// Enrutador de la app: una sola página que muestra la pantalla según la ruta.
//   /r/CODIGO          → huésped (lo que abre el QR)
//   /reserva/CODIGO    → estado de la reserva del huésped
//   /pago-demo/CODIGO  → pago simulado (solo modo prueba, sin Wompi)
//   /anfitrion         → panel del anfitrión
//   /conductor         → pantalla del conductor
//   /admin             → tablero de control
// En modo prueba aparece arriba una barra para saltar entre pantallas con un clic.

import { api, esc, marcaHTML, $ } from "./comun.js";

export const estado = { config: { marca: "Llegá", modoPrueba: false } };

async function iniciar() {
  try {
    estado.config = await api("/api/config");
  } catch { /* usa valores por defecto */ }
  document.title = `${estado.config.marca} · Traslados en Medellín`;
  if (estado.config.modoPrueba) await barraPrueba();
  await mostrar();
}

export async function ir(ruta) {
  history.pushState({}, "", ruta);
  await mostrar();
}
window.addEventListener("popstate", mostrar);

async function mostrar() {
  const ruta = location.pathname;
  const app = $("#app");
  app.innerHTML = `<div class="cargando">Cargando…</div>`;
  marcarBoton(ruta);
  window.scrollTo(0, 0);
  try {
    if (ruta.startsWith("/r/")) return (await import("./huesped.js")).pantalla(app, decodeURIComponent(ruta.slice(3)));
    if (ruta.startsWith("/reserva/")) return (await import("./reserva.js")).pantalla(app, decodeURIComponent(ruta.slice(9)));
    if (ruta.startsWith("/pago-demo/")) return (await import("./reserva.js")).pagoDemo(app, decodeURIComponent(ruta.slice(11)));
    if (ruta === "/anfitrion") return (await import("./anfitrion.js")).pantalla(app);
    if (ruta === "/conductor") return (await import("./conductor.js")).pantalla(app);
    if (ruta === "/admin") return (await import("./admin.js")).pantalla(app);
    return inicio(app);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="contenedor"><div class="tarjeta"><h2>Algo salió mal</h2><p class="suave">${esc(err.message)}</p></div></div>`;
  }
}

function inicio(app) {
  const m = estado.config.marca;
  app.innerHTML = `
    <div class="contenedor">
      <div class="encabezado">${marcaHTML(m, "Traslados privados en Medellín")}</div>
      <div class="tarjeta">
        <h1>Bienvenido a ${esc(m)}</h1>
        <p class="suave">Traslados programados al aeropuerto y terminales para huéspedes de alojamientos en Medellín.</p>
        <p class="suave peq">Si eres huésped, escanea el código QR de tu alojamiento.</p>
      </div>
      <div class="seccion inicio-roles">
        <a href="/anfitrion" data-ir class="tarjeta"><h3>Soy anfitrión</h3><span class="suave peq">Mis QR, mis huéspedes y lo que he ganado</span></a>
        <a href="/conductor" data-ir class="tarjeta"><h3>Soy conductor</h3><span class="suave peq">Viajes disponibles y mis viajes</span></a>
        <a href="/admin" data-ir class="tarjeta"><h3>Administración</h3><span class="suave peq">Tablero de control</span></a>
      </div>
    </div>`;
  app.querySelectorAll("[data-ir]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); ir(a.getAttribute("href")); }));
}

// ---------- Barra de modo prueba ----------

let opciones = { propiedades: [], anfitriones: [], conductores: [] };

async function barraPrueba() {
  try { opciones = await api("/api/prueba/opciones"); } catch { return; }
  const cont = $("#barra-prueba");
  const sel = (id, lista, texto) =>
    `<select id="${id}" title="Ver como">${lista.map((x) => `<option value="${esc(x.codigo || x.id)}">${esc(texto(x))}</option>`).join("")}</select>`;
  cont.innerHTML = `
    <div class="barra-prueba">
      <span class="etiqueta">MODO PRUEBA</span>
      <button data-p="huesped">👤 Huésped</button>${sel("p-prop", opciones.propiedades, (x) => x.nombre)}
      <button data-p="anfitrion">🏠 Anfitrión</button>${sel("p-anf", opciones.anfitriones, (x) => x.nombre)}
      <button data-p="conductor">🚐 Conductor</button>${sel("p-cond", opciones.conductores, (x) => `${x.nombre} (${x.vehiculo})`)}
      <button data-p="admin">📊 Admin</button>
    </div>`;
  cont.querySelectorAll("button[data-p]").forEach((b) => b.addEventListener("click", () => saltar(b.dataset.p)));
  ["p-anf", "p-cond"].forEach((id) => $(`#${id}`).addEventListener("change", () => saltar(id === "p-anf" ? "anfitrion" : "conductor")));
  $("#p-prop").addEventListener("change", () => saltar("huesped"));
}

async function saltar(p) {
  if (p === "huesped") return ir(`/r/${$("#p-prop").value}`);
  const id = p === "anfitrion" ? $("#p-anf").value : p === "conductor" ? $("#p-cond").value : 0;
  await api("/api/prueba/entrar", { datos: { rol: p, id } });
  ir(`/${p}`);
}

function marcarBoton(ruta) {
  const p = ruta.startsWith("/r/") || ruta.startsWith("/reserva") || ruta.startsWith("/pago-demo") ? "huesped" : ruta.slice(1);
  document.querySelectorAll(".barra-prueba button[data-p]").forEach((b) => b.classList.toggle("activo", b.dataset.p === p));
}

/** Formulario de entrada (anfitrión y conductor con teléfono + PIN; admin con clave). */
export function login(app, rol, alEntrar) {
  const titulos = { anfitrion: "Panel del anfitrión", conductor: "Conductores", admin: "Administración" };
  app.innerHTML = `
    <div class="contenedor login">
      <div class="encabezado">${marcaHTML(estado.config.marca, titulos[rol])}</div>
      <form class="tarjeta col" id="f-login">
        <h2>Entrar</h2>
        ${rol === "admin"
          ? `<label class="campo">Clave<input type="password" name="clave" autocomplete="current-password" required></label>`
          : `<label class="campo">Celular<input type="tel" name="telefono" placeholder="300 123 4567" required></label>
             <label class="campo">PIN<input type="password" name="pin" inputmode="numeric" maxlength="6" required></label>`}
        <p class="error" id="e-login"></p>
        <button class="btn prim grande">Entrar</button>
        ${estado.config.modoPrueba ? `<p class="suave peq centro">Modo prueba: usa la barra de arriba para entrar con un clic.</p>` : ""}
      </form>
    </div>`;
  $("#f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/entrar", { datos: { rol, ...datos } });
      alEntrar();
    } catch (err) {
      $("#e-login").textContent = err.message;
    }
  });
}

export async function salir() {
  await api("/api/salir", { datos: {} });
  ir(location.pathname);
}

iniciar();
