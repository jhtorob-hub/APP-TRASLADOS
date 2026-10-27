// Lógica central de las reservas: cotizar, crear, marcar pagada, ofrecer a conductores,
// aceptar, cambiar de estado y cancelar. La usan la página del huésped, el bot de
// conductores por WhatsApp, la pantalla del conductor y el tablero del administrador.

import crypto from "node:crypto";
import { config } from "./config.js";
import { q, uno, filas, ajustes, registrarEvento } from "./db.js";
import { calcular, pctAnfitrion, cabe, recomendado, VEHICULOS } from "./precios.js";
import { deFechaHora, esNocturna, fechaHoraTexto } from "./tiempo.js";
import { enviar, alertar, enviarCorreo } from "./whatsapp.js";
import { huesped, conductor as txtConductor } from "./textos.js";

export const ESTADOS = {
  pendiente_pago: "Pendiente de pago",
  pagada: "Pagada · sin conductor",
  asignada: "Asignada",
  confirmada: "Confirmada por el conductor",
  en_camino: "Conductor en camino",
  llego: "Conductor llegó",
  recogido: "Huésped recogido",
  terminada: "Terminada",
  cancelada: "Cancelada",
  vencida: "Pago no completado",
};
export const ACTIVAS = ["pagada", "asignada", "confirmada", "en_camino", "llego", "recogido"];

const codigoNuevo = () => {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (const b of crypto.randomBytes(5)) s += letras[b % letras.length];
  return s;
};

/** Reserva con datos del destino, conductor y ajustes de espera (para textos). */
export async function reservaCompleta(idOCodigo) {
  const campo = typeof idOCodigo === "number" ? "r.id" : "r.codigo";
  const r = await uno(
    `select r.*, d.codigo destino_codigo, d.nombre destino_nombre, d.nombre_en destino_nombre_en, d.tipo destino_tipo,
            c.nombre conductor_nombre, c.telefono conductor_telefono, c.placa conductor_placa,
            c.descripcion conductor_vehiculo, c.foto_url conductor_foto,
            p.nombre propiedad_nombre, p.codigo propiedad_codigo, a.nombre anfitrion_nombre
       from reservas r
       left join destinos d on d.id = r.destino_id
       left join conductores c on c.id = r.conductor_id
       left join propiedades p on p.id = r.propiedad_id
       left join anfitriones a on a.id = r.anfitrion_id
      where ${campo} = $1`,
    [idOCodigo]
  );
  if (!r) return null;
  const aj = await ajustes();
  r.espera_nacional = aj.espera_nacional;
  r.espera_internacional = aj.espera_internacional;
  return r;
}

/** Todo lo que necesita la página del huésped para una propiedad (precios por destino y vehículo). */
export async function datosPropiedad(codigo) {
  const prop = await uno(
    `select p.id, p.codigo, p.nombre, p.direccion, p.zona, p.activa, a.id anfitrion_id, a.nombre anfitrion_nombre, a.comision_pct, a.activo anfitrion_activo,
            (select count(*)::int from propiedades x where x.anfitrion_id = a.id and x.activa) num_propiedades
       from propiedades p join anfitriones a on a.id = p.anfitrion_id
      where upper(p.codigo) = upper($1)`,
    [codigo]
  );
  if (!prop || !prop.activa) return null;
  const aj = await ajustes();
  const destinos = await filas(
    `select d.id, d.codigo, d.nombre, d.nombre_en, d.tipo, d.pide_vuelo, d.antes_nacional, d.antes_internacional, t.pago_sedan, t.minutos
       from destinos d join tarifas t on t.destino_id = d.id and t.zona = $1 order by d.orden`,
    [prop.zona]
  );
  const pct = pctAnfitrion({ comision_pct: prop.comision_pct }, prop.num_propiedades, aj);
  for (const d of destinos) {
    d.precios = {};
    for (const v of Object.keys(VEHICULOS)) {
      d.precios[v] = {
        normal: calcular({ pagoSedan: d.pago_sedan, vehiculo: v, aj, pctAnfitrion: pct }).precio,
        nocturno: calcular({ pagoSedan: d.pago_sedan, vehiculo: v, aj, nocturno: true, pctAnfitrion: pct }).precio,
      };
    }
    delete d.pago_sedan;
  }
  return {
    propiedad: { codigo: prop.codigo, nombre: prop.nombre, direccion: prop.direccion, zona: prop.zona, anfitrion: prop.anfitrion_nombre },
    destinos,
    vehiculos: VEHICULOS,
    fotos: aj.fotos_vehiculos || {},
    reglas: {
      espera_nacional: aj.espera_nacional,
      espera_internacional: aj.espera_internacional,
      horas_garantizado: aj.horas_garantizado,
      horas_minimo: aj.horas_minimo,
      pct_nocturno: aj.pct_nocturno,
      descuento_regreso: aj.descuento_regreso,
    },
    _interno: { propiedadId: prop.id, anfitrionId: prop.anfitrion_id, pct },
  };
}

/** Calcula hora de recogida, precio y reparto. Lanza Error con mensaje claro si algo no cuadra. */
export async function cotizar(entrada) {
  const datos = await datosPropiedad(entrada.propiedad);
  if (!datos) throw new Error("Esta propiedad no existe o no está activa.");
  const aj = await ajustes();
  const destino = datos.destinos.find((d) => d.codigo === entrada.destino);
  if (!destino) throw new Error("Destino no válido.");
  const sentido = entrada.sentido === "desde_destino" ? "desde_destino" : "al_destino";
  const pasajeros = Math.max(1, Math.min(30, parseInt(entrada.pasajeros, 10) || 1));
  const maletas = Math.max(0, Math.min(40, parseInt(entrada.maletas, 10) || 0));
  const vehiculo = entrada.vehiculo || recomendado(pasajeros, maletas);
  if (!vehiculo || !VEHICULOS[vehiculo]) throw new Error("Para ese grupo escríbenos por WhatsApp y te cotizamos dos vehículos.");
  if (!cabe(vehiculo, pasajeros, maletas)) throw new Error(`En ${VEHICULOS[vehiculo].nombre} no caben ${pasajeros} pasajeros con ${maletas} maletas.`);
  const horaVuelo = deFechaHora(entrada.fecha, entrada.hora);
  if (!horaVuelo) throw new Error("Revisa la fecha y la hora.");
  const tipoVuelo = entrada.tipo_vuelo === "internacional" ? "internacional" : "nacional";
  const t = await uno("select pago_sedan, minutos from tarifas where zona=$1 and destino_id=$2", [datos.propiedad.zona, destino.id]);

  let recogida = horaVuelo;
  if (sentido === "al_destino") {
    const antes = tipoVuelo === "internacional" ? destino.antes_internacional : destino.antes_nacional;
    recogida = new Date(horaVuelo.getTime() - (antes + t.minutos) * 60000);
  }
  const horasFaltan = (recogida.getTime() - Date.now()) / 3600000;
  if (horasFaltan < Number(aj.horas_minimo)) {
    throw new Error(`Las reservas en línea son con mínimo ${aj.horas_minimo} horas de anticipación. Escríbenos por WhatsApp y vemos si hay un vehículo disponible.`);
  }
  if (horasFaltan > 24 * 180) throw new Error("La fecha es demasiado lejana.");
  const disponibilidad = horasFaltan >= Number(aj.horas_garantizado) ? "garantizado" : "sujeto";
  const nocturno = esNocturna(recogida);

  let descuento = 0;
  let reservaOrigen = null;
  if (entrada.regreso) {
    const origen = await uno("select id, estado from reservas where codigo=$1", [entrada.regreso]);
    if (origen && origen.estado !== "cancelada") {
      const ya = await uno("select 1 from reservas where reserva_origen=$1 and estado not in ('cancelada','vencida','pendiente_pago')", [origen.id]);
      if (!ya) {
        descuento = Number(aj.descuento_regreso) || 0;
        reservaOrigen = origen.id;
      }
    }
  }
  const c = calcular({ pagoSedan: t.pago_sedan, vehiculo, aj, nocturno, descuento, pctAnfitrion: datos._interno.pct });
  return { datos, destino, sentido, pasajeros, maletas, vehiculo, horaVuelo, tipoVuelo, recogida, disponibilidad, nocturno, descuento, reservaOrigen, ...c };
}

export async function crearReserva(entrada) {
  const nombre = String(entrada.nombre || "").trim().slice(0, 80);
  const telefono = String(entrada.telefono || "").replace(/\D/g, "");
  const correo = String(entrada.correo || "").trim().slice(0, 120);
  if (nombre.length < 2) throw new Error("Escribe tu nombre.");
  if (telefono.length < 10) throw new Error("Escribe tu WhatsApp con el indicativo del país (ej. +1 555 123 4567).");
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error("Revisa el correo.");
  const k = await cotizar(entrada);
  let codigo = codigoNuevo();
  while (await uno("select 1 from reservas where codigo=$1", [codigo])) codigo = codigoNuevo();
  const r = await uno(
    `insert into reservas (codigo, propiedad_id, anfitrion_id, reserva_origen, sentido, destino_id, vuelo, tipo_vuelo, hora_vuelo, recogida,
       pasajeros, maletas, vehiculo, nocturno, disponibilidad, nombre, telefono, correo, idioma, direccion, notas,
       precio, pago_conductor, comision_anfitrion, pasarela, neto, descuento)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) returning *`,
    [
      codigo, k.datos._interno.propiedadId, k.datos._interno.anfitrionId, k.reservaOrigen, k.sentido, k.destino.id,
      String(entrada.vuelo || "").toUpperCase().replace(/\s+/g, "").slice(0, 12), k.tipoVuelo, k.horaVuelo, k.recogida,
      k.pasajeros, k.maletas, k.vehiculo, k.nocturno, k.disponibilidad, nombre, telefono, correo,
      entrada.idioma === "en" ? "en" : "es", k.datos.propiedad.direccion, String(entrada.notas || "").slice(0, 300),
      k.precio, k.pago, k.comision, k.pasarela, k.neto, k.descuento,
    ]
  );
  await registrarEvento(r.id, "creada", `Reserva creada por ${nombre} · ${fechaHoraTexto(k.recogida)} · $${k.precio}`);
  return r;
}

/** El pago quedó aprobado: confirma al huésped y deja la reserva lista para ofrecer. */
export async function marcarPagada(codigo, { pagoId = null, metodo = "wompi" } = {}) {
  const r = await uno(
    `update reservas set estado='pagada', pagado_en=now(), pago_id=coalesce($2, pago_id), pago_metodo=$3
      where codigo=$1 and estado in ('pendiente_pago','vencida') returning id`,
    [codigo, pagoId, metodo]
  );
  if (!r) return false; // ya estaba pagada (webhook repetido) o no existe
  const c = await reservaCompleta(r.id);
  await registrarEvento(r.id, "pagada", `Pago aprobado (${metodo})`);
  await enviar(c.telefono, huesped.confirmacion(c), { reservaId: r.id });
  await enviarCorreo(c.correo, c.idioma === "en" ? `Booking confirmed #${c.codigo}` : `Reserva confirmada #${c.codigo}`, huesped.confirmacion(c));
  if (c.disponibilidad === "sujeto") await alertar(r.id, `Reserva #${c.codigo} con menos de 12 h (${fechaHoraTexto(c.recogida)}). Confirmar conductor ya.`);
  await ofrecer(r.id); // si faltan menos de 24 h se ofrece de una vez
  return true;
}

/**
 * Ofrece el viaje a los conductores activos. Ronda 1: mismo tipo de vehículo.
 * Ronda 2 (si nadie lo tomó en 30 min): también vehículos más grandes.
 */
export async function ofrecer(reservaId, { forzar = false } = {}) {
  const r = await reservaCompleta(reservaId);
  if (!r || r.estado !== "pagada" || r.conductor_id) return 0;
  const faltan = (new Date(r.recogida).getTime() - Date.now()) / 3600000;
  if (!forzar && faltan > 24) return 0;
  const ronda = (r.ronda_oferta || 0) + 1;
  if (ronda > 2 && !forzar) return 0;
  const orden = VEHICULOS[r.vehiculo].orden;
  const tipos = Object.entries(VEHICULOS).filter(([, v]) => (ronda === 1 ? v.orden === orden : v.orden >= orden)).map(([k]) => k);
  const lista = await filas(
    `select c.* from conductores c where c.activo and c.vehiculo = any($1)
       and not exists (select 1 from ofertas o where o.reserva_id=$2 and o.conductor_id=c.id)
       and not exists (select 1 from reservas x where x.conductor_id=c.id and x.estado = any($3)
                        and abs(extract(epoch from (x.recogida - $4::timestamptz))) < 3*3600)`,
    [tipos, reservaId, ACTIVAS, r.recogida]
  );
  await q("update reservas set ronda_oferta=$2, ofrecida_en=now() where id=$1", [reservaId, ronda]);
  for (const c of lista) {
    await q("insert into ofertas (reserva_id, conductor_id) values ($1,$2) on conflict do nothing", [reservaId, c.id]);
    await enviar(c.telefono, txtConductor.oferta(r), { reservaId });
  }
  await registrarEvento(reservaId, "ofrecida", `Ronda ${ronda}: ofrecida a ${lista.length} conductor(es)`);
  if (lista.length === 0 && ronda >= 2) await alertar(reservaId, `Reserva #${r.codigo}: no hay conductores disponibles para ${VEHICULOS[r.vehiculo].nombre}. Asignar a mano.`);
  return lista.length;
}

/** Un conductor toma el viaje. El primero que responde se lo queda. */
export async function aceptar(reservaId, conductorId, { porAdmin = false } = {}) {
  const r = await uno(
    `update reservas set conductor_id=$2, estado='asignada', asignada_en=now()
      where id=$1 and conductor_id is null and estado='pagada' returning id`,
    [reservaId, conductorId]
  );
  await q("update ofertas set respuesta=$3, respondida=now() where reserva_id=$1 and conductor_id=$2", [
    reservaId,
    conductorId,
    r ? "aceptó" : "tarde",
  ]);
  if (!r) return { ok: false, motivo: "El viaje ya lo tomó otro conductor o no está disponible." };
  const c = await reservaCompleta(reservaId);
  await registrarEvento(reservaId, "asignada", `${porAdmin ? "Asignada por el administrador a" : "Tomada por"} ${c.conductor_nombre}`);
  await enviar(c.conductor_telefono, txtConductor.asignado(c), { reservaId });
  // Si faltan 12 h o menos, el huésped recibe los datos del conductor de una vez.
  if (new Date(c.recogida).getTime() - Date.now() <= 12 * 3600000) await avisarHuesped(reservaId);
  return { ok: true, reserva: c };
}

export async function rechazar(reservaId, conductorId) {
  await q("update ofertas set respuesta='no puede', respondida=now() where reserva_id=$1 and conductor_id=$2 and respuesta is null", [
    reservaId,
    conductorId,
  ]);
}

export async function avisarHuesped(reservaId) {
  const ok = await uno("update reservas set aviso_huesped_en=now() where id=$1 and aviso_huesped_en is null and conductor_id is not null returning id", [reservaId]);
  if (!ok) return;
  const c = await reservaCompleta(reservaId);
  await enviar(c.telefono, huesped.conductorAsignado(c), { reservaId });
  await registrarEvento(reservaId, "aviso_huesped", "Datos del conductor enviados al huésped");
}

const SIGUIENTE = {
  confirmada: { desde: ["asignada"], campo: "confirmada_en", texto: "Conductor confirmó" },
  en_camino: { desde: ["asignada", "confirmada"], campo: "en_camino_en", texto: "Conductor en camino", huesped: "enCamino" },
  llego: { desde: ["asignada", "confirmada", "en_camino"], campo: "llego_en", texto: "Conductor llegó", huesped: "llego" },
  recogido: { desde: ["asignada", "confirmada", "en_camino", "llego"], campo: "recogido_en", texto: "Huésped recogido" },
  terminada: { desde: ["asignada", "confirmada", "en_camino", "llego", "recogido"], campo: "terminado_en", texto: "Viaje terminado" },
};

/** Avance del viaje (lo usan el conductor y el administrador). */
export async function avanzar(reservaId, nuevo, { conductorId = null, porAdmin = false } = {}) {
  const paso = SIGUIENTE[nuevo];
  if (!paso) return { ok: false, motivo: "Estado no válido." };
  const r = await uno(
    `update reservas set estado=$2, ${paso.campo}=now()
      where id=$1 and estado = any($3) ${conductorId ? "and conductor_id=$4" : ""} returning id`,
    conductorId ? [reservaId, nuevo, paso.desde, conductorId] : [reservaId, nuevo, paso.desde]
  );
  if (!r) return { ok: false, motivo: "Ese cambio no aplica al viaje en su estado actual." };
  // Si el viaje arranca antes del aviso de las 12 h (p. ej. viaje adelantado), el huésped recibe primero los datos del conductor.
  if (["en_camino", "llego", "recogido"].includes(nuevo)) await avisarHuesped(reservaId);
  const c = await reservaCompleta(reservaId);
  await registrarEvento(reservaId, nuevo, `${paso.texto}${porAdmin ? " (marcado por el administrador)" : ""}`);
  if (paso.huesped) await enviar(c.telefono, huesped[paso.huesped](c), { reservaId });
  if (nuevo === "terminada") {
    const regreso = c.sentido === "desde_destino" && c.propiedad_codigo ? `${config.urlPublica}/r/${c.propiedad_codigo}?regreso=${c.codigo}` : null;
    await enviar(c.telefono, huesped.final(c, regreso), { reservaId });
  }
  return { ok: true, reserva: c };
}

export async function cancelar(reservaId, motivo = "") {
  const antes = await reservaCompleta(reservaId);
  if (!antes || ["cancelada", "terminada"].includes(antes.estado)) return { ok: false, motivo: "No se puede cancelar." };
  await q("update reservas set estado='cancelada', cancelado_en=now(), motivo_cancelacion=$2 where id=$1", [reservaId, motivo]);
  const c = await reservaCompleta(reservaId);
  await registrarEvento(reservaId, "cancelada", motivo || "Cancelada");
  if (antes.estado !== "pendiente_pago") await enviar(c.telefono, huesped.cancelada(c), { reservaId });
  if (antes.conductor_id) await enviar(antes.conductor_telefono, txtConductor.cancelado(c), { reservaId });
  return { ok: true };
}

/** Cambio de hora (vuelo retrasado o adelantado). Avisa al conductor y al huésped. */
export async function cambiarHora(reservaId, fecha, hora) {
  const r = await reservaCompleta(reservaId);
  const nueva = deFechaHora(fecha, hora);
  if (!r || !nueva) return { ok: false, motivo: "Fecha u hora no válida." };
  const dif = nueva.getTime() - new Date(r.recogida).getTime();
  await q(
    `update reservas set recogida=$2, hora_vuelo = hora_vuelo + ($3 || ' milliseconds')::interval, nocturno=$4,
            recordatorio_conductor_en=null, alerta_sin_confirmar_en=null where id=$1`,
    [reservaId, nueva, String(dif), esNocturna(nueva)]
  );
  const c = await reservaCompleta(reservaId);
  await registrarEvento(reservaId, "cambio_hora", `Nueva recogida ${fechaHoraTexto(nueva)}`);
  if (c.conductor_id) await enviar(c.conductor_telefono, txtConductor.cambioHora(c), { reservaId });
  await enviar(c.telefono, huesped.cambioHora(c), { reservaId });
  return { ok: true };
}
