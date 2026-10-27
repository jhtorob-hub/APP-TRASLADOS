// Estado de la reserva para el huésped (enlace que le llega por WhatsApp) y pago simulado del modo prueba.

import { api, esc, pesos, $, fechaHora, marcaHTML, aviso } from "./comun.js";
import { estado as global, ir } from "./app.js";

const T = {
  es: {
    titulo: "Tu reserva", pagada: "¡Reserva confirmada!", pendiente: "Pago pendiente", cancelada: "Reserva cancelada", terminada: "Viaje terminado",
    pasos: ["Pago recibido", "Conductor asignado", "Conductor en camino", "En el vehículo", "Llegaste"],
    recogida: "Recogida", aterriza: "Aterriza", vuelo: "Vuelo", vehiculo: "Vehículo", total: "Pagado",
    conductor: "Tu conductor", conductorPronto: "12 horas antes del viaje te enviamos por WhatsApp el nombre, la foto, la placa y el contacto de tu conductor.",
    escribir: "Escribir al conductor", regreso: "Reserva tu regreso al aeropuerto con 10% de descuento", regresoBtn: "Reservar regreso",
    pagarDeNuevo: "Pagar", verificando: "Confirmando tu pago…", espera: (m) => `Incluye ${m} min de espera desde que aterrizas.`,
    sujeto: "Estamos confirmando tu conductor. Si no hay disponibilidad, te devolvemos el 100%.",
    pasajeros: "pasajeros",
  },
  en: {
    titulo: "Your booking", pagada: "Booking confirmed!", pendiente: "Payment pending", cancelada: "Booking cancelled", terminada: "Trip completed",
    pasos: ["Payment received", "Driver assigned", "Driver on the way", "On board", "Arrived"],
    recogida: "Pickup", aterriza: "Landing", vuelo: "Flight", vehiculo: "Vehicle", total: "Paid",
    conductor: "Your driver", conductorPronto: "12 hours before your trip we'll send your driver's name, photo, plate and contact by WhatsApp.",
    escribir: "Message your driver", regreso: "Book your ride back to the airport with 10% off", regresoBtn: "Book return",
    pagarDeNuevo: "Pay", verificando: "Confirming your payment…", espera: (m) => `${m} min of waiting included after landing.`,
    sujeto: "We're confirming your driver. If none is available, you get a full refund.",
    pasajeros: "passengers",
  },
};
const VEH = { es: { sedan: "Sedán", camioneta: "Camioneta", van: "Van" }, en: { sedan: "Sedan", camioneta: "SUV", van: "Van" } };
const PASO = { pagada: 0, asignada: 1, confirmada: 1, en_camino: 2, llego: 2, recogido: 3, terminada: 4 };

export async function pantalla(app, codigo) {
  const params = new URLSearchParams(location.search);
  const t0 = params.get("t");
  const idTx = params.get("id"); // Wompi agrega ?id=<transacción> al volver
  if (idTx) {
    app.innerHTML = `<div class="contenedor"><div class="tarjeta centro"><p>${T.es.verificando}</p></div></div>`;
    try { await api(`/api/reservas/${codigo}/verificar`, { datos: { t: t0, id: idTx } }); } catch { /* el webhook lo confirmará */ }
  }
  let r;
  try {
    r = await api(`/api/reservas/${codigo}?t=${encodeURIComponent(t0 || "")}`);
  } catch (e) {
    app.innerHTML = `<div class="contenedor"><div class="tarjeta"><p>${esc(e.message)}</p></div></div>`;
    return;
  }
  const t = T[r.idioma] || T.es;
  document.documentElement.lang = r.idioma;
  const paso = PASO[r.estado];
  const titulo = r.estado === "cancelada" ? t.cancelada : r.estado === "terminada" ? t.terminada : ["pendiente_pago", "vencida"].includes(r.estado) ? t.pendiente : t.pagada;
  const destino = r.idioma === "en" ? r.destino.nombre_en : r.destino.nombre;
  const ruta = r.sentido === "al_destino" ? `${r.direccion} → ${destino}` : `${destino} → ${r.direccion}`;
  const c = r.conductor;
  app.innerHTML = `
    <div class="contenedor">
      <div class="encabezado">${marcaHTML(global.config.marca)}<span class="suave peq">#${esc(r.codigo)}</span></div>
      <div class="tarjeta">
        <h1>${titulo}</h1>
        <p class="suave" style="margin:6px 0 0">${esc(r.nombre)} · ${r.pasajeros} ${t.pasajeros}</p>
        ${r.disponibilidad === "sujeto" && r.estado === "pagada" ? `<div class="nota amarilla" style="margin-top:12px">⏳ ${t.sujeto}</div>` : ""}
        ${r.puedePagar ? `<button class="btn prim grande" id="b-pagar" style="margin-top:14px">${t.pagarDeNuevo} ${pesos(r.precio)}</button>` : ""}
      </div>
      ${paso != null ? `
      <div class="tarjeta">
        <ol class="linea-tiempo">${t.pasos.map((p, i) => `<li class="${i <= paso ? "hecho" : i === paso + 1 ? "actual" : ""}"><span class="punto"></span><span>${p}</span></li>`).join("")}</ol>
      </div>` : ""}
      <div class="tarjeta col">
        <div class="fila entre"><span class="suave">${r.sentido === "desde_destino" && r.vuelo ? t.aterriza : t.recogida}</span><b>${fechaHora(r.sentido === "desde_destino" ? r.hora_vuelo : r.recogida, r.idioma)}</b></div>
        ${r.vuelo ? `<div class="fila entre"><span class="suave">${t.vuelo}</span><b>${esc(r.vuelo)}</b></div>` : ""}
        <div class="fila entre"><span class="suave">${t.vehiculo}</span><b>${VEH[r.idioma]?.[r.vehiculo] || r.vehiculo}</b></div>
        <div class="peq">📍 ${esc(ruta)}</div>
        ${r.sentido === "desde_destino" ? `<div class="suave peq">${t.espera(r.espera)}</div>` : ""}
        <div class="fila entre"><span class="suave">${t.total}</span><b>${pesos(r.precio)} COP</b></div>
      </div>
      ${["pagada", "asignada", "confirmada", "en_camino", "llego", "recogido"].includes(r.estado) ? `
      <div class="tarjeta">
        <h2 style="margin-bottom:12px">${t.conductor}</h2>
        ${c ? `<div class="conductor-card">
            <div class="avatar">${c.foto ? `<img src="${esc(c.foto)}" alt="">` : esc((c.nombre || "?").slice(0, 1))}</div>
            <div><b>${esc(c.nombre)}</b><div class="suave peq">${esc(c.vehiculo || "")}</div><span class="placa">${esc(c.placa)}</span></div>
          </div>
          <a class="btn grande" style="margin-top:14px" href="https://wa.me/${esc(c.telefono)}" target="_blank" rel="noopener">💬 ${t.escribir}</a>`
          : `<p class="suave" style="margin:0">${t.conductorPronto}</p>`}
      </div>` : ""}
      ${r.sentido === "desde_destino" && r.propiedad && !["cancelada", "pendiente_pago", "vencida"].includes(r.estado) ? `
      <div class="tarjeta" style="background:var(--acento-claro);border-color:#f5d9a8">
        <h3>${t.regreso}</h3>
        <button class="btn acento grande" style="margin-top:12px" id="b-regreso">${t.regresoBtn}</button>
      </div>` : ""}
    </div>`;
  $("#b-pagar")?.addEventListener("click", async () => {
    try {
      const x = await api(`/api/reservas/${codigo}/pagar`, { datos: { t: t0 } });
      location.href = x.pagoUrl;
    } catch (e) { aviso(e.message); }
  });
  $("#b-regreso")?.addEventListener("click", () => ir(`/r/${r.propiedad}?regreso=${r.codigo}&lang=${r.idioma}`));
  // Se refresca solo mientras el viaje está en curso.
  if (["pendiente_pago", "pagada", "asignada", "confirmada", "en_camino", "llego", "recogido"].includes(r.estado)) {
    clearTimeout(window.__refresco);
    window.__refresco = setTimeout(() => { if (location.pathname === `/reserva/${codigo}`) pantalla(app, codigo); }, 20000);
  }

}

/** Pago simulado: solo aparece cuando la app no tiene llaves de Wompi (modo prueba). */
export async function pagoDemo(app, codigo) {
  const t0 = new URLSearchParams(location.search).get("t") || "";
  let r;
  try { r = await api(`/api/reservas/${codigo}?t=${encodeURIComponent(t0)}`); } catch (e) {
    app.innerHTML = `<div class="contenedor"><div class="tarjeta">${esc(e.message)}</div></div>`;
    return;
  }
  app.innerHTML = `
    <div class="contenedor">
      <div class="encabezado">${marcaHTML(global.config.marca, "Pago")}</div>
      <div class="tarjeta col">
        <div class="nota amarilla"><b>Pago simulado (modo prueba).</b> Cuando conectes Wompi, aquí se abrirá el pago real con tarjeta, PSE o Nequi.</div>
        <div class="fila entre"><span class="suave">Reserva</span><b>#${esc(r.codigo)}</b></div>
        <div class="fila entre"><span class="suave">Cliente</span><b>${esc(r.nombre)}</b></div>
        <div class="fila entre"><span class="suave">Total</span><b style="font-size:1.4rem">${pesos(r.precio)} COP</b></div>
        <button class="btn prim grande" id="b-aprobar">✅ Aprobar pago</button>
        <button class="btn grande" id="b-cancelar">Cancelar</button>
      </div>
    </div>`;
  $("#b-aprobar").addEventListener("click", async () => {
    await api(`/api/pago-demo/${codigo}`, { datos: { t: t0 } });
    ir(`/reserva/${codigo}?t=${encodeURIComponent(t0)}`);
  });
  $("#b-cancelar").addEventListener("click", () => ir(`/reserva/${codigo}?t=${encodeURIComponent(t0)}`));
}
