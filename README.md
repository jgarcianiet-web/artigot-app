# Artigot Personal

Aplicación web para que RRHH gestione de forma rápida el personal de **bodas y eventos**: camareros, maîtres y mozos (descarga).

## Qué hace

**Para RRHH** (`/admin`, con contraseña)

- **Panel**: próximos 30 días con la cobertura de cada evento y aviso de los que en 7 días aún no tienen el personal completo.
- **Personal**: fichas con puesto, teléfono, valoración (1–5), zona y notas. Días no disponibles (sueltos o por rangos) e historial de servicios.
- **Eventos**: fecha, hora de servicio, **hora de descarga para los mozos**, lugar, notas para el personal y cuántos camareros, maîtres y mozos hacen falta. Se pueden duplicar (útil para eventos que se repiten).
- **Convocatoria**:
  - La app lista solo a quien está libre ese día (activo, sin día bloqueado y sin otro evento esa fecha), ordenado por valoración y, a igualdad, por quien menos ha trabajado en los últimos 30 días.
  - **Autocompletar** convoca en un clic a los mejores candidatos hasta cubrir los huecos.
  - Botón de **WhatsApp** por persona con el mensaje ya escrito y su enlace personal. Si alguien confirma por teléfono, RRHH puede marcarlo a mano.
  - Lista del equipo confirmado, lista para copiar y pasar al maître.
- **Fichaje y horas**: entrada y salida por persona (se admiten turnos que pasan de medianoche) y horas manuales, que tienen prioridad.
- **Liquidación**: horas e importe por trabajador en un rango de fechas, aplicando la tarifa y el mínimo de horas de cada puesto. Exportación a Excel (CSV) en resumen o detalle.
- **Tarifas**: € por hora y mínimo de horas por servicio para cada puesto.

**Para el trabajador** (`/p/<enlace-personal>`, desde el móvil y sin contraseña)

- Acepta o rechaza convocatorias.
- Ficha entrada y salida el día del evento.
- Marca en un calendario los días que no puede trabajar.
- Consulta sus próximos servicios (con el lugar en Google Maps) y las horas de los últimos.

## Puesta en marcha

Requisitos: Node.js 20 o superior.

```bash
npm install
cp .env.example .env   # y edita ADMIN_PASSWORD, SESSION_SECRET y APP_URL
npm run setup          # crea la base de datos, tarifas por defecto y datos de ejemplo
npm run dev            # http://localhost:3000
```

Para no cargar los datos de ejemplo: `npx prisma db push && npx tsx prisma/seed.ts --no-demo`.

### Producción

```bash
npm run build
npm start
```

- `APP_URL` debe ser la dirección pública (p. ej. `https://personal.artigot.es`): es la que aparece en los enlaces que se envían por WhatsApp.
- Por defecto usa SQLite (`prisma/dev.db`), suficiente para un servidor propio o un VPS; haz copia de seguridad de ese archivo. Para desplegar en Vercel u otro entorno sin disco persistente, cambia `provider = "postgresql"` en `prisma/schema.prisma` y apunta `DATABASE_URL` a una base de datos PostgreSQL.
- Usa siempre HTTPS: el enlace personal de cada trabajador funciona como su llave de acceso. Si se filtra, genera uno nuevo desde su ficha.

## Tecnología

Next.js 16 (App Router, Server Actions), React 19, Prisma 6, SQLite y Tailwind CSS 4.

```
prisma/schema.prisma      Modelo de datos (Worker, Unavailability, Event, Assignment, Rate)
src/lib/domain.ts         Puestos, fechas, cálculo de horas e importes, mensajes de WhatsApp
src/lib/staffing.ts       Candidatos disponibles, huecos y cobertura
src/lib/payroll.ts        Liquidación
src/app/actions.ts        Acciones de RRHH
src/app/admin/            Pantallas de RRHH
src/app/p/[token]/        Portal del trabajador
```
