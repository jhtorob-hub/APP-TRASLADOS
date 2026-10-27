# App de traslados — guía de mantenimiento

Este repo es la app de traslados para huéspedes de Airbnb en Medellín (proyecto "APP TRANSPORTE AIRBNB" en claude.ai). El dueño es José. Se mantiene desde Claude.

## Antes de cualquier cosa

1. Leer `docs/aprendizajes.md`: decisiones vigentes del negocio (tarifas, reparto, reglas de servicio). Lo que José decide manda.
2. Cada decisión nueva de José o error encontrado: agregar una línea con fecha a `docs/aprendizajes.md` en el mismo commit.
3. Hablarle a José en español, directo y con números concretos.

## Dónde vive cada cosa

| Qué | Archivo |
|---|---|
| Cálculo de precios y reparto | `src/precios.js` (valores por defecto en `AJUSTES_INICIALES`; los reales están en la tabla `ajustes`, se editan en Tablero → Tarifas) |
| Tarifas iniciales por zona y destino | `src/db.js` (`TARIFAS`, solo se cargan si la base está vacía) |
| Reglas de tiempo (ofertas 24 h, aviso 12 h, recordatorio 2 h 30, alertas) | `src/programador.js` |
| Comandos de WhatsApp del conductor | `src/bot-conductor.js` (`comandoDe`) |
| Textos de WhatsApp | `src/textos.js` |
| Pantallas | `public/js/*.js` (una por rol) |

Un mismo dato puede vivir en varios lugares: las reglas de servicio también aparecen en textos para el huésped (`public/js/huesped.js`, `src/textos.js`). Cambiarlas en todos.

## Flujo para cualquier cambio

1. Editar.
2. Probar: `node pruebas/unidades.mjs` y, con la app corriendo contra un Postgres local, `URL=http://localhost:3100 node pruebas/flujo.mjs`.
3. Commit en español, claro y corto. Push a `main` (Railway redespliega solo).
4. Confirmar `commit` en `GET /health`.

## Cuidados

- Nunca guardar llaves, `CLAVE_ADMIN` ni secretos en el repo; viven en Railway.
- `MODO_PRUEBA=on` permite entrar sin PIN: apagarlo antes de dar la app a usuarios reales.
- Sin Evolution configurado, los mensajes NO se envían: quedan en la tabla `mensajes` (Tablero → Mensajes WhatsApp).
