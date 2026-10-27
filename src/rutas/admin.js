// Tablero de control del administrador.

import { Router } from "express";
import { config } from "../config.js";
import { q, uno, filas, ajustes, guardarAjuste, registrarEvento } from "../db.js";
import { exigir, hashPin } from "../sesion.js";
import { ESTADOS, ACTIVAS, aceptar, avanzar, cancelar, cambiarHora, ofrecer, avisarHuesped, reservaCompleta } from "../reservas.js";
import { calcular, VEHICULOS, AJUSTES_INICIALES } from "../precios.js";
import { procesarEntrante } from "../bot-conductor.js";
import { normalizar } from "../whatsapp.js";
import { ciclo } from "../programador.js";
import { inicioDia } from "../tiempo.js";

export const admin = Router();
admin.use("/api/admin", exigir("admin"));

const err = (res, e, codigo = 400) => res.status(codigo).json({ error: e?.message || String(e) });

/** Semáforo: verde = asignado y confirmado; amarillo = asignado sin confirmar; rojo = sin conductor. */
function semaforo(r) {
  if (["terminada"].includes(r.estado)) return "gris";
  if (["cancelada", "vencida", "pendiente_pago"].includes(r.estado)) return "gris";
  if (!r.conductor_id) return "rojo";
  if (r.estado === "asignada") return "amarillo";
  return "verde";
}

// ---------- Viajes ----------

admin.get("/api/admin/viajes", async (req, res) => {
  const vista = req.query.vista || "proximos";
  const hoy = inicioDia(new Date());
  const manana = new Date(hoy.getTime() + 86400000);
  const pasado = new Date(hoy.getTime() + 2 * 86400000);
  let cond = "r.estado not in ('pendiente_pago','vencida')";
  const params = [];
  if (vista === "hoy") { params.push(hoy, manana); cond += " and r.recogida >= $1 and r.recogida < $2"; }
  else if (vista === "manana") { params.push(manana, pasado); cond += " and r.recogida >= $1 and r.recogida < $2"; }
  else if (vista === "proximos") { cond += ` and r.estado = any($1)`; params.push(ACTIVAS); }
  else if (vista === "terminados") { cond += " and r.estado in ('terminada','cancelada')"; }
  else if (vista === "sin_pagar") { cond = "r.estado in ('pendiente_pago','vencida')"; }
  const orden = ["terminados", "sin_pagar"].includes(vista) ? "r.recogida desc" : "r.recogida asc";
  const lista = await filas(
    `select r.id, r.codigo, r.estado, r.sentido, r.recogida, r.hora_vuelo, r.vuelo, r.tipo_vuelo, r.pasajeros, r.maletas, r.vehiculo, r.nocturno,
            r.disponibilidad, r.nombre, r.telefono, r.idioma, r.precio, r.pago_conductor, r.comision_anfitrion, r.neto, r.conductor_id,
            r.aviso_huesped_en, r.confirmada_en, d.codigo destino, d.nombre destino_nombre, c.nombre conductor, c.telefono conductor_telefono,
            p.nombre propiedad, a.nombre anfitrion
       from reservas r left join destinos d on d.id=r.destino_id left join conductores c on c.id=r.conductor_id
       left join propiedades p on p.id=r.propiedad_id left join anfitriones a on a.id=r.anfitrion_id
      where ${cond} order by ${orden} limit 300`,
    params
  );
  res.json(lista.map((r) => ({ ...r, semaforo: semaforo(r), estadoTexto: ESTADOS[r.estado] })));
});

admin.get("/api/admin/viajes/:id", async (req, res) => {
  const r = await reservaCompleta(Number(req.params.id));
  if (!r) return res.status(404).json({ error: "No existe" });
  const eventos = await filas("select tipo, detalle, alerta, creado from eventos where reserva_id=$1 order by creado desc", [r.id]);
  const ofertas = await filas(
    "select c.nombre, c.vehiculo, o.enviada, o.respuesta, o.respondida from ofertas o join conductores c on c.id=o.conductor_id where o.reserva_id=$1 order by o.enviada",
    [r.id]
  );
  const mensajes = await filas("select sentido, telefono, texto, estado, creado from mensajes where reserva_id=$1 order by creado desc limit 50", [r.id]);
  const candidatos = await filas(
    `select c.id, c.nombre, c.vehiculo, c.placa,
            exists (select 1 from reservas x where x.conductor_id=c.id and x.estado = any($2) and abs(extract(epoch from (x.recogida - $3::timestamptz))) < 3*3600) ocupado
       from conductores c where c.activo and c.vehiculo = any($1) order by c.nombre`,
    [Object.entries(VEHICULOS).filter(([, v]) => v.orden >= VEHICULOS[r.vehiculo].orden).map(([k]) => k), ACTIVAS, r.recogida]
  );
  res.json({ reserva: { ...r, semaforo: semaforo(r), estadoTexto: ESTADOS[r.estado] }, eventos, ofertas, mensajes, candidatos });
});

admin.post("/api/admin/viajes/:id/asignar", async (req, res) => {
  const id = Number(req.params.id);
  const r = await uno("select estado, conductor_id from reservas where id=$1", [id]);
  if (!r) return res.status(404).json({ error: "No existe" });
  // Reasignar: se quita el conductor actual y vuelve a 'pagada'.
  if (r.conductor_id) {
    await q(
      `update reservas set conductor_id=null, estado='pagada', asignada_en=null, confirmada_en=null, aviso_huesped_en=null,
              recordatorio_conductor_en=null, alerta_sin_confirmar_en=null where id=$1`,
      [id]
    );
    await registrarEvento(id, "reasignada", "Conductor retirado por el administrador");
  }
  const out = await aceptar(id, Number(req.body.conductor_id), { porAdmin: true });
  res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.motivo });
});

admin.post("/api/admin/viajes/:id/estado", async (req, res) => {
  const out = await avanzar(Number(req.params.id), req.body.estado, { porAdmin: true });
  res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.motivo });
});

admin.post("/api/admin/viajes/:id/hora", async (req, res) => {
  const out = await cambiarHora(Number(req.params.id), req.body.fecha, req.body.hora);
  res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.motivo });
});

admin.post("/api/admin/viajes/:id/cancelar", async (req, res) => {
  const out = await cancelar(Number(req.params.id), String(req.body.motivo || ""));
  res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true } : { error: out.motivo });
});

admin.post("/api/admin/viajes/:id/ofrecer", async (req, res) => {
  const n = await ofrecer(Number(req.params.id), { forzar: true });
  res.json({ ok: true, enviados: n });
});

admin.post("/api/admin/viajes/:id/reenviar-aviso", async (req, res) => {
  await q("update reservas set aviso_huesped_en=null where id=$1", [req.params.id]);
  await avisarHuesped(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Alertas ----------

admin.get("/api/admin/alertas", async (req, res) => {
  res.json(
    await filas(
      `select e.id, e.detalle, e.creado, e.atendida, r.id reserva_id, r.codigo from eventos e left join reservas r on r.id=e.reserva_id
        where e.alerta order by e.atendida, e.creado desc limit 100`
    )
  );
});
admin.post("/api/admin/alertas/:id/atendida", async (req, res) => {
  await q("update eventos set atendida=true where id=$1", [req.params.id]);
  res.json({ ok: true });
});
admin.post("/api/admin/alertas/atender-todas", async (req, res) => {
  await q("update eventos set atendida=true where alerta and not atendida");
  res.json({ ok: true });
});

// ---------- Conductores y empresas ----------

admin.get("/api/admin/conductores", async (req, res) => {
  res.json({
    conductores: await filas(
      `select c.id, c.empresa_id, c.nombre, c.telefono, c.vehiculo, c.placa, c.descripcion, c.foto_url, c.activo, e.nombre empresa,
              (c.pin is not null) tiene_pin,
              (select count(*)::int from reservas r where r.conductor_id=c.id and r.estado='terminada') viajes
         from conductores c left join empresas e on e.id=c.empresa_id order by c.activo desc, c.nombre`
    ),
    empresas: await filas("select * from empresas order by nombre"),
  });
});

admin.post("/api/admin/conductores", async (req, res) => {
  try {
    const b = req.body;
    if (!b.nombre || !normalizar(b.telefono)) throw new Error("Nombre y teléfono son obligatorios.");
    if (!VEHICULOS[b.vehiculo]) throw new Error("Tipo de vehículo no válido.");
    const campos = [b.empresa_id || null, b.nombre, normalizar(b.telefono), b.vehiculo, b.placa || "", b.descripcion || "", b.foto_url || "", b.activo !== false];
    if (b.id) {
      await q(
        "update conductores set empresa_id=$2, nombre=$3, telefono=$4, vehiculo=$5, placa=$6, descripcion=$7, foto_url=$8, activo=$9 where id=$1",
        [b.id, ...campos]
      );
    } else {
      const f = await uno(
        "insert into conductores (empresa_id, nombre, telefono, vehiculo, placa, descripcion, foto_url, activo) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        campos
      );
      b.id = f.id;
    }
    if (b.pin) await q("update conductores set pin=$2 where id=$1", [b.id, hashPin(b.pin)]);
    res.json({ ok: true, id: b.id });
  } catch (e) {
    err(res, e.code === "23505" ? new Error("Ese teléfono ya está registrado.") : e);
  }
});

admin.post("/api/admin/empresas", async (req, res) => {
  const b = req.body;
  if (!b.nombre) return err(res, new Error("El nombre es obligatorio."));
  if (b.id) await q("update empresas set nombre=$2, nit=$3, contacto=$4, telefono=$5, activa=$6 where id=$1", [b.id, b.nombre, b.nit || "", b.contacto || "", normalizar(b.telefono), b.activa !== false]);
  else await q("insert into empresas (nombre, nit, contacto, telefono) values ($1,$2,$3,$4)", [b.nombre, b.nit || "", b.contacto || "", normalizar(b.telefono)]);
  res.json({ ok: true });
});

// ---------- Anfitriones y propiedades ----------

admin.get("/api/admin/anfitriones", async (req, res) => {
  const anfs = await filas(
    `select a.id, a.nombre, a.telefono, a.correo, a.comision_pct, a.datos_pago, a.activo, (a.pin is not null) tiene_pin,
            coalesce(sum(r.comision_anfitrion) filter (where r.estado='terminada' and r.liquidado_anfitrion_en is null),0)::int por_pagar
       from anfitriones a left join reservas r on r.anfitrion_id=a.id group by a.id order by a.activo desc, a.nombre`
  );
  const props = await filas(
    `select p.*, (select count(*)::int from visitas v where v.propiedad_id=p.id and v.creado >= now() - interval '30 days') visitas_30d,
            (select count(*)::int from reservas r where r.propiedad_id=p.id and r.pagado_en is not null and r.creado >= now() - interval '30 days') reservas_30d
       from propiedades p order by p.id`
  );
  res.json({
    anfitriones: anfs.map((a) => ({ ...a, propiedades: props.filter((p) => p.anfitrion_id === a.id).map((p) => ({ ...p, enlace: `${config.urlPublica}/r/${p.codigo}` })) })),
    zonas: await filas("select * from zonas order by orden"),
  });
});

admin.post("/api/admin/anfitriones", async (req, res) => {
  try {
    const b = req.body;
    if (!b.nombre || !normalizar(b.telefono)) throw new Error("Nombre y teléfono son obligatorios.");
    const pct = b.comision_pct === "" || b.comision_pct == null ? null : Number(b.comision_pct);
    const campos = [b.nombre, normalizar(b.telefono), b.correo || "", pct, b.datos_pago || "", b.activo !== false];
    if (b.id) await q("update anfitriones set nombre=$2, telefono=$3, correo=$4, comision_pct=$5, datos_pago=$6, activo=$7 where id=$1", [b.id, ...campos]);
    else b.id = (await uno("insert into anfitriones (nombre, telefono, correo, comision_pct, datos_pago, activo) values ($1,$2,$3,$4,$5,$6) returning id", campos)).id;
    if (b.pin) await q("update anfitriones set pin=$2 where id=$1", [b.id, hashPin(b.pin)]);
    res.json({ ok: true, id: b.id });
  } catch (e) {
    err(res, e.code === "23505" ? new Error("Ese teléfono ya está registrado.") : e);
  }
});

admin.post("/api/admin/propiedades", async (req, res) => {
  try {
    const b = req.body;
    if (!b.anfitrion_id || !b.nombre || !b.direccion || !b.zona) throw new Error("Anfitrión, nombre, dirección y zona son obligatorios.");
    let codigo = String(b.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (!codigo) {
      const base = b.nombre.toUpperCase().normalize("NFD").replace(/[^A-Z0-9]/g, "").slice(0, 6) || "APTO";
      codigo = base + Math.floor(100 + Math.random() * 900);
    }
    if (b.id) await q("update propiedades set anfitrion_id=$2, nombre=$3, direccion=$4, zona=$5, activa=$6 where id=$1", [b.id, b.anfitrion_id, b.nombre, b.direccion, b.zona, b.activa !== false]);
    else await q("insert into propiedades (anfitrion_id, codigo, nombre, direccion, zona) values ($1,$2,$3,$4,$5)", [b.anfitrion_id, codigo, b.nombre, b.direccion, b.zona]);
    res.json({ ok: true, codigo });
  } catch (e) {
    err(res, e.code === "23505" ? new Error("Ese código de QR ya existe.") : e);
  }
});

// ---------- Tarifas y ajustes ----------

admin.get("/api/admin/tarifas", async (req, res) => {
  const aj = await ajustes();
  const zonas = await filas("select * from zonas order by orden");
  const destinos = await filas("select * from destinos order by orden");
  const tarifas = await filas("select * from tarifas");
  const tabla = [];
  for (const d of destinos) {
    for (const z of zonas) {
      const t = tarifas.find((x) => x.zona === z.codigo && x.destino_id === d.id);
      if (!t) continue;
      const fila = { destino_id: d.id, destino: d.nombre, zona: z.codigo, pago_sedan: t.pago_sedan, minutos: t.minutos, vehiculos: {} };
      for (const v of Object.keys(VEHICULOS)) {
        fila.vehiculos[v] = {
          normal: calcular({ pagoSedan: t.pago_sedan, vehiculo: v, aj, pctAnfitrion: Number(aj.comision_anfitrion?.[0]?.pct ?? 0.05) }),
          nocturno: calcular({ pagoSedan: t.pago_sedan, vehiculo: v, aj, nocturno: true, pctAnfitrion: Number(aj.comision_anfitrion?.[0]?.pct ?? 0.05) }),
        };
      }
      tabla.push(fila);
    }
  }
  res.json({ ajustes: aj, zonas, destinos, tabla, vehiculos: VEHICULOS });
});

admin.post("/api/admin/tarifas", async (req, res) => {
  const { zona, destino_id, pago_sedan, minutos } = req.body;
  if (!(Number(pago_sedan) > 0)) return err(res, new Error("Pago no válido."));
  await q("update tarifas set pago_sedan=$3, minutos=$4 where zona=$1 and destino_id=$2", [zona, destino_id, Math.round(pago_sedan), Math.round(minutos || 60)]);
  res.json({ ok: true });
});

admin.post("/api/admin/destinos", async (req, res) => {
  const b = req.body;
  await q("update destinos set antes_nacional=$2, antes_internacional=$3 where id=$1", [b.id, Number(b.antes_nacional), Number(b.antes_internacional)]);
  res.json({ ok: true });
});

admin.post("/api/admin/ajustes", async (req, res) => {
  const { clave, valor } = req.body;
  if (!(clave in AJUSTES_INICIALES)) return err(res, new Error("Ajuste no válido."));
  await guardarAjuste(clave, valor);
  res.json({ ok: true });
});

// ---------- Liquidaciones ----------

admin.get("/api/admin/liquidaciones", async (req, res) => {
  const conductores = await filas(
    `select c.id, c.nombre, c.telefono, e.nombre empresa, count(r.id)::int viajes, coalesce(sum(r.pago_conductor),0)::int total,
            min(r.recogida) desde, max(r.recogida) hasta
       from reservas r join conductores c on c.id=r.conductor_id left join empresas e on e.id=c.empresa_id
      where r.estado='terminada' and r.liquidado_conductor_en is null group by c.id, e.nombre order by total desc`
  );
  const anfitriones = await filas(
    `select a.id, a.nombre, a.telefono, a.datos_pago, count(r.id)::int viajes, coalesce(sum(r.comision_anfitrion),0)::int total,
            min(r.recogida) desde, max(r.recogida) hasta
       from reservas r join anfitriones a on a.id=r.anfitrion_id
      where r.estado='terminada' and r.liquidado_anfitrion_en is null and r.comision_anfitrion > 0 group by a.id order by total desc`
  );
  res.json({ conductores, anfitriones });
});

admin.get("/api/admin/liquidaciones/:tipo/:id", async (req, res) => {
  const campo = req.params.tipo === "conductor" ? "conductor_id" : "anfitrion_id";
  const liq = req.params.tipo === "conductor" ? "liquidado_conductor_en" : "liquidado_anfitrion_en";
  res.json(
    await filas(
      `select r.codigo, r.recogida, r.precio, r.pago_conductor, r.comision_anfitrion, d.nombre destino
         from reservas r left join destinos d on d.id=r.destino_id where r.${campo}=$1 and r.estado='terminada' and r.${liq} is null order by r.recogida`,
      [req.params.id]
    )
  );
});

admin.post("/api/admin/liquidaciones/:tipo/:id/pagado", async (req, res) => {
  const tipo = req.params.tipo === "conductor" ? "conductor" : "anfitrion";
  const r = await q(
    `update reservas set liquidado_${tipo}_en=now() where ${tipo}_id=$1 and estado='terminada' and liquidado_${tipo}_en is null`,
    [req.params.id]
  );
  res.json({ ok: true, viajes: r.rowCount });
});

// ---------- Números ----------

admin.get("/api/admin/numeros", async (req, res) => {
  const dias = Math.min(365, Math.max(1, Number(req.query.dias) || 30));
  const desde = new Date(Date.now() - dias * 86400000);
  const pagadas = "estado in ('pagada','asignada','confirmada','en_camino','llego','recogido','terminada')";
  const tot = await uno(
    `select count(*)::int viajes, coalesce(sum(precio),0)::int ventas, coalesce(sum(neto),0)::int neto,
            coalesce(sum(pago_conductor),0)::int conductores, coalesce(sum(comision_anfitrion),0)::int anfitriones,
            coalesce(sum(pasarela),0)::int pasarela, coalesce(avg(precio),0)::int ticket,
            count(*) filter (where vehiculo='sedan')::int sedan, count(*) filter (where vehiculo='camioneta')::int camioneta,
            count(*) filter (where vehiculo='van')::int van, count(*) filter (where reserva_origen is not null)::int regresos
       from reservas where ${pagadas} and creado >= $1`,
    [desde]
  );
  const visitas = (await uno("select count(*)::int n from visitas where creado >= $1", [desde])).n;
  const cancel = (await uno("select count(*)::int n from reservas where estado='cancelada' and creado >= $1", [desde])).n;
  const porDia = await filas(
    `select to_char(creado at time zone 'America/Bogota', 'YYYY-MM-DD') dia, count(*)::int viajes, coalesce(sum(neto),0)::int neto
       from reservas where ${pagadas} and creado >= $1 group by 1 order by 1`,
    [desde]
  );
  const porPropiedad = await filas(
    `select p.codigo, p.nombre, a.nombre anfitrion,
            (select count(*)::int from visitas v where v.propiedad_id=p.id and v.creado >= $1) visitas,
            (select count(*)::int from reservas r where r.propiedad_id=p.id and r.${pagadas.replace("estado", "estado")} and r.creado >= $1) reservas
       from propiedades p join anfitriones a on a.id=p.anfitrion_id order by reservas desc, visitas desc limit 30`,
    [desde]
  );
  res.json({ dias, ...tot, visitas, cancelaciones: cancel, conversion: visitas ? tot.viajes / visitas : 0, porDia, porPropiedad });
});

// ---------- Mensajes de WhatsApp y simulador ----------

admin.get("/api/admin/mensajes", async (req, res) => {
  res.json(
    await filas(
      `select m.id, m.sentido, m.telefono, m.texto, m.estado, m.error, m.creado, r.codigo,
              coalesce(c.nombre, a.nombre, r2.nombre) quien,
              case when c.id is not null then 'conductor' when a.id is not null then 'anfitrión' when r2.id is not null then 'huésped'
                   when m.telefono = $1 then 'administrador' else '' end rol
         from mensajes m left join reservas r on r.id=m.reserva_id
         left join conductores c on c.telefono=m.telefono left join anfitriones a on a.telefono=m.telefono
         left join lateral (select id, nombre from reservas x where x.telefono=m.telefono order by creado desc limit 1) r2 on true
        order by m.creado desc limit 200`,
      [config.telefonoAdmin]
    )
  );
});

/** Simula un mensaje que llega por WhatsApp (para probar el flujo del conductor sin Evolution). */
admin.post("/api/admin/simular-whatsapp", async (req, res) => {
  const out = await procesarEntrante(req.body.telefono, String(req.body.texto || ""));
  res.json(out);
});

/** Corre ya las tareas automáticas (ofertas, avisos, alertas) sin esperar al minuto. */
admin.post("/api/admin/correr-programador", async (req, res) => {
  await ciclo();
  res.json({ ok: true });
});
