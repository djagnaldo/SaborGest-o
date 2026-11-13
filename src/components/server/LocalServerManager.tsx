/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import {
  Wifi,
  WifiOff,
  Copy,
  Check,
  QrCode,
  KeyRound,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  Trash2,
  Power,
  MonitorSmartphone,
  Clock,
  AlertCircle,
  ExternalLink,
  Smartphone,
  BatteryCharging,
} from 'lucide-react';
import {
  fetchWebAccessStatus,
  toggleWebAccessServer,
  generateWebAccessKey,
  renewWebAccessKey,
  revokeWebAccessKey,
  disconnectWebSession,
  fetchQrDataUrl,
  startAndroidHostServer,
  stopAndroidHostServer,
  refreshNativeServerStatus,
  getSavedNativeServerPort,
  saveNativeServerPort,
} from '../../services/sync-client';
import {
  isAndroidNativeHost,
  requestNativeBatteryExemption,
  type NativeServerStatus,
} from '../../services/native-server';
import { collectSyncableState } from '../../services/storage';
import type { WebAccessStatusResponse, WebAccessMode } from '../../types';

export const LocalServerManager: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, users, isAdm, wsConnected } = useAuth();

  const isAndroidHost = isAndroidNativeHost();
  const [nativeStatus, setNativeStatus] = useState<NativeServerStatus | null>(null);
  const [configuredPort, setConfiguredPort] = useState<number>(() => getSavedNativeServerPort());
  const [status, setStatus] = useState<WebAccessStatusResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [newKeyMode, setNewKeyMode] = useState<WebAccessMode>('seller');
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [generatedPlainKey, setGeneratedPlainKey] = useState<{
    plainKey: string;
    mode: WebAccessMode;
    userName: string;
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const sellers = users.filter((u) => u.role !== 'admin');

  useEffect(() => {
    if (!selectedSellerId && sellers.length > 0) {
      const firstAuth = sellers.find((s) => s.canSell !== false && s.status !== 'bloqueado');
      setSelectedSellerId((firstAuth || sellers[0]).id);
    }
  }, [sellers, selectedSellerId]);

  const loadStatus = useCallback(async () => {
    if (!currentTenant?.id || !isAdm) return;
    try {
      setError(null);
      if (isAndroidHost) {
        const nStatus = await refreshNativeServerStatus();
        setNativeStatus(nStatus);
        if (nStatus && !nStatus.running) {
          // Nunca mostra servidor ativo quando o Foreground Service Android está parado
          setStatus(null);
          setQrDataUrl('');
          setLoading(false);
          return;
        }
        if (nStatus?.port) {
          setConfiguredPort(nStatus.port);
        }
      }

      const data = await fetchWebAccessStatus(currentTenant.id, currentUser?.id);
      setStatus(data);
      const defaultUrl =
        selectedUrl && data.urls.includes(selectedUrl)
          ? selectedUrl
          : data.urls[0] || `${window.location.origin}/?portal=web`;
      setSelectedUrl(defaultUrl);

      const qr = await fetchQrDataUrl(defaultUrl, currentUser?.id);
      setQrDataUrl(qr);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.startsWith('NATIVE_SERVER_STOPPED:')) {
        setStatus(null);
        setQrDataUrl('');
      } else {
        setError(msg || 'Não foi possível consultar o servidor de Acesso Web.');
      }
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id, currentUser?.id, isAdm, isAndroidHost, selectedUrl]);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 5000);
    const onSync = () => loadStatus();
    const onNativeChange = (e: Event) => {
      const detail = (e as CustomEvent<NativeServerStatus | null>).detail;
      setNativeStatus(detail);
      loadStatus();
    };
    window.addEventListener('sabor_local_sync', onSync);
    window.addEventListener('sabor_native_server_status', onNativeChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('sabor_local_sync', onSync);
      window.removeEventListener('sabor_native_server_status', onNativeChange);
    };
  }, [loadStatus]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const handlePortChange = (rawVal: string) => {
    const parsed = parseInt(rawVal.replace(/\D/g, ''), 10);
    if (!Number.isNaN(parsed)) {
      setConfiguredPort(parsed);
      if (parsed >= 1024 && parsed <= 65535) {
        saveNativeServerPort(parsed);
      }
    } else {
      setConfiguredPort(3000);
    }
  };

  const handleStartNativeServer = async () => {
    if (!currentTenant?.id) return;
    if (configuredPort < 1024 || configuredPort > 65535) {
      setError('Informe uma porta válida entre 1024 e 65535 (recomendado: 3000 ou 8080).');
      return;
    }
    setBusyAction('native_power');
    setError(null);
    try {
      const nStatus = await startAndroidHostServer({
        port: configuredPort,
        tenantId: currentTenant.id,
        userId: currentUser?.id,
        seedSnapshot: collectSyncableState(),
      });
      setNativeStatus(nStatus);
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Falha ao iniciar o servidor web nativo no Android.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStopNativeServer = async () => {
    setBusyAction('native_power');
    setError(null);
    try {
      const nStatus = await stopAndroidHostServer();
      setNativeStatus(nStatus);
      setStatus(null);
      setQrDataUrl('');
    } catch (err: any) {
      setError(err?.message || 'Falha ao parar o servidor nativo Android.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleBatteryExemption = async () => {
    try {
      await requestNativeBatteryExemption();
      const updated = await refreshNativeServerStatus();
      setNativeStatus(updated);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível abrir configurações de bateria.');
    }
  };

  const handleToggleWebAccess = async () => {
    if (!status || !currentTenant?.id) return;
    setBusyAction('toggle');
    try {
      await toggleWebAccessServer(!status.webAccessEnabled, currentTenant.id, currentUser?.id);
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Erro ao alterar acesso pelo navegador.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateKey = async () => {
    if (!currentTenant?.id) return;
    setBusyAction('create_key');
    setError(null);
    try {
      const res = await generateWebAccessKey({
        tenantId: currentTenant.id,
        mode: newKeyMode,
        userId: newKeyMode === 'seller' ? selectedSellerId : currentUser?.id,
        expiresInHours,
        activeUserId: currentUser?.id,
      });
      setGeneratedPlainKey({
        plainKey: res.plainKey,
        mode: res.keySummary.mode,
        userName: res.keySummary.userName,
      });
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar chave de acesso.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRenewKey = async (keyId: string) => {
    setBusyAction(`renew_${keyId}`);
    setError(null);
    try {
      const res = await renewWebAccessKey(keyId, 24, currentUser?.id);
      setGeneratedPlainKey({
        plainKey: res.plainKey,
        mode: res.keySummary.mode,
        userName: res.keySummary.userName,
      });
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Erro ao renovar chave.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setBusyAction(`revoke_${keyId}`);
    setError(null);
    try {
      await revokeWebAccessKey(keyId, currentUser?.id);
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Erro ao revogar chave.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnectSession = async (sessionId: string) => {
    setBusyAction(`disc_${sessionId}`);
    setError(null);
    try {
      await disconnectWebSession(sessionId, currentUser?.id);
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Erro ao desconectar dispositivo.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectUrl = async (url: string) => {
    setSelectedUrl(url);
    try {
      const qr = await fetchQrDataUrl(url, currentUser?.id);
      setQrDataUrl(qr);
    } catch {
      // noop
    }
  };

  if (!isAdm) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-stone-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-stone-900">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-stone-500 mt-1">
          Apenas o Administrador pode iniciar o servidor local, gerar chaves e desconectar dispositivos.
        </p>
      </div>
    );
  }

  const nativeRunning = isAndroidHost ? Boolean(nativeStatus?.running) : Boolean(status);
  const isNetworkActive = nativeRunning && Boolean(status?.webAccessEnabled);
  const activeKeys = (status?.keys || []).filter((k) => !k.revoked);
  const browserOriginUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/?portal=web`;
  const effectiveQrUrl = selectedUrl || status?.urls?.[0] || browserOriginUrl;

  return (
    <div className="space-y-6">
      {/* Header + Server Service Control */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
                {isAndroidHost ? 'Servidor Nativo no Celular (ADM)' : 'Acesso pelo Navegador'}
              </h1>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  isAndroidHost
                    ? nativeRunning
                      ? isNetworkActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                    : isNetworkActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-stone-100 text-stone-600 border border-stone-200'
                }`}
              >
                {isAndroidHost
                  ? nativeRunning
                    ? isNetworkActive
                      ? 'Serviço Ativo na Rede Wi-Fi'
                      : 'Serviço Ligado (Login Web Pausado)'
                    : 'Servidor Nativo Parado'
                  : status
                    ? status.webAccessEnabled
                      ? 'Ativo na Rede'
                      : 'Acesso Web Desativado'
                    : 'Servidor Indisponível'}
              </span>
              {nativeRunning && (
                <span className="text-xs font-medium text-stone-500 tabular-nums">
                  WS: {wsConnected ? 'Conectado' : 'Reconectando'} • Rev #{status?.revision ?? nativeStatus?.revision ?? 0}
                </span>
              )}
            </div>
            <p className="text-sm text-stone-500 mt-1">
              {isAndroidHost
                ? 'Este aparelho Android atua como servidor HTTP e WebSocket principal da rede Wi-Fi, sem depender de computador externo.'
                : 'Conecte notebooks, tablets ou celulares pelo navegador em Modo Administrador ou Modo Vendedor com sincronização em tempo real.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={loadStatus}
              className="min-h-[44px] px-3.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            {isAndroidHost ? (
              <>
                {nativeRunning ? (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleWebAccess}
                      disabled={busyAction === 'toggle'}
                      className="min-h-[44px] px-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-sm font-semibold cursor-pointer"
                    >
                      {status?.webAccessEnabled ? 'Pausar Login Web' : 'Liberar Login Web'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStopNativeServer}
                      disabled={busyAction === 'native_power'}
                      className="min-h-[44px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Power className="w-4 h-4" />
                      {busyAction === 'native_power' ? 'Parando...' : 'Parar Servidor'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartNativeServer}
                    disabled={busyAction === 'native_power'}
                    className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Power className="w-4 h-4" />
                    {busyAction === 'native_power' ? 'Iniciando Serviço...' : 'Iniciar Servidor Nativo'}
                  </button>
                )}
              </>
            ) : (
              status && (
                <button
                  type="button"
                  onClick={handleToggleWebAccess}
                  disabled={busyAction === 'toggle'}
                  className={`min-h-[44px] px-5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                    status.webAccessEnabled
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  {status.webAccessEnabled ? 'Desativar Acesso Web' : 'Ativar Acesso Web'}
                </button>
              )
            )}
          </div>
        </div>

        {/* Android Foreground Service Port & Battery Settings Bar */}
        {isAndroidHost && (
          <div className="mt-4 pt-4 border-t border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                <Smartphone className="w-4 h-4 text-amber-600" />
                <span>Porta do Servidor HTTP/WS:</span>
              </div>
              <input
                type="number"
                min={1024}
                max={65535}
                value={configuredPort}
                disabled={nativeRunning}
                onChange={(e) => handlePortChange(e.target.value)}
                className="w-28 min-h-[40px] px-3 rounded-xl border border-stone-300 bg-stone-50 disabled:opacity-60 font-mono text-sm font-bold text-stone-900 tabular-nums"
              />
              {nativeRunning && (
                <span className="text-xs text-stone-500">
                  Para alterar a porta, pare o servidor primeiro.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
                  nativeStatus?.batteryOptimizationIgnored
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {nativeStatus?.batteryOptimizationIgnored
                  ? 'Bateria: Execução contínua liberada'
                  : 'Bateria: Otimização Android ativa (pode suspender em tela apagada)'}
              </span>
              {!nativeStatus?.batteryOptimizationIgnored && (
                <button
                  type="button"
                  onClick={handleBatteryExemption}
                  className="min-h-[38px] px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <BatteryCharging className="w-4 h-4" />
                  Manter Ativo em 2º Plano
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* When Android Native Server is Stopped -> Honest Stopped State */}
      {isAndroidHost && !nativeRunning ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto">
            <WifiOff className="w-7 h-7 text-stone-500" />
          </div>
          <div className="max-w-lg mx-auto space-y-2">
            <h2 className="text-lg font-extrabold text-stone-900">
              O servidor web no celular está desligado
            </h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              O aplicativo continua funcionando normalmente neste aparelho em modo local. Para permitir que notebooks, tablets ou celulares dos vendedores conectem na rede Wi-Fi pela porta{' '}
              <strong className="font-mono">{configuredPort}</strong>, clique em{' '}
              <strong>Iniciar Servidor Nativo</strong>.
            </p>
            {nativeStatus?.primaryIp && nativeStatus.primaryIp !== '127.0.0.1' && (
              <p className="text-xs text-stone-500 font-mono">
                IP Wi-Fi detectado neste dispositivo: {nativeStatus.primaryIp}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleStartNativeServer}
            disabled={busyAction === 'native_power'}
            className="min-h-[48px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer"
          >
            <Power className="w-4 h-4" />
            {busyAction === 'native_power'
              ? 'Iniciando Servidor...'
              : `Iniciar Servidor na Porta ${configuredPort}`}
          </button>
        </div>
      ) : (
        /* Main Grid: Network URL + QR Code | Key Generator */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left: URL, IP, QR Code, Instructions */}
          <div className="xl:col-span-5 bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                {isNetworkActive ? (
                  <Wifi className="w-5 h-5 text-emerald-600" />
                ) : (
                  <WifiOff className="w-5 h-5 text-stone-400" />
                )}
                Endereço de Conexão (Wi-Fi LAN)
              </h2>
              <span className="text-xs font-bold text-stone-600 tabular-nums">
                Porta {status?.port || configuredPort}
              </span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  IP Detectado na Rede Local
                </p>
                <p className="text-lg font-extrabold font-mono text-stone-900 tabular-nums mt-0.5">
                  {status?.primaryIp || nativeStatus?.primaryIp || '127.0.0.1'}
                </p>
              </div>

              {status?.urls && status.urls.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-stone-500 mb-1.5">
                    Interfaces de rede disponíveis:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {status.urls.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => handleSelectUrl(u)}
                        className={`text-xs font-mono px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                          effectiveQrUrl === u
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-stone-700 border-stone-200'
                        }`}
                      >
                        {u.replace('http://', '').replace('/?portal=web', '')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                  Link Direto do Portal Web
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={effectiveQrUrl}
                    className="flex-1 min-h-[44px] px-3 bg-white border border-stone-300 rounded-xl font-mono text-xs text-stone-800"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(effectiveQrUrl, 'url')}
                    className="min-h-[44px] px-4 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'url' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar endereço
                      </>
                    )}
                  </button>
                </div>
              </div>

              {!isAndroidHost && (
                <a
                  href={browserOriginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] border border-stone-300 bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir Portal de Login em Nova Aba (Teste Real)
                </a>
              )}
            </div>

            {/* Real QR Code */}
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-stone-200 bg-white">
              <div className="w-36 h-36 rounded-xl border border-stone-200 bg-white flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code de Acesso pelo Navegador"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <QrCode className="w-16 h-16 text-stone-300" />
                )}
              </div>
              <div className="text-xs text-stone-600 space-y-1.5">
                <p className="font-bold text-stone-900 text-sm">QR Code de Conexão</p>
                <p className="leading-relaxed">
                  Aponte a câmera de outro celular ou tablet na mesma rede Wi-Fi para abrir o portal de login diretamente.
                </p>
                <p className="text-stone-500">
                  Gere ao lado uma chave de <strong>Modo Administrador</strong> ou <strong>Modo Vendedor</strong> para autenticar o dispositivo.
                </p>
              </div>
            </div>

            {/* 5 Step Instructions */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2 text-xs text-stone-600">
              <p className="font-bold text-stone-900">Como conectar outro dispositivo (5 passos):</p>
              <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                <li>Confirme que o celular do ADM e o outro aparelho estão na mesma rede Wi-Fi.</li>
                <li>Mantenha o <strong>Servidor Nativo</strong> iniciado (notificação ativa no Android).</li>
                <li>Gere uma chave para <strong>Modo Administrador</strong> ou <strong>Modo Vendedor</strong>.</li>
                <li>No outro aparelho, leia o QR Code ou digite o endereço copiado no navegador.</li>
                <li>Informe a chave de acesso para iniciar a operação sincronizada em tempo real.</li>
              </ol>
            </div>
          </div>

          {/* Right: Generate & Manage Access Keys */}
          <div className="xl:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600" />
                Gerar Chave de Acesso
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewKeyMode('admin')}
                  className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    newKeyMode === 'admin'
                      ? 'border-amber-600 bg-amber-50/70'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-stone-900">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Modo Administrador
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Acesso gerencial completo sincronizado.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewKeyMode('seller')}
                  className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    newKeyMode === 'seller'
                      ? 'border-emerald-600 bg-emerald-50/70'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-stone-900">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    Modo Vendedor
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Acesso individual restrito às vendas autorizadas.
                  </p>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {newKeyMode === 'seller' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">
                      Vendedor Vinculado
                    </label>
                    <select
                      value={selectedSellerId}
                      onChange={(e) => setSelectedSellerId(e.target.value)}
                      className="w-full min-h-[44px] px-3 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900"
                    >
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.canSell === false || s.status === 'bloqueado' ? 'BLOQUEADO' : 'Autorizado'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={newKeyMode === 'admin' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">
                    Validade da Chave
                  </label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900"
                  >
                    <option value={12}>12 horas (Turno)</option>
                    <option value={24}>24 horas (Diária)</option>
                    <option value={168}>7 dias</option>
                    <option value={720}>30 dias</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateKey}
                disabled={busyAction === 'create_key' || (newKeyMode === 'seller' && !selectedSellerId)}
                className="w-full min-h-[48px] bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
              >
                {busyAction === 'create_key'
                  ? 'Gerando chave criptografada...'
                  : `Gerar Chave para ${newKeyMode === 'admin' ? 'Administrador' : 'Vendedor'}`}
              </button>

              {generatedPlainKey && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Chave Gerada ({generatedPlainKey.mode === 'admin' ? 'ADM' : 'Vendedor'} — {generatedPlainKey.userName})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(generatedPlainKey.plainKey, 'new_plain_key')}
                      className="min-h-[36px] px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'new_plain_key' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Chave Copiada
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar Chave
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-lg font-extrabold tracking-widest text-stone-900 select-all">
                    {generatedPlainKey.plainKey}
                  </p>
                  <p className="text-xs text-amber-800">
                    Guarde ou envie esta chave agora. Por segurança, o servidor armazena apenas o hash criptográfico (scrypt + salt).
                  </p>
                </div>
              )}

              {/* Existing Keys Table */}
              <div className="pt-2 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Chaves Ativas ({activeKeys.length})
                </h3>
                {activeKeys.length === 0 ? (
                  <p className="text-xs text-stone-500 py-3">
                    Nenhuma chave ativa emitida no momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeKeys.map((k) => (
                      <div
                        key={k.id}
                        className="p-3 rounded-xl border border-stone-200 bg-stone-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-stone-900">
                              {k.keyPreview}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                k.mode === 'admin'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {k.mode === 'admin' ? 'ADM' : 'Vendedor'}
                            </span>
                            <span className="text-xs font-semibold text-stone-700 truncate">
                              {k.userName}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 mt-1 tabular-nums">
                            Expira em {new Date(k.expiresAt).toLocaleString('pt-BR')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRenewKey(k.id)}
                            disabled={busyAction === `renew_${k.id}`}
                            className="min-h-[38px] px-3 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-xs font-semibold text-stone-700 cursor-pointer"
                          >
                            Renovar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeKey(k.id)}
                            disabled={busyAction === `revoke_${k.id}`}
                            className="min-h-[38px] px-3 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Revogar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Connected Devices + Individual Disconnect */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <MonitorSmartphone className="w-5 h-5 text-emerald-600" />
                  Dispositivos Conectados ({status?.activeSessionsCount || 0})
                </h2>
              </div>

              {!status?.sessions || status.sessions.length === 0 ? (
                <p className="text-xs text-stone-500 py-2">
                  Nenhum navegador externo conectado no momento.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {status.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-xl border border-stone-200 bg-stone-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-stone-900">{s.deviceLabel}</span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              s.mode === 'admin'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {s.mode === 'admin' ? 'MODO ADM' : 'MODO VENDEDOR'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-0.5">
                          Usuário: <strong>{s.userName}</strong> • IP:{' '}
                          <span className="font-mono">{s.ipAddress}</span>
                        </p>
                        <p className="text-[11px] text-stone-500 tabular-nums mt-0.5">
                          Conectado em {new Date(s.connectedAt).toLocaleTimeString('pt-BR')} •{' '}
                          {s.wsConnected ? 'Tempo real ativo' : 'HTTP ativo'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDisconnectSession(s.id)}
                        disabled={busyAction === `disc_${s.id}`}
                        className="min-h-[40px] px-3.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer"
                      >
                        Desconectar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connection Logs */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-stone-600" />
                Histórico de Conexões e Auditoria de Chaves
              </h2>
              {!status?.logs || status.logs.length === 0 ? (
                <p className="text-xs text-stone-500">Sem eventos de conexão registrados ainda.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {status.logs.slice(0, 20).map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                    >
                      <div>
                        <span className="font-bold text-stone-900">{log.userName}</span>
                        <span className="text-stone-500"> — {log.details}</span>
                      </div>
                      <span className="text-[11px] text-stone-500 font-mono tabular-nums shrink-0">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
