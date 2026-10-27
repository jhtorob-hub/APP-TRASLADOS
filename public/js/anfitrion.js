// Panel del anfitrión: sus QR, el enlace para el mensaje de bienvenida de Airbnb, lo ganado y los viajes.

import { api, esc, pesos, $, $$, fechaHora, marcaHTML, copiar, VEH_ES } from "./comun.js";
import { estado as global, login, salir } from "./app.js";

const MENSAJE = {
  es: (marca, enlace) => `🚐 ¿Necesitas transporte desde o hacia el aeropuerto? Reserva tu traslado privado con precio fijo con ${marca}: el conductor sigue tu vuelo y te espera con tu nombre. Reserva aquí: ${enlace}`,
  en: (marca, enlace) => `🚐 Need a ride from or to the airport? Book a private transfer at a fixed price with ${marca}: your driver tracks your flight and waits for you with a sign. Book here: ${enlace}`,
};

export async function pantalla(app) {
  let datos, viajes;
  try {
    [datos, viajes] = await Promise.all([api("/api/anfitrion/resumen"), api("/api/anfitrion/viajes")]);
  } catch (e) {
    if (e.status === 401) return login(app, "anfitrion", () => pantalla(app));
    throw e;
  }
  const m = global.config.marca;
  const tot = datos.totales;
  const visitas = datos.propiedades.reduce((s, p) => s + p.visitas_30d, 0);
  const reservas = datos.propiedades.reduce((s, p) => s + p.reservas_30d, 0);
  app.innerHTML = `
    <div class="contenedor ancho">
      <div class="encabezado">${marcaHTML(m, "Panel del anfitrión")}<button class="btn chico" id="b-salir">Salir</button></div>
      <h1>Hola, ${esc(datos.anfitrion.nombre)}</h1>
      <p class="suave" style="margin:4px 0 16px">Ganas el <b>${Math.round(datos.pct * 1000) / 10}%</b> de cada traslado que reserven tus huéspedes.</p>
      <div class="kpis">
        <div class="kpi destacado"><div class="t">Ganado este mes</div><div class="v">${pesos(tot.ganado_mes)}</div></div>
        <div class="kpi"><div class="t">Por pagarte</div><div class="v">${pesos(tot.por_pagar)}</div></div>
        <div class="kpi"><div class="t">Viajes este mes</div><div class="v">${tot.viajes_mes}</div></div>
        <div class="kpi"><div class="t">Huéspedes que reservan (30 días)</div><div class="v">${visitas ? Math.round((reservas / visitas) * 100) : 0}%</div></div>
      </div>

      <h2 style="margin:24px 0 12px">Tus alojamientos y sus QR</h2>
      <div class="col">
        ${datos.propiedades.map((p) => `
          <div class="tarjeta propiedad-card">
            <img class="qr" src="${p.qr}" alt="QR de ${esc(p.nombre)}">
            <div class="col" style="gap:8px">
              <div class="fila entre envuelve"><h3>${esc(p.nombre)}</h3><span class="suave peq">${p.visitas_30d} escaneos · ${p.reservas_30d} reservas (30 días)</span></div>
              <div class="suave peq">📍 ${esc(p.direccion)}</div>
              <div class="copiable">${esc(p.enlace)}</div>
              <div class="fila envuelve">
                <button class="btn chico" data-copiar="${esc(p.enlace)}">Copiar enlace</button>
                <a class="btn chico" href="${p.qr}?descargar=1">Descargar QR</a>
                <button class="btn chico" data-msj="es" data-enlace="${esc(p.enlace)}">Mensaje de bienvenida (ES)</button>
                <button class="btn chico" data-msj="en" data-enlace="${esc(p.enlace)}">Welcome message (EN)</button>
              </div>
            </div>
          </div>`).join("")}
      </div>
      <div class="nota verde" style="margin-top:12px">💡 Lo que más reservas trae: pegar el enlace en el <b>mensaje automático de bienvenida de Airbnb</b> (el huésped lo ve antes de llegar). El QR impreso en el apartamento sirve para el regreso.</div>

      <h2 style="margin:24px 0 12px">Viajes de tus huéspedes</h2>
      ${viajes.length ? `
      <div class="tabla-envoltura"><table class="tabla compacta">
        <thead><tr><th>Fecha</th><th>Huésped</th><th class="ocultar-movil">Alojamiento</th><th class="ocultar-movil">Viaje</th><th>Estado</th><th>Tu comisión</th></tr></thead>
        <tbody>${viajes.map((v) => `<tr>
          <td>${fechaHora(v.recogida)}</td><td>${esc(v.huesped)}</td><td class="ocultar-movil">${esc(v.propiedad || "")}</td>
          <td class="ocultar-movil">${VEH_ES[v.vehiculo]} · ${v.sentido === "al_destino" ? "→" : "←"} ${esc(v.destino || "")}</td>
          <td><span class="estado">${esc(v.estadoTexto)}</span></td><td><b>${pesos(v.comision_anfitrion)}</b></td></tr>`).join("")}</tbody>
      </table></div>` : `<div class="tarjeta suave">Todavía no hay viajes. Comparte tu enlace con tus huéspedes.</div>`}
    </div>`;
  $("#b-salir").addEventListener("click", salir);
  $$("[data-copiar]", app).forEach((b) => b.addEventListener("click", () => copiar(b.dataset.copiar)));
  $$("[data-msj]", app).forEach((b) => b.addEventListener("click", () => copiar(MENSAJE[b.dataset.msj](m, b.dataset.enlace))));
}
