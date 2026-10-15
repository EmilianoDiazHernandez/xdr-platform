# XDR Platform — Frontend (TT 2026-B139)

Interfaz web de la plataforma XDR. Adapta las vistas a los tres roles del reporte TT1:
Analista de Seguridad, Administrador de Sistemas y Directivo / Auditor.

Stack: React 19 + TypeScript 5.8 + Vite 7 + Tailwind 3 + shadcn/ui + lucide-react + recharts.

## Requisitos

- Node.js 20.19+ o 22.12+ (requisito de Vite 7) y npm.
- Servicios del backend en ejecución (solo para datos reales):

| Puerto | Servicio | Uso en el frontend |
|---|---|---|
| 8000 | api-ml | Alertas, timeline de incidentes, `/health` |
| 8001 | api-reports | Generación de reporte PDF |
| 8002 | api-topology | Topología, eventos correlacionados, `/health` |

## Instalación y ejecución

```bash
cd frontend
npm install
cp .env.example .env    # ajustar si los servicios no están en localhost
npm run dev             # http://localhost:1420
```

Otros comandos:

```bash
npx tsc --noEmit   # verificación de tipos
npm run build      # build de producción en dist/
npm run preview    # sirve el build localmente
```

> **Nota:** si el frontend también corre en un contenedor de Docker (puerto 3000), ese contenedor sirve
> la copia del código incluida al construir la imagen. Para ver cambios recientes use `npm run dev`
> (puerto 1420) o reconstruya el contenedor.

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | api-ml |
| `VITE_REPORT_BASE_URL` | `http://localhost:8001/api/v1` | api-reports |
| `VITE_TOPOLOGY_BASE_URL` | `http://localhost:8002/api/v1` | api-topology |
| `VITE_AUTH_MODE` | `mock` | `mock`: autenticación, usuarios, logs, anomalías y resumen ejecutivo simulados en el navegador (**solo desarrollo**). `api`: usa los endpoints reales del backend |

## Usuarios demo (modo `mock`)

Contraseña de todos: `Demo1234!`

| Correo | Rol | Estado |
|---|---|---|
| `analista_01@xdr.local` | Analista de Seguridad | Activo |
| `admin_sistema@xdr.local` | Administrador de Sistemas | Activo |
| `auditor_externo@xdr.local` | Directivo / Auditor | Activo |
| `inactivo@xdr.local` | Analista de Seguridad | **Inactivo** (prueba de RN10) |

También se acepta solo el nombre de usuario (p. ej. `analista_01`). Los datos mock viven en memoria:
los cambios hechos en *Usuarios* se pierden al recargar la página.

## Roles y vistas

La matriz de acceso única está en `src/auth/permissions.ts`. Ocultar vistas en el frontend es solo UX;
el control real es el HTTP 403 del backend (RN06, RN07, RN12).

| Rol (`Role`) | Vista de aterrizaje | Vistas disponibles |
|---|---|---|
| `security_analyst` — Analista de Seguridad | Inicio | Inicio, Topología, Alertas, Anomalías, Reportes PDF |
| `sys_admin` — Administrador de Sistemas | Estado de servicios | Usuarios, Estado de servicios, Logs del sistema |
| `auditor` — Directivo / Auditor | Resumen ejecutivo | Resumen ejecutivo, Reportes |

La sesión se guarda en `sessionStorage` (`xdr.session`) y expira a las 8 horas como máximo (RN11).

## Estructura

```
src/
  api/        cliente HTTP único (client.ts) y adaptadores por dominio (config, admin, executive)
  auth/       AuthContext, authService (mock/api), permissions.ts, roles.ts
  components/ componentes compartidos (Sidebar, Header, StatusPanel, ...) y ui/ de shadcn
  lib/        helpers de formato, CSV y descargas
  mocks/      datos de demostración (SOLO DESARROLLO)
  pages/      vistas del analista; admin/ y executive/ para los otros roles
  types/      tipos de dominio (auth, admin, executive, anomaly)
```
