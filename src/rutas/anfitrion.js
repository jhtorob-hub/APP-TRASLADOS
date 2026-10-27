// Panel del anfitrión: sus QR, lo que ha ganado y los viajes de sus huéspedes.

import { Router } from "express";
import { config } from "../config.js";
import { uno, filas, ajustes } from "../db.js";
import { exigir } from "../sesion.js";
import { pctAnfitrion } from "../precios.js";
import { inicioMes } from "../tiempo.js";
import { ESTADOS } from "../reservas.js";

export const anfitrion = Router();
anfitrion.use("/api/anfitrion", exigir("anfitrion"));

const CUENTAN = "('pagada','asignada','confirmada','en_camino','llego','recogido','terminada')";

anfitrion.get("/api/anfitrion/resumen", async (req, res) => {
  const id = req.sesion.id;
  const a = await uno("select id, nombre, telefono, correo, comision_pct from anfitriones where id=$1", [id]);
  if (!a) return res.status(404).json({ error: "No encontrado" });
  const aj = await ajustes();
  const props = await filas(
    `select p.codigo, p.nombre, p.direccion, p.zona, p.activa,
            (select count(*)::int from visitas v where v.propiedad_id=p.id and v.creado >= now() - interval '30 days') visitas_30d,
            (select count(*)::int from reservas r where r.propiedad_id=p.id and r.estado in ${CUENTAN} and r.creado >= now() - interval '30 days') reservas_30d
       from propiedades p where p.anfitrion_id=$1 order by p.id`,
    [id]
  );
  const mes = inicioMes(new Date());
  const tot = await uno(
    `select coalesce(sum(comision_anfitrion) filter (where creado >= $2),0)::int ganado_mes,
            count(*) filter (where creado >= $2)::int viajes_mes,
            coalesce(sum(comision_anfitrion) filter (where estado='terminada' and liquidado_anfitrion_en is null),0)::int por_pagar,
            coalesce(sum(comision_anfitrion),0)::int ganado_total
       from reservas where anfitrion_id=$1 and estado in ${CUENTAN}`,
    [id, mes]
  );
  const activas = props.filter((p) => p.activa).length;
  res.json({
    anfitrion: { nombre: a.nombre, telefono: a.telefono, correo: a.correo },
    pct: pctAnfitrion(a, activas, aj),
    totales: tot,
    propiedades: props.map((p) => ({ ...p, enlace: `${config.urlPublica}/r/${p.codigo}`, qr: `/qr/${p.codigo}.png` })),
  });
});

anfitrion.get("/api/anfitrion/viajes", async (req, res) => {
  const lista = await filas(
    `select r.codigo, r.recogida, r.sentido, r.vehiculo, r.pasajeros, r.estado, r.precio, r.comision_anfitrion,
            split_part(r.nombre, ' ', 1) huesped, p.nombre propiedad, d.nombre destino
       from reservas r left join propiedades p on p.id=r.propiedad_id left join destinos d on d.id=r.destino_id
      where r.anfitrion_id=$1 and r.estado in ${CUENTAN} order by r.recogida desc limit 200`,
    [req.sesion.id]
  );
  res.json(lista.map((r) => ({ ...r, estadoTexto: ESTADOS[r.estado] })));
});
