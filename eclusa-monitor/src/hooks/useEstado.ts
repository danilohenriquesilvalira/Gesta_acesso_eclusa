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

    es.onmessage = e => {
      try {
        const json = JSON.parse(e.data);
        // Failover — campo _event distingue do estado normal
        if (json._event === "failover") {
          onFailoverRef.current?.({ cliente: json.cliente, ip_reserva: json.ip_reserva });
          return;
        }
        setEstado(json as Estado);
        setApiOk(true);
      } catch { /* ignore */ }
    };

    es.onerror = () => setApiOk(false);

    const poll = setInterval(fetchEstado, 15_000);
    return () => { es.close(); clearInterval(poll); };
  }, [apiUrl, fetchEstado]);

  return { estado, apiOk, fetchEstado };
}
