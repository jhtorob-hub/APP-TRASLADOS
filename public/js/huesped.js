// Pantalla del huésped: lo que abre el QR del alojamiento. Bilingüe (español / inglés).

import { api, esc, pesos, $, $$, diaISO, horaLocal, marcaHTML, silueta, aviso } from "./comun.js";
import { estado as global } from "./app.js";

const T = {
  es: {
    sub: "Traslados privados en Medellín",
    titulo: "Tu traslado privado, con precio fijo",
    desde: "Desde tu alojamiento",
    q1: "¿A dónde vas?", ir: "Voy al aeropuerto", irSub: "Te recogemos en tu alojamiento", llegar: "Llego a Medellín", llegarSub: "Te esperamos con tu nombre",
    irT: "Voy a la terminal", llegarT: "Llego a la terminal",
    q2v: "Tu vuelo", q2b: "Tu bus", vuelo: "Número de vuelo", vueloAyuda: "Ej. AV9485 — así seguimos tu vuelo",
    nacional: "Nacional", internacional: "Internacional",
    fecha: "Fecha", horaSale: "Hora de salida del vuelo", horaLlega: "Hora de llegada del vuelo", horaSaleBus: "Hora de salida del bus", horaLlegaBus: "Hora de llegada del bus",
    q3: "¿Cuántos son?", pasajeros: "Pasajeros", maletas: "Maletas grandes", maletasSub: "Las de bodega",
    q4: "Elige tu vehículo", hasta: (p, m) => `Hasta ${p} pasajeros · ${m} maletas`, recomendado: "RECOMENDADO", noCabe: "No caben", noche: "tarifa nocturna",
    q5: "Tus datos", nombre: "Nombre completo", whatsapp: "WhatsApp", whatsappAyuda: "Por aquí te llegan la confirmación y los datos del conductor", correo: "Correo (opcional)", notas: "Notas para el conductor (opcional)", notasPh: "Silla de bebé, mascota, parada extra…",
    incluye: "Incluido en el precio", inc: (e) => [`Seguimiento de tu vuelo: si se retrasa, el conductor espera sin costo`, `${e} minutos de espera desde que aterrizas`, `Conductor con letrero con tu nombre`, `Precio fijo: peajes incluidos, sin sorpresas`, `Vehículos de transporte especial habilitados y asegurados`],
    recogida: "Recogida", total: "Total", pagar: "Pagar", continuar: "Completa los datos", completaVuelo: "Indica la fecha y la hora",
    sujeto: "Tu viaje es en menos de 12 horas: confirmamos el conductor apenas pagues. Si no hay disponibilidad, te devolvemos el 100%.",
    nocturnoNota: "Recogida entre 10 p. m. y 5 a. m.: aplica tarifa nocturna.",
    regreso: (p) => `🎉 Tienes ${p}% de descuento en tu regreso.`,
    cancel: "Cancelación gratis hasta 24 h antes.", seguro: "Pago seguro con tarjeta, PSE o Nequi.",
    errNombre: "Escribe tu nombre", errTel: "Escribe tu WhatsApp", pagando: "Abriendo el pago…",
    noExiste: "No encontramos este alojamiento. Revisa el código QR.",
  },
  en: {
    sub: "Private transfers in Medellín",
    titulo: "Your private transfer, fixed price",
    desde: "From your stay",
    q1: "Where are you going?", ir: "Going to the airport", irSub: "We pick you up at your stay", llegar: "Arriving in Medellín", llegarSub: "We wait with your name",
    irT: "Going to the bus terminal", llegarT: "Arriving at the terminal",
    q2v: "Your flight", q2b: "Your bus", vuelo: "Flight number", vueloAyuda: "E.g. AA1123 — we track your flight",
    nacional: "Domestic", internacional: "International",
    fecha: "Date", horaSale: "Flight departure time", horaLlega: "Flight arrival time", horaSaleBus: "Bus departure time", horaLlegaBus: "Bus arrival time",
    q3: "How many?", pasajeros: "Passengers", maletas: "Large suitcases", maletasSub: "Checked bags",
    q4: "Choose your vehicle", hasta: (p, m) => `Up to ${p} passengers · ${m} bags`, recomendado: "RECOMMENDED", noCabe: "Too small", noche: "night rate",
    q5: "Your details", nombre: "Full name", whatsapp: "WhatsApp", whatsappAyuda: "We'll send your confirmation and driver details here", correo: "Email (optional)", notas: "Notes for the driver (optional)", notasPh: "Baby seat, pet, extra stop…",
    incluye: "Included in the price", inc: (e) => [`Flight tracking: if it's delayed, your driver waits at no cost`, `${e} minutes of waiting after landing`, `Meet & greet with a sign with your name`, `Fixed price: tolls included, no surprises`, `Licensed and insured private transport vehicles`],
    recogida: "Pickup", total: "Total", pagar: "Pay", continuar: "Complete your details", completaVuelo: "Add date and time",
    sujeto: "Your trip is less than 12 hours away: we'll confirm your driver right after payment. If none is available, you get a full refund.",
    nocturnoNota: "Pickup between 10 PM and 5 AM: night rate applies.",
    regreso: (p) => `🎉 You have ${p}% off your return trip.`,
    cancel: "Free cancellation up to 24 h before.", seguro: "Secure payment by card.",
    errNombre: "Enter your name", errTel: "Enter your WhatsApp", pagando: "Opening payment…",
    noExiste: "We couldn't find this property. Check the QR code.",
  },
};

const PREFIJOS = [["+1", "🇺🇸 +1"], ["+57", "🇨🇴 +57"], ["+44", "🇬🇧 +44"], ["+34", "🇪🇸 +34"], ["+33", "🇫🇷 +33"], ["+49", "🇩🇪 +49"], ["+31", "🇳🇱 +31"], ["+39", "🇮🇹 +39"], ["+52", "🇲🇽 +52"], ["+55", "🇧🇷 +55"], ["+54", "🇦🇷 +54"], ["+56", "🇨🇱 +56"], ["+51", "🇵🇪 +51"], ["+61", "🇦🇺 +61"], ["+", "Otro / Other"]];

export async function pantalla(app, codigo) {
  const params = new URLSearchParams(location.search);
  const regreso = params.get("regreso");
  let d;
  try {
    d = await api(`/api/propiedad/${encodeURIComponent(codigo)}${regreso ? `?regreso=${encodeURIComponent(regreso)}` : ""}`);
  } catch {
    const t = T[navigator.language?.startsWith("es") ? "es" : "en"];
    app.innerHTML = `<div class="contenedor"><div class="encabezado">${marcaHTML(global.config.marca)}</div><div class="tarjeta"><p>${t.noExiste}</p></div></div>`;
    return;
  }

  const st = {
    idioma: params.get("lang") || (navigator.language?.toLowerCase().startsWith("es") ? "es" : "en"),
    sentido: "desde_destino",
    destino: d.destinos[0]?.codigo,
    tipo_vuelo: "internacional",
    vuelo: "", fecha: diaISO(1), hora: "",
    pasajeros: 2, maletas: 2, vehiculo: null, elegidoAMano: false,
    nombre: "", prefijo: "+1", telefono: "", correo: "", notas: "",
    cotizacion: null, errorCot: "",
  };
  if (d.regreso) {
    const r = d.regreso;
    Object.assign(st, { idioma: r.idioma, sentido: "al_destino", nombre: r.nombre, correo: r.correo || "", pasajeros: r.pasajeros, maletas: r.maletas, prefijo: "+", telefono: "+" + r.telefono });
  }
  if (st.idioma === "es") { st.prefijo = d.regreso ? st.prefijo : "+57"; st.tipo_vuelo = "nacional"; }

  const destino = () => d.destinos.find((x) => x.codigo === st.destino);
  const recomendado = () => {
    const lista = Object.entries(d.vehiculos).sort((a, b) => a[1].orden - b[1].orden);
    return lista.find(([, v]) => st.pasajeros <= v.pasajeros && st.maletas <= v.maletas)?.[0] || null;
  };
  const cabe = (k) => st.pasajeros <= d.vehiculos[k].pasajeros && st.maletas <= d.vehiculos[k].maletas;

  /** Estimación local de la hora de recogida (el servidor da la exacta). */
  function recogidaEstimada() {
    if (!st.fecha || !st.hora) return null;
    const base = new Date(`${st.fecha}T${st.hora.padStart(5, "0")}:00-05:00`);
    if (Number.isNaN(base.getTime())) return null;
    if (st.sentido === "desde_destino") return base;
    const de = destino();
    const antes = st.tipo_vuelo === "internacional" ? de.antes_internacional : de.antes_nacional;
    return new Date(base.getTime() - (antes + de.minutos) * 60000);
  }
  const esNoche = () => {
    const r = recogidaEstimada();
    if (!r) return false;
    const h = horaLocal(r);
    return h >= 22 || h < 5;
  };
  const precioDe = (k) => destino().precios[k][esNoche() ? "nocturno" : "normal"];

  function dibujar() {
    const t = T[st.idioma];
    document.documentElement.lang = st.idioma;
    const p = d.propiedad;
    app.innerHTML = `
      <div class="contenedor">
        <div class="encabezado">
          ${marcaHTML(global.config.marca, t.sub)}
          <div class="chips"><button class="chip ${st.idioma === "es" ? "activa" : ""}" data-idioma="es">ES</button><button class="chip ${st.idioma === "en" ? "activa" : ""}" data-idioma="en">EN</button></div>
        </div>
        <div class="tarjeta">
          <h1>${t.titulo}</h1>
          <p class="suave peq" style="margin:8px 0 0">📍 ${t.desde}: <b>${esc(p.nombre)}</b><br>${esc(p.direccion)}</p>
          ${d.regreso ? `<div class="nota verde" style="margin-top:12px">${t.regreso(Math.round(d.reglas.descuento_regreso * 100))}</div>` : ""}
        </div>

        <section class="tarjeta seccion">
          <h2><span class="num">1</span>${t.q1}</h2>
          <div id="s-sentido"></div>
          <div class="chips" id="s-destinos" style="margin-top:12px"></div>
        </section>

        <section class="tarjeta seccion">
          <h2 id="t-vuelo"><span class="num">2</span></h2>
          <div class="col">
            <div id="s-tipo" class="chips"></div>
            <label class="campo" id="c-vuelo">${t.vuelo}<input type="text" id="i-vuelo" value="${esc(st.vuelo)}" autocapitalize="characters" placeholder="AV9485"><span class="ayuda">${t.vueloAyuda}</span></label>
            <div class="dos siempre">
              <label class="campo">${t.fecha}<input type="date" id="i-fecha" value="${esc(st.fecha)}" min="${diaISO(0)}"></label>
              <label class="campo"><span id="t-hora"></span><input type="time" id="i-hora" value="${esc(st.hora)}"></label>
            </div>
          </div>
        </section>

        <section class="tarjeta seccion">
          <h2><span class="num">3</span>${t.q3}</h2>
          <div class="contador"><div><b>${t.pasajeros}</b></div><div class="ctrl"><button data-mas="pasajeros" data-d="-1" aria-label="−">−</button><output id="o-pasajeros">${st.pasajeros}</output><button data-mas="pasajeros" data-d="1" aria-label="+">+</button></div></div>
          <div class="contador"><div><b>${t.maletas}</b><div class="suave peq">${t.maletasSub}</div></div><div class="ctrl"><button data-mas="maletas" data-d="-1" aria-label="−">−</button><output id="o-maletas">${st.maletas}</output><button data-mas="maletas" data-d="1" aria-label="+">+</button></div></div>
        </section>

        <section class="tarjeta seccion">
          <h2><span class="num">4</span>${t.q4}</h2>
          <div class="vehiculos" id="s-vehiculos"></div>
        </section>

        <section class="tarjeta seccion">
          <h2><span class="num">5</span>${t.q5}</h2>
          <div class="col">
            <label class="campo">${t.nombre}<input type="text" id="i-nombre" value="${esc(st.nombre)}" autocomplete="name"></label>
            <label class="campo">${t.whatsapp}
              <div class="tel"><select id="i-prefijo">${PREFIJOS.map(([v, l]) => `<option value="${v}" ${v === st.prefijo ? "selected" : ""}>${l}</option>`).join("")}</select>
              <input type="tel" id="i-telefono" value="${esc(st.telefono)}" autocomplete="tel-national" placeholder="${st.prefijo === "+57" ? "300 123 4567" : "555 123 4567"}"></div>
              <span class="ayuda">${t.whatsappAyuda}</span></label>
            <label class="campo">${t.correo}<input type="email" id="i-correo" value="${esc(st.correo)}" autocomplete="email"></label>
            <label class="campo">${t.notas}<textarea id="i-notas" placeholder="${t.notasPh}">${esc(st.notas)}</textarea></label>
          </div>
        </section>

        <section class="seccion" id="s-resumen"></section>

        <section class="tarjeta seccion">
          <h3 style="margin-bottom:10px">${t.incluye}</h3>
          <ul class="incluye" id="s-incluye"></ul>
          <p class="suave peq" style="margin:12px 0 0">${t.cancel} ${t.seguro}</p>
        </section>
      </div>
      <div class="barra-pago"><div class="interior"><div><div class="suave peq">${t.total}</div><div class="precio-total" id="b-precio">—</div></div><button class="btn prim grande" id="b-pagar" disabled>${t.continuar}</button></div></div>`;

    $$("[data-idioma]", app).forEach((b) => b.addEventListener("click", () => { guardarCampos(); st.idioma = b.dataset.idioma; dibujar(); }));
    $$("[data-mas]", app).forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.mas;
        st[k] = Math.max(k === "pasajeros" ? 1 : 0, Math.min(k === "pasajeros" ? 19 : 24, st[k] + Number(b.dataset.d)));
        $(`#o-${k}`).textContent = st[k];
        if (st.vehiculo && !cabe(st.vehiculo)) { st.vehiculo = null; st.elegidoAMano = false; }
        actualizar(true);
      })
    );
    for (const id of ["vuelo", "fecha", "hora", "nombre", "telefono", "correo", "notas"]) {
      $(`#i-${id}`).addEventListener("input", () => { guardarCampos(); actualizar(["fecha", "hora"].includes(id)); });
    }
    $("#i-prefijo").addEventListener("change", () => { guardarCampos(); actualizar(false); });
    $("#b-pagar").addEventListener("click", pagar);
    actualizar(true);
  }

  function guardarCampos() {
    for (const id of ["vuelo", "fecha", "hora", "nombre", "telefono", "correo", "notas", "prefijo"]) {
      const el = $(`#i-${id}`);
      if (el) st[id] = el.value;
    }
  }

  function actualizar(recotizar) {
    const t = T[st.idioma];
    const de = destino();
    const esTerminal = de.tipo === "terminal";
    // Sentido
    $("#s-sentido").innerHTML = `<div class="segmento">
      <button class="opcion ${st.sentido === "desde_destino" ? "activa" : ""}" data-sentido="desde_destino"><span class="ico">🛬</span><b>${esTerminal ? t.llegarT : t.llegar}</b><span>${t.llegarSub}</span></button>
      <button class="opcion ${st.sentido === "al_destino" ? "activa" : ""}" data-sentido="al_destino"><span class="ico">🛫</span><b>${esTerminal ? t.irT : t.ir}</b><span>${t.irSub}</span></button></div>`;
    $$("[data-sentido]", app).forEach((b) => b.addEventListener("click", () => { st.sentido = b.dataset.sentido; actualizar(true); }));
    $("#s-destinos").innerHTML = d.destinos
      .map((x) => `<button class="chip ${x.codigo === st.destino ? "activa" : ""}" data-destino="${x.codigo}">${esc(st.idioma === "en" ? x.nombre_en : x.nombre)}</button>`)
      .join("");
    $$("[data-destino]", app).forEach((b) => b.addEventListener("click", () => { st.destino = b.dataset.destino; actualizar(true); }));
    // Vuelo / bus
    $("#t-vuelo").innerHTML = `<span class="num">2</span>${esTerminal ? t.q2b : t.q2v}`;
    $("#c-vuelo").classList.toggle("oculto", !de.pide_vuelo);
    $("#s-tipo").classList.toggle("oculto", !de.pide_vuelo || de.codigo === "EOH");
    if (de.codigo === "EOH") st.tipo_vuelo = "nacional";
    $("#s-tipo").innerHTML = ["nacional", "internacional"].map((k) => `<button class="chip ${st.tipo_vuelo === k ? "activa" : ""}" data-tipo="${k}">${t[k]}</button>`).join("");
    $$("[data-tipo]", app).forEach((b) => b.addEventListener("click", () => { st.tipo_vuelo = b.dataset.tipo; actualizar(true); }));
    $("#t-hora").textContent = esTerminal ? (st.sentido === "al_destino" ? t.horaSaleBus : t.horaLlegaBus) : st.sentido === "al_destino" ? t.horaSale : t.horaLlega;
    // Vehículos
    const rec = recomendado();
    if (!st.elegidoAMano) st.vehiculo = rec;
    $("#s-vehiculos").innerHTML = Object.entries(d.vehiculos)
      .sort((a, b) => a[1].orden - b[1].orden)
      .map(([k, v]) => {
        const ok = cabe(k);
        const foto = d.fotos?.[k] ? `<img src="${esc(d.fotos[k])}" alt="">` : silueta(k);
        return `<button class="vehiculo ${st.vehiculo === k ? "activa" : ""} ${ok ? "" : "no"}" data-veh="${k}" ${ok ? "" : "disabled"}>
          <div class="foto">${foto}</div>
          <div><b>${esc(st.idioma === "en" ? v.nombre_en : v.nombre)}</b> ${k === rec ? `<span class="insignia rec">${t.recomendado}</span>` : ""}<div class="suave peq">${t.hasta(v.pasajeros, v.maletas)}</div></div>
          <div class="precio">${ok ? pesos(precioDe(k)) : `<small>${t.noCabe}</small>`}${ok && esNoche() ? `<small>${t.noche}</small>` : ""}</div>
        </button>`;
      })
      .join("");
    $$("[data-veh]", app).forEach((b) => b.addEventListener("click", () => { st.vehiculo = b.dataset.veh; st.elegidoAMano = true; actualizar(true); }));
    $("#s-incluye").innerHTML = t.inc(st.tipo_vuelo === "internacional" ? d.reglas.espera_internacional : d.reglas.espera_nacional).map((x) => `<li>${x}</li>`).join("");
    if (recotizar) cotizarLuego();
    resumen();
  }

  let espera;
  function cotizarLuego() {
    clearTimeout(espera);
    st.cotizacion = null;
    st.errorCot = "";
    if (!st.fecha || !st.hora || !st.vehiculo) return resumen();
    espera = setTimeout(async () => {
      try {
        st.cotizacion = await api("/api/cotizar", { datos: cuerpo() });
        st.errorCot = "";
      } catch (e) {
        st.cotizacion = null;
        st.errorCot = e.message;
      }
      resumen();
    }, 350);
  }

  function cuerpo() {
    const tel = (st.prefijo === "+" ? "" : st.prefijo) + st.telefono;
    return {
      propiedad: d.propiedad.codigo, sentido: st.sentido, destino: st.destino, tipo_vuelo: st.tipo_vuelo, vuelo: st.vuelo,
      fecha: st.fecha, hora: st.hora, pasajeros: st.pasajeros, maletas: st.maletas, vehiculo: st.vehiculo,
      nombre: st.nombre, telefono: tel.replace(/\D/g, ""), correo: st.correo, notas: st.notas, idioma: st.idioma, regreso: d.regreso?.codigo || "",
    };
  }

  function resumen() {
    const t = T[st.idioma];
    const k = st.cotizacion;
    const el = $("#s-resumen");
    const boton = $("#b-pagar");
    const precio = k ? k.precio : st.vehiculo ? precioDe(st.vehiculo) : null;
    $("#b-precio").textContent = precio ? pesos(precio) : "—";
    const datosOk = st.nombre.trim().length >= 2 && st.telefono.replace(/\D/g, "").length >= 7;
    if (!k) {
      el.innerHTML = st.errorCot ? `<div class="nota roja">${esc(st.errorCot)}</div>` : "";
      boton.disabled = true;
      boton.textContent = !st.fecha || !st.hora ? t.completaVuelo : t.continuar;
      return;
    }
    el.innerHTML = `
      <div class="resumen">
        <div class="linea"><span>${t.recogida}</span><span><b>${esc(k.recogidaTexto)}</b></span></div>
        <div class="linea"><span>${esc(st.idioma === "en" ? d.vehiculos[k.vehiculo].nombre_en : d.vehiculos[k.vehiculo].nombre)} · ${st.pasajeros} pax · ${st.maletas} 🧳</span><span></span></div>
        <div class="linea" style="margin-top:6px"><span>${t.total}</span><span class="total">${pesos(k.precio)} <small style="font-size:.8rem;opacity:.8">COP</small></span></div>
      </div>
      ${k.nocturno ? `<div class="nota amarilla" style="margin-top:10px">🌙 ${t.nocturnoNota}</div>` : ""}
      ${k.disponibilidad === "sujeto" ? `<div class="nota amarilla" style="margin-top:10px">⏳ ${t.sujeto}</div>` : ""}`;
    boton.disabled = !datosOk;
    boton.textContent = datosOk ? `${t.pagar} ${pesos(k.precio)}` : t.continuar;
  }

  async function pagar() {
    const t = T[st.idioma];
    guardarCampos();
    if (st.nombre.trim().length < 2) return aviso(t.errNombre);
    if (st.telefono.replace(/\D/g, "").length < 7) return aviso(t.errTel);
    const b = $("#b-pagar");
    b.disabled = true;
    b.textContent = t.pagando;
    try {
      const r = await api("/api/reservas", { datos: cuerpo() });
      location.href = r.pagoUrl;
    } catch (e) {
      aviso(e.message);
      b.disabled = false;
      resumen();
    }
  }

  dibujar();
}
