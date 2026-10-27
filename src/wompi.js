// Pago con Wompi (Bancolombia): checkout web con firma de integridad + webhook de eventos.
// Docs: https://docs.wompi.co — llaves en Wompi → Desarrolladores.
// Sin llaves configuradas, la app usa un pago simulado (solo para pruebas).

import crypto from "node:crypto";
import { config, wompiActivo, wompiApi } from "./config.js";
import { tokenReserva } from "./sesion.js";

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function urlPago(reserva) {
  const t = tokenReserva(reserva.codigo);
  const regreso = `${config.urlPublica}/reserva/${reserva.codigo}?t=${t}`;
  if (!wompiActivo()) return `${config.urlPublica}/pago-demo/${reserva.codigo}?t=${t}`;
  const referencia = reserva.pago_ref;
  const centavos = reserva.precio * 100;
  const firma = sha256(`${referencia}${centavos}COP${config.wompi.secretoIntegridad}`);
  const p = new URLSearchParams({
    "public-key": config.wompi.llavePublica,
    currency: "COP",
    "amount-in-cents": String(centavos),
    reference: referencia,
    "signature:integrity": firma,
    "redirect-url": regreso,
    "customer-data:full-name": reserva.nombre,
    "customer-data:phone-number": reserva.telefono,
  });
  if (reserva.correo) p.set("customer-data:email", reserva.correo);
  return `https://checkout.wompi.co/p/?${p.toString()}`;
}

/** Referencia única por intento de pago (Wompi no acepta repetir referencia). */
export const referenciaNueva = (codigo) => `${codigo}-${Date.now().toString(36).toUpperCase()}`;
export const codigoDeReferencia = (ref) => String(ref || "").split("-").slice(0, -1).join("-") || ref;

/** Verifica una transacción consultando a Wompi (respaldo del webhook, al volver del pago). */
export async function consultarTransaccion(id) {
  const r = await fetch(`${wompiApi()}/transactions/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`Wompi HTTP ${r.status}`);
  const { data } = await r.json();
  return data; // { id, status, reference, amount_in_cents, payment_method_type, ... }
}

/** Valida la firma del evento: sha256(valores de signature.properties + timestamp + secreto de eventos). */
export function eventoValido(body) {
  if (!config.wompi.secretoEventos) return false;
  const props = body?.signature?.properties || [];
  const valor = (ruta) => ruta.split(".").reduce((o, k) => (o == null ? o : o[k]), body.data);
  const cadena = props.map((p) => String(valor(p) ?? "")).join("") + String(body.timestamp) + config.wompi.secretoEventos;
  return sha256(cadena) === String(body?.signature?.checksum || "").toLowerCase();
}
