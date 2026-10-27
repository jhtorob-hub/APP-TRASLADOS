// Utilidades compartidas por las 4 pantallas.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export async function api(ruta, { metodo, datos } = {}) {
  const r = await fetch(ruta, {
    method: metodo || (datos ? "POST" : "GET"),
    headers: datos ? { "Content-Type": "application/json" } : {},
    body: datos ? JSON.stringify(datos) : undefined,
    credentials: "same-origin",
  });
  let cuerpo = {};
  try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    const e = new Error(cuerpo.error || `Error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return cuerpo;
}

let temporizador;
export function aviso(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("ver");
  clearTimeout(temporizador);
  temporizador = setTimeout(() => el.classList.remove("ver"), 2600);
}

const BOG = "America/Bogota";
export const fecha = (d, idioma = "es") =>
  new Date(d).toLocaleDateString(idioma === "en" ? "en-US" : "es-CO", { timeZone: BOG, weekday: "short", day: "numeric", month: "short" });
export const hora = (d, idioma = "es") =>
  new Date(d).toLocaleTimeString(idioma === "en" ? "en-US" : "es-CO", { timeZone: BOG, hour: "numeric", minute: "2-digit" });
export const fechaHora = (d, idioma = "es") => `${fecha(d, idioma)} · ${hora(d, idioma)}`;
export const horaLocal = (d) => Number(new Date(d).toLocaleString("en-US", { timeZone: BOG, hour: "numeric", hour12: false })) % 24;

/** "AAAA-MM-DD" de hoy + n días en hora Bogotá. */
export function diaISO(n = 0) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: BOG });
}

export function copiar(texto) {
  navigator.clipboard?.writeText(texto).then(() => aviso("Copiado"), () => aviso("No se pudo copiar"));
}

export const logo = (tam = 34) => `
  <span class="logo" style="width:${tam}px;height:${tam}px">
    <svg width="${tam * 0.7}" height="${tam * 0.7}" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="18" cy="44" r="8" fill="#F2A541"/>
      <path d="M18 44 C 28 16, 42 14, 46 20" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="46" cy="20" r="6" fill="#fff"/>
    </svg>
  </span>`;

export const marcaHTML = (marca, sub = "") =>
  `<a class="marca" href="/">${logo()}<span>${esc(marca)}${sub ? `<small>${esc(sub)}</small>` : ""}</span></a>`;

/** Silueta simple por tipo de vehículo (cuando no hay foto real configurada). */
export function silueta(tipo) {
  const largo = tipo === "van" ? 84 : tipo === "camioneta" ? 76 : 70;
  const alto = tipo === "van" ? 30 : tipo === "camioneta" ? 24 : 18;
  const techo = tipo === "van"
    ? `<rect x="8" y="${38 - alto}" width="${largo - 10}" height="${alto}" rx="6" fill="#14634A"/>`
    : `<path d="M${14} ${38 - alto * 0.55} L${26} ${38 - alto} L${largo - 18} ${38 - alto} L${largo - 6} ${38 - alto * 0.5} Z" fill="#14634A"/>`;
  return `<svg width="88" height="52" viewBox="0 0 92 52" aria-hidden="true">
    ${techo}
    <rect x="4" y="${38 - alto * 0.55}" width="${largo}" height="${alto * 0.55 + 4}" rx="7" fill="#0B3B2E"/>
    <circle cx="22" cy="44" r="7" fill="#1C1F1E"/><circle cx="22" cy="44" r="3" fill="#E3E0D8"/>
    <circle cx="${largo - 12}" cy="44" r="7" fill="#1C1F1E"/><circle cx="${largo - 12}" cy="44" r="3" fill="#E3E0D8"/>
  </svg>`;
}

export const ESTADO_COLOR = {
  pagada: "rojo", asignada: "amarillo", confirmada: "verde", en_camino: "verde", llego: "verde", recogido: "verde",
  terminada: "", cancelada: "", vencida: "", pendiente_pago: "",
};

export const VEH_ES = { sedan: "Sedán", camioneta: "Camioneta", van: "Van" };
