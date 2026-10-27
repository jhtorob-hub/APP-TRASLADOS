# App de traslados (Llegá)

Traslados privados programados para huéspedes de Airbnb en Medellín. Una sola app con 4 pantallas:

| Pantalla | Ruta | Quién |
|---|---|---|
| Reserva (lo que abre el QR) | `/r/<código del alojamiento>` | Huésped, sin cuenta, en español o inglés |
| Estado de la reserva | `/reserva/<código>?t=…` | Huésped (enlace que le llega por WhatsApp) |
| Panel del anfitrión | `/anfitrion` | Anfitrión (celular + PIN) |
| Pantalla del conductor | `/conductor` | Conductor (celular + PIN). También funciona solo por WhatsApp |
| Tablero de control | `/admin` | Administrador (clave) |

Con `MODO_PRUEBA=on` aparece una barra negra arriba para saltar entre las 4 pantallas con un clic, sin PIN.

## Cómo funciona un viaje

1. El huésped escanea el QR (o abre el enlace del mensaje de bienvenida), pone su vuelo, cuántos son y paga.
2. Le llega la confirmación por WhatsApp (y correo si está configurado).
3. **24 h antes** el viaje se ofrece por WhatsApp a los conductores del tipo de vehículo. El primero que responde **1** se lo queda. Si en 30 min nadie, se ofrece también a vehículos más grandes.
4. **12 h antes** el huésped recibe nombre, placa, vehículo y WhatsApp del conductor.
5. **2 h 30 min antes** el conductor recibe un recordatorio y debe responder **OK**. Si a 1 h 30 min no ha confirmado → alerta al administrador.
6. El conductor avisa **VOY**, **LLEGUÉ**, **RECOGÍ**, **ENTREGUÉ** (por WhatsApp o con los botones de su pantalla). El huésped recibe avisos.
7. Al terminar, el huésped recibe la oferta del regreso con 10% de descuento y se le pide calificación 1–5.
8. Liquidaciones: conductores semanal, anfitriones mensual, desde el tablero.

Alertas al administrador (tablero + WhatsApp): viaje sin conductor 2 h después de ofrecido o a menos de 6 h, viaje nocturno sin conductor a las 6 p. m. del día anterior, conductor sin confirmar, reservas con menos de 12 h, mensajes de huéspedes y conductores, calificaciones bajas.

## Desplegar en Railway (igual que el bot de la lavandería)

1. En Railway: **New Project → Deploy from GitHub repo → `app-traslados`**. Usa el `Dockerfile`.
2. En el mismo proyecto: **+ New → Database → PostgreSQL**.
3. En el servicio de la app → **Variables**, como mínimo:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `URL_PUBLICA` = la dirección que te da Railway (Settings → Networking → Generate Domain)
   - `SECRETO_SESION` = una frase larga al azar
   - `CLAVE_ADMIN` = tu clave del tablero
   - `TELEFONO_ADMIN` = tu WhatsApp con 57
   - `MODO_PRUEBA` = `on` mientras pruebas
4. Abre `https://<tu-app>/admin`. Verifica `https://<tu-app>/health` (el campo `commit` es el último push).

Cada push a `main` redespliega solo.

### Conectar el pago real (Wompi)

1. Crea la cuenta de comercio en Wompi (necesita la empresa y la cuenta bancaria).
2. Wompi → Desarrolladores: copia llave pública, secreto de integridad y secreto de eventos a `WOMPI_LLAVE_PUBLICA`, `WOMPI_SECRETO_INTEGRIDAD`, `WOMPI_SECRETO_EVENTOS`. Empieza con las de prueba (`pub_test_…`).
3. En Wompi, URL de eventos: `https://<tu-app>/webhooks/wompi`.
4. Los reembolsos se hacen desde el panel de Wompi.

### Conectar WhatsApp (Evolution API)

1. Crea una instancia nueva en Evolution con un **número distinto al de la lavandería**.
2. Variables: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCIA`, `SECRETO_WEBHOOK_WHATSAPP`.
3. Webhook de la instancia: `https://<tu-app>/webhooks/whatsapp/<SECRETO_WEBHOOK_WHATSAPP>` con el evento `MESSAGES_UPSERT`.
4. Mientras no esté conectado, todos los mensajes quedan en **Tablero → Mensajes WhatsApp** y ahí mismo se puede simular lo que responde un conductor.

> Siguiente paso recomendado: pasar los mensajes a huéspedes a la API oficial de WhatsApp (Meta) con plantillas aprobadas, para evitar bloqueos del número. Los conductores pueden seguir por Evolution.

### Antes de abrir a usuarios reales

- `MODO_PRUEBA=off` y `SEMILLA_DEMO=off`.
- En el tablero: borrar/desactivar los datos de ejemplo, crear empresas, conductores (con PIN), anfitriones (con PIN) y alojamientos.
- Poner las tarifas reales negociadas en **Tarifas**.
- Fotos reales de la flota en **Tarifas → Fotos de los vehículos**.

## Desarrollo local

```bash
npm install
DATABASE_URL=postgres://... PORT=3100 URL_PUBLICA=http://localhost:3100 npm start
node pruebas/unidades.mjs          # precios, firma Wompi, comandos (sin servidor)
URL=http://localhost:3100 node pruebas/flujo.mjs   # viaje completo de punta a punta
```

## Estructura

```
src/
  index.js          servidor y rutas de las pantallas
  config.js         variables de entorno
  db.js             esquema Postgres, datos iniciales (zonas, destinos, tarifas) y de ejemplo
  precios.js        cálculo de precio y reparto (misma lógica del tarifario en Excel)
  reservas.js       crear, pagar, ofrecer, aceptar, avanzar, cancelar, cambiar hora
  programador.js    tareas cada minuto (ofertas, avisos 24/12/2 h, alertas)
  bot-conductor.js  mensajes que llegan por WhatsApp (comandos del conductor, huéspedes)
  whatsapp.js       envío por Evolution API + registro en la tabla mensajes
  textos.js         textos de WhatsApp (huésped es/en, conductor)
  wompi.js          checkout y webhook de Wompi
  rutas/            publico, anfitrion, conductor, admin, webhooks
public/
  index.html, estilos.css
  js/app.js         enrutador + barra de modo prueba + inicio de sesión
  js/huesped.js     reserva (QR)        js/reserva.js  estado de la reserva y pago simulado
  js/anfitrion.js   panel del anfitrión  js/conductor.js pantalla del conductor
  js/admin.js       tablero de control
```
