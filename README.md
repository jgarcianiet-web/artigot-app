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
- **Fichaje, liquidación y tarifas**: horas por persona (admite turnos que pasan de medianoche) e importes con el mínimo de horas por puesto. Exportación a Excel.

**Personal (app)**
- Entra una sola vez con su **teléfono y el código de 6 cifras** que le da RRHH.
- Acepta o rechaza convocatorias, ficha entrada y salida y marca los días que no puede trabajar.
- Chat de cada evento confirmado, con avisos de mensajes, convocatorias, cambios de hora o lugar y cancelaciones.

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
   | `ADMIN_PASSWORD` | la contraseña de RRHH (larga) |
   | `SESSION_SECRET` | una cadena aleatoria de 40+ caracteres |
   | `APP_URL` | la URL pública (paso 5), p. ej. `https://artigot-production.up.railway.app` |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | ejecuta `npm run vapid` en tu ordenador y copia las dos claves |
   | `VAPID_SUBJECT` | `mailto:` + un email de contacto de la empresa |

5. **Settings → Networking → Generate Domain** para obtener la URL pública, o conecta un dominio propio. Pon esa URL en `APP_URL`.
6. Al desplegar se aplican las migraciones solas y se crean las tarifas por defecto. Entra en `/login`, da de alta al personal y dales su teléfono y código (botón **Copiar instrucciones de acceso** en cada ficha).

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
