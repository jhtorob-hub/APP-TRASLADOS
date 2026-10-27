// Sesiones firmadas con HMAC en una cookie (sin librerías).

import crypto from "node:crypto";
import { config } from "./config.js";

const firmar = (texto) => crypto.createHmac("sha256", config.secretoSesion).update(texto).digest("base64url");

export function crearToken(datos, dias = 30) {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + dias * 86400000 })).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function leerToken(token) {
  if (!token || !token.includes(".")) return null;
  const [cuerpo, firma] = token.split(".");
  const esperada = firmar(cuerpo);
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    return datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

function cookies(req) {
  const out = {};
  for (const par of (req.headers.cookie || "").split(";")) {
    const i = par.indexOf("=");
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}

export function ponerSesion(res, datos) {
  const seguro = config.urlPublica.startsWith("https") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `sesion=${crearToken(datos)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${seguro}`);
}

export function quitarSesion(res) {
  res.setHeader("Set-Cookie", "sesion=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

export const sesionDe = (req) => leerToken(cookies(req).sesion);

/** Middleware: exige rol. Deja la sesión en req.sesion. */
export const exigir = (rol) => (req, res, next) => {
  const s = sesionDe(req);
  if (!s || s.rol !== rol) return res.status(401).json({ error: "Inicia sesión" });
  req.sesion = s;
  next();
};

/** Token corto para que el huésped vea su reserva sin cuenta (evita adivinar códigos). */
export const tokenReserva = (codigo) => firmar(`reserva:${codigo}`).slice(0, 16);
export const tokenReservaValido = (codigo, t) => {
  const esperado = tokenReserva(codigo);
  return typeof t === "string" && t.length === esperado.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(esperado));
};

export function hashPin(pin) {
  const sal = crypto.randomBytes(8).toString("hex");
  return `${sal}:${crypto.scryptSync(String(pin), sal, 32).toString("hex")}`;
}

export function pinValido(pin, guardado) {
  if (!guardado || !guardado.includes(":")) return false;
  const [sal, hash] = guardado.split(":");
  const calc = crypto.scryptSync(String(pin), sal, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}
