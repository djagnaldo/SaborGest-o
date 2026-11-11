/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Monitor,
  Wifi,
  Globe,
  KeyRound,
  CheckCircle2,
  Copy,
  ExternalLink,
  X,
  QrCode,
  ShieldCheck,
  Server,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { getMatrizInfo } from '../../services/local-db';

interface PcBrowserAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToPcView?: () => void;
}

export const PcBrowserAccessModal: React.FC<PcBrowserAccessModalProps> = ({
  isOpen,
  onClose,
  onSwitchToPcView,
}) => {
  const matriz = getMatrizInfo();
  const [serverEnabled, setServerEnabled] = useState(true);
  const [pairingPin, setPairingPin] = useState('8492');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const localUrl = `http://${matriz.ipAddress}:3000`;

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(localUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegeneratePin = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPairingPin(newPin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-xs">
              <Monitor className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase text-stone-900 sm:text-lg">
                ACESSO ADMINISTRATIVO PELO NAVEGADOR DO PC
              </h3>
              <p className="text-xs text-stone-500">
                O celular Android do ADM atua como servidor local na rede Wi-Fi.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Controle Liga/Desliga do Acesso pelo Navegador */}
        <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-stone-900">Servidor Web para Computadores</p>
              <p className="text-xs text-stone-500">
                Permite conexões de PCs e notebooks na mesma rede local
              </p>
            </div>
            <button
              onClick={() => setServerEnabled(!serverEnabled)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
                serverEnabled
                  ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                  : 'border border-stone-300 bg-stone-200 text-stone-600 hover:bg-stone-300'
              }`}
            >
              {serverEnabled ? (
                <>
                  <span>[ LIGADO</span>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  <span>]</span>
                </>
              ) : (
                <span>[ DESLIGADO ]</span>
              )}
            </button>
          </div>
        </div>

        {serverEnabled ? (
          <div className="mt-4 space-y-4">
            {/* Endereço de Acesso */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                Endereço para digitar no navegador do Computador:
              </span>
              <div className="mt-1.5 flex items-center justify-between rounded-xl bg-white border border-amber-300 px-3.5 py-2.5 shadow-2xs">
                <span className="font-mono text-sm font-black text-stone-900 select-all">
                  {localUrl}
                </span>
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 transition"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-amber-900">
                Abra o <strong>Google Chrome, Edge ou Firefox</strong> no seu computador e acesse esse endereço.
              </p>
            </div>

            {/* PIN de Segurança e Pareamento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-600">PIN de Pareamento</span>
                  <button
                    onClick={handleRegeneratePin}
                    className="text-stone-400 hover:text-stone-700"
                    title="Gerar novo PIN"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1 font-mono text-2xl font-black tracking-widest text-stone-900">
                  {pairingPin}
                </p>
                <p className="text-[10px] text-stone-400">Solicitado no primeiro acesso do PC</p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 flex flex-col justify-between">
                <div className="flex items-center gap-1 text-xs font-semibold text-stone-600">
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Rede Local Wi-Fi</span>
                </div>
                <p className="text-xs font-bold text-stone-800">Mesma rede do Celular</p>
                <span className="text-[10px] text-emerald-700 font-semibold">● Servidor Ativo</span>
              </div>
            </div>

            {/* Botão de Teste / Simulação da Interface de Computador no Preview */}
            {onSwitchToPcView && (
              <button
                type="button"
                onClick={() => {
                  onSwitchToPcView();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-stone-800 shadow-md transition active:scale-98"
              >
                <Monitor className="h-4 w-4 text-amber-400" />
                <span>Visualizar Interface Adaptada do Computador</span>
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-xs text-rose-800">
            <p className="font-bold">Acesso pelo navegador do PC está DESLIGADO.</p>
            <p className="mt-1 text-stone-500">
              Ligue o servidor acima para permitir que computadores acessem o sistema pela rede local.
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-stone-100 pt-3 text-center">
          <p className="text-[11px] text-stone-400">
            O computador acessa a Matriz em tempo real. Toda alteração de preços, estoque e vendas reflete imediatamente no celular do Administrador.
          </p>
        </div>
      </div>
    </div>
  );
};
