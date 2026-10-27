// Configuración leída de variables de entorno. Los valores reales viven solo en Railway.
// Ver .env.example para la lista completa con explicación.

const env = process.env;
const onOff = (v, porDefecto = false) => (v == null || v === "" ? porDefecto : /^(1|on|si|sí|true|yes)$/i.test(v));

export const config = {
  puerto: Number(env.PORT || 3000),
  urlPublica: (env.URL_PUBLICA || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ""),
  marca: env.MARCA || "Llegá",
  // Modo prueba: muestra la barra para saltar entre las 4 pantallas con un clic y
  // permite entrar sin PIN. En producción se apaga (MODO_PRUEBA=off).
  modoPrueba: onOff(env.MODO_PRUEBA, true),
  // Carga anfitriones, conductores y viajes de ejemplo si la base está vacía.
  semillaDemo: onOff(env.SEMILLA_DEMO, onOff(env.MODO_PRUEBA, true)),
  baseDatos: env.DATABASE_URL || "",
  secretoSesion: env.SECRETO_SESION || "cambia-esto-en-railway",
  claveAdmin: env.CLAVE_ADMIN || "admin",
  telefonoAdmin: (env.TELEFONO_ADMIN || "").replace(/\D/g, ""),
  wompi: {
    llavePublica: env.WOMPI_LLAVE_PUBLICA || "",
    secretoIntegridad: env.WOMPI_SECRETO_INTEGRIDAD || "",
    secretoEventos: env.WOMPI_SECRETO_EVENTOS || "",
  },
  evolution: {
    url: (env.EVOLUTION_API_URL || "").replace(/\/$/, ""),
    llave: env.EVOLUTION_API_KEY || "",
    instancia: env.EVOLUTION_INSTANCIA || "",
  },
  secretoWebhookWhatsapp: env.SECRETO_WEBHOOK_WHATSAPP || "cambia-esto",
  correo: {
    resendKey: env.RESEND_API_KEY || "",
    remitente: env.CORREO_REMITENTE || "",
  },
  programador: onOff(env.PROGRAMADOR, true),
};

export const wompiActivo = () => Boolean(config.wompi.llavePublica && config.wompi.secretoIntegridad);
export const whatsappActivo = () => Boolean(config.evolution.url && config.evolution.llave && config.evolution.instancia);
export const wompiApi = () =>
  config.wompi.llavePublica.startsWith("pub_prod_") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
