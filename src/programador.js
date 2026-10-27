// Tareas automáticas cada minuto: ofrecer viajes, avisos al huésped y al conductor, alertas al administrador.
// Las reglas son las del tarifario (hoja "Reglas de servicio").

import { q, filas, uno } from "./db.js";
import { ofrecer, avisarHuesped, reservaCompleta } from "./reservas.js";
import { enviar, alertar } from "./whatsapp.js";
import { conductor as txtConductor } from "./textos.js";
import { fechaHoraTexto, partes, deFechaHora } from "./tiempo.js";

let corriendo = false;
const HORA = 3600000;

export async function ciclo(ahora = new Date()) {
  if (corriendo) return;
  corriendo = true;
  try {
    // 1. Pagos que nunca se completaron (2 h) → vencida.
    await q("update reservas set estado='vencida' where estado='pendiente_pago' and creado < now() - interval '2 hours'");

    // 2. Ofrecer viajes pagados sin conductor cuando faltan 24 h o menos (ronda 1),
    //    y segunda ronda con vehículos más grandes si en 30 min nadie lo tomó.
    const porOfrecer = await filas(
      `select id from reservas where estado='pagada' and conductor_id is null and recogida > now()
         and recogida - now() <= interval '24 hours'
         and (ronda_oferta = 0 or (ronda_oferta = 1 and ofrecida_en < now() - interval '30 minutes'))`
    );
    for (const r of porOfrecer) await ofrecer(r.id);

    // 3. Alerta: sin conductor 2 h después de ofrecido, o faltan menos de 6 h.
    const sinAsignar = await filas(
      `select id, codigo, recogida from reservas where estado='pagada' and conductor_id is null and alerta_sin_asignar_en is null
         and recogida > now() and (ofrecida_en < now() - interval '2 hours' or recogida - now() < interval '6 hours')`
    );
    for (const r of sinAsignar) {
      await q("update reservas set alerta_sin_asignar_en=now() where id=$1", [r.id]);
      await alertar(r.id, `Reserva #${r.codigo} (${fechaHoraTexto(r.recogida)}) sigue SIN CONDUCTOR. Asígnala desde el tablero.`);
    }

    // 4. Viajes nocturnos (10 p. m.–5 a. m.) sin conductor a las 6 p. m. del día anterior.
    const nocturnos = await filas(
      `select id, codigo, recogida from reservas where estado='pagada' and conductor_id is null and nocturno and alerta_nocturna_en is null and recogida > now()`
    );
    for (const r of nocturnos) {
      const p = partes(r.recogida);
      // Si la recogida es de madrugada (0–5 h), el "día anterior" es el mismo día de calendario menos uno.
      const base = deFechaHora(`${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`, "18:00");
      const limite = new Date(base.getTime() - (p.hora < 5 ? 24 * HORA : 0));
      if (ahora >= limite) {
        await q("update reservas set alerta_nocturna_en=now() where id=$1", [r.id]);
        await alertar(r.id, `🌙 Viaje nocturno #${r.codigo} (${fechaHoraTexto(r.recogida)}) sin conductor a las 6 p. m. Activar empresa de turno.`);
      }
    }

    // 5. Datos del conductor al huésped 12 h antes.
    const avisos = await filas(
      `select id from reservas where estado in ('asignada','confirmada') and aviso_huesped_en is null and recogida - now() <= interval '12 hours'`
    );
    for (const r of avisos) await avisarHuesped(r.id);

    // 6. Recordatorio al conductor 2 h 30 min antes: debe responder OK.
    const recordar = await filas(
      `select id from reservas where estado='asignada' and recordatorio_conductor_en is null and recogida > now()
         and recogida - now() <= interval '150 minutes'`
    );
    for (const r of recordar) {
      await q("update reservas set recordatorio_conductor_en=now() where id=$1", [r.id]);
      const c = await reservaCompleta(r.id);
      await enviar(c.conductor_telefono, txtConductor.recordatorio(c), { reservaId: r.id });
    }

    // 7. Alerta: el conductor no confirmó y falta 1 h 30 min o menos → activar respaldo.
    const sinConfirmar = await filas(
      `select id, codigo, recogida from reservas where estado='asignada' and alerta_sin_confirmar_en is null and recogida > now()
         and recogida - now() <= interval '90 minutes'`
    );
    for (const r of sinConfirmar) {
      await q("update reservas set alerta_sin_confirmar_en=now() where id=$1", [r.id]);
      const c = await uno("select c.nombre, c.telefono from reservas r join conductores c on c.id=r.conductor_id where r.id=$1", [r.id]);
      await alertar(r.id, `Reserva #${r.codigo} (${fechaHoraTexto(r.recogida)}): ${c?.nombre || "el conductor"} NO ha confirmado. Llamarlo (+${c?.telefono || "?"}) o activar respaldo.`);
    }
  } catch (err) {
    console.error("[programador]", err);
  } finally {
    corriendo = false;
  }
}

export function iniciarProgramador() {
  setTimeout(ciclo, 5000);
  setInterval(ciclo, 60000);
  console.log("[programador] Activo: revisa reservas cada minuto.");
}
