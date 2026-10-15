// Helpers de formato de fechas. Aceptan "YYYY-MM-DD HH:mm:ss" y también ISO 8601 ("YYYY-MM-DDTHH:mm:ss.sssZ").
// No convierten zona horaria: muestran la hora tal como la envía el backend.

// "2026-10-14T08:15:30.123Z" → "08:15:30"
export function formatHora(ts: string): string {
  const m = ts.match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  return m ? m[1] : ts;
}

// "2026-10-14T08:15:30.123Z" → "2026-10-14 08:15:30"
export function formatFechaHora(ts: string): string {
  return ts.replace("T", " ").split(".")[0].replace(/Z$/, "");
}

// "2026-10-14T08:15:30Z" → "2026-10-14" (comparable con el valor de <input type="date">)
export function fechaDe(ts: string): string {
  return ts.slice(0, 10);
}

// Fecha local en formato YYYY-MM-DD (valor de <input type="date">), desplazada `dias` días
export function fechaLocalIso(base: Date = new Date(), dias = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "2026-10-15" → "15/10/2026"
export function formatFechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

// Sufijo de nombre de archivo YYYYMMDD-HHmm (RF15)
export function sufijoArchivo(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}`;
}
