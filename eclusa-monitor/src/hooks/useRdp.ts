import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { apiPost } from "../lib/api";
import type { ClienteKey, Estado } from "../types";

interface Options {
  apiUrl:        string;
  token:         string;
  username:      string;
  estado:        Estado | null;
  fetchEstado:   () => void;
  onNeedLogin:   () => void;
  ipCliente1:    string;
  ipCliente2:    string;
  ipReserva:     string;
  servidorHealth: Record<string, import("../types").ServidorHealth>;
  onFailoverManual: (cliente: string, idReserva: string, ipReserva: string) => void;
  onLimparReserva:  (cliente: ClienteKey) => void;
}

const RESERVAS_ORDEM = ["Reserva01", "Reserva02", "Reserva03"] as const;
const CLIENTE_SERVIDOR: Record<ClienteKey, string> = { eclusa_RG: "RG", eclusa_PN: "PN" };
// Normaliza "RG"→"eclusa_RG", "PN"→"eclusa_PN" — o watchdog envia o ID do servidor
const SERVIDOR_CLIENTE: Record<string, ClienteKey> = { RG: "eclusa_RG", PN: "eclusa_PN" };

export function useRdp({ apiUrl, token, username, estado, fetchEstado, onNeedLogin, ipCliente1, ipCliente2, ipReserva, servidorHealth, onFailoverManual, onLimparReserva }: Options) {
  const clienteIps: Record<ClienteKey, string> = {
    eclusa_RG: ipCliente1,
    eclusa_PN: ipCliente2,
  };
  const [conectando,   setConectando]   = useState<ClienteKey | null>(null);
  const [emSupervisao, setEmSupervisao] = useState<ClienteKey | null>(null);
  const [erro,         setErro]         = useState("");
  // Suprime rdp-desconectado durante transições de failover/retorno
  const suprimirDesconectado = useRef(false);

  // ── Encerrar sessão (própria — fecha também janela mstsc local) ──────────────

  const handleEncerrar = useCallback(async (cliente: ClienteKey) => {
    try { await invoke("fechar_rdp"); } catch { /* janela já fechada */ }
    try {
      await apiPost(`${apiUrl}/sessoes/encerrar`, { cliente }, token);
      fetchEstado();
    } catch { /* sem ligação */ }
    onLimparReserva(cliente);
  }, [apiUrl, token, fetchEstado, onLimparReserva]);

  // ── Forçar encerramento (admin) — só API, sem fechar mstsc do admin ──────────

  const handleAdminEncerrar = useCallback(async (cliente: ClienteKey) => {
    try {
      await apiPost(`${apiUrl}/sessoes/encerrar`, { cliente }, token);
      fetchEstado();
    } catch { /* sem ligação */ }
    onLimparReserva(cliente);
  }, [apiUrl, token, fetchEstado, onLimparReserva]);

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

    const outro: ClienteKey = cliente === "eclusa_RG" ? "eclusa_PN" : "eclusa_RG";
    const outraSessao = estado?.sessoes?.[outro];
    if (outraSessao?.conectado && outraSessao.operador.toLowerCase() === username.toLowerCase()) {
      setErro(`Já tens sessão activa em ${outro}. Encerra primeiro.`);
      return;
    }

    // Se o servidor principal está offline, redireciona para o primeiro reserva disponível
    const servidorPrincipal = CLIENTE_SERVIDOR[cliente];
    const principalOffline  = !servidorHealth[servidorPrincipal]?.windows_vivo || !servidorHealth[servidorPrincipal]?.wincc_vivo;

    let ipDestino  = clienteIps[cliente];
    let idReserva: string | null = null;

    if (principalOffline) {
      const reserva = RESERVAS_ORDEM.find(r => servidorHealth[r]?.windows_vivo && servidorHealth[r]?.wincc_vivo);
      if (!reserva) {
        setErro("Servidor offline e sem reserva disponível com WinCC ativo.");
        return;
      }
      idReserva = reserva;
      ipDestino = servidorHealth[reserva].ip;
    }

    setConectando(cliente);
    try {
      const data = await apiPost<{ ok: boolean; erro?: string }>(
        `${apiUrl}/sessoes/iniciar`,
        { cliente, operador: username, ip_servidor: idReserva ? ipDestino : undefined },
        token,
      );
      if (!data.ok) { setErro(data.erro ?? "Erro ao registar sessão."); return; }

      fetchEstado();

      if (idReserva) {
        onFailoverManual(cliente, idReserva, ipDestino);
      }

      // Lança mstsc — Tauri envia "rdp-desconectado" quando a janela fechar
      const msg = await invoke<string>("connect_rdp", { ip: ipDestino, cliente });
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
      const data = await apiPost<{ ok: boolean; erro?: string; sessao_id?: number; server_ip?: string }>(
        `${apiUrl}/supervisao/iniciar`,
        { cliente, supervisor: username },
        token,
      );
      if (!data.ok) { setErro(data.erro ?? "Sem sessão activa para supervisionar."); return; }

      registado = true;
      const sessaoId = data.sessao_id ?? 0;
      if (!sessaoId) { rollback(); setErro("Session ID inválido — refresca o estado."); return; }

      // server_ip pode ser o reserva em caso de failover
      const serverIp = data.server_ip ?? "";
      const msg = await invoke<string>("connect_shadow", { cliente, sessaoId, serverIp });
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
  // Chamado quando SSE "failover" chega. A sessão já está registada no backend
  // (foi registada em handleConectar quando o operador abriu a sessão original).
  // Só precisa fechar o mstsc atual e abrir no novo IP.
  const handleFailover = useCallback(async (cliente: ClienteKey, ipNovoServidor: string) => {
    if (!username) return;

    // Suprime rdp-desconectado no lado React — garante que handleEncerrar não apaga a sessão
    suprimirDesconectado.current = true;
    try { await invoke("fechar_rdp_transicao"); } catch {
      // fechar_rdp_transicao pode não existir em builds antigos — usa fechar_rdp normal
      try { await invoke("fechar_rdp"); } catch { /* já fechou */ }
    }
    await new Promise(r => setTimeout(r, 1500));
    suprimirDesconectado.current = false;

    // Regista sessão no reserva — informa backend do IP real usado.
    // Isto faz o backend inserir failover_ips[cliente]=reserva, necessário para:
    //   1. rdp_poll_loop monitorar o reserva (não o servidor offline)
    //   2. servidores_poll_loop isentar o operador no reserva
    //   3. servidor_voltou saber que há sessão ativa no reserva → reconectar_auto=true
    try {
      await apiPost(`${apiUrl}/sessoes/iniciar`,
        { cliente, operador: username, ip_servidor: ipNovoServidor },
        token,
      );
    } catch { /* melhor esforço */ }

    const msg = await invoke<string>("connect_rdp", { ip: ipNovoServidor, cliente }).catch(String);
    if (msg) setErro(`Failover: ${msg}`);

    fetchEstado();
  }, [apiUrl, token, fetchEstado, username]);

  // ── Retorno ao servidor original — regista nova sessão e abre mstsc ─────────
  // Chamado quando SSE "servidor_voltou" com reconectar_auto=true.
  // Precisa registar sessão no backend (ip_servidor = IP original) antes de abrir mstsc.
  const handleVoltarOriginal = useCallback(async (cliente: ClienteKey, ipOriginal: string) => {
    if (!username) return;

    suprimirDesconectado.current = true;
    try { await invoke("fechar_rdp_transicao"); } catch {
      try { await invoke("fechar_rdp"); } catch { /* já fechou */ }
    }
    await new Promise(r => setTimeout(r, 1000));
    suprimirDesconectado.current = false;

    // Regista sessão no servidor original ANTES de abrir mstsc
    // → rdp_poll_loop vê sessão autorizada desde o início, nunca bloqueia o operador
    try {
      await apiPost(`${apiUrl}/sessoes/iniciar`,
        { cliente, operador: username, ip_servidor: ipOriginal },
        token,
      );
    } catch { /* melhor esforço */ }

    // Abre mstsc no servidor original
    const msg = await invoke<string>("connect_rdp", { ip: ipOriginal, cliente }).catch(String);
    if (msg) setErro(`Retorno: ${msg}`);

    // Limpa failover_ips no backend — reserva volta a estar livre
    // Feito após mstsc estar aberto (≥1s de margem pela espera acima)
    apiPost(`${apiUrl}/sessoes/voltar-original`, { cliente }, token).catch(() => {});

    fetchEstado();
  }, [apiUrl, token, username, fetchEstado]);

  // Exposto para o App passar ao useEstado como callback de failover SSE
  // O watchdog envia "servidor": "RG" — normaliza para ClienteKey "eclusa_RG"
  const onFailoverSse = useCallback((p: { cliente: string; ip_reserva: string }) => {
    const clienteKey: ClienteKey = SERVIDOR_CLIENTE[p.cliente] ?? (p.cliente as ClienteKey);
    const ip = p.ip_reserva || ipReserva;
    handleFailover(clienteKey, ip);
  }, [handleFailover, ipReserva]);

  // ── Eventos Tauri ────────────────────────────────────────────────────────────

  // mstsc fechou → encerrar sessão na API (suprimido durante transições de failover)
  useEffect(() => {
    const unsub = listen<string>("rdp-desconectado", e => {
      if (suprimirDesconectado.current) return;
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
    handleVoltarOriginal,
  };
}
