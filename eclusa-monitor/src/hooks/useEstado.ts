import { useState, useEffect, useCallback } from "react";
import type { Estado } from "../types";

// /estado e /eventos são públicos — não requerem token
export function useEstado(apiUrl: string) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [apiOk,  setApiOk]  = useState<boolean | null>(null);

  const fetchEstado = useCallback(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4_000); // desiste ao fim de 4s
    fetch(`${apiUrl}/estado`, { signal: ac.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<Estado>; })
      .then(d => { setEstado(d); setApiOk(true); })
      .catch(() => setApiOk(false))
      .finally(() => clearTimeout(timer));
  }, [apiUrl]);

  useEffect(() => {
    fetchEstado();

    const es = new EventSource(`${apiUrl}/eventos`);
    es.onmessage = e => {
      try { setEstado(JSON.parse(e.data) as Estado); setApiOk(true); } catch { /* ignore */ }
    };
    es.onerror = () => setApiOk(false);

    // Fallback polling a cada 15s — garante actualizações mesmo se SSE cair
    const poll = setInterval(fetchEstado, 15_000);

    return () => { es.close(); clearInterval(poll); };
  }, [apiUrl, fetchEstado]);

  return { estado, apiOk, fetchEstado };
}
