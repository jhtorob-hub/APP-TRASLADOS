// Textos de los mensajes de WhatsApp. Huésped en su idioma (es/en); conductor y administrador en español.

import { config } from "./config.js";
import { fechaHoraTexto, horaTexto, pesos } from "./tiempo.js";
import { VEHICULOS } from "./precios.js";
import { tokenReserva } from "./sesion.js";

export const enlaceReserva = (r) => `${config.urlPublica}/reserva/${r.codigo}?t=${tokenReserva(r.codigo)}`;
const mapa = (dir) => `https://maps.google.com/?q=${encodeURIComponent(dir)}`;
const veh = (r, idioma) => (idioma === "en" ? VEHICULOS[r.vehiculo]?.nombre_en : VEHICULOS[r.vehiculo]?.nombre) || r.vehiculo;

function ruta(r, idioma) {
  const destino = idioma === "en" ? r.destino_nombre_en : r.destino_nombre;
  return r.sentido === "al_destino"
    ? idioma === "en" ? `${r.direccion} → ${destino}` : `${r.direccion} → ${destino}`
    : idioma === "en" ? `${destino} → ${r.direccion}` : `${destino} → ${r.direccion}`;
}

export const huesped = {
  confirmacion(r) {
    const en = r.idioma === "en";
    const sujeto = r.disponibilidad === "sujeto";
    if (en) {
      return [
        `✅ *${config.marca}* — Booking confirmed #${r.codigo}`,
        ``,
        `🚐 ${veh(r, "en")} · ${r.pasajeros} passenger(s)`,
        `📍 ${ruta(r, "en")}`,
        r.sentido === "desde_destino" && r.vuelo ? `✈️ Flight ${r.vuelo} · landing ${fechaHoraTexto(r.hora_vuelo, "en")}` : `🕐 Pickup ${fechaHoraTexto(r.recogida, "en")}`,
        `💳 Paid: ${pesos(r.precio)} COP`,
        ``,
        sujeto
          ? `⏳ Your trip is less than 12 h away: we're confirming a driver now. If we can't, you get a full refund.`
          : `12 hours before pickup you'll get your driver's name, photo, plate and WhatsApp.`,
        `Track your booking: ${enlaceReserva(r)}`,
      ].join("\n");
    }
    return [
      `✅ *${config.marca}* — Reserva confirmada #${r.codigo}`,
      ``,
      `🚐 ${veh(r, "es")} · ${r.pasajeros} pasajero(s)`,
      `📍 ${ruta(r, "es")}`,
      r.sentido === "desde_destino" && r.vuelo ? `✈️ Vuelo ${r.vuelo} · aterriza ${fechaHoraTexto(r.hora_vuelo)}` : `🕐 Recogida ${fechaHoraTexto(r.recogida)}`,
      `💳 Pagado: ${pesos(r.precio)}`,
      ``,
      sujeto
        ? `⏳ Tu viaje es en menos de 12 h: estamos confirmando un conductor. Si no lo logramos, te devolvemos el 100%.`
        : `12 horas antes te llegan el nombre, la foto, la placa y el WhatsApp de tu conductor.`,
      `Sigue tu reserva: ${enlaceReserva(r)}`,
    ].join("\n");
  },

  conductorAsignado(r) {
    const en = r.idioma === "en";
    const espera = r.tipo_vuelo === "internacional" ? r.espera_internacional : r.espera_nacional;
    if (en) {
      return [
        `🚐 *Your driver for #${r.codigo}*`,
        ``,
        `👤 ${r.conductor_nombre}`,
        `🚗 ${r.conductor_vehiculo || veh(r, "en")} · Plate *${r.conductor_placa}*`,
        `📱 WhatsApp: +${r.conductor_telefono}`,
        r.conductor_foto ? `📷 ${r.conductor_foto}` : null,
        ``,
        r.sentido === "desde_destino"
          ? `Your driver tracks flight ${r.vuelo || ""} and waits for you at arrivals with a sign with your name. ${espera} min of waiting included after landing.`
          : `Pickup: ${fechaHoraTexto(r.recogida, "en")} at ${r.direccion}.`,
        ``,
        `Any problem or change? Write to us here.`,
      ].filter((l) => l !== null).join("\n");
    }
    return [
      `🚐 *Tu conductor para la reserva #${r.codigo}*`,
      ``,
      `👤 ${r.conductor_nombre}`,
      `🚗 ${r.conductor_vehiculo || veh(r, "es")} · Placa *${r.conductor_placa}*`,
      `📱 WhatsApp: +${r.conductor_telefono}`,
      r.conductor_foto ? `📷 ${r.conductor_foto}` : null,
      ``,
      r.sentido === "desde_destino"
        ? `Tu conductor sigue el vuelo ${r.vuelo || ""} y te espera en la salida de llegadas con un letrero con tu nombre. Incluye ${espera} min de espera desde que aterrizas.`
        : `Recogida: ${fechaHoraTexto(r.recogida)} en ${r.direccion}.`,
      ``,
      `¿Algún problema o cambio? Escríbenos por aquí.`,
    ].filter((l) => l !== null).join("\n");
  },

  enCamino: (r) =>
    r.idioma === "en"
      ? `🚐 ${r.conductor_nombre} is on the way (plate ${r.conductor_placa}). Booking #${r.codigo}.`
      : `🚐 ${r.conductor_nombre} va en camino (placa ${r.conductor_placa}). Reserva #${r.codigo}.`,

  llego: (r) =>
    r.idioma === "en"
      ? r.sentido === "desde_destino"
        ? `👋 ${r.conductor_nombre} is at arrivals with a sign with your name. Plate ${r.conductor_placa}.`
        : `👋 ${r.conductor_nombre} is outside your building. Plate ${r.conductor_placa}.`
      : r.sentido === "desde_destino"
        ? `👋 ${r.conductor_nombre} ya está en la salida de llegadas con un letrero con tu nombre. Placa ${r.conductor_placa}.`
        : `👋 ${r.conductor_nombre} ya está afuera de tu edificio. Placa ${r.conductor_placa}.`,

  final(r, enlaceRegreso) {
    if (r.idioma === "en") {
      return [
        `🙌 Thanks for riding with *${config.marca}*!`,
        r.sentido === "desde_destino" && enlaceRegreso
          ? `Book your ride back to the airport with *10% off*: ${enlaceRegreso}`
          : `See you next time in Medellín!`,
        `How was your trip? Reply with a number from 1 to 5.`,
      ].join("\n");
    }
    return [
      `🙌 ¡Gracias por viajar con *${config.marca}*!`,
      r.sentido === "desde_destino" && enlaceRegreso
        ? `Reserva tu regreso al aeropuerto con *10% de descuento*: ${enlaceRegreso}`
        : `¡Te esperamos en tu próximo viaje!`,
      `¿Cómo estuvo el viaje? Responde con un número del 1 al 5.`,
    ].join("\n");
  },

  enlacePago: (r, url) =>
    r.idioma === "en"
      ? [`🚐 *${config.marca}* — your private transfer #${r.codigo}`, `🕐 Pickup ${fechaHoraTexto(r.recogida, "en")}`, `📍 ${ruta(r, "en")}`, `🚐 ${veh(r, "en")} · ${r.pasajeros} passenger(s)`, `💳 Total: ${pesos(r.precio)} COP`, ``, `Pay here to confirm: ${url}`].join("\n")
      : [`🚐 *${config.marca}* — tu traslado privado #${r.codigo}`, `🕐 Recogida ${fechaHoraTexto(r.recogida)}`, `📍 ${ruta(r, "es")}`, `🚐 ${veh(r, "es")} · ${r.pasajeros} pasajero(s)`, `💳 Total: ${pesos(r.precio)}`, ``, `Paga aquí para confirmar: ${url}`].join("\n"),

  cancelada: (r) =>
    r.idioma === "en"
      ? `Your booking #${r.codigo} was cancelled. ${r.motivo_cancelacion || ""} If a refund applies, it will be processed to your card.`
      : `Tu reserva #${r.codigo} fue cancelada. ${r.motivo_cancelacion || ""} Si aplica reembolso, se hará a tu tarjeta.`,

  cambioHora: (r) =>
    r.idioma === "en"
      ? `🕐 Booking #${r.codigo}: new pickup time ${fechaHoraTexto(r.recogida, "en")}.`
      : `🕐 Reserva #${r.codigo}: nueva hora de recogida ${fechaHoraTexto(r.recogida)}.`,
};

export const conductor = {
  oferta: (r) =>
    [
      `🚐 *Viaje disponible #${r.codigo}*`,
      `📅 ${fechaHoraTexto(r.recogida)}${r.nocturno ? " 🌙 nocturno" : ""}`,
      `📍 ${ruta(r, "es")}`,
      r.vuelo ? `✈️ ${r.sentido === "desde_destino" ? "Aterriza" : "Vuelo"} ${r.vuelo} (${r.tipo_vuelo})` : null,
      `👥 ${r.pasajeros} pasajero(s) · ${r.maletas} maleta(s) · ${veh(r, "es")}`,
      `💰 *Ganas ${pesos(r.pago_conductor)}*`,
      ``,
      `Responde *1* para tomarlo o *2* si no puedes.`,
    ].filter((l) => l !== null).join("\n"),

  asignado: (r) =>
    [
      `✅ *Viaje #${r.codigo} es tuyo*`,
      `📅 Recogida: ${fechaHoraTexto(r.recogida)}`,
      `📍 ${ruta(r, "es")}`,
      r.vuelo ? `✈️ ${r.sentido === "desde_destino" ? "Aterriza" : "Sale"} vuelo ${r.vuelo} a las ${horaTexto(r.hora_vuelo)} (${r.tipo_vuelo})` : null,
      `👤 Huésped: ${r.nombre} · +${r.telefono}${r.idioma === "en" ? " (habla inglés)" : ""}`,
      `👥 ${r.pasajeros} pasajero(s) · ${r.maletas} maleta(s)`,
      r.notas ? `📝 ${r.notas}` : null,
      `🗺️ ${mapa(r.direccion)}`,
      `💰 Ganas ${pesos(r.pago_conductor)}`,
      ``,
      `Comandos: *OK* (confirmar) · *VOY* (salí) · *LLEGUÉ* · *RECOGÍ* · *ENTREGUÉ* · *VIAJES*`,
    ].filter((l) => l !== null).join("\n"),

  tomado: (codigo) => `Gracias. El viaje #${codigo} ya lo tomó otro conductor.`,

  recordatorio: (r) =>
    [
      `⏰ *Recordatorio viaje #${r.codigo}*`,
      `Recogida ${fechaHoraTexto(r.recogida)} · ${ruta(r, "es")}`,
      r.vuelo ? `✈️ Vuelo ${r.vuelo}` : null,
      `Responde *OK* para confirmar que vas. Si no confirmas, se asigna a otro conductor.`,
    ].filter((l) => l !== null).join("\n"),

  cambioHora: (r) => `🕐 Viaje #${r.codigo}: la nueva hora de recogida es ${fechaHoraTexto(r.recogida)}.`,

  cancelado: (r) => `❌ El viaje #${r.codigo} (${fechaHoraTexto(r.recogida)}) fue cancelado. No tienes que ir.`,

  ayuda: () =>
    [
      `Comandos disponibles:`,
      `*1* tomar el último viaje ofrecido · *2* no puedo`,
      `*OK* confirmar · *VOY* salí · *LLEGUÉ* · *RECOGÍ* · *ENTREGUÉ*`,
      `*VIAJES* ver mis próximos viajes`,
      `También puedes usar la app: ${config.urlPublica}/conductor`,
    ].join("\n"),
};
