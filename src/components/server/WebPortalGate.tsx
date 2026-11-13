/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KeyRound, ShieldCheck, UserCheck, AlertTriangle, ArrowRight, Wifi } from 'lucide-react';
import { loginWithWebKey } from '../../services/sync-client';

interface WebPortalGateProps {
  revokedMessage?: string | null;
  onClearRevoked?: () => void;
  onExitPortalMode?: () => void;
}

export const WebPortalGate: React.FC<WebPortalGateProps> = ({
  revokedMessage,
  onClearRevoked,
  onExitPortalMode,
}) => {
  const [accessKey, setAccessKey] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    onClearRevoked?.();
    if (!accessKey.trim()) {
      setError('Digite a chave de acesso fornecida pelo Administrador da Matriz.');
      return;
    }

    setLoading(true);
    try {
      await loginWithWebKey(accessKey.trim(), deviceLabel.trim() || undefined);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível validar a chave de acesso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden">
        <div className="bg-stone-900 px-6 py-6 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                SaborGestão Web
              </p>
              <h1 className="text-xl font-extrabold mt-1">Acesso pelo Navegador</h1>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Wifi className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-stone-300 mt-2 leading-relaxed">
            Conecte-se em tempo real ao sistema usando a Chave de Acesso gerada pelo Administrador.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {revokedMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-sm text-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Sessão Encerrada</p>
                <p className="text-xs mt-0.5 text-rose-700">{revokedMessage}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <div className="flex items-center gap-1.5 font-bold text-stone-800">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Modo Administrador
              </div>
              <p className="text-stone-500 mt-1 leading-snug">
                Controle total sincronizado com a Matriz.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <div className="flex items-center gap-1.5 font-bold text-stone-800">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                Modo Vendedor
              </div>
              <p className="text-stone-500 mt-1 leading-snug">
                Apenas vendas, mesas e catálogo autorizados.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                Chave de Acesso
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value.toUpperCase())}
                  placeholder="Ex: SG-ADM-4F2A-9C10"
                  autoComplete="off"
                  className="w-full min-h-[48px] pl-10 pr-4 bg-stone-50 border border-stone-300 rounded-xl font-mono text-sm font-bold text-stone-900 tracking-wide focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                Identificação deste Dispositivo (Opcional)
              </label>
              <input
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="Ex: Notebook Balcão, Tablet Salão..."
                className="w-full min-h-[44px] px-3.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] bg-amber-600 hover:bg-amber-700 disabled:bg-stone-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{loading ? 'Validando chave...' : 'Conectar ao SaborGestão'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {onExitPortalMode && (
            <button
              type="button"
              onClick={onExitPortalMode}
              className="w-full min-h-[44px] text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
            >
              Voltar ao terminal Matriz local
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
