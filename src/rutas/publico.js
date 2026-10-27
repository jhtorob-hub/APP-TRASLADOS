// Rutas públicas: página del huésped (QR), pago, estado de la reserva, inicio de sesión.

import { Router } from "express";
import QRCode from "qrcode";
import { config, wompiActivo, whatsappActivo } from "../config.js";
import { q, uno, filas } from "../db.js";
import { datosPropiedad, cotizar, crearReserva, marcarPagada, reservaCompleta, ESTADOS } from "../reservas.js";
import { urlPago, referenciaNueva, consultarTransaccion, codigoDeReferencia } from "../wompi.js";
import { ponerSesion, quitarSesion, sesionDe, tokenReservaValido, pinValido } from "../sesion.js";
import { normalizar } from "../whatsapp.js";
import { horaTexto, fechaTexto } from "../tiempo.js";

export const publico = Router();

publico.get("/api/config", (req, res) => {
  res.json({ marca: config.marca, modoPrueba: config.modoPrueba, pagoReal: wompiActivo(), whatsappReal: whatsappActivo() });
});

publico.get("/api/propiedad/:codigo", async (req, res) => {
  const d = await datosPropiedad(req.params.codigo);
  if (!d) return res.status(404).json({ error: "No encontramos este alojamiento." });
  if (!req.query.nv) await q("insert into visitas (propiedad_id) values ($1)", [d._interno.propiedadId]);
  delete d._interno;
  if (req.query.regreso) {
    const o = await uno("select codigo, nombre, telefono, correo, idioma, pasajeros, maletas, vehiculo, vuelo from reservas where codigo=$1", [req.query.regreso]);
    if (o) d.regreso = o;
  }
  res.json(d);
});

/** Revisión final antes de pagar: hora de recogida, precio exacto y disponibilidad. */
publico.post("/api/cotizar", async (req, res) => {
  try {
    const k = await cotizar(req.body);
    const idioma = req.body.idioma === "en" ? "en" : "es";
    res.json({
      precio: k.precio,
      vehiculo: k.vehiculo,
      recogida: k.recogida,
      recogidaTexto: `${fechaTexto(k.recogida, idioma)} · ${horaTexto(k.recogida, idioma)}`,
      nocturno: k.nocturno,
      disponibilidad: k.disponibilidad,
      descuento: k.descuento,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

publico.post("/api/reservas", async (req, res) => {
  try {
    const r = await crearReserva(req.body);
    const ref = referenciaNueva(r.codigo);
    await q("update reservas set pago_ref=$2 where id=$1", [r.id, ref]);
    res.json({ codigo: r.codigo, pagoUrl: urlPago({ ...r, pago_ref: ref }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Estado de la reserva para el huésped (enlace con token, sin cuenta). */
publico.get("/api/reservas/:codigo", async (req, res) => {
  if (!tokenReservaValido(req.params.codigo, req.query.t)) return res.status(404).json({ error: "Reserva no encontrada." });
  const r = await reservaCompleta(req.params.codigo);
  if (!r) return res.status(404).json({ error: "Reserva no encontrada." });
  const verConductor = Boolean(r.aviso_huesped_en);
  res.json({
    codigo: r.codigo,
    estado: r.estado,
    estadoTexto: ESTADOS[r.estado],
    sentido: r.sentido,
    destino: { nombre: r.destino_nombre, nombre_en: r.destino_nombre_en },
    direccion: r.direccion,
    vuelo: r.vuelo,
    tipo_vuelo: r.tipo_vuelo,
    hora_vuelo: r.hora_vuelo,
    recogida: r.recogida,
    pasajeros: r.pasajeros,
    maletas: r.maletas,
    vehiculo: r.vehiculo,
    precio: r.precio,
    nombre: r.nombre,
    idioma: r.idioma,
    disponibilidad: r.disponibilidad,
    propiedad: r.propiedad_codigo,
    espera: r.tipo_vuelo === "internacional" ? r.espera_internacional : r.espera_nacional,
    conductor: verConductor
      ? { nombre: r.conductor_nombre, placa: r.conductor_placa, vehiculo: r.conductor_vehiculo, telefono: r.conductor_telefono, foto: r.conductor_foto }
      : null,
    puedePagar: ["pendiente_pago", "vencida"].includes(r.estado) && new Date(r.recogida).getTime() - Date.now() > 3 * 3600000,
  });
});

/** Nuevo intento de pago (Wompi no acepta repetir la referencia). */
publico.post("/api/reservas/:codigo/pagar", async (req, res) => {
  if (!tokenReservaValido(req.params.codigo, req.body.t)) return res.status(404).json({ error: "Reserva no encontrada." });
  const r = await uno("select * from reservas where codigo=$1 and estado in ('pendiente_pago','vencida')", [req.params.codigo]);
  if (!r) return res.status(400).json({ error: "Esta reserva ya no se puede pagar." });
  const ref = referenciaNueva(r.codigo);
  await q("update reservas set pago_ref=$2, estado='pendiente_pago', creado=now() where id=$1", [r.id, ref]);
  res.json({ pagoUrl: urlPago({ ...r, pago_ref: ref }) });
});

/** Al volver de Wompi (?id=transacción) se confirma el pago sin esperar el webhook. */
publico.post("/api/reservas/:codigo/verificar", async (req, res) => {
  if (!tokenReservaValido(req.params.codigo, req.body.t)) return res.status(404).json({ error: "Reserva no encontrada." });
  if (!wompiActivo() || !req.body.id) return res.json({ ok: false });
  try {
    const tx = await consultarTransaccion(req.body.id);
    const r = await uno("select precio from reservas where codigo=$1", [req.params.codigo]);
    if (tx.status === "APPROVED" && codigoDeReferencia(tx.reference) === req.params.codigo && tx.amount_in_cents === r.precio * 100) {
      await marcarPagada(req.params.codigo, { pagoId: tx.id, metodo: `wompi:${tx.payment_method_type || ""}` });
      return res.json({ ok: true, estado: "pagada" });
    }
    res.json({ ok: false, estado: tx.status });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

/** Pago simulado: solo existe mientras no haya llaves de Wompi. */
publico.post("/api/pago-demo/:codigo", async (req, res) => {
  if (wompiActivo()) return res.status(404).end();
  if (!tokenReservaValido(req.params.codigo, req.body.t)) return res.status(404).json({ error: "Reserva no encontrada." });
  await marcarPagada(req.params.codigo, { metodo: "simulado" });
  res.json({ ok: true });
});

publico.get("/qr/:codigo.png", async (req, res) => {
  const p = await uno("select codigo from propiedades where upper(codigo)=upper($1)", [req.params.codigo]);
  if (!p) return res.status(404).end();
  const png = await QRCode.toBuffer(`${config.urlPublica}/r/${p.codigo}`, { width: 900, margin: 2, color: { dark: "#0B3B2E", light: "#FFFFFF" } });
  res.setHeader("Content-Type", "image/png");
  if (req.query.descargar) res.setHeader("Content-Disposition", `attachment; filename="QR-${p.codigo}.png"`);
  res.send(png);
});

// ---------- Sesiones ----------

publico.post("/api/entrar", async (req, res) => {
  const { rol, telefono, pin, clave } = req.body || {};
  if (rol === "admin") {
    if (String(clave || "") !== config.claveAdmin) return res.status(401).json({ error: "Clave incorrecta." });
    ponerSesion(res, { rol: "admin", id: 0 });
    return res.json({ ok: true });
  }
  const tabla = rol === "conductor" ? "conductores" : rol === "anfitrion" ? "anfitriones" : null;
  if (!tabla) return res.status(400).json({ error: "Rol no válido." });
  const fila = await uno(`select id, pin from ${tabla} where telefono=$1 and activo`, [normalizar(telefono)]);
  if (!fila || !pinValido(pin, fila.pin)) return res.status(401).json({ error: "Teléfono o PIN incorrecto." });
  ponerSesion(res, { rol, id: fila.id });
  res.json({ ok: true });
});

publico.post("/api/salir", (req, res) => {
  quitarSesion(res);
  res.json({ ok: true });
});

publico.get("/api/yo", async (req, res) => {
  const s = sesionDe(req);
  if (!s) return res.json({ sesion: null });
  let nombre = "Administrador";
  if (s.rol === "conductor") nombre = (await uno("select nombre from conductores where id=$1", [s.id]))?.nombre;
  if (s.rol === "anfitrion") nombre = (await uno("select nombre from anfitriones where id=$1", [s.id]))?.nombre;
  res.json({ sesion: { rol: s.rol, id: s.id, nombre } });
});

/** Modo prueba: entrar a cualquier pantalla con un clic (sin PIN). */
publico.get("/api/prueba/opciones", async (req, res) => {
  if (!config.modoPrueba) return res.status(404).end();
  res.json({
    propiedades: await filas("select codigo, nombre from propiedades where activa order by id limit 20"),
    anfitriones: await filas("select id, nombre from anfitriones where activo order by id limit 20"),
    conductores: await filas("select id, nombre, vehiculo from conductores where activo order by id limit 30"),
  });
});

publico.post("/api/prueba/entrar", async (req, res) => {
  if (!config.modoPrueba) return res.status(404).end();
  const { rol, id } = req.body || {};
  if (!["admin", "anfitrion", "conductor"].includes(rol)) return res.status(400).json({ error: "Rol no válido." });
  let elegido = Number(id) || 0;
  if (rol !== "admin" && !elegido) {
    const f = await uno(`select id from ${rol === "conductor" ? "conductores" : "anfitriones"} where activo order by id limit 1`);
    elegido = f?.id || 0;
  }
  ponerSesion(res, { rol, id: elegido });
  res.json({ ok: true });
});
