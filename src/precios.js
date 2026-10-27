// Cálculo de precios y reparto. Misma lógica del tarifario en Excel:
// precio público = pago al conductor / (1 - % plataforma), redondeado hacia arriba.
// Del precio salen: conductor, comisión del anfitrión, pasarela de pago y el neto de la plataforma.

export const VEHICULOS = {
  sedan: { orden: 1, nombre: "Sedán", nombre_en: "Sedan", pasajeros: 3, maletas: 3 },
  camioneta: { orden: 2, nombre: "Camioneta", nombre_en: "SUV", pasajeros: 6, maletas: 5 },
  van: { orden: 3, nombre: "Van", nombre_en: "Van", pasajeros: 12, maletas: 12 },
};

export const AJUSTES_INICIALES = {
  pct_plataforma: 0.2,
  pct_pasarela: 0.03,
  comision_anfitrion: [
    { desde: 1, pct: 0.05 },
    { desde: 50, pct: 0.06 },
    { desde: 200, pct: 0.07 },
  ],
  mult_camioneta: 1.47,
  mult_van: 2.27,
  pct_nocturno: 0.15,
  redondeo: 5000,
  descuento_regreso: 0.1,
  espera_nacional: 60,
  espera_internacional: 90,
  hora_extra_espera: 40000,
  horas_garantizado: 12,
  horas_minimo: 3,
  telefono_soporte: "",
  fotos_vehiculos: { sedan: "", camioneta: "", van: "" },
};

const arriba = (n, paso) => Math.ceil(n / paso) * paso;

export function multiplicador(vehiculo, aj) {
  if (vehiculo === "camioneta") return Number(aj.mult_camioneta);
  if (vehiculo === "van") return Number(aj.mult_van);
  return 1;
}

/**
 * @param {object} p
 * @param {number} p.pagoSedan  pago al conductor en sedán para la ruta
 * @param {string} p.vehiculo   sedan | camioneta | van
 * @param {object} p.aj         ajustes
 * @param {boolean} [p.nocturno]
 * @param {number} [p.descuento] fracción (0.1 = 10%) — sale del margen, no del conductor
 * @param {number} [p.pctAnfitrion] fracción; 0 si no hay anfitrión
 */
export function calcular({ pagoSedan, vehiculo, aj, nocturno = false, descuento = 0, pctAnfitrion = 0 }) {
  const plat = Number(aj.pct_plataforma);
  const paso = Number(aj.redondeo) || 1000;
  let pago = Math.round(pagoSedan * multiplicador(vehiculo, aj));
  let precio = arriba(pago / (1 - plat), paso);
  if (nocturno) {
    precio = arriba(precio * (1 + Number(aj.pct_nocturno)), paso);
    pago = Math.round(precio * (1 - plat));
  }
  if (descuento > 0) precio = arriba(precio * (1 - descuento), paso);
  const comision = Math.round(precio * pctAnfitrion);
  const pasarela = Math.round(precio * Number(aj.pct_pasarela));
  const neto = precio - pago - comision - pasarela;
  return { precio, pago, comision, pasarela, neto };
}

/** % de comisión del anfitrión: el suyo propio si se pactó, si no por número de propiedades activas. */
export function pctAnfitrion(anfitrion, numPropiedades, aj) {
  if (!anfitrion) return 0;
  if (anfitrion.comision_pct != null && anfitrion.comision_pct !== "") return Number(anfitrion.comision_pct);
  const tramos = [...(aj.comision_anfitrion || [])].sort((a, b) => a.desde - b.desde);
  let pct = tramos[0]?.pct ?? 0.05;
  for (const t of tramos) if (numPropiedades >= t.desde) pct = t.pct;
  return Number(pct);
}

/** El vehículo más pequeño donde caben los pasajeros y las maletas. */
export function recomendado(pasajeros, maletas) {
  const lista = Object.entries(VEHICULOS).sort((a, b) => a[1].orden - b[1].orden);
  const ok = lista.find(([, v]) => pasajeros <= v.pasajeros && maletas <= v.maletas);
  return ok ? ok[0] : null;
}

export const cabe = (vehiculo, pasajeros, maletas) => {
  const v = VEHICULOS[vehiculo];
  return Boolean(v && pasajeros <= v.pasajeros && maletas <= v.maletas);
};
