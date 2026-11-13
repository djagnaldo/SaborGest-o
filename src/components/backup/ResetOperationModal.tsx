/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FolderArchive,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { ResetOperationOptions } from '../../types';
import { executeResetOperation } from '../../services/storage';

interface ResetOperationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResetOperationModal: React.FC<ResetOperationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [options, setOptions] = useState<ResetOperationOptions>({
    resetTables: true,
    resetProducts: false,
    resetStock: true,
    resetSales: true,
    resetExpenses: true,
    resetMovements: true,
    createBackupFirst: true,
    confirmationText: '',
    reason: 'Início de novo ciclo / período operacional',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  if (!isAdm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-rose-600 mb-2" />
          <h3 className="font-bold text-stone-900">Acesso Restrito ao Administrador</h3>
          <p className="text-xs text-stone-500 mt-1 mb-4">
            Apenas o ADM possui permissão para executar a reinicialização de operações.
          </p>
          <button
            onClick={onClose}
            className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const handleToggle = (key: keyof ResetOperationOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg(null);

    if (options.confirmationText.trim() !== 'CONFIRMAR REINICIO') {
      setErrorMsg('Digite exatamente "CONFIRMAR REINICIO" em letras maiúsculas para prosseguir.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = executeResetOperation(
        currentTenant.id,
        options,
        { id: currentUser.id, name: currentUser.name }
      );

      if (res.success) {
        onSuccess();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(`Erro na execução: ${err?.message || 'Falha desconhecida'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900">Reiniciar Operação & Novo Ciclo</h2>
              <p className="text-xs text-stone-500">
                Limpe dados operacionais selecionados sem perder balanços anteriores
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold">
            ✕
          </button>
        </div>

        <form onSubmit={handleExecute} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Passo 1: Backup Automático Obrigatório */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-950">
            <label className="flex items-start gap-2.5 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={options.createBackupFirst}
                onChange={() => handleToggle('createBackupFirst')}
                className="mt-0.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Criar cópia de segurança (backup) antes de reiniciar
                </span>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Gera automaticamente um ponto de restauração com todos os produtos, fotos, vendas e estoques atuais.
                </p>
              </div>
            </label>
          </div>

          {/* Passo 2: O que deseja reiniciar */}
          <div className="space-y-2">
            <span className="font-bold uppercase tracking-wider text-stone-500 text-[10px]">
              Selecione o que deseja reiniciar:
            </span>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resetTables}
                  onChange={() => handleToggle('resetTables')}
                  className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Mesas & Atendimento</p>
                  <p className="text-[10px] text-stone-500">Libera mesas e zera contas em aberto</p>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resetStock}
                  onChange={() => handleToggle('resetStock')}
                  className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Quantidades de Estoque</p>
                  <p className="text-[10px] text-stone-500">Zera saldos para nova contagem de inventário</p>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resetSales}
                  onChange={() => handleToggle('resetSales')}
                  className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Vendas Operacionais</p>
                  <p className="text-[10px] text-stone-500">Limpa pedidos diários da fila do caixa</p>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resetExpenses}
                  onChange={() => handleToggle('resetExpenses')}
                  className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Despesas do Período</p>
                  <p className="text-[10px] text-stone-500">Limpa gastos diários da rotina</p>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resetMovements}
                  onChange={() => handleToggle('resetMovements')}
                  className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Movimentações de Estoque</p>
                  <p className="text-[10px] text-stone-500">Limpa histórico operacional recente</p>
                </div>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 hover:bg-amber-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resetProducts}
                  onChange={() => handleToggle('resetProducts')}
                  className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Catálogo de Produtos</p>
                  <p className="text-[10px] text-stone-500">Limpa cardápio para recadastrar do zero</p>
                </div>
              </label>
            </div>
          </div>

          {/* Passo 3: O que permanecerá preservado */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-blue-950">
            <span className="font-bold flex items-center gap-1.5 text-blue-900 mb-1">
              <FolderArchive className="h-4 w-4 text-blue-600" />
              O que permanecerá 100% PRESERVADO (Imutável):
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-blue-800">
              <li>Todos os Balanços e Relatórios salvos anteriormente</li>
              <li>Todos os Períodos Históricos arquivados com preços e valores da época</li>
              <li>Todas as Cópias de Segurança (Backups) criadas</li>
              <li>Configurações de funcionários, usuários e permissões da equipe</li>
              <li>Trilha completa de auditoria e segurança</li>
            </ul>
          </div>

          {/* Passo 4: Motivo opcional */}
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-1">
              Motivo do Reinício Operacional:
            </label>
            <input
              type="text"
              value={options.reason}
              onChange={(e) => setOptions({ ...options, reason: e.target.value })}
              className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900 focus:border-rose-500 focus:outline-hidden"
              placeholder="Ex: Abertura de novo mês, reforma de cardápio, virada de exercício"
            />
          </div>

          {/* Passo 5: Confirmação Explícita Obrigatória */}
          <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3.5 space-y-2">
            <span className="font-bold text-rose-900 flex items-center gap-1.5 text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Confirmação de Segurança do ADM:
            </span>
            <p className="text-[11px] text-rose-800">
              Para autorizar, digite exatamente <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-300">CONFIRMAR REINICIO</strong> no campo abaixo:
            </p>
            <input
              type="text"
              value={options.confirmationText}
              onChange={(e) => setOptions({ ...options, confirmationText: e.target.value })}
              className="w-full rounded-xl border border-rose-300 bg-white p-2.5 font-mono text-xs font-bold text-rose-950 focus:border-rose-600 focus:outline-hidden"
              placeholder="CONFIRMAR REINICIO"
              autoComplete="off"
            />
          </div>

          {/* Footer com botões */}
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing || options.confirmationText.trim() !== 'CONFIRMAR REINICIO'}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40 transition shadow-xs"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{isProcessing ? 'Executando Reinício...' : 'Autorizar e Reiniciar Operação'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
