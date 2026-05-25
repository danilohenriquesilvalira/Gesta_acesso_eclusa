import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { apiPost } from "../lib/api";
import type { ClienteKey, Estado } from "../types";

interface Options {
  apiUrl:      string;
  token:       string;
  username:    string;
  estado:      Estado | null;
  fetchEstado: () => void;
  onNeedLogin: () => void;
  ipCliente1:  string;
  ipCliente2:  string;
  ipReserva:   string;
}

export function useRdp({ apiUrl, token, username, estado, fetchEstado, onNeedLogin, ipCliente1, ipCliente2, ipReserva }: Options) {
  const clienteIps: Record<ClienteKey, string> = {
    cliente1: ipCliente1,
    cliente2: ipCliente2,
  };
  const [conectando,   setConectando]   = useState<ClienteKey | null>(null);
  const [emSupervisao, setEmSupervisao] = useState<ClienteKey | null>(null);
  const [erro,         setErro]         = useState("");

  // ── Encerrar sessão (própria — fecha também janela mstsc local) ──────────────

  const handleEncerrar = useCallback(async (cliente: ClienteKey) => {
    try { await invoke("fechar_rdp"); } catch { /* janela já fechada */ }
    try {
      await apiPost(`${apiUrl}/sessoes/encerrar`, { cliente }, token);
      fetchEstado();
    } catch { /* sem ligação */ }
  }, [apiUrl, token, fetchEstado]);

  // ── Forçar encerramento (admin) — só API, sem fechar mstsc do admin ──────────

  const handleAdminEncerrar = useCallback(async (cliente: ClienteKey) => {
    try {
      await apiPost(`${apiUrl}/sessoes/encerrar`, { cliente }, token);
      fetchEstado();
    } catch { /* sem ligação */ }
  }, [apiUrl, token, fetchEstado]);

  // ── Iniciar sessão RDP ──────────────────────────────────────────────────────

  const handleConectar = useCallback(async (cliente: ClienteKey) => {
    if (!username) { onNeedLogin(); return; }
    if (conectando) return;

    const rdp  = estado?.rdp?.[cliente];
    const sess = estado?.sessoes?.[cliente];

    if (rdp?.ocupado) {
      const quem = sess?.operador || rdp.utilizador || "alguém";
      setErro(`Sessão RDP activa em ${cliente} — ${quem}`);
      return;
    }

    const outro: ClienteKey = cliente === "cliente1" ? "cliente2" : "cliente1";
    const outraSessao = estado?.sessoes?.[outro];
    if (outraSessao?.conectado && outraSessao.operador.toLowerCase() === username.toLowerCase()) {
      setErro(`Já tens sessão activa em ${outro}. Encerra primeiro.`);
      return;
    }

    setConectando(cliente);
    try {
      const data = await apiPost<{ ok: boolean; erro?: string }>(
        `${apiUrl}/sessoes/iniciar`,
        { cliente, operador: username },
        token,
      );
      if (!data.ok) { setErro(data.erro ?? "Erro ao registar sessão."); return; }

      fetchEstado();

      // Lança mstsc — Tauri envia "rdp-desconectado" quando a janela fechar
      const msg = await invoke<string>("connect_rdp", { ip: clienteIps[cliente], cliente });
      if (msg) setErro(msg);
    } catch {
      setErro("Erro ao contactar a API.");
    } finally {
      setConectando(null);
    }
  }, [apiUrl, token, username, conectando, estado, fetchEstado, onNeedLogin]);

  // ── Iniciar supervisão shadow ────────────────────────────────────────────────

  const handleSupervisao = useCallback(async (cliente: ClienteKey) => {
    if (!username) { onNeedLogin(); return; }

    const rollback = () =>
      apiPost(`${apiUrl}/supervisao/encerrar`, { cliente, supervisor: username }, token)
        .catch(() => {});

    let registado = false;
    try {
      const data = await apiPost<{ ok: boolean; erro?: string; sessao_id?: number }>(
        `${apiUrl}/supervisao/iniciar`,
        { cliente, supervisor: username },
        token,
      );
      if (!data.ok) { setErro(data.erro ?? "Sem sessão activa para supervisionar."); return; }

      registado = true;
      const sessaoId = data.sessao_id ?? 0;
      if (!sessaoId) { rollback(); setErro("Session ID inválido — refresca o estado."); return; }

      const msg = await invoke<string>("connect_shadow", { cliente, sessaoId });
      if (msg) { rollback(); setErro(msg); return; }

      setEmSupervisao(cliente);
    } catch (e) {
      if (registado) rollback();
      setErro(`Erro supervisão: ${String(e)}`);
    }
  }, [apiUrl, token, username, onNeedLogin]);

  // ── Sair supervisão ──────────────────────────────────────────────────────────

  const handleSairSupervisao = useCallback(async () => {
    if (emSupervisao && username) {
      apiPost(
        `${apiUrl}/supervisao/encerrar`,
        { cliente: emSupervisao, supervisor: username },
        token,
      ).catch(() => {});
    }
    try { await invoke("fechar_shadow"); } catch { /* processo já fechou */ }
    setEmSupervisao(null);
  }, [apiUrl, token, emSupervisao, username]);

  // ── Failover automático — servidor caiu, reconectar no reserva ─────────────

  const handleFailover = useCallback(async (cliente: ClienteKey, ipNovoServidor: string) => {
    // Fecha mstsc atual silenciosamente
    try { await invoke("fechar_rdp"); } catch { /* já fechou */ }

    // Pequena pausa para o mstsc terminar
    await new Promise(r => setTimeout(r, 1500));

    // Abre novo RDP no servidor reserva
    const msg = await invoke<string>("connect_rdp", { ip: ipNovoServidor, cliente }).catch(String);
    if (msg) setErro(`Failover: ${msg}`);

    fetchEstado();
  }, [fetchEstado]);

  // Exposto para o App passar ao useEstado como callback de failover SSE
  const onFailoverSse = useCallback((p: { cliente: string; ip_reserva: string }) => {
    const cliente = p.cliente as ClienteKey;
    const ip = p.ip_reserva || ipReserva;
    handleFailover(cliente, ip);
  }, [handleFailover, ipReserva]);

  // ── Eventos Tauri ────────────────────────────────────────────────────────────

  // mstsc fechou → encerrar sessão na API
  useEffect(() => {
    const unsub = listen<string>("rdp-desconectado", e => {
      handleEncerrar(e.payload as ClienteKey);
    });
    return () => { unsub.then(fn => fn()); };
  }, [handleEncerrar]);

  // shadow fechou → encerrar supervisão na API
  useEffect(() => {
    const unsub = listen<string>("shadow-fechado", e => {
      const cliente = e.payload as ClienteKey;
      if (username) {
        apiPost(`${apiUrl}/supervisao/encerrar`, { cliente, supervisor: username }, token)
          .catch(() => {});
      }
      setEmSupervisao(null);
    });
    return () => { unsub.then(fn => fn()); };
  }, [apiUrl, token, username]);

  return {
    conectando,
    emSupervisao,
    erro,
    setErro,
    handleConectar,
    handleEncerrar,
    handleAdminEncerrar,
    handleSupervisao,
    handleSairSupervisao,
    onFailoverSse,
  };
}
