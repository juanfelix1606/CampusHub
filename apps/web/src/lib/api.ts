import type { AuthResponse } from "../features/auth/auth.types";

const API_BASE_URL = "/api/v1";
let accessToken: string | null = null;
let refreshRequest: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function requestRefresh(): Promise<string | null> {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as AuthResponse;
        accessToken = payload.data.accessToken;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function refreshAccessToken(): Promise<string | null> {
  return requestRefresh();
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retryAfterRefresh = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retryAfterRefresh && !path.startsWith("/auth/")) {
    const refreshedToken = await requestRefresh();
    if (refreshedToken) return apiRequest<T>(path, init, false);
    accessToken = null;
    window.dispatchEvent(new Event("campushub:session-expired"));
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(payload) ?? `Request failed with status ${response.status}.`);
  }
  return payload as T;
}

export async function downloadFile(path: string, suggestedName: string): Promise<void> {
  const send = () =>
    fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

  let response = await send();
  if (response.status === 401) {
    const refreshedToken = await requestRefresh();
    if (refreshedToken) {
      response = await send();
    } else {
      accessToken = null;
      window.dispatchEvent(new Event("campushub:session-expired"));
    }
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(getErrorMessage(payload) ?? `Request failed with status ${response.status}.`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  const encodedName = disposition?.match(/filename="([^"]+)"/)?.[1];
  const filename = encodedName ? decodeURIComponent(encodedName) : suggestedName;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function getErrorMessage(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return undefined;
  const error = payload.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}
