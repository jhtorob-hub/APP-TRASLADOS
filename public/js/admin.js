// Tablero de control del administrador.

import { api, esc, pesos, $, $$, fechaHora, fecha, hora, marcaHTML, aviso, copiar, VEH_ES } from "./comun.js";
import { estado as global, login, salir } from "./app.js";

const PESTANAS = [
  ["viajes", "Viajes"], ["alertas", "Alertas"], ["conductores", "Conductores"], ["anfitriones", "Anfitriones y QR"],
  ["tarifas", "Tarifas"], ["liquidaciones", "Liquidaciones"], ["numeros", "Números"], ["mensajes", "Mensajes WhatsApp"],
];
let pestana = "viajes";
let vista = "proximos";
let app;

export async function pantalla(raiz) {
  app = raiz;
  try {
    const alertas = await api("/api/admin/alertas");
    dibujarMarco(alertas.filter((a) => !a.atendida).length);
  } catch (e) {
    if (e.status === 401) return login(app, "admin", () => pantalla(app));
    throw e;
  }
  await mostrarPestana();
}

function dibujarMarco(pendientes) {
  app.innerHTML = `
    <div class="contenedor ancho">
      <div class="encabezado">${marcaHTML(global.config.marca, "Tablero de control")}
        <div class="fila">${global.config.pagoReal ? "" : `<span class="estado amarillo">Pago simulado</span>`}${global.config.whatsappReal ? "" : `<span class="estado amarillo">WhatsApp sin conectar</span>`}<button class="btn chico" id="b-salir">Salir</button></div></div>
      <nav class="pestanas">${PESTANAS.map(([k, t]) => `<button data-tab="${k}" class="${k === pestana ? "activa" : ""}">${t}${k === "alertas" && pendientes ? `<span class="burbuja">${pendientes}</span>` : ""}</button>`).join("")}</nav>
      <div id="contenido"><div class="cargando">Cargando…</div></div>
    </div>`;
  $("#b-salir").addEventListener("click", salir);
  $$("[data-tab]", app).forEach((b) => b.addEventListener("click", () => {
    pestana = b.dataset.tab;
    $$("[data-tab]", app).forEach((x) => x.classList.toggle("activa", x === b));
    mostrarPestana();
  }));
}

async function mostrarPestana() {
  const c = $("#contenido");
  c.innerHTML = `<div class="cargando">Cargando…</div>`;
  const f = { viajes, alertas, conductores, anfitriones, tarifas, liquidaciones, numeros, mensajes }[pestana];
  try { await f(c); } catch (e) { c.innerHTML = `<div class="nota roja">${esc(e.message)}</div>`; }
}

async function refrescarBurbuja() {
  const al = await api("/api/admin/alertas");
  const n = al.filter((a) => !a.atendida).length;
  const b = $('[data-tab="alertas"]');
  if (b) b.innerHTML = `Alertas${n ? `<span class="burbuja">${n}</span>` : ""}`;
}

const accion = async (ruta, datos = {}, ok = "Listo") => {
  try { const r = await api(ruta, { datos }); aviso(ok); return r; } catch (e) { aviso(e.message); throw e; }
};

// ---------- Viajes ----------

async function viajes(c) {
  const lista = await api(`/api/admin/viajes?vista=${vista}`);
  const vistas = [["hoy", "Hoy"], ["manana", "Mañana"], ["proximos", "Próximos"], ["terminados", "Terminados y cancelados"], ["sin_pagar", "Sin pagar"]];
  const rojos = lista.filter((v) => v.semaforo === "rojo").length;
  const amarillos = lista.filter((v) => v.semaforo === "amarillo").length;
  c.innerHTML = `
    <div class="fila entre envuelve" style="margin-bottom:12px">
      <div class="chips">${vistas.map(([k, t]) => `<button class="chip ${k === vista ? "activa" : ""}" data-vista="${k}">${t}</button>`).join("")}</div>
      <div class="leyenda"><span><i class="semaforo rojo"></i> Sin conductor (${rojos})</span><span><i class="semaforo amarillo"></i> Asignado, sin confirmar (${amarillos})</span><span><i class="semaforo verde"></i> Confirmado</span></div>
    </div>
    ${lista.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th></th><th>Recogida</th><th>Reserva</th><th>Huésped</th><th>Ruta</th><th>Vehículo</th><th>Conductor</th><th>Precio</th><th>Neto</th><th>Estado</th></tr></thead>
      <tbody>${lista.map((v) => `<tr class="clic" data-id="${v.id}">
        <td><i class="semaforo ${v.semaforo}"></i></td>
        <td><b>${fecha(v.recogida)}</b><br>${hora(v.recogida)}${v.nocturno ? " 🌙" : ""}</td>
        <td>#${esc(v.codigo)}${v.disponibilidad === "sujeto" ? `<br><span class="estado amarillo">&lt;12 h</span>` : ""}</td>
        <td>${esc(v.nombre)}${v.idioma === "en" ? " 🇬🇧" : ""}<br><span class="suave peq">${esc(v.propiedad || "")}</span></td>
        <td>${v.sentido === "al_destino" ? "→" : "←"} ${esc(v.destino)}${v.vuelo ? `<br><span class="suave peq">✈️ ${esc(v.vuelo)}</span>` : ""}</td>
        <td>${VEH_ES[v.vehiculo]}<br><span class="suave peq">${v.pasajeros} pax · ${v.maletas} 🧳</span></td>
        <td>${v.conductor ? esc(v.conductor) : `<span class="estado rojo">Sin asignar</span>`}</td>
        <td>${pesos(v.precio)}</td><td>${pesos(v.neto)}</td>
        <td><span class="estado ${v.semaforo === "gris" ? "" : v.semaforo}">${esc(v.estadoTexto)}</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="tarjeta suave">No hay viajes en esta vista.</div>`}`;
  $$("[data-vista]", c).forEach((b) => b.addEventListener("click", () => { vista = b.dataset.vista; viajes(c); }));
  $$("tr[data-id]", c).forEach((tr) => tr.addEventListener("click", () => detalle(Number(tr.dataset.id))));
}

async function detalle(id) {
  const d = await api(`/api/admin/viajes/${id}`);
  const r = d.reserva;
  cerrarPanel();
  const velo = document.createElement("div");
  velo.className = "velo";
  const panel = document.createElement("aside");
  panel.className = "panel-lateral";
  const activa = ["pagada", "asignada", "confirmada", "en_camino", "llego", "recogido"].includes(r.estado);
  const sig = { asignada: ["confirmada", "en_camino"], confirmada: ["en_camino"], en_camino: ["llego"], llego: ["recogido"], recogido: ["terminada"] }[r.estado] || [];
  const nombresEstado = { confirmada: "Confirmó", en_camino: "En camino", llego: "Llegó", recogido: "Recogido", terminada: "Terminado" };
  const fechaLocal = new Date(r.recogida).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const horaLocal = new Date(r.recogida).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
  panel.innerHTML = `
    <div class="fila entre"><h2>#${esc(r.codigo)} <span class="estado ${r.semaforo === "gris" ? "" : r.semaforo}">${esc(r.estadoTexto)}</span></h2><button class="btn chico" id="p-cerrar">✕</button></div>
    <div class="tarjeta col seccion" style="gap:6px">
      <div><b>${esc(r.nombre)}</b> · <a href="https://wa.me/${esc(r.telefono)}" target="_blank" rel="noopener">+${esc(r.telefono)}</a>${r.correo ? ` · ${esc(r.correo)}` : ""} · ${r.idioma === "en" ? "inglés" : "español"}</div>
      <div>🕐 Recogida <b>${fechaHora(r.recogida)}</b>${r.nocturno ? " 🌙" : ""}</div>
      ${r.vuelo ? `<div>✈️ ${esc(r.vuelo)} (${r.tipo_vuelo}) · ${r.sentido === "desde_destino" ? "aterriza" : "sale"} ${fechaHora(r.hora_vuelo)}</div>` : ""}
      <div>📍 ${r.sentido === "al_destino" ? `${esc(r.direccion)} → ${esc(r.destino_nombre)}` : `${esc(r.destino_nombre)} → ${esc(r.direccion)}`}</div>
      <div>🚐 ${VEH_ES[r.vehiculo]} · ${r.pasajeros} pax · ${r.maletas} maletas</div>
      ${r.notas ? `<div class="nota amarilla">📝 ${esc(r.notas)}</div>` : ""}
      <div class="suave peq">Alojamiento: ${esc(r.propiedad_nombre || "—")} · ${esc(r.anfitrion_nombre || "")}</div>
      <div class="fila envuelve peq" style="margin-top:6px"><span>Precio <b>${pesos(r.precio)}</b></span><span>Conductor ${pesos(r.pago_conductor)}</span><span>Anfitrión ${pesos(r.comision_anfitrion)}</span><span>Pasarela ${pesos(r.pasarela)}</span><span>Neto <b>${pesos(r.neto)}</b></span></div>
    </div>
    ${activa ? `
    <div class="tarjeta col seccion">
      <h3>Conductor</h3>
      ${r.conductor_nombre ? `<div>${esc(r.conductor_nombre)} · <span class="placa">${esc(r.conductor_placa)}</span> · <a href="https://wa.me/${esc(r.conductor_telefono)}" target="_blank" rel="noopener">WhatsApp</a></div>` : `<div class="nota roja">Sin conductor asignado</div>`}
      <div class="fila"><select id="p-cond">${d.candidatos.map((c) => `<option value="${c.id}">${esc(c.nombre)} · ${VEH_ES[c.vehiculo]} ${esc(c.placa)}${c.ocupado ? " (ocupado cerca)" : ""}</option>`).join("")}</select>
      <button class="btn prim" id="p-asignar">${r.conductor_nombre ? "Reasignar" : "Asignar"}</button></div>
      <div class="fila envuelve">
        ${r.estado === "pagada" ? `<button class="btn chico" id="p-ofrecer">Ofrecer otra vez por WhatsApp</button>` : ""}
        ${r.conductor_id ? `<button class="btn chico" id="p-aviso">Reenviar datos al huésped</button>` : ""}
      </div>
      ${sig.length ? `<div class="fila envuelve">${sig.map((k) => `<button class="btn chico" data-est="${k}">Marcar: ${nombresEstado[k]}</button>`).join("")}</div>` : ""}
    </div>
    <div class="tarjeta col seccion">
      <h3>Cambiar hora de recogida</h3>
      <p class="suave peq" style="margin:0">Para vuelos retrasados o adelantados. Se avisa al conductor y al huésped.</p>
      <div class="dos siempre"><input type="date" id="p-fecha" value="${fechaLocal}"><input type="time" id="p-hora" value="${horaLocal}"></div>
      <button class="btn" id="p-cambiar">Guardar nueva hora</button>
    </div>
    <div class="tarjeta col seccion">
      <h3>Cancelar</h3>
      <input type="text" id="p-motivo" placeholder="Motivo (lo ve el huésped)">
      <button class="btn rojo" id="p-cancelar">Cancelar reserva</button>
      <p class="suave peq" style="margin:0">El reembolso se hace desde el panel de Wompi.</p>
    </div>` : ""}
    <div class="tarjeta seccion"><h3 style="margin-bottom:8px">Historial</h3>
      <ul class="lista-eventos">${d.eventos.map((e) => `<li><span class="suave">${fecha(e.creado)} ${hora(e.creado)}</span><span>${e.alerta ? "⚠️ " : ""}${esc(e.detalle || e.tipo)}</span></li>`).join("")}</ul></div>
    ${d.ofertas.length ? `<div class="tarjeta seccion"><h3 style="margin-bottom:8px">Ofertas enviadas</h3>${d.ofertas.map((o) => `<div class="peq">${esc(o.nombre)} (${VEH_ES[o.vehiculo]}) · ${o.respuesta ? esc(o.respuesta) : "sin respuesta"}</div>`).join("")}</div>` : ""}
    <div class="tarjeta seccion col" style="gap:8px"><h3>Mensajes</h3>${d.mensajes.map((m) => `<div class="mensaje ${m.sentido}"><div class="suave peq">${m.sentido === "sale" ? "→" : "←"} +${esc(m.telefono)} · ${fechaHora(m.creado)}</div>${esc(m.texto)}</div>`).join("") || `<span class="suave peq">Sin mensajes</span>`}</div>`;
  document.body.append(velo, panel);
  velo.addEventListener("click", cerrarPanel);
  $("#p-cerrar").addEventListener("click", cerrarPanel);
  const recargar = async () => { await detalle(id); if (pestana === "viajes") viajes($("#contenido")); refrescarBurbuja(); };
  $("#p-asignar")?.addEventListener("click", async () => { await accion(`/api/admin/viajes/${id}/asignar`, { conductor_id: $("#p-cond").value }, "Conductor asignado"); recargar(); });
  $("#p-ofrecer")?.addEventListener("click", async () => { const x = await accion(`/api/admin/viajes/${id}/ofrecer`, {}, "Ofrecido"); aviso(`Ofrecido a ${x.enviados} conductor(es)`); recargar(); });
  $("#p-aviso")?.addEventListener("click", async () => { await accion(`/api/admin/viajes/${id}/reenviar-aviso`, {}, "Enviado al huésped"); recargar(); });
  $$("[data-est]", panel).forEach((b) => b.addEventListener("click", async () => { await accion(`/api/admin/viajes/${id}/estado`, { estado: b.dataset.est }, "Actualizado"); recargar(); }));
  $("#p-cambiar")?.addEventListener("click", async () => { await accion(`/api/admin/viajes/${id}/hora`, { fecha: $("#p-fecha").value, hora: $("#p-hora").value }, "Hora cambiada y avisada"); recargar(); });
  $("#p-cancelar")?.addEventListener("click", async () => {
    if (!confirm("¿Cancelar esta reserva? Se le avisa al huésped y al conductor.")) return;
    await accion(`/api/admin/viajes/${id}/cancelar`, { motivo: $("#p-motivo").value }, "Cancelada");
    recargar();
  });
}
function cerrarPanel() { document.querySelectorAll(".panel-lateral, .velo").forEach((x) => x.remove()); }

// ---------- Alertas ----------

async function alertas(c) {
  const lista = await api("/api/admin/alertas");
  c.innerHTML = `
    <div class="fila entre" style="margin-bottom:12px"><p class="suave" style="margin:0">También te llegan por WhatsApp al número del administrador.</p>
      ${lista.some((a) => !a.atendida) ? `<button class="btn chico" id="a-todas">Marcar todas como atendidas</button>` : ""}</div>
    ${lista.length ? `<div class="col">${lista.map((a) => `
      <div class="tarjeta fila entre" style="${a.atendida ? "opacity:.55" : ""}">
        <div><div class="suave peq">${fechaHora(a.creado)}${a.codigo ? ` · #${esc(a.codigo)}` : ""}</div><div>${esc(a.detalle)}</div></div>
        <div class="fila">${a.reserva_id ? `<button class="btn chico" data-ver="${a.reserva_id}">Ver viaje</button>` : ""}${a.atendida ? "" : `<button class="btn chico" data-ok="${a.id}">Atendida</button>`}</div>
      </div>`).join("")}</div>` : `<div class="tarjeta suave">Sin alertas. 🎉</div>`}`;
  $("#a-todas")?.addEventListener("click", async () => { await accion("/api/admin/alertas/atender-todas"); alertas(c); refrescarBurbuja(); });
  $$("[data-ok]", c).forEach((b) => b.addEventListener("click", async () => { await accion(`/api/admin/alertas/${b.dataset.ok}/atendida`); alertas(c); refrescarBurbuja(); }));
  $$("[data-ver]", c).forEach((b) => b.addEventListener("click", () => detalle(Number(b.dataset.ver))));
}

// ---------- Formularios genéricos ----------

function formulario(titulo, campos, valores, alGuardar) {
  cerrarPanel();
  const velo = document.createElement("div");
  velo.className = "velo";
  const panel = document.createElement("aside");
  panel.className = "panel-lateral";
  panel.innerHTML = `
    <div class="fila entre"><h2>${titulo}</h2><button class="btn chico" id="f-cerrar">✕</button></div>
    <form class="tarjeta col seccion" id="f-form">
      ${campos.map((f) => {
        const v = valores[f.k] ?? f.def ?? "";
        if (f.tipo === "select") return `<label class="campo">${f.t}<select name="${f.k}">${f.opciones.map(([ov, ot]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? "selected" : ""}>${esc(ot)}</option>`).join("")}</select></label>`;
        if (f.tipo === "check") return `<label class="fila"><input type="checkbox" name="${f.k}" ${v !== false ? "checked" : ""}> ${f.t}</label>`;
        return `<label class="campo">${f.t}<input type="${f.tipo || "text"}" name="${f.k}" value="${esc(v)}" ${f.req ? "required" : ""} placeholder="${esc(f.ph || "")}">${f.ayuda ? `<span class="ayuda">${f.ayuda}</span>` : ""}</label>`;
      }).join("")}
      <p class="error" id="f-error"></p>
      <button class="btn prim grande">Guardar</button>
    </form>`;
  document.body.append(velo, panel);
  velo.addEventListener("click", cerrarPanel);
  $("#f-cerrar").addEventListener("click", cerrarPanel);
  $("#f-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = { ...valores };
    for (const f of campos) {
      const el = e.target.elements[f.k];
      datos[f.k] = f.tipo === "check" ? el.checked : el.value;
    }
    try { await alGuardar(datos); cerrarPanel(); aviso("Guardado"); mostrarPestana(); } catch (err) { $("#f-error").textContent = err.message; }
  });
}

// ---------- Conductores ----------

async function conductores(c) {
  const { conductores: lista, empresas } = await api("/api/admin/conductores");
  c.innerHTML = `
    <div class="fila entre envuelve" style="margin-bottom:12px"><p class="suave" style="margin:0">Solo vehículos de <b>empresas de transporte especial habilitadas</b>. El conductor entra a la app con su celular y PIN, o usa WhatsApp.</p>
      <div class="fila"><button class="btn" id="n-emp">+ Empresa</button><button class="btn prim" id="n-cond">+ Conductor</button></div></div>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Conductor</th><th>Celular</th><th>Vehículo</th><th>Empresa</th><th>Viajes</th><th>App</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((x) => `<tr>
        <td><b>${esc(x.nombre)}</b></td><td>+${esc(x.telefono)}</td><td>${VEH_ES[x.vehiculo]} · <span class="placa">${esc(x.placa || "—")}</span><br><span class="suave peq">${esc(x.descripcion)}</span></td>
        <td>${esc(x.empresa || "—")}</td><td>${x.viajes}</td><td>${x.tiene_pin ? "PIN ✓" : `<span class="estado amarillo">Sin PIN</span>`}</td>
        <td>${x.activo ? `<span class="estado verde">Activo</span>` : `<span class="estado">Inactivo</span>`}</td>
        <td><button class="btn chico" data-ed="${x.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>
    <h3 style="margin:20px 0 10px">Empresas aliadas</h3>
    <div class="col">${empresas.map((e) => `<div class="tarjeta fila entre"><div><b>${esc(e.nombre)}</b> · NIT ${esc(e.nit || "—")}<div class="suave peq">${esc(e.contacto)} · +${esc(e.telefono)}</div></div><button class="btn chico" data-emp="${e.id}">Editar</button></div>`).join("") || `<div class="tarjeta suave">Sin empresas.</div>`}</div>`;
  const opEmp = [["", "— Sin empresa —"], ...empresas.map((e) => [e.id, e.nombre])];
  const campos = [
    { k: "nombre", t: "Nombre", req: true }, { k: "telefono", t: "Celular (WhatsApp)", req: true, tipo: "tel", ph: "300 123 4567" },
    { k: "vehiculo", t: "Tipo de vehículo", tipo: "select", opciones: [["sedan", "Sedán (hasta 3)"], ["camioneta", "Camioneta (hasta 6)"], ["van", "Van (hasta 12)"]] },
    { k: "placa", t: "Placa" }, { k: "descripcion", t: "Vehículo", ph: "Toyota Fortuner negra" }, { k: "empresa_id", t: "Empresa", tipo: "select", opciones: opEmp },
    { k: "foto_url", t: "Foto del conductor (URL, opcional)" }, { k: "pin", t: "PIN para la app", ayuda: "4 dígitos. Déjalo vacío para no cambiarlo.", tipo: "text" }, { k: "activo", t: "Activo", tipo: "check" },
  ];
  $("#n-cond").addEventListener("click", () => formulario("Nuevo conductor", campos, { activo: true }, (d) => api("/api/admin/conductores", { datos: d })));
  $$("[data-ed]", c).forEach((b) => b.addEventListener("click", () => {
    const x = lista.find((y) => y.id === Number(b.dataset.ed));
    formulario("Editar conductor", campos, { ...x, pin: "" }, (d) => api("/api/admin/conductores", { datos: { ...d, id: x.id } }));
  }));
  const camposEmp = [{ k: "nombre", t: "Empresa", req: true }, { k: "nit", t: "NIT" }, { k: "contacto", t: "Contacto" }, { k: "telefono", t: "Teléfono", tipo: "tel" }, { k: "activa", t: "Activa", tipo: "check" }];
  $("#n-emp").addEventListener("click", () => formulario("Nueva empresa", camposEmp, { activa: true }, (d) => api("/api/admin/empresas", { datos: d })));
  $$("[data-emp]", c).forEach((b) => b.addEventListener("click", () => {
    const e = empresas.find((y) => y.id === Number(b.dataset.emp));
    formulario("Editar empresa", camposEmp, e, (d) => api("/api/admin/empresas", { datos: { ...d, id: e.id } }));
  }));
}

// ---------- Anfitriones y propiedades ----------

async function anfitriones(c) {
  const { anfitriones: lista, zonas } = await api("/api/admin/anfitriones");
  c.innerHTML = `
    <div class="fila entre envuelve" style="margin-bottom:12px"><p class="suave" style="margin:0">Cada alojamiento tiene su QR. El anfitrión entra a su panel con su celular y PIN.</p>
      <button class="btn prim" id="n-anf">+ Anfitrión</button></div>
    <div class="col">${lista.map((a) => `
      <div class="tarjeta col">
        <div class="fila entre envuelve"><div><h3>${esc(a.nombre)}</h3><div class="suave peq">+${esc(a.telefono)} · ${esc(a.correo || "")} · comisión ${a.comision_pct != null ? `${Math.round(a.comision_pct * 1000) / 10}% (pactada)` : "por volumen"} · ${a.tiene_pin ? "PIN ✓" : "sin PIN"} · por pagar <b>${pesos(a.por_pagar)}</b></div></div>
          <div class="fila"><button class="btn chico" data-anf="${a.id}">Editar</button><button class="btn chico" data-nprop="${a.id}">+ Alojamiento</button></div></div>
        ${a.propiedades.length ? `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>QR</th><th>Alojamiento</th><th>Zona</th><th>Escaneos 30 d</th><th>Reservas 30 d</th><th></th></tr></thead><tbody>
          ${a.propiedades.map((p) => `<tr><td><a href="/qr/${esc(p.codigo)}.png?descargar=1" title="Descargar QR"><img src="/qr/${esc(p.codigo)}.png" width="56" height="56" style="border-radius:6px" alt="QR"></a></td>
            <td><b>${esc(p.nombre)}</b> ${p.activa ? "" : `<span class="estado">Inactivo</span>`}<br><span class="suave peq">${esc(p.direccion)}</span><br><span class="peq">${esc(p.codigo)} · <a href="#" data-copiar="${esc(p.enlace)}">copiar enlace</a> · <a href="/r/${esc(p.codigo)}" target="_blank">abrir</a></span></td>
            <td>${esc(p.zona)}</td><td>${p.visitas_30d}</td><td>${p.reservas_30d}</td><td><button class="btn chico" data-prop="${p.id}" data-anfp="${a.id}">Editar</button></td></tr>`).join("")}
        </tbody></table></div>` : `<span class="suave peq">Sin alojamientos.</span>`}
      </div>`).join("")}</div>`;
  const campos = [
    { k: "nombre", t: "Nombre o empresa", req: true }, { k: "telefono", t: "Celular (WhatsApp)", req: true, tipo: "tel" }, { k: "correo", t: "Correo", tipo: "email" },
    { k: "comision_pct", t: "Comisión pactada (opcional)", ph: "0.06", ayuda: "En fracción: 0.06 = 6%. Vacío = por volumen (5% / 6% desde 50 / 7% desde 200 alojamientos)." },
    { k: "datos_pago", t: "Cuenta para pagarle", ph: "Bancolombia ahorros 123… / Nequi 300…" }, { k: "pin", t: "PIN para su panel", ayuda: "Vacío = no cambiar." }, { k: "activo", t: "Activo", tipo: "check" },
  ];
  $("#n-anf").addEventListener("click", () => formulario("Nuevo anfitrión", campos, { activo: true }, (d) => api("/api/admin/anfitriones", { datos: d })));
  $$("[data-anf]", c).forEach((b) => b.addEventListener("click", () => {
    const a = lista.find((y) => y.id === Number(b.dataset.anf));
    formulario("Editar anfitrión", campos, { ...a, pin: "", comision_pct: a.comision_pct ?? "" }, (d) => api("/api/admin/anfitriones", { datos: { ...d, id: a.id } }));
  }));
  const opZonas = zonas.map((z) => [z.codigo, `${z.codigo} · ${z.nombre}`]);
  const camposP = [
    { k: "nombre", t: "Nombre del alojamiento", req: true, ph: "Loft Laureles 302" }, { k: "direccion", t: "Dirección completa", req: true, ph: "Cra. 76 #33-40, Laureles, Medellín" },
    { k: "zona", t: "Zona de tarifa", tipo: "select", opciones: opZonas }, { k: "codigo", t: "Código del QR (opcional)", ayuda: "Vacío = se genera solo. No se puede cambiar después." }, { k: "activa", t: "Activo", tipo: "check" },
  ];
  $$("[data-nprop]", c).forEach((b) => b.addEventListener("click", () => formulario("Nuevo alojamiento", camposP, { activa: true, anfitrion_id: Number(b.dataset.nprop) }, (d) => api("/api/admin/propiedades", { datos: d }))));
  $$("[data-prop]", c).forEach((b) => b.addEventListener("click", () => {
    const a = lista.find((y) => y.id === Number(b.dataset.anfp));
    const p = a.propiedades.find((y) => y.id === Number(b.dataset.prop));
    formulario("Editar alojamiento", camposP.filter((f) => f.k !== "codigo"), p, (d) => api("/api/admin/propiedades", { datos: { ...d, id: p.id } }));
  }));
  $$("[data-copiar]", c).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); copiar(a.dataset.copiar); }));
}

// ---------- Tarifas ----------

async function tarifas(c) {
  const d = await api("/api/admin/tarifas");
  const aj = d.ajustes;
  const porDestino = {};
  for (const f of d.tabla) (porDestino[f.destino] ||= []).push(f);
  const pct = (v) => Math.round(Number(v) * 1000) / 10;
  c.innerHTML = `
    <div class="nota verde" style="margin-bottom:14px">Solo escribes lo que le pagas al conductor en <b>sedán</b> por cada ruta. Camioneta y van salen con los multiplicadores, y el precio al público con el % de la plataforma. Todo se recalcula al guardar.</div>
    ${Object.entries(porDestino).map(([dest, filasD]) => `
      <div class="tarjeta seccion grilla-tarifas">
        <h3 style="margin-bottom:10px">${esc(dest)}</h3>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Zona</th><th>Pago sedán</th><th>Minutos de trayecto</th>${Object.keys(d.vehiculos).map((v) => `<th>${VEH_ES[v]}<br>público · nocturno</th>`).join("")}<th>Neto sedán</th></tr></thead>
          <tbody>${filasD.map((f) => `<tr>
            <td><b>${f.zona}</b><br><span class="suave peq">${esc(d.zonas.find((z) => z.codigo === f.zona)?.nombre || "")}</span></td>
            <td><input type="number" step="1000" value="${f.pago_sedan}" data-t="${f.zona}|${f.destino_id}|pago"></td>
            <td><input type="number" step="5" value="${f.minutos}" data-t="${f.zona}|${f.destino_id}|min"></td>
            ${Object.keys(d.vehiculos).map((v) => `<td><b>${pesos(f.vehiculos[v].normal.precio)}</b><br><span class="suave peq">${pesos(f.vehiculos[v].nocturno.precio)} · cond. ${pesos(f.vehiculos[v].normal.pago)}</span></td>`).join("")}
            <td>${pesos(f.vehiculos.sedan.normal.neto)}</td></tr>`).join("")}</tbody></table></div>
      </div>`).join("")}

    <div class="tarjeta seccion">
      <h3 style="margin-bottom:12px">Tiempo de llegada antes del vuelo (minutos)</h3>
      <div class="col">${d.destinos.map((x) => `<div class="fila envuelve"><span style="min-width:260px">${esc(x.nombre)}</span>
        <label class="fila peq">Nacional <input type="number" style="width:90px" value="${x.antes_nacional}" data-dest="${x.id}" data-k="antes_nacional"></label>
        <label class="fila peq">Internacional <input type="number" style="width:90px" value="${x.antes_internacional}" data-dest="${x.id}" data-k="antes_internacional"></label></div>`).join("")}</div>
    </div>

    <div class="tarjeta seccion">
      <h3 style="margin-bottom:12px">Reglas y porcentajes</h3>
      <div class="dos">
        ${[
          ["pct_plataforma", "% plataforma (bruto)", pct(aj.pct_plataforma), "%"], ["pct_pasarela", "% pasarela de pago", pct(aj.pct_pasarela), "%"],
          ["mult_camioneta", "Multiplicador camioneta", aj.mult_camioneta, "x"], ["mult_van", "Multiplicador van", aj.mult_van, "x"],
          ["pct_nocturno", "Recargo nocturno (10 p. m.–5 a. m.)", pct(aj.pct_nocturno), "%"], ["redondeo", "Redondeo del precio (COP)", aj.redondeo, "$"],
          ["descuento_regreso", "Descuento en el regreso", pct(aj.descuento_regreso), "%"], ["espera_nacional", "Espera incluida vuelo nacional (min)", aj.espera_nacional, "min"],
          ["espera_internacional", "Espera incluida vuelo internacional (min)", aj.espera_internacional, "min"], ["hora_extra_espera", "Hora adicional de espera (COP)", aj.hora_extra_espera, "$"],
          ["horas_garantizado", "Horas de anticipación para garantizar", aj.horas_garantizado, "h"], ["horas_minimo", "Mínimo de horas para reservar en línea", aj.horas_minimo, "h"],
        ].map(([k, t, v, u]) => `<label class="campo">${t}<input type="number" step="any" value="${v}" data-aj="${k}" data-u="${u}"></label>`).join("")}
        <label class="campo">Teléfono de soporte / alertas<input type="tel" value="${esc(aj.telefono_soporte || "")}" data-aj="telefono_soporte" data-u="txt"></label>
      </div>
      <h3 style="margin:18px 0 10px">Comisión del anfitrión por volumen</h3>
      <div class="col">${(aj.comision_anfitrion || []).map((t, i) => `<div class="fila"><span>Desde</span><input type="number" style="width:100px" value="${t.desde}" data-tramo="${i}" data-k="desde"><span>alojamientos:</span><input type="number" step="0.1" style="width:100px" value="${pct(t.pct)}" data-tramo="${i}" data-k="pct"><span>%</span></div>`).join("")}</div>
      <h3 style="margin:18px 0 10px">Fotos de los vehículos (lo que ve el huésped)</h3>
      <div class="col">${Object.keys(d.vehiculos).map((v) => `<label class="campo">${VEH_ES[v]} (URL de la foto)<input type="text" value="${esc(aj.fotos_vehiculos?.[v] || "")}" data-foto="${v}" placeholder="https://…"></label>`).join("")}</div>
      <button class="btn prim" id="g-reglas" style="margin-top:16px">Guardar reglas</button>
    </div>`;
  $$("input[data-t]", c).forEach((inp) => inp.addEventListener("change", async () => {
    const [zona, destino_id] = inp.dataset.t.split("|");
    const pago = $(`input[data-t="${zona}|${destino_id}|pago"]`, c).value;
    const min = $(`input[data-t="${zona}|${destino_id}|min"]`, c).value;
    await accion("/api/admin/tarifas", { zona, destino_id: Number(destino_id), pago_sedan: Number(pago), minutos: Number(min) }, "Tarifa guardada");
    tarifas(c);
  }));
  $$("input[data-dest]", c).forEach((inp) => inp.addEventListener("change", async () => {
    const id = inp.dataset.dest;
    const datos = { id: Number(id) };
    $$(`input[data-dest="${id}"]`, c).forEach((x) => (datos[x.dataset.k] = Number(x.value)));
    await accion("/api/admin/destinos", datos, "Guardado");
  }));
  $("#g-reglas").addEventListener("click", async () => {
    for (const inp of $$("input[data-aj]", c)) {
      const u = inp.dataset.u;
      const valor = u === "%" ? Number(inp.value) / 100 : u === "txt" ? inp.value.replace(/\D/g, "") : Number(inp.value);
      await api("/api/admin/ajustes", { datos: { clave: inp.dataset.aj, valor } });
    }
    const tramos = (aj.comision_anfitrion || []).map((_, i) => ({
      desde: Number($(`input[data-tramo="${i}"][data-k="desde"]`, c).value),
      pct: Number($(`input[data-tramo="${i}"][data-k="pct"]`, c).value) / 100,
    }));
    await api("/api/admin/ajustes", { datos: { clave: "comision_anfitrion", valor: tramos } });
    const fotos = {};
    $$("input[data-foto]", c).forEach((x) => (fotos[x.dataset.foto] = x.value.trim()));
    await api("/api/admin/ajustes", { datos: { clave: "fotos_vehiculos", valor: fotos } });
    aviso("Reglas guardadas");
    tarifas(c);
  });
}

// ---------- Liquidaciones ----------

async function liquidaciones(c) {
  const d = await api("/api/admin/liquidaciones");
  const tabla = (tipo, lista, extra) => lista.length ? `<div class="tabla-envoltura"><table class="tabla">
    <thead><tr><th>${tipo === "conductor" ? "Conductor" : "Anfitrión"}</th><th>Viajes</th><th>Periodo</th><th>Total a pagar</th>${extra ? `<th>Cuenta</th>` : ""}<th></th></tr></thead>
    <tbody>${lista.map((x) => `<tr><td><b>${esc(x.nombre)}</b><br><span class="suave peq">+${esc(x.telefono)}${x.empresa ? ` · ${esc(x.empresa)}` : ""}</span></td><td>${x.viajes}</td>
      <td>${fecha(x.desde)} – ${fecha(x.hasta)}</td><td><b>${pesos(x.total)}</b></td>${extra ? `<td class="peq">${esc(x.datos_pago || "—")}</td>` : ""}
      <td class="fila"><button class="btn chico" data-det="${tipo}|${x.id}">Detalle</button><button class="btn chico prim" data-pagar="${tipo}|${x.id}|${esc(x.nombre)}|${x.total}">Marcar pagado</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="tarjeta suave">Nada pendiente.</div>`;
  c.innerHTML = `
    <div class="nota verde" style="margin-bottom:14px">Conductores: liquidación <b>semanal</b>. Anfitriones: <b>mensual</b>. Solo cuentan viajes terminados. Haz la transferencia y luego marca "pagado".</div>
    <h3 style="margin-bottom:10px">Conductores · total ${pesos(d.conductores.reduce((s, x) => s + x.total, 0))}</h3>${tabla("conductor", d.conductores)}
    <h3 style="margin:20px 0 10px">Anfitriones · total ${pesos(d.anfitriones.reduce((s, x) => s + x.total, 0))}</h3>${tabla("anfitrion", d.anfitriones, true)}
    <div id="l-detalle"></div>`;
  $$("[data-det]", c).forEach((b) => b.addEventListener("click", async () => {
    const [tipo, id] = b.dataset.det.split("|");
    const lista = await api(`/api/admin/liquidaciones/${tipo}/${id}`);
    $("#l-detalle").innerHTML = `<div class="tarjeta seccion"><h3 style="margin-bottom:8px">Detalle</h3>${lista.map((r) => `<div class="fila entre peq" style="padding:5px 0;border-bottom:1px solid var(--borde)"><span>#${esc(r.codigo)} · ${fechaHora(r.recogida)} · ${esc(r.destino || "")}</span><b>${pesos(tipo === "conductor" ? r.pago_conductor : r.comision_anfitrion)}</b></div>`).join("")}</div>`;
  }));
  $$("[data-pagar]", c).forEach((b) => b.addEventListener("click", async () => {
    const [tipo, id, nombre, total] = b.dataset.pagar.split("|");
    if (!confirm(`¿Confirmas que ya le transferiste ${pesos(total)} a ${nombre}?`)) return;
    await accion(`/api/admin/liquidaciones/${tipo}/${id}/pagado`, {}, "Marcado como pagado");
    liquidaciones(c);
  }));
}

// ---------- Números ----------

async function numeros(c, dias = 30) {
  const d = await api(`/api/admin/numeros?dias=${dias}`);
  const max = Math.max(1, ...d.porDia.map((x) => x.viajes));
  c.innerHTML = `
    <div class="chips" style="margin-bottom:14px">${[7, 30, 90, 365].map((n) => `<button class="chip ${n === dias ? "activa" : ""}" data-dias="${n}">${n === 365 ? "1 año" : `${n} días`}</button>`).join("")}</div>
    <div class="kpis">
      <div class="kpi destacado"><div class="t">Tu neto</div><div class="v">${pesos(d.neto)}</div></div>
      <div class="kpi"><div class="t">Ventas</div><div class="v">${pesos(d.ventas)}</div></div>
      <div class="kpi"><div class="t">Viajes pagados</div><div class="v">${d.viajes}</div></div>
      <div class="kpi"><div class="t">Ticket promedio</div><div class="v">${pesos(d.ticket)}</div></div>
      <div class="kpi"><div class="t">Escaneos del QR</div><div class="v">${d.visitas}</div></div>
      <div class="kpi"><div class="t">Conversión QR → reserva</div><div class="v">${(d.conversion * 100).toFixed(1)}%</div></div>
      <div class="kpi"><div class="t">Pagado a conductores</div><div class="v">${pesos(d.conductores)}</div></div>
      <div class="kpi"><div class="t">Comisión anfitriones</div><div class="v">${pesos(d.anfitriones)}</div></div>
    </div>
    <div class="tarjeta seccion">
      <h3 style="margin-bottom:12px">Viajes por día</h3>
      ${d.porDia.length ? `<div style="display:flex;align-items:flex-end;gap:4px;height:140px">${d.porDia.map((x) => `<div title="${x.dia}: ${x.viajes} viajes · ${pesos(x.neto)}" style="flex:1;min-width:6px;background:var(--verde-2);border-radius:4px 4px 0 0;height:${(x.viajes / max) * 100}%"></div>`).join("")}</div>
      <div class="fila entre suave peq" style="margin-top:6px"><span>${d.porDia[0].dia}</span><span>${d.porDia.at(-1).dia}</span></div>` : `<span class="suave">Sin datos aún.</span>`}
    </div>
    <div class="tarjeta seccion"><h3 style="margin-bottom:8px">Mezcla de vehículos</h3>
      <div class="fila envuelve">${["sedan", "camioneta", "van"].map((v) => `<span class="estado">${VEH_ES[v]}: ${d[v]}</span>`).join("")}<span class="estado verde">Regresos con descuento: ${d.regresos}</span><span class="estado">Cancelaciones: ${d.cancelaciones}</span></div></div>
    <h3 style="margin:20px 0 10px">Conversión por alojamiento</h3>
    <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Alojamiento</th><th>Anfitrión</th><th>Escaneos</th><th>Reservas</th><th>Conversión</th></tr></thead>
      <tbody>${d.porPropiedad.map((p) => `<tr><td>${esc(p.nombre)} <span class="suave peq">${esc(p.codigo)}</span></td><td>${esc(p.anfitrion)}</td><td>${p.visitas}</td><td>${p.reservas}</td><td>${p.visitas ? ((p.reservas / p.visitas) * 100).toFixed(1) + "%" : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  $$("[data-dias]", c).forEach((b) => b.addEventListener("click", () => numeros(c, Number(b.dataset.dias))));
}

// ---------- Mensajes ----------

async function mensajes(c) {
  const [lista, conds] = await Promise.all([api("/api/admin/mensajes"), api("/api/admin/conductores")]);
  c.innerHTML = `
    ${global.config.whatsappReal ? "" : `<div class="nota amarilla" style="margin-bottom:14px"><b>WhatsApp aún no está conectado.</b> Los mensajes no se envían: quedan aquí para que veas exactamente qué recibiría cada persona. Al conectar Evolution API salen de verdad.</div>`}
    <div class="tarjeta seccion col">
      <h3>Simular un mensaje que llega por WhatsApp</h3>
      <p class="suave peq" style="margin:0">Para probar cómo responde la app a un conductor (1, 2, OK, VOY, LLEGUÉ, RECOGÍ, ENTREGUÉ, VIAJES) o a un huésped.</p>
      <div class="dos"><select id="s-tel">${conds.conductores.map((x) => `<option value="${esc(x.telefono)}">${esc(x.nombre)} (conductor)</option>`).join("")}<option value="">Otro número…</option></select>
        <input type="tel" id="s-otro" placeholder="Número con indicativo" class="oculto"></div>
      <div class="fila"><input type="text" id="s-texto" placeholder="Ej. 1"><button class="btn prim" id="s-enviar">Simular</button></div>
      <div class="fila envuelve"><button class="btn chico" id="s-ciclo">Correr tareas automáticas ahora</button><span class="suave peq">Ofertas, avisos 24/12/2 h y alertas (normalmente corren cada minuto).</span></div>
    </div>
    <div class="col seccion">${lista.map((m) => `<div class="mensaje ${m.sentido}">
      <div class="fila entre suave peq"><span>${m.sentido === "sale" ? "→ Enviado a" : "← Recibido de"} ${esc(m.quien || "")} ${m.rol ? `(${esc(m.rol)})` : ""} +${esc(m.telefono)}${m.codigo ? ` · #${esc(m.codigo)}` : ""}</span><span>${fechaHora(m.creado)} · ${esc(m.estado)}</span></div>${esc(m.texto)}${m.error ? `<div class="error">${esc(m.error)}</div>` : ""}</div>`).join("") || `<div class="tarjeta suave">Sin mensajes todavía.</div>`}</div>`;
  $("#s-tel").addEventListener("change", (e) => $("#s-otro").classList.toggle("oculto", e.target.value !== ""));
  $("#s-enviar").addEventListener("click", async () => {
    const tel = $("#s-tel").value || $("#s-otro").value;
    const texto = $("#s-texto").value;
    if (!tel || !texto) return aviso("Escribe número y texto");
    const r = await accion("/api/admin/simular-whatsapp", { telefono: tel, texto }, "Procesado");
    aviso(`Resultado: ${r.tipo}`);
    mensajes(c);
    refrescarBurbuja();
  });
  $("#s-ciclo").addEventListener("click", async () => { await accion("/api/admin/correr-programador", {}, "Tareas ejecutadas"); mensajes(c); refrescarBurbuja(); });
}
