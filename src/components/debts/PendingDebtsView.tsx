/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  User,
  Phone,
  DollarSign,
  AlertCircle,
  Receipt,
  History,
  X,
  CreditCard,
  Banknote,
  QrCode,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { DebtRecord } from '../../types';
import { getDebts, settleDebt } from '../../services/storage';
import { formatBRL, formatDateTimeBR } from '../../utils/formatters';

export const PendingDebtsView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { isAdm, currentUser } = useAuth();

  const [debts, setDebts] = useState<DebtRecord[]>(getDebts(currentTenant.id));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'parcial' | 'quitado'>('all');

  // Modal de Baixa / Recebimento
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<'dinheiro' | 'pix'>('pix');
  const [settleNotes, setSettleNotes] = useState('');

  const refreshDebts = () => {
    setDebts(getDebts(currentTenant.id));
  };

  const handleOpenSettleModal = (debt: DebtRecord) => {
    setSelectedDebt(debt);
    setSettleAmount(debt.remainingAmount);
    setSettleMethod('pix');
    setSettleNotes('');
  };

  const handleConfirmSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt || settleAmount <= 0) return;

    settleDebt(
      selectedDebt.id,
      settleAmount,
      settleMethod,
      settleNotes || 'Recebimento de fiado no caixa',
      currentUser?.name || 'Administrador'
    );

    setSelectedDebt(null);
    refreshDebts();
  };

  // Filtros
  const filteredDebts = debts.filter((d) => {
    const matchesSearch =
      d.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.customerPhone && d.customerPhone.includes(searchTerm)) ||
      (d.customerCpf && d.customerCpf.includes(searchTerm)) ||
      String(d.orderNumber).includes(searchTerm);

    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Métricas
  const totalPending = debts
    .filter((d) => d.status !== 'quitado')
    .reduce((acc, d) => acc + d.remainingAmount, 0);

  const totalSettled = debts.reduce((acc, d) => acc + d.amountPaid, 0);
  const pendingCount = debts.filter((d) => d.status !== 'quitado').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Fiado e Pendências Financeiras
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Controle Rigoroso
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Histórico completo de vendas a prazo (DEVENDO), clientes com débitos em aberto e quitações registradas pelo ADM.
          </p>
        </div>

        {!isAdm && (
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Vendedores não podem dar baixa ou excluir pendências.</span>
          </div>
        )}
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/50 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-xs font-bold uppercase tracking-wider">Total em Aberto (Fiado)</span>
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="mt-2 text-2xl font-black text-rose-900">{formatBRL(totalPending)}</p>
          <p className="mt-1 text-[11px] text-rose-700 font-medium">
            {pendingCount} cliente(s) com dívida ativa
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Já Quitado</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{formatBRL(totalSettled)}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">
            Valores recebidos e creditados no caixa
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total de Registros</span>
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-stone-900">{debts.length}</p>
          <p className="mt-1 text-[11px] text-stone-400">Histórico permanente mantido</p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'Todos os Registros' },
            { id: 'pendente', label: 'Pendentes' },
            { id: 'parcial', label: 'Parciais' },
            { id: 'quitado', label: 'Quitados' },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id as any)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === st.id
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[280px]">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, telefone ou pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-stone-50/50 py-1.5 pl-9 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Listagem de Pendências */}
      <div className="space-y-3">
        {filteredDebts.length > 0 ? (
          filteredDebts.map((debt) => (
            <div
              key={debt.id}
              className={`rounded-2xl border p-4.5 transition ${
                debt.status === 'quitado'
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : debt.status === 'parcial'
                  ? 'border-blue-200 bg-blue-50/30'
                  : 'border-rose-200 bg-white shadow-xs'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-stone-900">{debt.customerName}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        debt.status === 'quitado'
                          ? 'bg-emerald-100 text-emerald-800'
                          : debt.status === 'parcial'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {debt.status}
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                      Pedido #{debt.orderNumber}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    {debt.customerPhone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-stone-400" /> {debt.customerPhone}
                      </span>
                    )}
                    {debt.customerCpf && <span>CPF: {debt.customerCpf}</span>}
                    {debt.customerAddress && <span>• {debt.customerAddress}</span>}
                  </div>

                  <div className="mt-2 text-xs text-stone-600">
                    <span className="font-semibold text-stone-700">Observações do Vendedor: </span>
                    <span className="italic">{debt.notes}</span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                    <span>Vendedor: <strong>{debt.sellerName}</strong></span>
                    <span>• {formatDateTimeBR(debt.createdAt)}</span>
                  </div>
                </div>

                {/* Bloco de Valores & Ação do ADM */}
                <div className="flex flex-col items-start sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-2 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] uppercase font-semibold text-stone-400">
                      Saldo Restante a Receber
                    </span>
                    <p
                      className={`text-xl font-black ${
                        debt.status === 'quitado' ? 'text-emerald-700 line-through' : 'text-rose-700'
                      }`}
                    >
                      {formatBRL(debt.remainingAmount)}
                    </p>
                    <p className="text-[11px] text-stone-500">
                      Original: {formatBRL(debt.amount)}{' '}
                      {debt.amountPaid > 0 && `• Já pago: ${formatBRL(debt.amountPaid)}`}
                    </p>
                  </div>

                  {debt.status !== 'quitado' && isAdm && (
                    <button
                      onClick={() => handleOpenSettleModal(debt)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Receber / Dar Baixa
                    </button>
                  )}
                </div>
              </div>

              {/* Histórico de Recebimentos Parciais */}
              {debt.settlementHistory && debt.settlementHistory.length > 0 && (
                <div className="mt-3 border-t border-stone-200/60 pt-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                    <History className="h-3 w-3" /> Histórico de Recebimentos:
                  </span>
                  <div className="mt-1.5 space-y-1">
                    {debt.settlementHistory.map((sh) => (
                      <div
                        key={sh.id}
                        className="flex items-center justify-between rounded-lg bg-stone-50 px-2.5 py-1 text-[11px] text-stone-700"
                      >
                        <span>
                          Recebido por <strong>{sh.receivedBy}</strong> via{' '}
                          <strong className="uppercase">{sh.paymentMethod}</strong> ({formatDateTimeBR(sh.date)})
                          {sh.notes ? ` - ${sh.notes}` : ''}
                        </span>
                        <span className="font-bold text-emerald-700">+{formatBRL(sh.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-400">
            <FileText className="mx-auto h-8 w-8 text-stone-300" />
            <p className="mt-2 text-xs font-semibold">Nenhuma pendência encontrada com os filtros selecionados.</p>
          </div>
        )}
      </div>

      {/* Modal para o Administrador Dar Baixa na Dívida */}
      {selectedDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-base">Registrar Recebimento de Fiado</h3>
                <p className="text-xs text-stone-500">Cliente: {selectedDebt.customerName}</p>
              </div>
              <button
                onClick={() => setSelectedDebt(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSettle} className="mt-4 space-y-4">
              <div className="rounded-xl bg-amber-50 p-3 border border-amber-200">
                <span className="text-xs text-amber-800">Saldo Restante Atual:</span>
                <p className="text-xl font-black text-amber-950">{formatBRL(selectedDebt.remainingAmount)}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Valor Sendo Pago Agora (R$) *
                </label>
                <input
                  type="number"
                  step="0.50"
                  max={selectedDebt.remainingAmount}
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-bold text-stone-900 focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-stone-400">
                  Permite quitação total ou amortização parcial da dívida.
                </p>
              </div>

              {/* Forma de Pagamento Exclusiva: DINHEIRO ou PIX */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Forma de Recebimento *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleMethod('dinheiro')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                      settleMethod === 'dinheiro'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Banknote className="h-4 w-4 text-emerald-600" />
                    1. DINHEIRO
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettleMethod('pix')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                      settleMethod === 'pix'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <QrCode className="h-4 w-4 text-emerald-600" />
                    2. PIX
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Observações do Recebimento</label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Ex: Pago no balcão em espécie com comprovante"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedDebt(null)}
                  className="w-1/2 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Confirmar Baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
