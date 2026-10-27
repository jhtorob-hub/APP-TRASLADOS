// Pantalla del conductor (celular): viajes disponibles, mis viajes con botones de estado, mis ganancias.

import { api, esc, pesos, $, $$, fechaHora, hora, marcaHTML, aviso, VEH_ES } from "./comun.js";
import { estado as global, login, salir } from "./app.js";

const SIGUIENTE = {
  asignada: [["confirmada", "👍 Confirmo el viaje"], ["en_camino", "🚐 Voy en camino"]],
  confirmada: [["en_camino", "🚐 Voy en camino"]],
  en_camino: [["llego", "📍 Llegué"]],
  llego: [["recogido", "✅ Recogí al huésped"]],
  recogido: [["terminada", "🏁 Entregué"]],
};

export async function pantalla(app) {
  let d;
  try {
    d = await api("/api/conductor/inicio");
  } catch (e) {
    if (e.status === 401) return login(app, "conductor", () => pantalla(app));
    throw e;
  }
  const mapa = (dir) => `https://maps.google.com/?q=${encodeURIComponent(dir)}`;
  const ruta = (v) => (v.sentido === "al_destino" ? `${v.direccion} → ${v.destino}` : `${v.destino} → ${v.direccion}`);
  app.innerHTML = `
    <div class="contenedor">
      <div class="encabezado">${marcaHTML(global.config.marca, "Conductores")}<button class="btn chico" id="b-salir">Salir</button></div>
      <div class="fila entre"><div><h1>${esc(d.yo.nombre)}</h1><div class="suave peq">${VEH_ES[d.yo.vehiculo]} · <span class="placa">${esc(d.yo.placa || "—")}</span> ${d.yo.empresa ? `· ${esc(d.yo.empresa)}` : ""}</div></div></div>
      <div class="kpis" style="margin-top:14px">
        <div class="kpi destacado"><div class="t">Esta semana</div><div class="v">${pesos(d.ganancias.semana)}</div></div>
        <div class="kpi"><div class="t">Por cobrar</div><div class="v">${pesos(d.ganancias.por_cobrar)}</div></div>
      </div>

      <h2 style="margin:22px 0 10px">Viajes disponibles ${d.ofertas.length ? `<span class="insignia rec">${d.ofertas.length}</span>` : ""}</h2>
      ${d.ofertas.length ? d.ofertas.map((v) => `
        <div class="tarjeta viaje-cond oferta col" style="gap:8px">
          <div class="fila entre"><b>${fechaHora(v.recogida)}</b>${v.nocturno ? `<span class="insignia rec">🌙 Nocturno</span>` : ""}</div>
          <div class="peq">📍 ${esc(ruta(v))}</div>
          <div class="suave peq">${v.vuelo ? `✈️ ${esc(v.vuelo)} (${v.tipo_vuelo}) · ` : ""}👥 ${v.pasajeros} · 🧳 ${v.maletas} · ${VEH_ES[v.vehiculo]}</div>
          <div class="fila entre"><span style="font-size:1.3rem;font-weight:800">${pesos(v.pago_conductor)}</span>
            <div class="fila"><button class="btn chico" data-rechazar="${v.id}">No puedo</button><button class="btn prim" data-aceptar="${v.id}">Tomar viaje</button></div></div>
        </div>`).join("") : `<div class="tarjeta suave peq">No hay viajes disponibles ahora. Te llegan también por WhatsApp.</div>`}

      <h2 style="margin:22px 0 10px">Mis próximos viajes</h2>
      ${d.viajes.length ? d.viajes.map((v) => `
        <div class="tarjeta viaje-cond col" style="gap:8px">
          <div class="fila entre"><b>${fechaHora(v.recogida)}</b><span class="estado verde">${esc(v.estadoTexto)}</span></div>
          <div class="peq">📍 ${esc(ruta(v))}</div>
          ${v.vuelo ? `<div class="peq">✈️ ${v.sentido === "desde_destino" ? "Aterriza" : "Sale"} <b>${esc(v.vuelo)}</b> a las ${hora(v.hora_vuelo)} (${v.tipo_vuelo})</div>` : ""}
          <div class="peq">👤 <b>${esc(v.huesped)}</b>${v.idioma === "en" ? " · habla inglés" : ""} · 👥 ${v.pasajeros} · 🧳 ${v.maletas}</div>
          ${v.notas ? `<div class="nota amarilla">📝 ${esc(v.notas)}</div>` : ""}
          <div class="fila envuelve">
            <a class="btn chico" href="https://wa.me/${esc(v.huesped_telefono)}" target="_blank" rel="noopener">💬 WhatsApp huésped</a>
            <a class="btn chico" href="${mapa(v.direccion)}" target="_blank" rel="noopener">🗺️ Mapa</a>
            ${v.sentido === "desde_destino" ? `<button class="btn chico" data-letrero="${esc(v.huesped)}">🪧 Letrero</button>` : ""}
          </div>
          <div class="acciones-estado">${(SIGUIENTE[v.estado] || []).map(([k, t]) => `<button class="btn prim" data-estado="${k}" data-viaje="${v.id}">${t}</button>`).join("")}</div>
          <div class="suave peq">Ganas ${pesos(v.pago_conductor)}</div>
        </div>`).join("") : `<div class="tarjeta suave peq">No tienes viajes asignados.</div>`}

      <h2 style="margin:22px 0 10px">Últimos viajes</h2>
      <div class="tarjeta">${d.historial.length ? d.historial.map((h) => `<div class="fila entre peq" style="padding:6px 0;border-bottom:1px solid var(--borde)"><span>${fechaHora(h.recogida)} · ${esc(h.destino || "")}</span><span><b>${pesos(h.pago_conductor)}</b> ${h.liquidado_conductor_en ? "✅" : "⏳"}</span></div>`).join("") : `<span class="suave peq">Aún no hay viajes terminados.</span>`}
        <p class="suave peq" style="margin:8px 0 0">✅ pagado · ⏳ por pagar (liquidación semanal)</p></div>
    </div>`;
  $("#b-salir").addEventListener("click", salir);
  const accion = async (ruta, datos, ok) => {
    try { await api(ruta, { datos }); aviso(ok); pantalla(app); } catch (e) { aviso(e.message); pantalla(app); }
  };
  $$("[data-aceptar]", app).forEach((b) => b.addEventListener("click", () => accion(`/api/conductor/ofertas/${b.dataset.aceptar}/aceptar`, {}, "¡Viaje tomado!")));
  $$("[data-rechazar]", app).forEach((b) => b.addEventListener("click", () => accion(`/api/conductor/ofertas/${b.dataset.rechazar}/rechazar`, {}, "Listo")));
  $$("[data-estado]", app).forEach((b) => b.addEventListener("click", () => accion(`/api/conductor/viajes/${b.dataset.viaje}/estado`, { estado: b.dataset.estado }, "Actualizado")));
  $$("[data-letrero]", app).forEach((b) => b.addEventListener("click", () => letrero(b.dataset.letrero)));
}

/** Letrero de pantalla completa con el nombre del huésped para la sala de llegadas. */
function letrero(nombre) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;z-index:100;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;cursor:pointer";
  el.innerHTML = `<div style="font-size:1rem;font-weight:800;color:#14634A;letter-spacing:.1em">${esc(global.config.marca.toUpperCase())}</div>
    <div style="font-size:clamp(2.5rem,12vw,6rem);font-weight:800;line-height:1.05;margin-top:12px;color:#0B3B2E">${esc(nombre)}</div>
    <div style="margin-top:24px;color:#5F6763">Toca para cerrar</div>`;
  el.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}
