// Cliente HTTP único del frontend. Toda petición al backend pasa por aquí.
// No depende de React: AuthContext registra el getter del token y el callback de 401.

export const DEFAULT_TIMEOUT_MS = 10_000;
export const REPORT_TIMEOUT_MS  = 20_000;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => void;

let getToken: TokenGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

export function registerTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

export function registerUnauthorizedHandler(fn: UnauthorizedHandler): void {
  onUnauthorized = fn;
}

async function doRequest(baseUrl: string, path: string, init: ApiRequestInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal, ...rest } = init;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Respeta también la señal de cancelación del llamador, si la hay
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const finalHeaders = new Headers(headers);
  const token = getToken();
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...rest, headers: finalHeaders, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError(0, "Tiempo de espera agotado al contactar el servidor.");
    }
    throw new ApiError(0, "No se pudo conectar con el servidor.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError(401, "Sesión no válida o expirada.");
  }
  if (response.status === 403) {
    throw new ApiError(403, "No tienes permisos para esta acción.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, `Error del servidor (${response.status}).`);
  }
  return response;
}

export async function apiRequest<T>(baseUrl: string, path: string, init?: ApiRequestInit): Promise<T> {
  const response = await doRequest(baseUrl, path, init);
  return (await response.json()) as T;
}

export async function apiBlob(baseUrl: string, path: string, init?: ApiRequestInit): Promise<Blob> {
  const response = await doRequest(baseUrl, path, init);
  return response.blob();
}
