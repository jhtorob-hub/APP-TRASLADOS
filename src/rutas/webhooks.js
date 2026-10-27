// Webhooks: Wompi (pagos) y Evolution API (mensajes de WhatsApp que llegan).

import { Router } from "express";
import { config } from "../config.js";
import { uno } from "../db.js";
import { marcarPagada } from "../reservas.js";
import { eventoValido, codigoDeReferencia } from "../wompi.js";
import { procesarEntrante, leerEventoEvolution } from "../bot-conductor.js";

export const webhooks = Router();

// En Wompi → Desarrolladores → URL de eventos: https://<tu-app>/webhooks/wompi
webhooks.post("/webhooks/wompi", async (req, res) => {
  const body = req.body || {};
  if (!eventoValido(body)) {
    console.warn("[wompi] Evento con firma inválida, ignorado.");
    return res.status(200).json({ ok: false }); // 200 para que Wompi no reintente sin fin
  }
  const tx = body?.data?.transaction;
  if (body.event === "transaction.updated" && tx?.status === "APPROVED") {
    const codigo = codigoDeReferencia(tx.reference);
    const r = await uno("select precio from reservas where codigo=$1", [codigo]);
    if (r && tx.amount_in_cents === r.precio * 100) {
      await marcarPagada(codigo, { pagoId: tx.id, metodo: `wompi:${tx.payment_method_type || ""}` });
    } else {
      console.warn(`[wompi] Pago aprobado que no cuadra con una reserva: ${tx.reference} ${tx.amount_in_cents}`);
    }
  }
  res.json({ ok: true });
});

// En Evolution API → Webhook de la instancia: https://<tu-app>/webhooks/whatsapp/<SECRETO_WEBHOOK_WHATSAPP>
// con el evento MESSAGES_UPSERT.
webhooks.post("/webhooks/whatsapp/:secreto", async (req, res) => {
  if (req.params.secreto !== config.secretoWebhookWhatsapp) return res.status(404).end();
  res.json({ ok: true }); // responder rápido; procesar después
  const ev = leerEventoEvolution(req.body);
  if (!ev) return;
  try {
    await procesarEntrante(ev.telefono, ev.texto);
  } catch (err) {
    console.error("[whatsapp entrante]", err);
  }
});
