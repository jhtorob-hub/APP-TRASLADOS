// Pruebas sin servidor: precios, firma de Wompi, lectura de eventos de Evolution, comandos del conductor.
// Uso: DATABASE_URL=x node pruebas/unidades.mjs   (no toca la base)
import crypto from "node:crypto";
process.env.WOMPI_SECRETO_EVENTOS = "secreto_prueba";
process.env.DATABASE_URL ||= "postgres://nadie@localhost/x";
const { calcular, AJUSTES_INICIALES, recomendado, pctAnfitrion } = await import("../src/precios.js");
const { eventoValido, codigoDeReferencia } = await import("../src/wompi.js");
const { leerEventoEvolution, comandoDe } = await import("../src/bot-conductor.js");
const ok = (c, m) => { console.log(c ? "✓" : "✗", m); if (!c) process.exitCode = 1; };
const aj = AJUSTES_INICIALES;

// Precios = tarifario en Excel (zona A → JMC, pago sedán 120.000).
const s = calcular({ pagoSedan: 120000, vehiculo: "sedan", aj, pctAnfitrion: 0.05 });
ok(s.precio === 150000 && s.pago === 120000 && s.comision === 7500 && s.pasarela === 4500 && s.neto === 18000, `Sedán ${JSON.stringify(s)}`);
const c = calcular({ pagoSedan: 120000, vehiculo: "camioneta", aj, pctAnfitrion: 0.05 });
ok(c.precio === 205000 && c.pago === 162000, `Camioneta ${c.precio}`);
const v = calcular({ pagoSedan: 120000, vehiculo: "van", aj, pctAnfitrion: 0.05 });
ok(v.precio === 330000 && v.pago === 264000, `Van ${v.precio}`);
const n = calcular({ pagoSedan: 120000, vehiculo: "sedan", aj, nocturno: true, pctAnfitrion: 0.05 });
ok(n.precio === 175000 && n.pago === 140000, `Sedán nocturno ${n.precio} / conductor ${n.pago}`);
const sin = calcular({ pagoSedan: 120000, vehiculo: "sedan", aj, pctAnfitrion: 0 });
ok(sin.neto === 25500, `Sin anfitrión el neto sube a ${sin.neto}`);
ok(recomendado(2, 2) === "sedan" && recomendado(4, 2) === "camioneta" && recomendado(3, 6) === "van" && recomendado(20, 2) === null, "Vehículo recomendado");
ok(pctAnfitrion({}, 10, aj) === 0.05 && pctAnfitrion({}, 60, aj) === 0.06 && pctAnfitrion({}, 250, aj) === 0.07 && pctAnfitrion({ comision_pct: 0.08 }, 1, aj) === 0.08, "Comisión por volumen");

// Firma de eventos de Wompi.
const data = { transaction: { id: "1234-1610641025-49201", status: "APPROVED", amount_in_cents: 15000000, reference: "ABCDE-LX1" } };
const timestamp = 1530291411;
const checksum = crypto.createHash("sha256").update(`1234-1610641025-49201APPROVED15000000${timestamp}secreto_prueba`).digest("hex");
const ev = { event: "transaction.updated", data, signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum }, timestamp };
ok(eventoValido(ev), "Firma de Wompi válida");
ok(!eventoValido({ ...ev, signature: { ...ev.signature, checksum: "x" } }), "Firma de Wompi alterada se rechaza");
ok(codigoDeReferencia("ABCDE-LX1") === "ABCDE" && codigoDeReferencia("DEMO-1-LX1") === "DEMO-1", "Código desde la referencia");

// Evento de Evolution (número normal y @lid).
ok(leerEventoEvolution({ data: { key: { remoteJid: "573001112233@s.whatsapp.net", fromMe: false }, message: { conversation: "1" } } })?.telefono === "573001112233", "Evento Evolution normal");
ok(leerEventoEvolution({ data: { key: { remoteJid: "123@lid", senderPn: "573001112233@s.whatsapp.net" }, message: { extendedTextMessage: { text: "voy" } } } })?.telefono === "573001112233", "Evento Evolution @lid");
ok(leerEventoEvolution({ data: { key: { remoteJid: "573001112233@s.whatsapp.net", fromMe: true }, message: { conversation: "x" } } }) === null, "Ignora mensajes propios");

// Comandos.
const casos = { "1": "aceptar", "Sí": "aceptar", "2": "rechazar", "OK": "confirmada", "voy en camino": "en_camino", "Llegué!": "llego", "ya lo recogí": "recogido", "Entregué.": "terminada", "viajes": "viajes", "hola qué más": null };
for (const [t, e] of Object.entries(casos)) ok(comandoDe(t) === e, `"${t}" → ${comandoDe(t)}`);
