// Servidor de la app de traslados: API + las 4 pantallas (huésped, anfitrión, conductor, administrador).

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { config, wompiActivo, whatsappActivo } from "./config.js";
import { iniciarBase } from "./db.js";
import { iniciarProgramador } from "./programador.js";
import { publico } from "./rutas/publico.js";
import { webhooks } from "./rutas/webhooks.js";
import { anfitrion } from "./rutas/anfitrion.js";
import { conductor } from "./rutas/conductor.js";
import { admin } from "./rutas/admin.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dir, "..", "public");

let commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "";
if (!commit) {
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    commit = "local";
  }
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) =>
  res.json({ ok: true, commit, modoPrueba: config.modoPrueba, pagoReal: wompiActivo(), whatsappReal: whatsappActivo(), programador: config.programador })
);

app.use(webhooks);
app.use(publico);
app.use(anfitrion);
app.use(conductor);
app.use(admin);

app.use(express.static(publicDir, { index: false, maxAge: "1h" }));

// Todas las pantallas son la misma app (public/index.html); el navegador decide cuál mostrar por la ruta.
const PANTALLAS = [/^\/$/, /^\/r\/[\w-]+$/, /^\/reserva\/[\w-]+$/, /^\/pago-demo\/[\w-]+$/, /^\/anfitrion$/, /^\/conductor$/, /^\/admin$/];
app.get("*", (req, res, next) => {
  if (!PANTALLAS.some((r) => r.test(req.path))) return next();
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use("/api", (req, res) => res.status(404).json({ error: "No existe" }));
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Error interno" });
});

await iniciarBase();
app.listen(config.puerto, () => {
  console.log(`[app] ${config.marca} escuchando en ${config.puerto} · commit ${commit} · modo prueba ${config.modoPrueba ? "ON" : "off"}`);
  console.log(`[app] Pago: ${wompiActivo() ? "Wompi" : "SIMULADO"} · WhatsApp: ${whatsappActivo() ? "Evolution API" : "solo registro (pestaña Mensajes)"}`);
  if (config.programador) iniciarProgramador();
});
