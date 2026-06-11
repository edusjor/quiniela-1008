# Quiniela 1008 (API + Web) — Node + TypeScript + Prisma + Postgres

Este proyecto es una base **multi-quiniela** enfocada en Mundial 2026, con:
- Registro/Login (JWT)
- Registro reforzado: cedula unica, nombre completo, fecha de nacimiento, foto de factura y confirmacion de Instagram
- Calendario Mundial 2026 publico
- Quinielas privadas para usuarios registrados
- Crear quiniela (solo SUPERADMIN) y unirse por codigo
- Pronosticos por liga
- Carga de resultados (solo OWNER de quiniela)
- Calculo de puntos y ranking por liga
- Pagina de premios del ranking final

## Requisitos
- Node.js 18+ (recomendado 20)
- Docker (para Postgres) — (vos ya lo tenés)
- npm 9+

## 1) Base de datos
Este proyecto está configurado para usar Neon vía `DATABASE_URL` desde `apps/api/.env`.

## 2) Variables de entorno

### API
Creá manualmente el archivo `apps/api/.env` con tus variables privadas.
Incluye como mínimo: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `WEB_URL`, `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`.

### WEB
Creá manualmente el archivo `apps/web/.env.local` con la configuración de entorno del frontend.

## 3) Instalar dependencias
En la raíz del proyecto:

```bash
npm install
```

## 4) Crear DB + migraciones
```bash
npm run prisma:migrate
npm run prisma:generate
```

## 5) Sembrar datos de ejemplo (torneo, equipos, partidos y un SUPERADMIN)
```bash
npm run db:seed
```

Esto crea:
- SUPERADMIN de prueba
- Un torneo demo con equipos y partidos.

## 6) Correr en desarrollo
En dos terminales o usando el script combinado:

API:
```bash
npm run dev:api
```

WEB:
```bash
npm run dev:web
```

O ambos:
```bash
npm run dev
```

- API: http://localhost:17643
- WEB: http://localhost:18931

## 6.1) Recuperar contrasena
La app incluye flujo de recuperacion por email:
- Solicitar enlace: `POST /auth/password/forgot` (envia correo si la cuenta existe)
- Restablecer contrasena: `POST /auth/password/reset`

Pantallas web:
- `/forgot-password`
- `/reset-password?token=...`

## 7) Correr con Docker (VPS)

Esta opcion levanta **API + Web** con un solo comando (la DB corre en Neon).

### Variables importantes
- `JWT_SECRET` se debe definir solo por entorno.
- Variables SMTP y `WEB_URL` se leen desde `apps/api/.env` en Docker.
- Para recuperacion de contrasena en produccion, `WEB_URL` debe apuntar a tu URL publica (no `localhost`).

Si no existe `apps/api/.env`, crealo antes de levantar Docker.

### Levantar servicios
```bash
docker compose up -d --build
```

### Ver logs
```bash
docker compose logs -f api web
```

### URLs por defecto
- Web: http://TU_IP_O_DOMINIO:19631
- API health (vía web): http://TU_IP_O_DOMINIO:19631/backend/health

Notas:
- El contenedor `api` ejecuta `prisma migrate deploy` al iniciar, para aplicar migraciones pendientes.
- Si actualizas codigo, vuelve a construir con `docker compose up -d --build`.

## 8) Si ves errores de DB en Partidos/Admin

Si el error menciona una columna faltante (por ejemplo `groupName`), significa que faltan migraciones en la base de datos.

En local puedes ejecutarlo asi:
```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

## Notas rápidas
- Para cargar resultados: usa un usuario con rol SUPERADMIN y la pantalla "Admin" en la web.
- El cierre de pronóstico se respeta con `lockAt`. Si la hora pasó, no deja guardar.
- En Admin, cada quiniela tiene su propio catalogo de equipos.
- Al crear un equipo en quiniela, la foto es obligatoria (URL o subida de archivo desde el navegador).
- Las fotos ya usadas pueden reutilizarse desde la biblioteca de imagenes dentro de Admin.
- La seccion Finalistas fue retirada del flujo principal.
- Premios: 1er lugar $500 en efectivo; 2do al 5to lugar certificados de consumo.

---
Si querés, luego se puede:
- Agregar ligas públicas y buscador
- Notificaciones
- Roles por liga (OWNER/ADMIN) con gestión desde el front



## Docker

cd /home/quiniela-1008/htdocs/quiniela.1008.com/app
git pull
docker compose down --remove-orphans
docker compose up -d --build --force-recreate



cd /home/diez08-quiniela/htdocs/quiniela.diez08.com/quiniela-1008
git pull
docker compose down --remove-orphans
docker compose build --no-cache --pull
docker compose up -d --force-recreate --remove-orphans
docker image prune -f
docker builder prune -f

docker compose logs -f api web

sudo nginx -t
sudo systemctl reload nginx



