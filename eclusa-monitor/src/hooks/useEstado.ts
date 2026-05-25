import { useState, useEffect, useCallback, useRef } from "react";
import type { Estado } from "../types";

export type FailoverPayload = { cliente: string; ip_reserva: string };

// /estado e /eventos são públicos — não requerem token
export function useEstado(apiUrl: string, onFailover?: (p: FailoverPayload) => void) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [apiOk,  setApiOk]  = useState<boolean | null>(null);
  const onFailoverRef = useRef(onFailover);
  onFailoverRef.current = onFailover;

  const fetchEstado = useCallback(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4_000);
    fetch(`${apiUrl}/estado`, { signal: ac.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<Estado>; })
      .then(d => { setEstado(d); setApiOk(true); })
      .catch(() => setApiOk(false))
      .finally(() => clearTimeout(timer));
  }, [apiUrl]);

  useEffect(() => {
    fetchEstado();

    const es = new EventSource(`${apiUrl}/eventos`);

    // Eventos de estado normal (sem nome — tipo "message")
    es.onmessage = e => {
      try { setEstado(JSON.parse(e.data) as Estado); setApiOk(true); } catch { /* ignore */ }
    };

    // Evento de failover (named event — "event: failover")
    es.addEventListener("failover", (e: MessageEvent) => {
      try {
        const p = JSON.parse(e.data) as FailoverPayload;
        onFailoverRef.current?.(p);
      } catch { /* ignore */ }
    });

    es.onerror = () => setApiOk(false);

    const poll = setInterval(fetchEstado, 15_000);
    return () => { es.close(); clearInterval(poll); };
  }, [apiUrl, fetchEstado]);

  return { estado, apiOk, fetchEstado };
}
