// Mensajes que llegan por WhatsApp (webhook de Evolution API).
// - Si los manda un conductor: se interpretan como comandos (1, 2, OK, VOY, LLEGUÉ, RECOGÍ, ENTREGUÉ, VIAJES).
// - Si los manda un huésped con reserva: se le reenvían al administrador con el contexto.

import { uno, filas, registrarEvento } from "./db.js";
import { aceptar, rechazar, avanzar, ACTIVAS } from "./reservas.js";
import { enviar, alertar, registrarEntrante, normalizar } from "./whatsapp.js";
import { conductor as txt } from "./textos.js";
import { fechaHoraTexto } from "./tiempo.js";

const limpio = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function comandoDe(texto) {
  const t = limpio(texto);
  if (/^(1|si|acepto|lo tomo|tomo)$/.test(t)) return "aceptar";
  if (/^(2|no|no puedo)$/.test(t)) return "rechazar";
  if (/^(ok|okay|confirmo|confirmado|listo)$/.test(t)) return "confirmada";
  if (/^(voy|en camino|saliendo|sali|ya sali|voy en camino)$/.test(t)) return "en_camino";
  if (/^(llegue|ya llegue|estoy afuera|aqui estoy|llego)$/.test(t)) return "llego";
  if (/^(recogi|ya lo recogi|ya los recogi|recogido|subio|subieron)$/.test(t)) return "recogido";
  if (/^(entregue|termine|fin|finalizado|entregado|terminado)$/.test(t)) return "terminada";
  if (/^(viajes|mis viajes|agenda)$/.test(t)) return "viajes";
  if (/^(ayuda|menu|comandos|hola)$/.test(t)) return "ayuda";
  return null;
}

/** Procesa un mensaje entrante. Devuelve lo que se hizo (para pruebas y para el simulador del tablero). */
export async function procesarEntrante(telefono, texto) {
  const tel = normalizar(telefono);
  const cond = await uno("select * from conductores where telefono=$1 and activo", [tel]);
  if (cond) {
    await registrarEntrante(tel, texto);
    return manejarConductor(cond, texto);
  }
  const reserva = await uno(
    `select id, codigo, nombre, recogida, estado from reservas where telefono=$1 and estado <> 'vencida'
      order by abs(extract(epoch from (recogida - now()))) limit 1`,
    [tel]
  );
  await registrarEntrante(tel, texto, reserva?.id || null);
  if (reserva) {
    // Calificación 1–5 después del viaje.
    if (reserva.estado === "terminada" && /^[1-5]$/.test(limpio(texto))) {
      await registrarEvento(reserva.id, "calificacion", `Calificación del huésped: ${limpio(texto)}/5`);
      if (Number(limpio(texto)) <= 3) await alertar(reserva.id, `Calificación baja (${limpio(texto)}/5) en la reserva #${reserva.codigo}.`);
      return { tipo: "calificacion" };
    }
    await alertar(reserva.id, `💬 Huésped ${reserva.nombre} (#${reserva.codigo}, ${fechaHoraTexto(reserva.recogida)}) escribió: "${String(texto).slice(0, 300)}"`);
    return { tipo: "huesped_reenviado", reserva: reserva.codigo };
  }
  return { tipo: "desconocido" };
}

async function manejarConductor(cond, texto) {
  const cmd = comandoDe(texto);
  if (cmd === "aceptar" || cmd === "rechazar") {
    const oferta = await uno(
      `select o.reserva_id, r.codigo, r.estado, r.conductor_id from ofertas o join reservas r on r.id=o.reserva_id
        where o.conductor_id=$1 and o.respuesta is null order by o.enviada desc limit 1`,
      [cond.id]
    );
    if (!oferta) {
      await enviar(cond.telefono, "No tienes viajes ofrecidos pendientes. Escribe *VIAJES* para ver tus próximos viajes.");
      return { tipo: "sin_oferta" };
    }
    if (cmd === "rechazar") {
      await rechazar(oferta.reserva_id, cond.id);
      await enviar(cond.telefono, `Listo, no te asignamos el viaje #${oferta.codigo}.`);
      return { tipo: "rechazo", reserva: oferta.codigo };
    }
    const res = await aceptar(oferta.reserva_id, cond.id);
    if (!res.ok) await enviar(cond.telefono, txt.tomado(oferta.codigo));
    return { tipo: res.ok ? "aceptado" : "tarde", reserva: oferta.codigo };
  }
  if (cmd === "viajes") {
    const lista = await filas(
      `select codigo, recogida, estado from reservas where conductor_id=$1 and estado = any($2) order by recogida limit 8`,
      [cond.id, ACTIVAS]
    );
    await enviar(
      cond.telefono,
      lista.length ? `Tus próximos viajes:\n${lista.map((r) => `• #${r.codigo} · ${fechaHoraTexto(r.recogida)}`).join("\n")}` : "No tienes viajes asignados."
    );
    return { tipo: "viajes" };
  }
  if (["confirmada", "en_camino", "llego", "recogido", "terminada"].includes(cmd)) {
    // Aplica al viaje activo más cercano en el tiempo.
    const r = await uno(
      `select id, codigo from reservas where conductor_id=$1 and estado = any($2)
        order by abs(extract(epoch from (recogida - now()))) limit 1`,
      [cond.id, ACTIVAS]
    );
    if (!r) {
      await enviar(cond.telefono, "No tienes un viaje activo en este momento.");
      return { tipo: "sin_viaje" };
    }
    const res = await avanzar(r.id, cmd, { conductorId: cond.id });
    const ok = {
      confirmada: `👍 Confirmado el viaje #${r.codigo}. Escribe *VOY* cuando salgas.`,
      en_camino: `🚐 Le avisamos al huésped que vas en camino (#${r.codigo}).`,
      llego: `👋 Le avisamos al huésped que llegaste (#${r.codigo}).`,
      recogido: `✅ Huésped recogido (#${r.codigo}). Escribe *ENTREGUÉ* al terminar.`,
      terminada: `🙌 Viaje #${r.codigo} terminado. ¡Gracias!`,
    };
    await enviar(cond.telefono, res.ok ? ok[cmd] : `No se pudo: ${res.motivo}`);
    return { tipo: res.ok ? cmd : "error", reserva: r.codigo };
  }
  if (cmd === "ayuda") {
    await enviar(cond.telefono, txt.ayuda());
    return { tipo: "ayuda" };
  }
  // Mensaje libre del conductor: se le pasa al administrador.
  const r = await uno(
    `select id, codigo from reservas where conductor_id=$1 and estado = any($2) order by abs(extract(epoch from (recogida - now()))) limit 1`,
    [cond.id, ACTIVAS]
  );
  await alertar(r?.id || null, `💬 Conductor ${cond.nombre}${r ? ` (#${r.codigo})` : ""}: "${String(texto).slice(0, 300)}"`);
  return { tipo: "reenviado" };
}

/** Extrae teléfono y texto del evento messages.upsert de Evolution API. */
export function leerEventoEvolution(body) {
  const data = body?.data;
  if (!data?.key || data.key.fromMe) return null;
  const jid = data.key.remoteJid || "";
  if (jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  // Contactos con identificador @lid traen el número real en campos alternos.
  const alterno = data.key.senderPn || data.key.remoteJidAlt || data.key.participantPn || "";
  const telefono = (jid.endsWith("@lid") ? alterno : jid).replace(/@.*$/, "");
  const m = data.message || {};
  const texto = m.conversation || m.extendedTextMessage?.text || m.buttonsResponseMessage?.selectedDisplayText || "";
  if (!telefono || !texto) return null;
  return { telefono, texto };
}

// Exportado para pruebas.
export { limpio };
