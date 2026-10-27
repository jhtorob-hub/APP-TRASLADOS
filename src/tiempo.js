// Fechas en hora de Colombia (UTC-5 fijo, sin horario de verano).

const OFFSET_MS = -5 * 60 * 60 * 1000;

/** "2026-11-03" + "14:30" (hora Bogotá) -> Date */
export function deFechaHora(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") || !/^\d{1,2}:\d{2}$/.test(hora || "")) return null;
  const [h, m] = hora.split(":").map(Number);
  const d = new Date(`${fecha}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Partes de la fecha en hora Bogotá. */
export function partes(d) {
  const l = new Date(new Date(d).getTime() + OFFSET_MS);
  return {
    anio: l.getUTCFullYear(),
    mes: l.getUTCMonth() + 1,
    dia: l.getUTCDate(),
    hora: l.getUTCHours(),
    minuto: l.getUTCMinutes(),
    diaSemana: l.getUTCDay(),
  };
}

export const esNocturna = (d) => {
  const { hora } = partes(d);
  return hora >= 22 || hora < 5;
};

const DIAS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function horaTexto(d, idioma = "es") {
  const { hora, minuto } = partes(d);
  if (idioma === "en") {
    const h12 = hora % 12 || 12;
    return `${h12}:${String(minuto).padStart(2, "0")} ${hora < 12 ? "AM" : "PM"}`;
  }
  const h12 = hora % 12 || 12;
  return `${h12}:${String(minuto).padStart(2, "0")} ${hora < 12 ? "a. m." : "p. m."}`;
}

export function fechaTexto(d, idioma = "es") {
  const p = partes(d);
  return idioma === "en"
    ? `${DIAS_EN[p.diaSemana]} ${MESES_EN[p.mes - 1]} ${p.dia}`
    : `${DIAS_ES[p.diaSemana]} ${p.dia} ${MESES_ES[p.mes - 1]}`;
}

export const fechaHoraTexto = (d, idioma = "es") => `${fechaTexto(d, idioma)}, ${horaTexto(d, idioma)}`;

/** Inicio del día (00:00 Bogotá) de la fecha dada, como Date. */
export function inicioDia(d) {
  const p = partes(d);
  return deFechaHora(`${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`, "00:00");
}

/** Lunes 00:00 (Bogotá) de la semana de la fecha. */
export function inicioSemana(d) {
  const ini = inicioDia(d);
  const { diaSemana } = partes(d);
  return new Date(ini.getTime() - ((diaSemana + 6) % 7) * 86400000);
}

export function inicioMes(d) {
  const p = partes(d);
  return deFechaHora(`${p.anio}-${String(p.mes).padStart(2, "0")}-01`, "00:00");
}

export const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
