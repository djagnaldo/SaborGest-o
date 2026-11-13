/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, Wifi, WifiOff, Copy, Check, QrCode, ExternalLink, KeyRound, Power } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchWebAccessStatus,
  fetchQrDataUrl,
  generateWebAccessKey,
  refreshNativeServerStatus,
  startAndroidHostServer,
  getSavedNativeServerPort,
} from '../../services/sync-client';
import { isAndroidNativeHost, type NativeServerStatus } from '../../services/native-server';
import { collectSyncableState } from '../../services/storage';
import type { WebAccessStatusResponse } from '../../types';

interface PcBrowserAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFullManager?: () => void;
}

export const PcBrowserAccessModal: React.FC<PcBrowserAccessModalProps> = ({
  isOpen,
  onClose,
  onOpenFullManager,
}) => {
  const { currentTenant } = useTenant();
  const { currentUser } = useAuth();
  const isAndroidHost = isAndroidNativeHost();
  const [nativeStatus, setNativeStatus] = useState<NativeServerStatus | null>(null);
  const [status, setStatus] = useState<WebAccessStatusResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [quickAdmKey, setQuickAdmKey] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [startingNative, setStartingNative] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModalState = async () => {
    if (!currentTenant?.id) return;
    setError(null);
    try {
      if (isAndroidHost) {
        const ns = await refreshNativeServerStatus();
        setNativeStatus(ns);
        if (!ns?.running) {
          setStatus(null);
          setQrDataUrl('');
          return;
        }
      }
      const s = await fetchWebAccessStatus(currentTenant.id, currentUser?.id);
      setStatus(s);
      const targetUrl = s.urls[0] || `${window.location.origin}/?portal=web`;
      const qr = await fetchQrDataUrl(targetUrl, currentUser?.id);
      setQrDataUrl(qr);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (!msg.startsWith('NATIVE_SERVER_STOPPED:')) {
        setError(msg || 'Não foi possível obter status do servidor.');
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !currentTenant?.id) return;
    loadModalState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentTenant?.id, currentUser?.id]);

  if (!isOpen) return null;

  const nativeRunning = isAndroidHost ? Boolean(nativeStatus?.running) : Boolean(status);
  const savedPort = getSavedNativeServerPort();
  const targetUrl = status?.urls?.[0] || `${window.location.origin}/?portal=web`;

  const copy = (val: string, id: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartNativeFromModal = async () => {
    if (!currentTenant?.id) return;
    setStartingNative(true);
    setError(null);
    try {
      await startAndroidHostServer({
        port: savedPort,
        tenantId: currentTenant.id,
        userId: currentUser?.id,
        seedSnapshot: collectSyncableState(),
      });
      await loadModalState();
    } catch (err: any) {
      setError(err?.message || 'Erro ao iniciar servidor nativo.');
    } finally {
      setStartingNative(false);
    }
  };

  const handleGenerateAdmKey = async () => {
    if (!currentTenant?.id) return;
    try {
      const res = await generateWebAccessKey({
        tenantId: currentTenant.id,
        mode: 'admin',
        userId: currentUser?.id,
        expiresInHours: 24,
        activeUserId: currentUser?.id,
      });
      setQuickAdmKey(res.plainKey);
    } catch (err: any) {
      setError(err?.message || 'Falha ao gerar chave rápida.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {nativeRunning ? (
              <Wifi className="w-5 h-5 text-emerald-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-rose-400" />
            )}
            <div>
              <h2 className="text-base font-bold">Acesso pelo Navegador</h2>
              <p className="text-xs text-stone-300">
                {nativeRunning
                  ? `Servidor ativo na rede local (Porta ${status?.port || savedPort})`
                  : `Servidor Nativo Parado (Porta configurada: ${savedPort})`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {isAndroidHost && !nativeRunning ? (
            <div className="p-5 bg-stone-50 border border-stone-200 rounded-xl text-center space-y-3">
              <p className="text-sm font-bold text-stone-900">
                Servidor Web no celular ADM está desligado
              </p>
              <p className="text-xs text-stone-600 leading-relaxed">
                Inicie o servidor nativo para liberar o acesso de navegadores e vendedores na mesma rede Wi-Fi.
              </p>
              <button
                type="button"
                onClick={handleStartNativeFromModal}
                disabled={startingNative}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <Power className="w-4 h-4" />
                {startingNative ? 'Iniciando servidor...' : `Iniciar Servidor na Porta ${savedPort}`}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="w-28 h-28 rounded-xl border border-stone-200 bg-white flex items-center justify-center shrink-0 p-1">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code Acesso Web" className="w-full h-full object-contain" />
                  ) : (
                    <QrCode className="w-12 h-12 text-stone-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Endereço na Rede ({status?.primaryIp || 'localhost'})
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={targetUrl}
                      className="flex-1 min-h-[40px] px-2.5 bg-stone-50 border border-stone-200 rounded-lg font-mono text-xs text-stone-800"
                    />
                    <button
                      type="button"
                      onClick={() => copy(targetUrl, 'modal_url')}
                      className="min-h-[40px] px-3 bg-stone-900 text-white text-xs font-bold rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedId === 'modal_url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Copiar
                    </button>
                  </div>
                  <p className="text-xs text-stone-500 tabular-nums">
                    Sessões ativas: <strong>{status?.activeSessionsCount ?? 0}</strong> • Status:{' '}
                    <strong>{status?.webAccessEnabled ? 'Ativo' : 'Desativado'}</strong>
                  </p>
                </div>
              </div>

              {quickAdmKey ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-amber-900">Chave Temporária MODO ADM:</p>
                    <p className="font-mono text-base font-extrabold text-stone-900 mt-0.5">
                      {quickAdmKey}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(quickAdmKey, 'modal_key')}
                    className="min-h-[38px] px-3 bg-amber-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {copiedId === 'modal_key' ? 'Copiada!' : 'Copiar'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateAdmKey}
                  className="w-full min-h-[44px] border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-900 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  Gerar Chave Rápida (Modo Administrador)
                </button>
              )}
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-stone-200">
            {!isAndroidHost && (
              <a
                href={`${window.location.origin}/?portal=web`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Portal Web
              </a>
            )}
            {onOpenFullManager && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullManager();
                }}
                className="flex-1 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Gerenciar Servidor e Chaves
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
