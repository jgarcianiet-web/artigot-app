# Artigot Personal

Aplicación para que RRHH gestione de forma rápida el personal de **bodas y eventos**: camareros, maîtres y mozos (descarga). Cada evento tiene su propio **chat en tiempo real** con avisos en el móvil.

| Quién | Dónde |
|---|---|
| RRHH | Web desde el ordenador: `https://<tu-app>/login` |
| Camareros, maîtres y mozos | App Android (APK), app iPhone (TestFlight) o web app instalada en el móvil: `https://<tu-app>/entrar` |

## Qué hace

**RRHH**
- **Panel**: eventos de los próximos 30 días con su cobertura y aviso de los que en 7 días aún no tienen el personal completo.
- **Personal**: fichas con puesto, teléfono, valoración, zona, días no disponibles e historial. En cada ficha aparece su **código de acceso** a la app y en qué dispositivos tiene los avisos activos.
- **Eventos y convocatoria**: número de camareros, maîtres y mozos necesarios y hora de descarga de los mozos. **Autocompletar** convoca en un clic a los mejores candidatos libres ese día. Cada convocado **recibe un aviso en el móvil** y acepta o rechaza desde la app.
- **Chat del evento**: lo ven RRHH y el personal **confirmado** en ese evento. Quien rechaza o es cancelado deja de verlo. Los mensajes llegan al momento y quien no tiene la app abierta recibe una notificación push. El menú **Chats** reúne todos los chats, con los no leídos primero.
- **Calendario**: vista mensual con los eventos coloreados por cobertura (verde completo, ámbar faltan respuestas, rojo faltan personas), el personal libre de cada día y alta de un evento pulsando el día.
- **Importar desde Excel**: sube vuestra lista (.xlsx o CSV). Reconoce las columnas aunque se llamen distinto («Móvil», «Categoría», «Apellidos»…) y entiende «camarera», «metre» o «mozo de descarga». Muestra una vista previa con errores y duplicados antes de guardar. Se puede volver a importar sin duplicar a nadie (se identifica por teléfono). Hay plantilla descargable y **exportación de los códigos de acceso** a Excel para repartirlos.
- **Fichaje con geolocalización** (ver reglas abajo), liquidación y tarifas: horas por persona (admite turnos que pasan de medianoche) e importes con el mínimo de horas por puesto. Exportación a Excel.

**Gestión de RRHH**
- **Varios usuarios de RRHH**, todos con acceso completo. Cada uno entra con su email y su contraseña (cifrada con scrypt; bloqueo tras 5 intentos) y aparece con su nombre en el chat. Se gestionan en Ajustes → Usuarios. Desactivar a alguien o cambiarle la contraseña cierra sus sesiones al momento.
- **Fincas guardadas**: dirección, punto de fichaje, contacto e **indicaciones de acceso**, que el personal ve en la app («Cómo llegar»). **Clientes guardados** con contacto y notas.
- **Plantillas de evento**: «Guardar como plantilla» en cualquier evento, y «Empezar desde una plantilla» al crear otro. Copian el personal, el horario, la finca y las notas.
- **Informes** por periodo: eventos, servicios, horas, coste, % de aceptación, tiempo medio de respuesta, coste por mes, desglose por evento y por trabajador (valoración media, rechazos, retiradas, retrasos, ausencias) e incidencias por tipo. Se exportan a Excel.

**Personal: documentación, turnos, nómina y material**
- **Mis datos**: DNI/NIE, Seguridad Social, IBAN, nacimiento, dirección y email. Los completa el trabajador desde su app o RRHH desde la ficha. El DNI/NIE y el IBAN se validan con su dígito de control.
- **Documentos**: DNI, tarjeta de la Seguridad Social, carnet de manipulador, cuenta bancaria, contrato… en foto o PDF y con fecha de caducidad. RRHH los revisa. **Aviso 30 días antes de caducar y el día que caducan**, al trabajador y a RRHH, y resumen en el panel. Solo los ven RRHH y el propio trabajador.
- **Cambio de turno**: quien no puede ir propone a un compañero libre y capacitado para ese puesto, el compañero acepta desde su app y **RRHH lo aprueba con un clic**. El compañero queda confirmado y quien cedió el turno no recibe penalización.
- **Nómina en la app**: servicios, horas e importe bruto estimado de cada mes, con el detalle por evento.
- **Uniforme y material**: el uniforme de cada puesto (Ajustes → Uniforme) más «Qué llevar» de cada evento forman una lista con casillas en la app. RRHH registra el **material prestado** (chaquetas, sacacorchos…) y su devolución, y el trabajador ve lo que tiene.

**Selección, contratos y nóminas**
- **Trabaja con nosotros**: formulario público (`/trabaja-con-nosotros`, enlazado desde la pantalla de acceso) con puestos, experiencia, disponibilidad y CV, y consentimiento RGPD. Tiene protección contra bots y un límite de envíos por IP. RRHH recibe un aviso y gestiona las candidaturas en «Candidatos» (nuevo, contactado, entrevista, descartado) con notas. **Dar de alta** crea al trabajador con su código de acceso, o lo enlaza si ese teléfono ya existía.
- **Documento de condiciones del servicio**: en cada evento, «Enviar a firmar» genera un documento por confirmado con sus datos (DNI, NSS, puesto, horario, tarifa) y le avisa. El trabajador lo lee y **firma con el dedo** en la app. Se guarda la firma, la fecha, la hora y la IP, y se genera un **PDF** que pueden descargar él y RRHH. El texto se edita en Ajustes → Empresa y contratos. ⚠️ El texto por defecto es orientativo: debe revisarlo vuestra asesoría laboral.
- **Datos para el alta en la Seguridad Social**: Excel por evento con DNI, NSS, nacimiento, dirección, puesto y horario de cada confirmado, marcando lo que falta.
- **Exportación a A3**: en Liquidación, «Exportar a A3» (Excel o CSV con `;`). Genera una línea por trabajador y puesto con código de empresa, código de trabajador, NIF, concepto, unidades (horas), precio, importe y periodo. Los códigos se configuran en Ajustes → Nóminas A3, que además lista al personal sin código de A3.

**Personal (app)**
- Entra una sola vez con su **teléfono y el código de 6 cifras** que le da RRHH.
- Acepta o rechaza convocatorias, ficha entrada y salida y marca los días que no puede trabajar.
- Chat de cada evento confirmado, con avisos de mensajes, convocatorias, cambios de hora o lugar y cancelaciones.

**Puestos: camarero, camarero responsable, maître y mozo**

- El **camarero responsable** va a los eventos pequeños y cumple la función del maître. Cada evento indica cuántos necesita de cada puesto.
- Cada trabajador tiene un **puesto principal** y los **puestos que también puede hacer** (en su ficha). El puesto en cada evento se decide al convocar: un mismo camarero puede ir como responsable en un evento y como maître en otro.

**Valoraciones y selección automática**

- El **maître o camarero responsable** confirmado de cada evento valora a su equipo (camareros y mozos) desde el móvil, de 1 a 5 en cuatro criterios: puntualidad, imagen y uniforme, calidad del servicio, y actitud y equipo. Puede marcar «No se presentó» y dejar un comentario para RRHH. Solo lo ve RRHH.
- Puede valorar desde la hora de servicio hasta 7 días después. Al fichar la salida recibe un aviso, y RRHH puede enviarle un recordatorio desde el evento. **Si se retrasa más de un día, no puede aceptar nuevas convocatorias** hasta completarlas.
- Con esas valoraciones, cada trabajador tiene una **puntuación de 0 a 100** (`src/lib/scoring.ts`):

| Componente | Cálculo |
|---|---|
| Calidad | Media de las valoraciones; las recientes pesan más (una valoración pierde la mitad de su peso cada 180 días). Las estrellas que RRHH pone en la ficha cuentan como 2 valoraciones de partida. |
| Fiabilidad (12 meses) | −25 por cada ausencia, −8 por retirarse después de confirmar y −4 por fichar más de 10 min tarde. |
| Rotación | −2 por cada servicio de los últimos 30 días, para repartir el trabajo entre quienes están igualados. |

- En cada evento, **⚡ Selección automática** convoca a los mejor puntuados que estén libres ese día. Cubre primero maître y responsable, y nunca convoca a la misma persona para dos puestos.
- **Reposición automática** (activada por defecto en cada evento): si alguien rechaza, se retira o RRHH marca que «No puede», se convoca solo al siguiente mejor puntuado del mismo puesto y RRHH recibe un aviso con el nombre del sustituto, o de que no queda nadie libre. A quien rechazó no se le vuelve a convocar a ese evento. En la lista de candidatos, al pasar el ratón por la puntuación se ve su desglose. La ficha de cada trabajador muestra su puntuación, la media por criterio y todas sus valoraciones.

**El día del evento**

- **Recordatorios automáticos** (se comprueban cada 5 minutos y ninguno se envía dos veces):

| Cuándo | A quién |
|---|---|
| 12 h sin responder a una convocatoria | Al trabajador |
| 24 h sin responder | A RRHH |
| El día anterior, desde las 17:00 | Al equipo confirmado: «Mañana: evento, citación y lugar» |
| 10 min después de la citación sin haber fichado | Al trabajador, al maître o responsable y a RRHH |
| La mañana siguiente (10:00), si faltan valoraciones | Al maître o responsable |
| 30 días antes de que caduque un documento y el día que caduca | Al trabajador y a RRHH |

  Los tiempos están en `REMINDERS` (`src/lib/reminders.ts`). Con `REMINDERS=off` se desactivan.
- **Panel en directo** para el maître o camarero responsable (en la app) y para RRHH (botón «🔴 En directo» del evento). Muestra quién trabaja, quién no ha fichado (en rojo, con botón para llamar) y quién ha salido, y se actualiza cada 30 s. El responsable puede **marcar la llegada** de alguien que no puede fichar, por ejemplo si se ha quedado sin batería; queda como fichaje manual con su nombre.
- **Incidencias** (roturas, quejas, accidentes, personal) con hasta 5 fotos y la persona implicada. Las registra el responsable desde el móvil o RRHH. RRHH recibe un aviso, las ve en el evento y en el menú «Incidencias», y las marca como resueltas.
- **Chat con fotos y ubicación**: botones 📷 y 📍. Las fotos se reducen en el móvil antes de enviarse y solo las ven RRHH y el personal confirmado del evento. Las fotos de incidencias solo las ven RRHH y el responsable.

**Reglas del fichaje**

| Regla | Detalle |
|---|---|
| Distancia | A **200 m como máximo** del punto del evento, que RRHH fija en el mapa al crearlo: buscando la dirección, pegando un enlace de Google Maps o con «Estoy aquí». Configurable con `CLOCK_RADIUS_M`. |
| Horario | Desde **30 min antes de la citación** del puesto (para los mozos, la hora de descarga) hasta **30 min después de la hora de fin** del evento. Los eventos que pasan de medianoche y los cambios de hora se calculan bien. |
| Precisión | Si el GPS da una precisión peor de ±200 m, pide repetir con mejor señal. |
| Quién decide | El **servidor**, con su propia hora: cambiar la hora del móvil no sirve. Se guardan la distancia y la precisión de cada fichaje, y RRHH las ve (📍 89 m). |
| Correcciones | RRHH puede corregir horas en la hoja del evento; quedan marcadas como **✎ manual**. |

Sin ubicación fijada, el evento muestra un aviso y el personal no puede fichar. Aviso: como cualquier sistema basado en GPS, un móvil manipulado con apps de «ubicación falsa» podría engañarlo. La distancia registrada y las correcciones manuales permiten revisar los casos dudosos.

**Avisos que se envían**

| Cuándo | A quién |
|---|---|
| Se convoca a alguien (a mano o con Autocompletar) | Al trabajador |
| Un trabajador acepta, rechaza o se da de baja de un evento | A RRHH |
| Mensaje en el chat | A todos los del chat, menos a quien lo escribe |
| Cambia la fecha, la hora, la descarga o el lugar de un evento | A convocados y confirmados |
| RRHH cancela a alguien o elimina el evento | A los afectados |

## Arquitectura

```
                 ┌──────────────────────── Railway ────────────────────────┐
 Ordenador RRHH ─┤  Next.js (web + API + chat en tiempo real por SSE)       │
 Web app móvil  ─┤          │                                               │
 App Android    ─┤          └── PostgreSQL                                  │
 App iPhone     ─┤                                                          │
                 └──────┬──────────────┬──────────────────┬────────────────┘
                   Web Push (VAPID)   Firebase (FCM)     Apple (APNs)
                   navegador/web app  app Android        app iPhone
```

- Las apps de Android e iOS (Capacitor) **cargan la web desplegada**, así que cualquier mejora llega a las apps sin publicar una versión nueva. Solo hace falta recompilarlas si cambia la parte nativa (icono, permisos, plugins).
- El tiempo real usa Server-Sent Events con un canal en memoria. Por eso el servicio debe tener **una sola instancia** (así está configurado `railway.json`).

---

## 1. Desplegar en Railway (≈ 15 min)

1. Sube este repositorio a GitHub (ya lo está si lees esto allí).
2. En [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** y elige el repositorio. Detecta el `Dockerfile` automáticamente.
3. En el mismo proyecto: **New → Database → PostgreSQL**.
4. En el servicio de la app, pestaña **Variables**, añade:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base de datos) |
   | `ADMIN_PASSWORD` | clave de instalación: solo sirve para crear el primer usuario de RRHH en `/login` |
   | `SESSION_SECRET` | una cadena aleatoria de 40+ caracteres |
   | `APP_URL` | la URL pública (paso 5), p. ej. `https://artigot-production.up.railway.app` |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | ejecuta `npm run vapid` en tu ordenador y copia las dos claves |
   | `VAPID_SUBJECT` | `mailto:` + un email de contacto de la empresa |

5. **Settings → Networking → Generate Domain** para obtener la URL pública, o conecta un dominio propio. Pon esa URL en `APP_URL`.
6. Al desplegar se aplican las migraciones solas y se crean las tarifas por defecto. Entra en `/login`: la primera vez pide la clave de instalación para crear tu usuario. Después da de alta al resto de RRHH en Ajustes → Usuarios, importa al personal y dales su teléfono y código (botón **Copiar instrucciones de acceso** en cada ficha o **Exportar códigos**).

Con esto ya funcionan la web de RRHH, la web app del personal y los **avisos en navegador y en la web app**. En iPhone, los avisos web exigen iOS 16.4 o superior y añadir la web a la pantalla de inicio.

## 2. App Android (APK)

**Compilar:** en GitHub → **Settings → Secrets and variables → Actions → Variables** crea `APP_URL` con la URL de Railway. Después, en **Actions → App Android (APK) → Run workflow**. En unos 10 minutos aparece el APK en **Releases** y en los artefactos de la ejecución. También se recompila solo cuando cambia la parte nativa en `main`.

**Avisos push en Android (Firebase, gratis):**
1. En [console.firebase.google.com](https://console.firebase.google.com) crea un proyecto y añade una app **Android** con el paquete `es.artigot.personal`.
2. Descarga `google-services.json` y guarda su contenido completo como secreto de GitHub `GOOGLE_SERVICES_JSON`.
3. En Firebase: **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Pega el JSON descargado en la variable `FCM_SERVICE_ACCOUNT` de Railway.
4. Vuelve a lanzar el workflow de Android.

**Firma (recomendado antes de repartir el APK):** sin keystore se genera un APK de depuración. Sirve para probar, pero cada instalación nueva con otra firma obliga a desinstalar la anterior. Para firmar siempre con la misma clave:
```bash
keytool -genkeypair -v -keystore artigot.keystore -alias artigot -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 artigot.keystore   # → secreto ANDROID_KEYSTORE_BASE64
```
Añade también `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`artigot`) y `ANDROID_KEY_PASSWORD`. **Guarda el keystore en un lugar seguro**: sin él no se pueden publicar actualizaciones.

**Repartir el APK:** si el repositorio es privado, las Releases solo las pueden descargar miembros del repositorio. Sube el APK a una carpeta compartida (Drive, etc.) y pon ese enlace en la variable `ANDROID_APK_URL` de Railway. Así aparecerá en las instrucciones de acceso que copia RRHH.

## 3. App iPhone (TestFlight, sin Mac)

La compila un Mac de GitHub Actions y la sube a TestFlight.

1. **App Store Connect → Apps → +** para crear la app con el bundle ID `es.artigot.personal`. Si no aparece, créalo antes en developer.apple.com → Identifiers, con la capacidad **Push Notifications** activada.
2. **App Store Connect → Usuarios y acceso → Integraciones → API de App Store Connect**: crea una clave con rol **Admin** y descarga el `.p8`.
3. Secretos de GitHub:

   | Secreto | Dónde se encuentra |
   |---|---|
   | `APPLE_TEAM_ID` | developer.apple.com → Membership |
   | `ASC_KEY_ID` | ID de la clave del paso 2 |
   | `ASC_ISSUER_ID` | «Issuer ID» en la misma pantalla |
   | `ASC_KEY_P8` | contenido completo del archivo `.p8` |

4. **Actions → App iOS (TestFlight) → Run workflow**. Tras la subida, Apple procesa la build (10-30 min) y aparece en TestFlight. Añade a los probadores en **TestFlight → Pruebas internas/externas**. Las externas requieren una revisión rápida de Apple la primera vez.

**Avisos push en iPhone (APNs):**
1. developer.apple.com → **Keys → +** → marca **Apple Push Notifications service (APNs)** y descarga el `.p8`.
2. Variables en Railway: `APNS_KEY` (contenido del `.p8`), `APNS_KEY_ID`, `APNS_TEAM_ID` y `APNS_BUNDLE_ID=es.artigot.personal`.

   Las builds de TestFlight usan el entorno de producción de APNs. Si alguna vez compilas desde Xcode en modo depuración, añade `APNS_SANDBOX=1`.

## Desarrollo local

Requisitos: Node.js 20+ y PostgreSQL.

```bash
npm install
cp .env.example .env     # rellena DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET, APP_URL y las claves VAPID (npm run vapid)
npm run setup            # migraciones + tarifas + datos de ejemplo
npm run dev              # http://localhost:3000
```

Para abrir las apps nativas en Android Studio o Xcode apuntando a tu servidor: `CAP_SERVER_URL=http://<ip-de-tu-ordenador>:3000 npm run cap:android` (o `cap:ios`, en un Mac).

## Seguridad

- **RRHH** entra con una contraseña compartida y su nombre, que aparece en el chat como «Marta (RRHH)». Cada intento fallido se retrasa para frenar ataques.
- **Personal:** teléfono + código de 6 cifras. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. **Generar código nuevo** en la ficha cierra la sesión en todos sus dispositivos. Dar de baja a alguien le quita el acceso y los avisos.
- El chat de un evento solo lo pueden leer y escribir RRHH y los confirmados de ese evento; se comprueba en el servidor en cada petición.
- Usa siempre HTTPS (Railway lo da por defecto).

## Tecnología

Next.js 16 (App Router, Server Actions, SSE), React 19, Prisma 6 + PostgreSQL, Tailwind CSS 4, Capacitor 8 y web-push.

```
prisma/schema.prisma            Modelo de datos
src/lib/auth.ts                 Sesiones de RRHH y del personal, acceso con teléfono + código
src/lib/chat.ts, bus.ts         Chat: permisos, mensajes, no leídos y canal en tiempo real
src/lib/push.ts                 Envío de avisos: Web Push, FCM (Android) y APNs (iOS)
src/app/api/chat/…              Stream SSE, envío y lectura de mensajes
src/app/admin/                  Pantallas de RRHH
src/app/app/                    App del personal
src/components/Chat.tsx         Chat (web y apps)
src/components/PushSetup.tsx    Activación de avisos en navegador y apps nativas
android/, ios/                  Proyectos nativos (Capacitor)
.github/workflows/              Compilación del APK y subida a TestFlight
Dockerfile, railway.json        Despliegue
```
