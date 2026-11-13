/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  WalletCards,
  ArrowDownRight,
  ArrowUpRight,
  Lock,
  Unlock,
  AlertCircle,
  Clock,
  DollarSign,
  CheckCircle2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { CashRegisterSession } from '../../types';
import { getCashSessions, saveCashSession, addAuditLog } from '../../services/storage';
import { formatBRL, formatDateTimeBR } from '../../utils/formatters';

export const CashRegisterView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [sessions, setSessions] = useState<CashRegisterSession[]>(getCashSessions(currentTenant.id));
  const currentSession = sessions.find((s) => s.status === 'open') || null;

  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);

  const [amountInput, setAmountInput] = useState<number>(0);
  const [reasonInput, setReasonInput] = useState('');
  const [countedInput, setCountedInput] = useState<number>(0);

  const refreshSessions = () => {
    setSessions(getCashSessions(currentTenant.id));
  };

  const handleOpenCash = () => {
    const newSession: CashRegisterSession = {
      id: `cash-${Date.now()}`,
      tenantId: currentTenant.id,
      openedBy: currentUser?.id || 'caixa',
      openedByName: currentUser?.name || 'Operador',
      openedAt: new Date().toISOString(),
      status: 'open',
      initialAmount: amountInput,
      totalCash: 0,
      totalPix: 0,
      totalDevendo: 0,
      totalWithdrawals: 0,
      totalDeposits: 0,
      expectedAmount: amountInput,
      notes: reasonInput || 'Abertura de turno normal',
      isDemo: false,
    };

    saveCashSession(newSession);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'caixa',
      userName: currentUser?.name || 'Operador',
      action: 'ABERTURA_CAIXA',
      details: `Abriu sessão de caixa com saldo inicial de ${formatBRL(amountInput)}`,
    });
    setIsOpenModalOpen(false);
    setAmountInput(0);
    setReasonInput('');
    refreshSessions();
  };

  const handleWithdrawal = () => {
    if (!currentSession || amountInput <= 0) return;
    const updated: CashRegisterSession = {
      ...currentSession,
      totalWithdrawals: (currentSession.totalWithdrawals || 0) + amountInput,
      expectedAmount: currentSession.expectedAmount - amountInput,
    };
    saveCashSession(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'caixa',
      userName: currentUser?.name || 'Operador',
      action: 'SANGRIA_CAIXA',
      details: `Sangria de ${formatBRL(amountInput)}. Motivo: ${reasonInput || 'Não informado'}`,
    });
    setIsWithdrawModalOpen(false);
    setAmountInput(0);
    setReasonInput('');
    refreshSessions();
  };

  const handleDeposit = () => {
    if (!currentSession || amountInput <= 0) return;
    const updated: CashRegisterSession = {
      ...currentSession,
      totalDeposits: (currentSession.totalDeposits || 0) + amountInput,
      expectedAmount: currentSession.expectedAmount + amountInput,
    };
    saveCashSession(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'caixa',
      userName: currentUser?.name || 'Operador',
      action: 'REFORCO_CAIXA',
      details: `Reforço/Suprimento de ${formatBRL(amountInput)}. Motivo: ${reasonInput || 'Troco adicional'}`,
    });
    setIsDepositModalOpen(false);
    setAmountInput(0);
    setReasonInput('');
    refreshSessions();
  };

  const handleCloseCash = () => {
    if (!currentSession) return;
    const diff = countedInput - currentSession.expectedAmount;

    const closed: CashRegisterSession = {
      ...currentSession,
      status: 'closed',
      closedBy: currentUser?.id,
      closedByName: currentUser?.name,
      closedAt: new Date().toISOString(),
      countedAmount: countedInput,
      discrepancy: diff,
      notes: reasonInput || `Fechamento com diferença de ${formatBRL(diff)}`,
    };

    saveCashSession(closed);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'caixa',
      userName: currentUser?.name || 'Operador',
      action: 'FECHAMENTO_CAIXA',
      details: `Fechou o caixa. Esperado: ${formatBRL(currentSession.expectedAmount)} | Contado: ${formatBRL(countedInput)} | Dif: ${formatBRL(diff)}`,
    });

    setIsCloseModalOpen(false);
    setCountedInput(0);
    setReasonInput('');
    refreshSessions();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Controle de Caixa & Turnos
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Etapa 5 Integrada
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Abertura, fechamento cego, sangria, reforço e conferência de valores esperados vs. contados.
          </p>
        </div>

        {currentSession ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsWithdrawModalOpen(true)}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              Sangria (Retirada)
            </button>
            <button
              onClick={() => setIsDepositModalOpen(true)}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
            >
              Reforço (Suprimento)
            </button>
            <button
              onClick={() => setIsCloseModalOpen(true)}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 transition"
            >
              Fechar Caixa
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpenModalOpen(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            Abrir Sessão de Caixa
          </button>
        )}
      </div>

      {/* Card da Sessão Ativa */}
      {currentSession ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-2xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Unlock className="h-5 w-5" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Caixa Aberto
                </span>
                <p className="text-xs text-stone-500">
                  Operador: <strong className="text-stone-800">{currentSession.openedByName}</strong> · Desde{' '}
                  {formatDateTimeBR(currentSession.openedAt)}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-stone-400">Saldo Calculado em Gaveta (Espécie)</span>
              <p className="text-2xl font-black text-stone-900 tabular-nums">
                {formatBRL(currentSession.expectedAmount)}
              </p>
            </div>
          </div>

          {/* Grid de Totais do Caixa Geral: Recebimentos, Despesas e Saldo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl bg-stone-50 p-3 border border-stone-200/60">
              <span className="text-[10px] font-semibold text-stone-500 uppercase">Fundo Inicial</span>
              <p className="mt-1 text-sm font-bold text-stone-800">{formatBRL(currentSession.initialAmount)}</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3 border border-stone-200/60">
              <span className="text-[10px] font-semibold text-stone-500 uppercase">Recebimentos (Dinheiro)</span>
              <p className="mt-1 text-sm font-bold text-stone-800">{formatBRL(currentSession.totalCash)}</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3 border border-stone-200/60">
              <span className="text-[10px] font-semibold text-stone-500 uppercase">Recebimentos (PIX)</span>
              <p className="mt-1 text-sm font-bold text-emerald-700">{formatBRL(currentSession.totalPix)}</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 border border-rose-200/60">
              <span className="text-[10px] font-semibold text-rose-800 uppercase">Despesas / Gastos (Dinheiro)</span>
              <p className="mt-1 text-sm font-bold text-rose-700">-{formatBRL(currentSession.totalWithdrawals)}</p>
            </div>
            <div className="rounded-xl bg-stone-900 p-3 border border-stone-800 text-white">
              <span className="text-[10px] font-semibold text-stone-300 uppercase">Saldo Calculado</span>
              <p className="mt-1 text-sm font-black text-white">{formatBRL(currentSession.expectedAmount)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center space-y-3">
          <Lock className="mx-auto h-10 w-10 text-stone-400" />
          <h3 className="font-bold text-stone-800 text-base">Caixa Fechado</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Não há nenhum turno de caixa ativo no momento. Abra uma nova sessão com o troco inicial para registrar operações em dinheiro.
          </p>
          <button
            onClick={() => setIsOpenModalOpen(true)}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
          >
            Abrir Caixa Agora
          </button>
        </div>
      )}

      {/* Histórico de Sessões Anteriores */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 border-b border-stone-100 pb-3">
          Histórico de Fechamentos de Caixa
        </h3>

        <div className="mt-3 divide-y divide-stone-100">
          {sessions.map((sess) => (
            <div key={sess.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-900">{sess.openedByName}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${
                      sess.status === 'open'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {sess.status === 'open' ? 'Aberto' : 'Fechado'}
                  </span>
                </div>
                <p className="text-[11px] text-stone-400">
                  Aberto em: {formatDateTimeBR(sess.openedAt)}{' '}
                  {sess.closedAt ? `• Fechado em: ${formatDateTimeBR(sess.closedAt)}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[10px] text-stone-400">Esperado</span>
                  <p className="text-xs font-bold text-stone-800">{formatBRL(sess.expectedAmount)}</p>
                </div>
                {sess.countedAmount !== undefined && (
                  <div>
                    <span className="text-[10px] text-stone-400">Contado</span>
                    <p className="text-xs font-bold text-stone-800">{formatBRL(sess.countedAmount)}</p>
                  </div>
                )}
                {sess.discrepancy !== undefined && (
                  <div>
                    <span className="text-[10px] text-stone-400">Diferença</span>
                    <p
                      className={`text-xs font-bold ${
                        sess.discrepancy === 0
                          ? 'text-emerald-600'
                          : sess.discrepancy > 0
                          ? 'text-blue-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {formatBRL(sess.discrepancy)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modais de Operação */}
      {isOpenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-stone-900 text-base">Abertura de Caixa</h3>
            <p className="text-xs text-stone-500">Informe o valor inicial de troco para o turno</p>
            <div className="mt-3">
              <label className="block text-xs font-semibold text-stone-700">Troco Inicial (R$)</label>
              <input
                type="number"
                step="10"
                value={amountInput || ''}
                onChange={(e) => setAmountInput(parseFloat(e.target.value) || 0)}
                placeholder="Ex: 200,00"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setIsOpenModalOpen(false)}
                className="w-1/2 rounded-xl border border-stone-200 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleOpenCash}
                className="w-1/2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Abrir Turno
              </button>
            </div>
          </div>
        </div>
      )}

      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-stone-900 text-base">Sangria de Caixa</h3>
            <p className="text-xs text-stone-500">Retirada de dinheiro da gaveta</p>
            <div className="mt-3 space-y-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Valor da Retirada (R$)</label>
                <input
                  type="number"
                  step="5"
                  value={amountInput || ''}
                  onChange={(e) => setAmountInput(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 50,00"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Motivo / Destino</label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Ex: Compra de gelo ou suprimentos"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setIsWithdrawModalOpen(false)}
                className="w-1/2 rounded-xl border border-stone-200 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleWithdrawal}
                className="w-1/2 rounded-xl bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmar Sangria
              </button>
            </div>
          </div>
        </div>
      )}

      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-stone-900 text-base">Reforço de Caixa</h3>
            <p className="text-xs text-stone-500">Adição de troco ou suprimento na gaveta</p>
            <div className="mt-3 space-y-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Valor do Reforço (R$)</label>
                <input
                  type="number"
                  step="10"
                  value={amountInput || ''}
                  onChange={(e) => setAmountInput(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 100,00"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Origem / Motivo</label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Ex: Troco moedas banco"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="w-1/2 rounded-xl border border-stone-200 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeposit}
                className="w-1/2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Confirmar Reforço
              </button>
            </div>
          </div>
        </div>
      )}

      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-stone-900 text-base">Fechamento de Caixa</h3>
            <p className="text-xs text-stone-500">Conferência cega: digite o dinheiro físico contado na gaveta</p>
            <div className="mt-3">
              <label className="block text-xs font-semibold text-stone-700">Valor Contado em Gaveta (R$)</label>
              <input
                type="number"
                step="1"
                value={countedInput || ''}
                onChange={(e) => setCountedInput(parseFloat(e.target.value) || 0)}
                placeholder="Ex: 270,00"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="w-1/2 rounded-xl border border-stone-200 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseCash}
                className="w-1/2 rounded-xl bg-stone-900 py-2 text-xs font-bold text-white hover:bg-stone-800"
              >
                Finalizar Turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
