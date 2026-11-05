export const apiBaseUrl = (
  import.meta.env.VITE_API_URL ?? "http://localhost:6201/api"
).replace(/\/+$/u, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const errorMessages: Record<string, string> = {
  BAD_REQUEST: "Проверьте введённые данные и состояние заказа. Возможно, действие уже недоступно.",
  UNAUTHENTICATED: "Сеанс завершён. Войдите в аккаунт и попробуйте снова.",
  INVALID_CREDENTIALS: "Текущий пароль указан неверно.",
  FORBIDDEN: "У вас нет прав на это действие.",
  NOT_FOUND: "Запись не найдена или уже была изменена. Обновите страницу.",
  METHOD_NOT_ALLOWED: "Это действие сейчас недоступно.",
  CONFLICT: "Данные уже изменились или конфликтуют с существующими. Обновите страницу.",
  PAYLOAD_TOO_LARGE: "Файл слишком большой. Максимальный размер — 1 МБ.",
  UNSUPPORTED_MEDIA_TYPE: "Формат отправленных данных не поддерживается.",
  VALIDATION_FAILED: "Некоторые данные заполнены неверно. Проверьте форму.",
  TOO_MANY_REQUESTS: "Слишком много запросов. Подождите немного и попробуйте снова.",
  SERVICE_UNAVAILABLE: "Сервис временно недоступен. Попробуйте позже.",
  INTERNAL_SERVER_ERROR: "Не удалось выполнить запрос из-за ошибки сервера. Попробуйте позже.",
  REQUEST_FAILED: "Не удалось выполнить запрос. Попробуйте снова.",
  NETWORK_ERROR: "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "The server could not be reached.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new ApiError(
      getErrorMessage(body, response.statusText || `HTTP ${response.status}`),
      response.status,
      getErrorCode(body, response.status),
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function downloadApiFile(path: string, filename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError("The server could not be reached.", 0, "NETWORK_ERROR");
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new ApiError(
      getErrorMessage(body, response.statusText || `HTTP ${response.status}`),
      response.status,
      getErrorCode(body, response.status),
    );
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null || !("message" in body)) return fallback;
  const message = body.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(", ");
  }
  return fallback;
}

function getErrorCode(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "code" in body &&
      typeof body.code === "string") {
    return body.code;
  }
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHENTICATED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 405: return "METHOD_NOT_ALLOWED";
    case 409: return "CONFLICT";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 415: return "UNSUPPORTED_MEDIA_TYPE";
    case 422: return "VALIDATION_FAILED";
    case 429: return "TOO_MANY_REQUESTS";
    case 503: return "SERVICE_UNAVAILABLE";
    default: return status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
  }
}

export function getUserFacingError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return errorMessages.NETWORK_ERROR;

  if (typeof error === "object" && error !== null) {
    if ("code" in error && typeof error.code === "string" && error.code in errorMessages) {
      return errorMessages[error.code];
    }
    if ("status" in error && typeof error.status === "number") {
      return errorMessages[getErrorCode(undefined, error.status)] ?? fallback;
    }
  }

  return fallback;
}
