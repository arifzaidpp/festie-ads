"use client";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** JSON fetch for the admin UI; never throws. */
export async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: json.error ?? `Request failed (${response.status})` };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Network error." };
  }
}
