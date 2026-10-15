# TASKS_CLAUDE_CODE.md — Plataforma XDR (TT 2026-B139)

> Archivo de instrucciones para Claude Code. Léelo completo antes de tocar código.
> **Alcance de estas sesiones: SOLO `frontend/`.** Objetivo: adaptar el front a los 3 roles definidos en el reporte TT1 (Analista de Seguridad, Administrador de Sistemas, Directivo/Auditor).
> Idioma: UI y comentarios en español. Commits en Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`).

---

## 0. Protocolo de trabajo (obligatorio)

1. **No escanees el repo.** No ejecutes `find`, `tree`, `grep -r` ni leas carpetas completas. Lee únicamente los archivos listados en la tarea activa (sección "Leer").
2. **Una tarea por sesión** (o por bloque de commits). Al terminar una tarea: `cd frontend && npx tsc --noEmit && npm run build`. Si falla, corrige antes de seguir.
3. **No instales dependencias** salvo que la tarea lo indique. Hoy no se requiere ninguna nueva (sin react-router, sin zustand, sin axios).
4. **No ejecutes `docker compose`** ni levantes servicios. No hay backend de auth todavía; se trabaja con el modo mock (ver T2).
5. Si una tarea exige un cambio fuera de `frontend/`, **detente y repórtalo** en lugar de hacerlo.
6. Al cerrar cada tarea, marca su checkbox en este archivo y agrega una línea en la sección 7 (Bitácora).

---

## 1. Contexto mínimo (no lo re-descubras)

### Stack frontend
React 19 + TypeScript ~5.8 + Vite 7 + Tailwind 3 + shadcn/ui (`radix-nova`) + lucide-react + recharts. Fuentes: Syne / JetBrains Mono. Alias `@/` → `frontend/src`.

### Estructura relevante
```
frontend/src/
  App.tsx                 # navegación por estado (paginaActiva: string) + TITULOS + Placeholder + StatusBar
  main.tsx
  index.css               # variables CSS del tema (--bg, --bg2, --bg3, --bg4, --border, --txt, --txt2, --txt3, --accent, --red, --amber, --green, ...)
  api/config.ts           # URLs base + fetch* sueltos (sin auth)
  types/index.ts          # Alerta, NivelSeveridad, TopologyNode/Edge, CorrelatedEvent, AttackFlowStep, IncidentTimeline...
  components/
    Sidebar.tsx Header.tsx KPICards.tsx AlertList.tsx AlertChart.tsx StatusPanel.tsx
    ReportButton.tsx NetworkGraph.tsx CyberKillChainTimeline.jsx   # ← único .jsx
    ui/ (badge, button, card, separator)  # generados por shadcn
  pages/  Home.tsx Topology.tsx Alerts.tsx
  mocks/alertas.ts
```

### Servicios backend existentes (NO modificar, solo consumir)
| Puerto | Servicio | Endpoints usados por el front |
|---|---|---|
| 8000 | api-ml | `GET /api/v1/alertas`, `GET /api/v1/eventos-correlacionados/{uuid}/timeline`, `GET /health` |
| 8001 | api-reports | `POST /api/v1/reports/generate?n_alertas=50` → PDF |
| 8002 | api-topology | `GET /api/v1/topology`, `GET /api/v1/topology/events`, `GET /api/v1/topology/node_alerts/{id}`, `GET /health` |

**No existe** todavía: endpoint de login, middleware JWT, CRUD de usuarios, logs, resumen ejecutivo ni listado de reportes. `auth-db` está comentado en `docker-compose.yml`.

### Roles (fuente de verdad: `database/auth-db/init-scripts/01_auth_schema.sql`)
| Rol canónico (TS y BD) | Alias en el reporte TT1 | Vista de aterrizaje |
|---|---|---|
| `security_analyst` | `analista_seguridad` | `inicio` |
| `sys_admin` | `admin_sistemas` | `admin-servicios` |
| `auditor` | `directivo` | `ejecutivo` |

Contrato de auth del reporte (Apéndice A, OpenAPI): `POST /api/v1/auth/login` con `{ email, password }` → `{ access_token, token_type, role }`. Seguridad `bearerAuth` (JWT). Expiración máx. 8 h (RNF19/RN11).

---

## 2. Reglas de arquitectura (no romper)

### 2.1 Cliente-servidor
- El front **solo** habla con el backend vía HTTP a través de `src/api/` (nunca `fetch` directo en componentes o páginas).
- Toda petición pasa por un único cliente (`src/api/client.ts`, ver T1) que inyecta `Authorization: Bearer <token>` y centraliza errores.
- **El ocultamiento por rol en el front es UX, no seguridad.** El control real es el HTTP 403 del backend (RN06, RN07, RN12). Nunca escribas lógica que asuma que ocultar un botón protege datos.
- Las URLs base salen de `import.meta.env` (`VITE_API_BASE_URL`, `VITE_REPORT_BASE_URL`, `VITE_TOPOLOGY_BASE_URL`) con fallback a los `localhost` actuales. No dupliques URLs.

### 2.2 Tipado
- **Cero `any`** (incluido `as any` y `: any` en callbacks). Usa uniones discriminadas o `unknown` + type guards.
- Todo archivo nuevo es `.ts` / `.tsx`. No se crean `.js` / `.jsx`.
- Los tipos de dominio viven en `src/types/` (un archivo por dominio si crece: `auth.ts`, `admin.ts`, `executive.ts`; reexportar desde `types/index.ts`).
- Respuestas de API se tipan en la función de `src/api/*` que las consume; los componentes reciben datos ya tipados.
- `NivelSeveridad` debe incluir `"Crítica"` (el backend ya la emite vía `DecisionEngine`).
- No actives ni desactives flags de `tsconfig.json` en estas sesiones.

### 2.3 Estado, navegación y RBAC
- Se mantiene la **navegación por estado** de `App.tsx` (no introducir router). `paginaActiva` pasa a ser del tipo `PageId` (unión literal).
- Sesión global con **un** `AuthContext` (`src/auth/AuthContext.tsx`) + hook `useAuth()`. No pasar el usuario por props entre más de un nivel.
- Matriz de acceso **única** en `src/auth/permissions.ts`. Sidebar, guardas de página y botones consultan esa matriz; nunca hardcodear `if (role === ...)` dentro de componentes.
- El token se guarda en `sessionStorage` (no `localStorage`), con su `exp`. Nunca guardar la contraseña. Nunca imprimir el token en consola.

### 2.4 UI
- Respetar el lenguaje visual existente: estilos inline con variables CSS (`var(--bg3)`, `var(--border)`, `var(--txt2)`...), radios 8–10 px, tipografía 9–14 px, iconos `lucide-react`.
- Reutilizar `components/ui/*` de shadcn; **no editar** esos archivos.
- Mensajes de UI: usar literalmente los del reporte TT1 cuando existan (p. ej. "Credenciales incorrectas.", "Cuenta desactivada. Contacte al administrador.", "Sesión cerrada correctamente.", "Sin reportes generados.", "La fecha de inicio no puede ser posterior a la fecha de fin.").
- Responsivo: no romper el Sidebar móvil/colapsable existente.

### 2.5 Zonas prohibidas (no leer ni editar)
`backend/`, `database/`, `collector/`, `emulation/`, `frontend/src-tauri/`, `frontend/.git/`, `backend/models_data/`, `*.pkl`, `*.bat`, `docker-compose*.yml`, `frontend/src/components/ui/`.
Excepción: puedes **leer** (no editar) `database/auth-db/init-scripts/01_auth_schema.sql` si necesitas confirmar nombres de roles.

### 2.6 Secretos
No copies, muevas ni repliques credenciales o API keys que veas en el repo. Si una tarea te lleva a un archivo con secretos, no los incluyas en código, logs, commits ni en tu respuesta.

---

## 3. Matriz de acceso (implementar tal cual en `permissions.ts`)

| PageId | Etiqueta Sidebar | security_analyst | sys_admin | auditor | CU / RF |
|---|---|:-:|:-:|:-:|---|
| `inicio` | Inicio | ✅ | — | — | CU-02 / RF10, RF11, RF16 |
| `topologia` | Topología | ✅ | — | — | CU-03, CU-09 |
| `alertas` | Alertas | ✅ | — | — | CU-04, CU-05, CU-06, CU-12 |
| `eventos` | Eventos | ✅ | — | — | (placeholder actual) |
| `anomalias` | Anomalías | ✅ | — | — | CU-10 (placeholder hasta tener API) |
| `reportes` | Reportes PDF | ✅ | — | — | CU-08 |
| `admin-usuarios` | Usuarios | — | ✅ | — | CU-15 / RF36 |
| `admin-servicios` | Estado de servicios | — | ✅ | — | CU-16 / RF37 |
| `admin-logs` | Logs del sistema | — | ✅ | — | CU-17 / RF38 |
| `ejecutivo` | Resumen ejecutivo | — | — | ✅ | CU-21, CU-22 / RF39, RF40 |
| `reportes-generados` | Reportes | — | — | ✅ | CU-20 |

`configuracion` se elimina del menú (ningún CU lo respalda).
Secciones del Sidebar por rol: Analista → General / Detección / Reportes; Admin → Administración; Auditor → Ejecutivo.

---

## 4. Tareas priorizadas

> Orden estricto: T1 → T2 → T3 son bloqueantes. T4–T6 pueden ir en cualquier orden después de T3.

### [x] T1 — Fundaciones: tipos + cliente HTTP (P0)
**Leer:** `src/types/index.ts`, `src/api/config.ts`, `src/components/ReportButton.tsx`.
**Crear:**
- `src/types/auth.ts`: `Role = "security_analyst" | "sys_admin" | "auditor"`; `SessionUser { id: string; nombre: string; correo: string; role: Role }`; `Session { token: string; exp: number; user: SessionUser }`; `PageId` (unión de la matriz §3).
- `src/api/client.ts`: `apiRequest<T>(baseUrl, path, init?): Promise<T>` y `apiBlob(baseUrl, path, init?): Promise<Blob>`.
  - Inyecta Bearer si hay sesión (lee de un getter registrado por AuthContext, sin importar React aquí).
  - Errores tipados: `class ApiError extends Error { status: number }`. `401` → dispara callback `onUnauthorized` registrado (logout). `403` → lanza `ApiError` con mensaje "No tienes permisos para esta acción.".
  - Timeout con `AbortController` (10 s; el reporte PDF 20 s).
**Modificar:**
- `src/types/index.ts`: `NivelSeveridad` incluye `"Crítica"`; reexporta `./auth`.
- `src/api/config.ts`: URLs desde `import.meta.env` con fallback; reescribir `fetchAlertas`, `fetchIncidentTimeline`, `fetchHealth`, `fetchTopology`, `fetchEvents`, `fetchNodeAlerts` usando `apiRequest` con tipos de retorno explícitos (no `Promise<any>`).
- `src/components/ReportButton.tsx`: usar `apiBlob`. Nombre de descarga `ALERTAS-YYYYMMDD-HHmm.pdf` (RF15).
- Crear `frontend/.env.example` con las 3 `VITE_*_BASE_URL` y `VITE_AUTH_MODE=mock`.
**Aceptación:** `tsc` y `build` limpios; ninguna página hace `fetch` directo; comportamiento visual idéntico al actual.

### [x] T2 — Autenticación (login, sesión, logout, expiración) (P0)
**Leer:** `src/App.tsx`, `src/main.tsx`, `src/components/Header.tsx`, archivos creados en T1.
**Crear:**
- `src/auth/authService.ts` con interfaz `AuthAdapter { login(email, password): Promise<Session>; logout(token): Promise<void> }` y dos implementaciones seleccionadas por `import.meta.env.VITE_AUTH_MODE`:
  - `mock` (default): usuarios `analista_01@xdr.local`, `admin_sistema@xdr.local`, `auditor_externo@xdr.local`, contraseña `Demo1234!`; un 4.º usuario `inactivo@xdr.local` con `activo=false` para probar RN10. Token = string opaco + `exp = now + 8h`. Marcar el archivo con comentario `// SOLO DESARROLLO`.
  - `api`: `POST {API_BASE}/auth/login` según contrato OpenAPI; decodificar `exp` del JWT (base64url del payload, sin librerías); `logout` llama a `POST /auth/logout` si existe y siempre limpia la sesión local.
- `src/auth/AuthContext.tsx`: `AuthProvider` + `useAuth()` → `{ session, login, logout, isAuthenticated }`. Persiste en `sessionStorage` (`xdr.session`). Al montar, descarta sesiones con `exp` vencido. Programa `setTimeout` para cerrar sesión al expirar (RN11). Registra `getToken` y `onUnauthorized` en `client.ts`.
- `src/pages/Login.tsx`: formulario correo/usuario + contraseña, botón deshabilitado mientras carga, mensajes exactos del CU-01/14/19. Para cuenta inactiva mostrar mensaje genérico de acceso denegado **sin revelar si existe** (RN10). Mismo estilo oscuro del dashboard.
**Modificar:**
- `src/main.tsx`: envolver `<App />` con `<AuthProvider>`.
- `src/App.tsx`: si `!isAuthenticated` → renderiza `<Login />`; si no, el layout actual.
- `src/components/Header.tsx`: mostrar nombre + rol legible y botón "Cerrar sesión" (icono `LogOut`). Tras logout mostrar "Sesión cerrada correctamente." en el Login.
**Aceptación:** login/logout funcionan en modo mock con los 3 roles; recargar la página conserva la sesión; sesión vencida regresa a Login; usuario inactivo no entra.

### [x] T3 — RBAC en navegación y layout (P0)
**Leer:** `src/App.tsx`, `src/components/Sidebar.tsx`, `src/auth/*`.
**Crear:** `src/auth/permissions.ts` con:
- `ACCESS: Record<PageId, readonly Role[]>` (§3), `canAccess(role, page): boolean`, `defaultPageFor(role): PageId`, `MENU_BY_ROLE: Record<Role, MenuSection[]>` (secciones, ids, etiquetas, iconos lucide).
- `src/pages/Forbidden.tsx`: vista "Acceso denegado (403)" con botón para volver a la página por defecto del rol.
**Modificar:**
- `App.tsx`: `paginaActiva: PageId`, inicializado con `defaultPageFor(session.user.role)`; `TITULOS: Record<PageId, string>`; `renderPagina()` verifica `canAccess` antes de renderizar (si no, `<Forbidden />`). Mantener `eventoSeleccionado` y `handleNavegar(pagina: PageId, param?)`.
- `Sidebar.tsx`: recibir el menú desde `MENU_BY_ROLE[role]` (vía `useAuth`), quitar el `MENU` hardcodeado. Mostrar el rol bajo el logo. Conservar colapsado/móvil.
- `StatusBar` en `App.tsx`: solo visible para `security_analyst` y `sys_admin` (el auditor no ve datos técnicos, RN07).
**Aceptación:** cada rol ve solo su menú y aterriza en su vista; forzar `paginaActiva` a una página ajena muestra `Forbidden`; `Home`, `Topology`, `Alerts` siguen funcionando igual para el analista.

### [x] T4 — Vistas del Analista de Seguridad (P1)
**Leer:** `src/pages/Alerts.tsx`, `src/pages/Home.tsx`, `src/components/AlertList.tsx`, `src/components/CyberKillChainTimeline.jsx`.
1. **Tipado de `Alerts.tsx`:** eliminar `(step: any)`; definir `type PasoTimeline = TimelineItem | AttackFlowStep` con type guard para campos alternos (`descripcion|description`, `vector|layer`, `ip_destino|dest_ip`).
2. **Migrar** `CyberKillChainTimeline.jsx` → `.tsx` con props tipadas (`KillChainStep[]`, mismo shape que `KillChainStepResponse` del backend: `id_alerta, timestamp, vector, severidad, mitre_tactic, mitre_technique_id, descripcion`). Borrar el `.jsx`.
3. **Filtros de alertas (CU-06):** en `Alerts.tsx`, barra de filtros por severidad, IP origen (texto) y rango de fechas; filtrado client-side sobre lo ya cargado; contador de resultados; mensaje "No se encontraron alertas con los criterios seleccionados.". Los filtros persisten al navegar (guardar en estado de `App` o en `sessionStorage` con clave `xdr.filtros.alertas`, envuelto en try/catch).
4. **Exportar CSV (CU-12):** botón en `Alerts.tsx` que genera CSV en el cliente con columnas `ID, IP origen, IP destino, protocolo, timestamp, severidad, descripción` sobre las alertas filtradas (campos ausentes → vacío). Si no hay filtradas: "Sin alertas para exportar con los filtros actuales." Escapar comillas/comas correctamente; BOM UTF-8 para Excel.
5. **Página `reportes`:** `src/pages/Reports.tsx` que contiene `ReportButton` + texto del CU-08. Quitar el placeholder.
6. **Página `anomalias`:** `src/pages/Anomalies.tsx` con UI completa de CU-10 (lista + detalle + selector "Amenaza confirmada / Falso positivo" + justificación obligatoria que deshabilita el botón si está vacía, RN09) alimentada por `src/mocks/anomalias.ts`. Banner visible: "Datos de demostración — pendiente endpoint de backend".
7. **Bug menor:** `AlertList.tsx` usa `a.timestamp.split(" ")[1]`, que falla con timestamps ISO (`T`). Normalizar con un helper `formatHora(ts: string)` en `src/lib/format.ts`.
**Aceptación:** `grep -rn "any" src/pages src/components --include=*.tsx` no devuelve tipos `any`; no quedan `.jsx`; CSV abre correctamente en Excel con acentos.

### [x] T5 — Vistas del Administrador de Sistemas (P1)
**Leer:** `src/components/StatusPanel.tsx`, `src/api/config.ts`, `src/auth/permissions.ts`.
Crear `src/api/admin.ts` con interfaz `AdminApi` y adaptador mock/api (mismo patrón que T2, `VITE_AUTH_MODE`). Tipos en `src/types/admin.ts`.
1. **`admin-usuarios` (CU-15 / RF36)** → `src/pages/admin/Users.tsx`: tabla (nombre, correo, rol, estado, creado_en); crear/editar en modal (shadcn `card` + inputs nativos estilizados); "Desactivar" en lugar de borrar (no existe borrado físico). Validaciones: correo con formato válido y no duplicado ("El correo ya está registrado."), contraseña ≥ 8 caracteres en creación, rol obligatorio. Mensajes exactos del CU-15. Contrato API objetivo: `GET/POST /admin/users`, `PATCH /admin/users/{id}`.
2. **`admin-servicios` (CU-16 / RF37)** → `src/pages/admin/Services.tsx`: reutiliza `StatusPanel`. Fuentes reales hoy: `GET :8000/health` (capas red/endpoint/email + redis), `GET :8002/health`; reporte `:8001` se marca "desconocido" si no responde. Timeout 2 s por servicio, en paralelo (`Promise.allSettled`). Botón "Actualizar".
3. **`admin-logs` (CU-17 / RF38)** → `src/pages/admin/Logs.tsx`: tabla timestamp/componente/nivel/mensaje, filtros por componente (BD, API, servidor web) y nivel (INFO, WARNING, ERROR), orden descendente, solo lectura. Datos mock + banner de demostración. Contrato objetivo: `GET /logs?level=`.
**Aceptación:** el admin no puede ver ninguna vista de alertas/topología/reportes; un usuario desactivado en el mock de Users no puede iniciar sesión en el mock de auth (ambos mocks comparten el mismo almacén en memoria: `src/mocks/usuarios.ts`).

### [x] T6 — Vistas del Directivo / Auditor (P1)
**Leer:** `src/components/KPICards.tsx`, `src/components/AlertChart.tsx`, `src/types/index.ts`.
Crear `src/api/executive.ts` (adaptador mock/api) y `src/types/executive.ts`:
```ts
interface ResumenEjecutivo {
  periodo: { inicio: string; fin: string };
  totalesPorSeveridad: Record<NivelSeveridad, number>;
  tendenciaPct: number;                       // vs periodo anterior
  topTiposAtaque: { tipo: string; total: number }[]; // máx. 3
}
interface ReporteGenerado { nombre: string; fecha: string; url: string }
```
1. **`ejecutivo` (CU-21 + CU-22)** → `src/pages/executive/ExecutiveSummary.tsx`: tarjetas por severidad, tendencia con flecha y %, top 3 tipos de ataque (barras recharts), selector de rango de fechas con validación ("La fecha de inicio no puede ser posterior a la fecha de fin." sin ejecutar consulta). **Prohibido** mostrar IPs, puertos, IDs de alerta o descripciones técnicas (RN07, RN12).
2. **`reportes-generados` (CU-20)** → `src/pages/executive/GeneratedReports.tsx`: lista ordenada por fecha desc, botón descargar (vía `apiBlob`), "Sin reportes generados." si vacío. Contrato objetivo: `GET /reports` + `GET /reports/{nombre}`.
**Regla crítica:** el modo mock de `executive.ts` devuelve agregados ya calculados desde `src/mocks/ejecutivo.ts`. **Nunca** obtener el resumen llamando a `fetchAlertas()` y agregando en el cliente: eso enviaría datos individuales al navegador del auditor y viola RN12.
**Aceptación:** inspeccionando la pestaña Network con rol auditor no hay ninguna petición a `/alertas`, `/topology*` ni `/eventos-correlacionados*`.

### [ ] T7 — Limpieza de la migración Tauri → Web (P2)
**Leer:** `frontend/index.html`, `frontend/package.json`, `frontend/README.md`.
- `index.html`: `lang="es"`, `<title>XDR Platform — TT 2026-B139</title>`.
- `README.md` del frontend: reemplazar texto de plantilla Tauri por: requisitos, `npm install`, `npm run dev`, variables `.env`, usuarios demo del modo mock, tabla de roles.
- **No** borrar `src-tauri/` ni dependencias `@tauri-apps/*` en esta tarea; solo listar en la bitácora qué se podría retirar y esperar confirmación del equipo.
**Aceptación:** build limpio; nada de Tauri cambia de comportamiento.

---

## 5. Pendientes que NO son de Claude Code en estas sesiones (dependen de backend / equipo)

Documentar aquí; no implementar salvo instrucción explícita:
- Servicio de auth en backend: `POST /auth/login`, `POST /auth/logout` (lista negra de tokens o `jti` en Redis), dependencia FastAPI que valide JWT y rol, bcrypt costo ≥ 12 (RNF20), 403 por rol en `/alertas`, `/topology*`, `/reports*` (RN06, RN07, RN12).
- Esquema de usuarios: la tabla actual `users` no tiene `nombre`, `correo` ni `activo` que exige el reporte (actores ACT-SEG-001/SIS-002/DIR-003 y RN10). Requiere migración.
- Habilitar `auth-db` (está comentado en `docker-compose.yml`) o mover `users`/`audit_logs` a TimescaleDB.
- Endpoints: `/admin/users`, `/admin/services/health`, `/logs`, resumen ejecutivo agregado, listado/descarga de reportes, anomalías no supervisadas + clasificación (CU-10), cambio de estado de alerta con bitácora inmutable (CU-11, RN08, RN09).
- Retirar credenciales y API keys hardcodeadas del repo (moverlas a `.env` no versionado y rotarlas).

---

## 6. Definition of Done (por tarea)

- [ ] `npx tsc --noEmit` sin errores y `npm run build` exitoso en `frontend/`.
- [ ] Sin `any`, sin `.jsx` nuevos, sin `fetch` fuera de `src/api/`.
- [ ] Ningún archivo de zonas prohibidas (§2.5) modificado (`git diff --stat` lo confirma).
- [ ] Probado manualmente en modo mock con los 3 usuarios demo (el que aplique).
- [ ] Checkbox marcado + entrada en bitácora.
- [ ] Commit atómico con mensaje convencional, p. ej. `feat(auth): login y sesión con expiración de 8h`.

---

## 7. Bitácora de sesiones

<!-- Formato: YYYY-MM-DD · Tarea · Resumen en 1 línea · Pendientes/bloqueos -->
2026-10-14 · T1 · types/auth.ts, api/client.ts (Bearer, 401/403, timeout 10s/20s), config.ts con env + tipos, ReportButton con apiBlob y nombre RF15, .env.example, vite-env.d.ts tipado · Topology.tsx espera un array del timeline pero el tipo IncidentTimeline es objeto (posible bug previo; revisar en T4). Commit b081bbc.
2026-10-14 · T2 · authService (mock/api), AuthContext (sessionStorage xdr.session, expiración 8h, registro en client.ts), Login, logout en Header, mocks/usuarios.ts compartido para T5; probado manualmente con los 3 roles + inactivo · Validar con el equipo: mensaje genérico para cuenta inactiva (RN10) vs. literal del CU, texto de sesión expirada. Commit 926759e.
2026-10-14 · T3 · permissions.ts (ACCESS, canAccess, defaultPageFor, MENU_BY_ROLE, canSeeTechnicalStatus), Forbidden 403, Sidebar por rol con rol bajo el logo, App con PageId y guarda canAccess, StatusBar oculto al auditor; onNavegar tipado con PageId en Home/AlertList; probado manualmente con los 3 roles · Vistas pendientes (Placeholder) hasta T4–T6. Commit 43e1eba.
2026-10-15 · T4 · PasoTimeline tipado en Alerts, CyberKillChainTimeline .jsx→.tsx, filtros CU-06 persistentes (xdr.filtros.alertas), exportar CSV CU-12 (BOM, escapado, anti-fórmulas), páginas Reports y Anomalies (mock CU-10), formatHora en lib/format.ts; fetchNodeAlerts tipado como NodeAlert[] y fetchKillChain normaliza ambas formas del timeline (corrige bug anotado en T1) · PENDIENTE probar con datos reales la Kill Chain de Topología y el acordeón de incidentes en Alertas: /topology/events devolvía [] al probar. Pendiente: texto literal CU-08 en Reports.tsx; selector PDF/CSV de ReportButton siempre descarga PDF; IP destino/protocolo vacíos en CSV hasta que el backend los envíe. Commit 411dd9d.
2026-10-15 · T5 · api/admin.ts (AdminApi mock/api + verificarServicios con allSettled y timeout 2s), types/admin.ts, páginas admin/Users (CU-15, modal con Card shadcn, desactivar/activar, sin auto-desactivación ni cambio de rol propio), admin/Services (CU-16, estado "Desconocido" en StatusPanel), admin/Logs (CU-17, mock), DemoBanner compartido; mock de usuarios compartido con auth (desactivar bloquea login); probado manualmente con admin_sistema en npm run dev (:1420) · El contenedor Docker del front (:3000) sirve una copia del código de la imagen: reconstruirlo para ver cambios. Validar textos de CU-15 distintos de "El correo ya está registrado.". Commit 9405278.
2026-10-15 · T6 · types/executive.ts, mocks/ejecutivo.ts (solo agregados diarios), api/executive.ts (mock/api; tendencia vs periodo anterior), ExecutiveSummary (CU-21/22: severidad, tendencia, top 3 en barras, validación de rango sin consultar) y GeneratedReports (CU-20, descarga vía apiBlob); MODO_MOCK movido a api/config.ts · Verificación estática: ninguna referencia a /alertas, /topology* ni /eventos-correlacionados* en las vistas del auditor; falta confirmar la pestaña Network en el navegador. Endpoint GET /executive/summary?inicio=&fin= es propuesta, no está en el contrato OpenAPI. Tipos de ataque del mock son de ejemplo.
