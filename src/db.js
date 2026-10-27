// Base de datos Postgres (servicio Postgres de Railway, variable DATABASE_URL).
// Crea las tablas al arrancar y carga los datos iniciales (zonas, destinos, tarifas, ajustes).

import pg from "pg";
import { config } from "./config.js";
import { AJUSTES_INICIALES, calcular } from "./precios.js";
import { hashPin } from "./sesion.js";

if (!config.baseDatos) {
  console.error("Falta DATABASE_URL (en Railway: agrega un servicio Postgres y referencia su DATABASE_URL).");
  process.exit(1);
}

const ssl = /sslmode=require|railway\.app|rlwy\.net/.test(config.baseDatos) && !/localhost|127\.0\.0\.1|\/tmp/.test(config.baseDatos)
  ? { rejectUnauthorized: false }
  : undefined;

export const pool = new pg.Pool({ connectionString: config.baseDatos, ssl, max: 5 });
export const q = (sql, params) => pool.query(sql, params);
export const uno = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
export const filas = async (sql, params) => (await pool.query(sql, params)).rows;

const ESQUEMA = `
create table if not exists ajustes (clave text primary key, valor jsonb not null);

create table if not exists zonas (
  codigo text primary key, nombre text not null, barrios text default '', orden int default 0
);

create table if not exists destinos (
  id serial primary key, codigo text unique not null, nombre text not null, nombre_en text not null,
  tipo text not null default 'aeropuerto', pide_vuelo boolean default true,
  antes_nacional int default 90, antes_internacional int default 150, orden int default 0
);

create table if not exists tarifas (
  zona text references zonas(codigo) on delete cascade,
  destino_id int references destinos(id) on delete cascade,
  pago_sedan int not null, minutos int not null default 60,
  primary key (zona, destino_id)
);

create table if not exists empresas (
  id serial primary key, nombre text not null, nit text default '', contacto text default '',
  telefono text default '', activa boolean default true, creado timestamptz default now()
);

create table if not exists conductores (
  id serial primary key, empresa_id int references empresas(id) on delete set null,
  nombre text not null, telefono text unique not null, pin text,
  vehiculo text not null check (vehiculo in ('sedan','camioneta','van')),
  placa text default '', descripcion text default '', foto_url text default '',
  activo boolean default true, creado timestamptz default now()
);

create table if not exists anfitriones (
  id serial primary key, nombre text not null, telefono text unique not null, correo text default '',
  pin text, comision_pct numeric, datos_pago text default '', activo boolean default true,
  creado timestamptz default now()
);

create table if not exists propiedades (
  id serial primary key, anfitrion_id int references anfitriones(id) on delete cascade,
  codigo text unique not null, nombre text not null, direccion text not null,
  zona text references zonas(codigo), activa boolean default true, creado timestamptz default now()
);

create table if not exists visitas (
  id bigserial primary key, propiedad_id int references propiedades(id) on delete cascade, creado timestamptz default now()
);

create table if not exists reservas (
  id serial primary key, codigo text unique not null,
  propiedad_id int references propiedades(id) on delete set null,
  anfitrion_id int references anfitriones(id) on delete set null,
  reserva_origen int,
  sentido text not null check (sentido in ('al_destino','desde_destino')),
  destino_id int references destinos(id),
  vuelo text default '', tipo_vuelo text default 'nacional',
  hora_vuelo timestamptz not null, recogida timestamptz not null,
  pasajeros int not null, maletas int not null default 0,
  vehiculo text not null, nocturno boolean default false, disponibilidad text default 'garantizado',
  nombre text not null, telefono text not null, correo text default '', idioma text default 'es',
  direccion text not null, notas text default '',
  precio int not null, pago_conductor int not null, comision_anfitrion int not null default 0,
  pasarela int not null default 0, neto int not null, descuento numeric default 0,
  estado text not null default 'pendiente_pago',
  pago_ref text, pago_id text, pago_metodo text, pagado_en timestamptz,
  conductor_id int references conductores(id) on delete set null,
  ronda_oferta int default 0, ofrecida_en timestamptz, asignada_en timestamptz, confirmada_en timestamptz,
  en_camino_en timestamptz, llego_en timestamptz, recogido_en timestamptz, terminado_en timestamptz,
  cancelado_en timestamptz, motivo_cancelacion text,
  aviso_huesped_en timestamptz, recordatorio_conductor_en timestamptz,
  alerta_sin_asignar_en timestamptz, alerta_nocturna_en timestamptz, alerta_sin_confirmar_en timestamptz,
  liquidado_conductor_en timestamptz, liquidado_anfitrion_en timestamptz,
  creado timestamptz default now()
);
alter table reservas add column if not exists origen text default 'qr';
create index if not exists reservas_recogida on reservas (recogida);
create index if not exists reservas_estado on reservas (estado);

create table if not exists ofertas (
  id serial primary key, reserva_id int references reservas(id) on delete cascade,
  conductor_id int references conductores(id) on delete cascade,
  enviada timestamptz default now(), respuesta text, respondida timestamptz,
  unique (reserva_id, conductor_id)
);

create table if not exists eventos (
  id bigserial primary key, reserva_id int references reservas(id) on delete cascade,
  tipo text not null, detalle text default '', alerta boolean default false, atendida boolean default false,
  creado timestamptz default now()
);

create table if not exists mensajes (
  id bigserial primary key, sentido text not null, telefono text not null, texto text not null,
  estado text default 'registrado', error text, reserva_id int, creado timestamptz default now()
);
`;

const ZONAS = [
  ["A", "Poblado, Laureles, Estadio, Envigado", "El Poblado, Provenza, Manila, Laureles, Estadio, Conquistadores, Envigado", 1],
  ["B", "Centro, Candelaria, Buenos Aires, Belén", "La Candelaria, Centro, Buenos Aires, Bomboná, Belén, Prado", 2],
  ["C", "Sabaneta, Itagüí, La Estrella", "Sabaneta, Itagüí, La Estrella, Caldas", 3],
  ["D", "Bello, Copacabana", "Bello, Copacabana, Girardota", 4],
];

// codigo, nombre, nombre_en, tipo, pide_vuelo, antes_nacional, antes_internacional, orden
const DESTINOS = [
  ["JMC", "Aeropuerto José María Córdova (Rionegro)", "José María Córdova Airport (MDE)", "aeropuerto", true, 90, 150, 1],
  ["EOH", "Aeropuerto Olaya Herrera", "Olaya Herrera Airport (EOH)", "aeropuerto", true, 60, 60, 2],
  ["TSUR", "Terminal del Sur", "South Bus Terminal", "terminal", false, 30, 30, 3],
  ["TNORTE", "Terminal del Norte", "North Bus Terminal", "terminal", false, 30, 30, 4],
];

// Pago al conductor en sedán (supuestos iniciales del tarifario) y minutos de trayecto por zona.
const TARIFAS = {
  JMC: { A: [120000, 60], B: [120000, 60], C: [140000, 75], D: [130000, 75] },
  EOH: { A: [45000, 20], B: [40000, 20], C: [50000, 30], D: [60000, 40] },
  TSUR: { A: [45000, 20], B: [40000, 20], C: [45000, 25], D: [60000, 40] },
  TNORTE: { A: [55000, 30], B: [40000, 20], C: [65000, 40], D: [40000, 20] },
};

export async function iniciarBase() {
  await q(ESQUEMA);
  for (const [clave, valor] of Object.entries(AJUSTES_INICIALES)) {
    await q("insert into ajustes (clave, valor) values ($1, $2) on conflict (clave) do nothing", [clave, JSON.stringify(valor)]);
  }
  const { n } = await uno("select count(*)::int n from zonas");
  if (n === 0) {
    for (const z of ZONAS) await q("insert into zonas (codigo, nombre, barrios, orden) values ($1,$2,$3,$4)", z);
    for (const d of DESTINOS) {
      const { id } = await uno(
        "insert into destinos (codigo, nombre, nombre_en, tipo, pide_vuelo, antes_nacional, antes_internacional, orden) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        d
      );
      for (const [zona, [pago, minutos]] of Object.entries(TARIFAS[d[0]])) {
        await q("insert into tarifas (zona, destino_id, pago_sedan, minutos) values ($1,$2,$3,$4)", [zona, id, pago, minutos]);
      }
    }
    console.log("[base] Zonas, destinos y tarifas iniciales cargados.");
  }
  if (config.semillaDemo) await semillaDemo();
}

export async function ajustes() {
  const rows = await filas("select clave, valor from ajustes");
  const out = { ...AJUSTES_INICIALES };
  for (const r of rows) out[r.clave] = r.valor;
  return out;
}

export async function guardarAjuste(clave, valor) {
  await q("insert into ajustes (clave, valor) values ($1,$2) on conflict (clave) do update set valor = excluded.valor", [
    clave,
    JSON.stringify(valor),
  ]);
}

export async function registrarEvento(reservaId, tipo, detalle = "", alerta = false) {
  await q("insert into eventos (reserva_id, tipo, detalle, alerta) values ($1,$2,$3,$4)", [reservaId, tipo, detalle, alerta]);
}

// ---------- Datos de ejemplo para probar (solo si la base no tiene anfitriones) ----------

async function semillaDemo() {
  const { n } = await uno("select count(*)::int n from anfitriones");
  if (n > 0) return;
  const pin = hashPin("1234");
  const emp = await uno("insert into empresas (nombre, nit, contacto, telefono) values ('Transportes Especiales Demo', '900000000-1', 'Carlos Demo', '573000000100') returning id");
  const conductores = [
    ["Juan Pérez", "573000000101", "sedan", "ABC123", "Chevrolet Onix gris"],
    ["Luis Gómez", "573000000102", "sedan", "DEF456", "Kia Picanto blanco"],
    ["Andrés Ruiz", "573000000103", "camioneta", "GHI789", "Toyota Fortuner negra"],
    ["Mario Ríos", "573000000104", "van", "JKL012", "Mercedes Sprinter blanca"],
  ];
  for (const c of conductores) {
    await q("insert into conductores (empresa_id, nombre, telefono, vehiculo, placa, descripcion, pin) values ($1,$2,$3,$4,$5,$6,$7)", [emp.id, ...c, pin]);
  }
  const a1 = await uno("insert into anfitriones (nombre, telefono, correo, pin) values ('Apartamentos Demo Laureles', '573000000201', 'demo@ejemplo.com', $1) returning id", [pin]);
  const a2 = await uno("insert into anfitriones (nombre, telefono, correo, pin) values ('Administradora Demo Poblado', '573000000202', 'admin@ejemplo.com', $1) returning id", [pin]);
  await q("insert into propiedades (anfitrion_id, codigo, nombre, direccion, zona) values ($1,'DEMO1','Loft Laureles 302','Cra. 76 #33-40, Laureles, Medellín','A')", [a1.id]);
  await q("insert into propiedades (anfitrion_id, codigo, nombre, direccion, zona) values ($1,'DEMO2','Apto Estadio 1101','Cl. 48 #73-15, Estadio, Medellín','A')", [a1.id]);
  await q("insert into propiedades (anfitrion_id, codigo, nombre, direccion, zona) values ($1,'DEMO3','Torre Provenza 805','Cra. 35 #8A-20, El Poblado, Medellín','A')", [a2.id]);

  // Algunos viajes para ver el tablero con datos.
  const aj = await ajustes();
  const jmc = await uno("select id from destinos where codigo='JMC'");
  const ahora = Date.now();
  const h = (horas) => new Date(Math.round((ahora + horas * 3600000) / 900000) * 900000);
  const ejemplos = [
    { nombre: "Emily Johnson", tel: "15551230001", idioma: "en", sentido: "desde_destino", vuelo: "AA1123", tipo: "internacional", recogida: h(30), pax: 2, mal: 2, veh: "sedan", estado: "pagada", prop: "DEMO1" },
    { nombre: "Lucas Martin", tel: "33612340002", idioma: "en", sentido: "al_destino", vuelo: "AV010", tipo: "internacional", recogida: h(5), pax: 5, mal: 5, veh: "camioneta", estado: "asignada", cond: "573000000103", prop: "DEMO3" },
    { nombre: "Valentina Ríos", tel: "573001110003", idioma: "es", sentido: "al_destino", vuelo: "LA4041", tipo: "nacional", recogida: h(-50), pax: 1, mal: 1, veh: "sedan", estado: "terminada", cond: "573000000101", prop: "DEMO2" },
    { nombre: "Sophie Müller", tel: "4915112340004", idioma: "en", sentido: "desde_destino", vuelo: "IB6585", tipo: "internacional", recogida: h(-26), pax: 9, mal: 10, veh: "van", estado: "terminada", cond: "573000000104", prop: "DEMO3" },
  ];
  let i = 0;
  for (const e of ejemplos) {
    i++;
    const prop = await uno("select p.*, a.id anf from propiedades p join anfitriones a on a.id=p.anfitrion_id where codigo=$1", [e.prop]);
    const t = await uno("select pago_sedan from tarifas where zona=$1 and destino_id=$2", [prop.zona, jmc.id]);
    const c = calcular({ pagoSedan: t.pago_sedan, vehiculo: e.veh, aj, pctAnfitrion: 0.05 });
    const cond = e.cond ? await uno("select id from conductores where telefono=$1", [e.cond]) : null;
    const pasado = e.estado === "terminada";
    await q(
      `insert into reservas (codigo, propiedad_id, anfitrion_id, sentido, destino_id, vuelo, tipo_vuelo, hora_vuelo, recogida, pasajeros, maletas, vehiculo,
        nombre, telefono, idioma, direccion, precio, pago_conductor, comision_anfitrion, pasarela, neto, estado, pagado_en, conductor_id,
        asignada_en, terminado_en, aviso_huesped_en, pago_metodo, creado)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now(),$23,$24,$25,$26,'demo', now() - interval '2 days')`,
      [
        `DEMO-${i}`, prop.id, prop.anf, e.sentido, jmc.id, e.vuelo, e.tipo, e.recogida, e.recogida, e.pax, e.mal, e.veh,
        e.nombre, e.tel, e.idioma, prop.direccion, c.precio, c.pago, c.comision, c.pasarela, c.neto, e.estado, cond?.id || null,
        cond ? new Date(ahora - 86400000) : null, pasado ? new Date(e.recogida.getTime() + 3600000) : null, pasado ? e.recogida : null,
      ]
    );
  }
  // Algunas visitas al QR para ver la conversión.
  await q("insert into visitas (propiedad_id, creado) select p.id, now() - (random() * interval '20 days') from propiedades p, generate_series(1, 25)");
  console.log("[base] Datos de ejemplo cargados (PIN de prueba 1234).");
}
