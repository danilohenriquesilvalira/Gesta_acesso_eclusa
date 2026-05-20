// ── Typed API helpers — always attach Bearer token when provided ───────────────

type JsonResult<T = Record<string, unknown>> = T & { ok?: boolean; erro?: string };

function authHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function apiGet<T = Record<string, unknown>>(
  url: string,
  token?: string,
): Promise<JsonResult<T>> {
  const r = await fetch(url, { headers: authHeaders(token) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<JsonResult<T>>;
}

export async function apiPost<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  token?: string,
): Promise<JsonResult<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return r.json() as Promise<JsonResult<T>>;
}

export async function apiDelete<T = Record<string, unknown>>(
  url: string,
  token?: string,
): Promise<JsonResult<T>> {
  const r = await fetch(url, { method: "DELETE", headers: authHeaders(token) });
  return r.json() as Promise<JsonResult<T>>;
}
