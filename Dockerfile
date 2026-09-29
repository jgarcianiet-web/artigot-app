# Imagen de producción (Railway o cualquier servidor con Docker)
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
# Aplica las migraciones pendientes y arranca
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
