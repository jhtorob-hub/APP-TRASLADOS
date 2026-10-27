// Prueba de punta a punta contra un servidor corriendo (modo prueba, pago simulado, WhatsApp sin conectar).
// Uso: URL=http://localhost:3100 CLAVE_ADMIN=admin node pruebas/flujo.mjs

const URL_BASE = process.env.URL || "http://localhost:3100";
let cookie = "";
async function api(ruta, datos) {
  const r = await fetch(URL_BASE + ruta, {
    method: datos ? "POST" : "GET",
    headers: { "Content-Type": "application/json", cookie },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${ruta} → ${r.status} ${j.error || ""}`);
  return j;
}
const ok = (cond, msj) => { if (!cond) { console.error("✗", msj); process.exitCode = 1; } else console.log("✓", msj); };
const bog = (ms) => new Date(Date.now() + ms).toLocaleString("sv-SE", { timeZone: "America/Bogota" }).split(" ");

// 1. Huésped reserva una llegada en ~20 h (entra a la ventana de 24 h → se ofrece de una vez).
const [fecha, horaCompleta] = bog(20 * 3600000);
const hora = horaCompleta.slice(0, 5);
const telHuesped = "1555" + String(Date.now()).slice(-7);
const cot = await api("/api/cotizar", { propiedad: "DEMO1", sentido: "desde_destino", destino: "JMC", tipo_vuelo: "internacional", fecha, hora, pasajeros: 2, maletas: 2 });
ok(cot.precio >= 150000, `Cotización: ${cot.precio} · recogida ${cot.recogidaTexto} · ${cot.disponibilidad}`);
const res = await api("/api/reservas", { propiedad: "DEMO1", sentido: "desde_destino", destino: "JMC", tipo_vuelo: "internacional", vuelo: "aa 1123", fecha, hora, pasajeros: 2, maletas: 2, nombre: "Test Guest", telefono: telHuesped, idioma: "en" });
ok(res.pagoUrl.includes("/pago-demo/"), `Reserva ${res.codigo} creada, pago simulado`);
const t = new URL(res.pagoUrl).searchParams.get("t");

// 2. Paga.
await api(`/api/pago-demo/${res.codigo}`, { t });
let est = await api(`/api/reservas/${res.codigo}?t=${t}`);
ok(est.estado === "pagada", "Pago aprobado → pagada");

// 3. Admin entra y ve las ofertas enviadas.
await api("/api/entrar", { rol: "admin", clave: process.env.CLAVE_ADMIN || "admin" });
const lista = await api("/api/admin/viajes?vista=proximos");
const fila = lista.find((x) => x.codigo === res.codigo);
ok(fila?.semaforo === "rojo", "En el tablero aparece en rojo (sin conductor)");
const det = await api(`/api/admin/viajes/${fila.id}`);
ok(det.ofertas.length >= 1, `Ofrecida a ${det.ofertas.length} conductor(es) de sedán`);

// 4. El conductor responde "1" por WhatsApp.
const conductorTel = "573000000101";
let r = await api("/api/admin/simular-whatsapp", { telefono: conductorTel, texto: "1" });
ok(r.tipo === "aceptado" && r.reserva === res.codigo, `Conductor tomó el viaje (${r.tipo})`);
r = await api("/api/admin/simular-whatsapp", { telefono: "573000000102", texto: "1" });
ok(["tarde", "sin_oferta"].includes(r.tipo), `Segundo conductor llega tarde (${r.tipo})`);

// 5. Avanza el viaje con comandos.
for (const [texto, esperado] of [["ok", "confirmada"], ["Voy", "en_camino"], ["llegué", "llego"], ["Recogí", "recogido"], ["entregué", "terminada"]]) {
  r = await api("/api/admin/simular-whatsapp", { telefono: conductorTel, texto });
  est = await api(`/api/reservas/${res.codigo}?t=${t}`);
  ok(est.estado === esperado, `"${texto}" → ${est.estado}`);
  if (texto === "ok") ok(est.conductor === null || est.conductor?.placa, "Huésped ve conductor cuando corresponde");
}

// 6. Mensajes al huésped.
const msjs = await api("/api/admin/mensajes");
const alHuesped = msjs.filter((m) => m.telefono === telHuesped && m.sentido === "sale");
ok(alHuesped.some((m) => m.texto.includes("Booking confirmed")), "Huésped recibió confirmación (en inglés)");
ok(alHuesped.some((m) => m.texto.includes("Your driver")), "Huésped recibió datos del conductor");
ok(alHuesped.some((m) => m.texto.includes("10% off")), "Huésped recibió oferta de regreso con 10%");

// 7. Calificación del huésped.
r = await api("/api/admin/simular-whatsapp", { telefono: telHuesped, texto: "5" });
ok(r.tipo === "calificacion", "Calificación registrada");

// 8. Liquidaciones.
const liq = await api("/api/admin/liquidaciones");
ok(liq.conductores.some((c) => c.telefono === conductorTel), "Conductor aparece en liquidaciones");

// 9. Regreso con descuento.
const [f2, h2] = bog(4 * 86400000);
const cotR = await api("/api/cotizar", { propiedad: "DEMO1", sentido: "al_destino", destino: "JMC", tipo_vuelo: "internacional", fecha: f2, hora: h2.slice(0, 5), pasajeros: 2, maletas: 2, regreso: res.codigo });
ok(cotR.descuento > 0 && cotR.precio < cot.precio, `Regreso con descuento: ${cotR.precio}`);

// 10. Reserva con menos de 3 h se rechaza.
const [f3, h3] = bog(2 * 3600000);
try {
  await api("/api/cotizar", { propiedad: "DEMO1", sentido: "desde_destino", destino: "JMC", fecha: f3, hora: h3.slice(0, 5), pasajeros: 1, maletas: 1 });
  ok(false, "Debía rechazar < 3 h");
} catch (e) { ok(/mínimo/.test(e.message), "Rechaza reservas con menos de 3 h"); }

console.log(process.exitCode ? "\nHAY FALLAS" : "\nTodo bien ✅");
