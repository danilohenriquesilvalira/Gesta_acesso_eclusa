import { useState, useEffect, useCallback, useRef } from "react";
import type { Estado } from "../types";

export type FailoverPayload = { cliente: string; ip_reserva: string };

// /estado e /eventos são públicos — não requerem token
export function useEstado(apiUrl: string, ipReserva: string, onFailover?: (p: FailoverPayload) => void) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [apiOk,  setApiOk]  = useState<boolean | null>(null);
  const onFailoverRef   = useRef(onFailover);
  const ipReservaRef    = useRef(ipReserva);
  const disparadoRef    = useRef<Record<string, boolean>>({});

  onFailoverRef.current = onFailover;
  ipReservaRef.current  = ipReserva;

  const processarEstado = useCallback((json: Estado) => {
    setEstado(json);
    setApiOk(true);

    // Detetar servidor inacessível pelo estado normal — não depende do evento SSE failover
    // que pode ser perdido durante reconexão do EventSource
    const clientes = ["cliente1", "cliente2"] as const;
    for (const cliente of clientes) {
      const rdp = json.rdp?.[cliente];
      if (!rdp) continue;

      if (!rdp.verificado) {
        // Servidor inacessível — acionar failover se ainda não disparado para este cliente
        if (!disparadoRef.current[cliente]) {
          disparadoRef.current[cliente] = true;
          onFailoverRef.current?.({ cliente, ip_reserva: ipReservaRef.current });
        }
      } else {
        // Servidor voltou — resetar flag para próxima queda
        disparadoRef.current[cliente] = false;
      }
    }
  }, []);

  const fetchEstado = useCallback(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4_000);
    fetch(`${apiUrl}/estado`, { signal: ac.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<Estado>; })
      .then(d => processarEstado(d))
      .catch(() => setApiOk(false))
      .finally(() => clearTimeout(timer));
  }, [apiUrl, processarEstado]);

  useEffect(() => {
    fetchEstado();

    const es = new EventSource(`${apiUrl}/eventos`);

    es.onmessage = e => {
      try {
        const json = JSON.parse(e.data);
        // Evento failover explícito do backend — reforço adicional
        if (json._event === "failover") {
          if (!disparadoRef.current[json.cliente]) {
            disparadoRef.current[json.cliente] = true;
            onFailoverRef.current?.({ cliente: json.cliente, ip_reserva: json.ip_reserva });
          }
          return;
        }
        processarEstado(json as Estado);
      } catch { /* ignore */ }
    };

    es.onerror = () => setApiOk(false);

    const poll = setInterval(fetchEstado, 2_000);
    return () => { es.close(); clearInterval(poll); };
  }, [apiUrl, fetchEstado, processarEstado]);

  return { estado, apiOk, fetchEstado };
}
