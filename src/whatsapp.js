// Envío de WhatsApp por Evolution API. Todo mensaje queda en la tabla `mensajes`:
// si Evolution no está configurado (modo prueba), el mensaje solo se registra y se ve
// en el tablero → pestaña Mensajes, así se prueba el flujo sin mandar nada real.

import { config, whatsappActivo } from "./config.js";
import { q, uno, registrarEvento, ajustes } from "./db.js";

export function normalizar(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("3")) d = "57" + d; // celular colombiano sin indicativo
  return d;
}

export async function enviar(telefono, texto, { reservaId = null } = {}) {
  const numero = normalizar(telefono);
  if (!numero) return { ok: false, error: "sin número" };
  const fila = await uno("insert into mensajes (sentido, telefono, texto, reserva_id) values ('sale',$1,$2,$3) returning id", [
    numero,
    texto,
    reservaId,
  ]);
  if (!whatsappActivo()) return { ok: true, registrado: true };
  try {
    const r = await fetch(`${config.evolution.url}/message/sendText/${encodeURIComponent(config.evolution.instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.evolution.llave },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    await q("update mensajes set estado='enviado' where id=$1", [fila.id]);
    return { ok: true };
  } catch (err) {
    await q("update mensajes set estado='error', error=$2 where id=$1", [fila.id, err.message]);
    console.warn(`[whatsapp] No se pudo enviar a ${numero}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Alerta para el administrador: queda en el tablero (Alertas) y le llega por WhatsApp. */
export async function alertar(reservaId, texto) {
  await registrarEvento(reservaId, "alerta", texto, true);
  const aj = await ajustes();
  const tel = config.telefonoAdmin || normalizar(aj.telefono_soporte);
  if (tel) await enviar(tel, `⚠️ ${texto}`, { reservaId });
}

export async function registrarEntrante(telefono, texto, reservaId = null) {
  await q("insert into mensajes (sentido, telefono, texto, estado, reserva_id) values ('entra',$1,$2,'recibido',$3)", [
    normalizar(telefono),
    texto,
    reservaId,
  ]);
}

export async function enviarCorreo(para, asunto, texto) {
  if (!config.correo.resendKey || !config.correo.remitente || !para) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.correo.resendKey}` },
      body: JSON.stringify({ from: config.correo.remitente, to: [para], subject: asunto, text: texto.replace(/\*/g, "") }),
    });
  } catch (err) {
    console.warn(`[correo] ${err.message}`);
  }
}
