// Pantalla del conductor: viajes ofrecidos, sus viajes con botones de estado y sus ganancias.
// Hace lo mismo que los comandos de WhatsApp.

import { Router } from "express";
import { uno, filas } from "../db.js";
import { exigir } from "../sesion.js";
import { aceptar, rechazar, avanzar, ACTIVAS, ESTADOS } from "../reservas.js";
import { inicioSemana } from "../tiempo.js";

export const conductor = Router();
conductor.use("/api/conductor", exigir("conductor"));

const CAMPOS = `r.id, r.codigo, r.sentido, r.recogida, r.hora_vuelo, r.vuelo, r.tipo_vuelo, r.pasajeros, r.maletas, r.vehiculo, r.nocturno,
  r.direccion, r.pago_conductor, r.estado, d.nombre destino, d.codigo destino_codigo`;

conductor.get("/api/conductor/inicio", async (req, res) => {
  const id = req.sesion.id;
  const yo = await uno("select c.id, c.nombre, c.telefono, c.vehiculo, c.placa, c.descripcion, e.nombre empresa from conductores c left join empresas e on e.id=c.empresa_id where c.id=$1", [id]);
  if (!yo) return res.status(404).json({ error: "No encontrado" });
  const ofertas = await filas(
    `select ${CAMPOS} from ofertas o join reservas r on r.id=o.reserva_id left join destinos d on d.id=r.destino_id
      where o.conductor_id=$1 and o.respuesta is null and r.estado='pagada' and r.conductor_id is null and r.recogida > now()
      order by r.recogida`,
    [id]
  );
  const viajes = await filas(
    `select ${CAMPOS}, r.nombre huesped, r.telefono huesped_telefono, r.idioma, r.notas
       from reservas r left join destinos d on d.id=r.destino_id
      where r.conductor_id=$1 and r.estado = any($2) order by r.recogida`,
    [id, ACTIVAS]
  );
  const semana = inicioSemana(new Date());
  const ganancias = await uno(
    `select coalesce(sum(pago_conductor) filter (where terminado_en >= $2),0)::int semana,
            count(*) filter (where terminado_en >= $2)::int viajes_semana,
            coalesce(sum(pago_conductor) filter (where liquidado_conductor_en is null),0)::int por_cobrar
       from reservas where conductor_id=$1 and estado='terminada'`,
    [id, semana]
  );
  const historial = await filas(
    `select r.codigo, r.recogida, r.pago_conductor, r.liquidado_conductor_en, d.nombre destino
       from reservas r left join destinos d on d.id=r.destino_id where r.conductor_id=$1 and r.estado='terminada'
      order by r.recogida desc limit 20`,
    [id]
  );
  res.json({ yo, ofertas, viajes: viajes.map((v) => ({ ...v, estadoTexto: ESTADOS[v.estado] })), ganancias, historial });
});

conductor.post("/api/conductor/ofertas/:id/aceptar", async (req, res) => {
  const ofrecida = await uno("select 1 from ofertas where reserva_id=$1 and conductor_id=$2", [req.params.id, req.sesion.id]);
  if (!ofrecida) return res.status(404).json({ error: "Este viaje no te fue ofrecido." });
  const r = await aceptar(Number(req.params.id), req.sesion.id);
  res.status(r.ok ? 200 : 409).json(r.ok ? { ok: true } : { error: r.motivo });
});

conductor.post("/api/conductor/ofertas/:id/rechazar", async (req, res) => {
  await rechazar(Number(req.params.id), req.sesion.id);
  res.json({ ok: true });
});

conductor.post("/api/conductor/viajes/:id/estado", async (req, res) => {
  const r = await avanzar(Number(req.params.id), req.body.estado, { conductorId: req.sesion.id });
  res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true } : { error: r.motivo });
});
