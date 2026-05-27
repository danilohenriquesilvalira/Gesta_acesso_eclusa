import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Estado, ServidorHealth } from "../types";

export type FailoverPayload  = { cliente: string; ip_reserva: string; id_reserva?: string };
export type VoltouPayload    = { servidor: string; ip_original: string; cliente_key?: string; reconectar_auto?: boolean; operador?: string };

export function useEstado(
  apiUrl:      string,
  _ipReserva:  string,
  onFailover?: (p: FailoverPayload) => void,
  onVoltou?:   (p: VoltouPayload)   => void,
) {
  const [estado,          setEstado]          = useState<Estado | null>(null);
  const [servidorHealth,  setServidorHealth]  = useState<Record<string, ServidorHealth>>({});
  const [apiOk,           setApiOk]           = useState<boolean | null>(null);

  const onFailoverRef  = useRef(onFailover);
  const onVoltouRef    = useRef(onVoltou);
  const disparadoRef   = useRef<Record<string, boolean>>({});
  const shRef          = useRef<Record<string, ServidorHealth>>({});

  onFailoverRef.current = onFailover;
  onVoltouRef.current   = onVoltou;

  const processarEstado = useCallback((json: Estado) => {
    // ── servidor_health — só atualiza estado React se windows_vivo/wincc_vivo mudou
    if (json.servidor_health) {
      let mudou = false;
      for (const [id, h] of Object.entries(json.servidor_health)) {
        const prev = shRef.current[id];
        if (!prev || prev.windows_vivo !== h.windows_vivo || prev.wincc_vivo !== h.wincc_vivo) {
          mudou = true;
          break;
        }
      }
      shRef.current = json.servidor_health;
      if (mudou) setServidorHealth({ ...json.servidor_health });
    }

    // ── estado principal — só atualiza se sessoes/rdp/eclusas/supervisoes mudaram
    setEstado(prev => {
      if (!prev) return json;
      if (
        JSON.stringify(json.sessoes)            === JSON.stringify(prev.sessoes)          &&
        JSON.stringify(json.rdp)                === JSON.stringify(prev.rdp)              &&
        JSON.stringify(json.supervisoes)        === JSON.stringify(prev.supervisoes)       &&
        JSON.stringify(json.operadores)         === JSON.stringify(prev.operadores)        &&
        JSON.stringify(json.eclusas?.eclusas)   === JSON.stringify(prev.eclusas?.eclusas) &&
        JSON.stringify(json.plc_health)         === JSON.stringify(prev.plc_health)
      ) return prev;
      return json;
    });

    setApiOk(true);
  }, []);

  const fetchEstado = useCallback(() => {
    const ac    = new AbortController();
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
        if (json._event === "failover") {
          if (!disparadoRef.current[json.servidor ?? json.cliente]) {
            disparadoRef.current[json.servidor ?? json.cliente] = true;
            onFailoverRef.current?.({ cliente: json.cliente ?? json.servidor, ip_reserva: json.ip_reserva, id_reserva: json.id_reserva });
          }
          return;
        }
        if (json._event === "servidor_voltou") {
          delete disparadoRef.current[json.servidor];
          onVoltouRef.current?.({
            servidor:        json.servidor,
            ip_original:     json.ip_original,
            cliente_key:     json.cliente_key,
            reconectar_auto: json.reconectar_auto ?? false,
            operador:        json.operador,
          });
          return;
        }
        // WinCC activou Encerrar_Sessao — fechar mstsc silenciosamente antes do logoff
        if (json._event === "fechar_rdp") {
          invoke("fechar_rdp_transicao").catch(() => invoke("fechar_rdp").catch(() => {}));
          return;
        }
        processarEstado(json as Estado);
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      setApiOk(false);
      // SSE caiu — poll a cada 5s até reconectar (não 2s para não stressar)
    };

    // Poll apenas como fallback quando SSE cai — intervalo longo
    const poll = setInterval(() => {
      if (es.readyState === EventSource.CLOSED) fetchEstado();
    }, 5_000);

    return () => { es.close(); clearInterval(poll); };
  }, [apiUrl, fetchEstado, processarEstado]);

  return { estado, servidorHealth, apiOk, fetchEstado };
}
