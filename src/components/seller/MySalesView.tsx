/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Receipt,
  CheckCircle2,
  Clock,
  Camera,
  X,
  Calendar,
  User,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { getSellerSalesSummary } from '../../services/storage';
import { Order } from '../../types';
import { formatBRL, formatDateTimeBR, formatTimeBR } from '../../utils/formatters';

export const MySalesView: React.FC = () => {
  const { currentUser } = useAuth();
  const { currentTenant } = useTenant();

  const [summary, setSummary] = useState(
    getSellerSalesSummary(currentTenant.id, currentUser?.id, currentUser?.name)
  );
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'all'>('today');
  const [viewingReceipt, setViewingReceipt] = useState<Order | null>(null);

  const loadData = () => {
    setSummary(getSellerSalesSummary(currentTenant.id, currentUser?.id, currentUser?.name));
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id, currentUser?.id]);

  // Filtragem estrita dos pedidos do próprio vendedor
  const myOrders = summary.orders.filter((ord) => {
    if (filterPeriod === 'today') {
      const today = new Date().toDateString();
      const orderDate = new Date(ord.createdAt).toDateString();
      return today === orderDate;
    }
    return true;
  });

  const periodSold = myOrders
    .filter((o) => o.paid)
    .reduce((acc, o) => acc + (o.total || 0), 0);

  const periodCount = myOrders.filter((o) => o.paid).length;
  const inProgressOrders = myOrders.filter(
    (o) => o.status === 'received' || o.status === 'preparing' || o.status === 'ready'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Minhas Vendas
            </h1>
            <span className="text-xs text-stone-500 font-medium">
              · {currentUser?.name}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Acompanhamento individual dos seus atendimentos e histórico de pedidos realizados.
          </p>
        </div>

        {/* Filtro de Período (Hoje vs Todo o Histórico) */}
        <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1 border border-stone-200">
          <button
            onClick={() => setFilterPeriod('today')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filterPeriod === 'today'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setFilterPeriod('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filterPeriod === 'all'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Histórico Completo
          </button>
        </div>
      </div>

      {/* 3 Métricas Individuais do Vendedor (Sem dados globais da loja, sem comissões ou metas) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Valor Total Vendido por Mim
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900 sm:text-3xl">
            {formatBRL(periodSold)}
          </p>
          <span className="text-[11px] text-emerald-700 font-semibold">
            {filterPeriod === 'today' ? 'Vendas concluídas hoje' : 'Total acumulado'}
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Quantidade de Vendas Realizadas
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900 sm:text-3xl">
            {periodCount}
          </p>
          <span className="text-[11px] text-stone-500 font-medium">
            Pedidos confirmados
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Atendimentos em Andamento
          </span>
          <p className="mt-1 text-2xl font-black text-amber-700 sm:text-3xl">
            {inProgressOrders.length}
          </p>
          <span className="text-[11px] text-amber-800 font-medium">
            Sob sua responsabilidade no salão
          </span>
        </div>
      </div>

      {/* Histórico das Minhas Vendas */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
            Histórico dos Meus Pedidos
          </h2>
          <span className="text-[11px] text-stone-400">
            {myOrders.length} pedido(s) listado(s)
          </span>
        </div>

        <div className="divide-y divide-stone-100">
          {myOrders.length > 0 ? (
            myOrders.map((ord) => {
              const modalityLabel =
                ord.type === 'table'
                  ? `Mesa ${ord.tableNumber || ''}`
                  : ord.type === 'comanda'
                  ? `Comanda ${ord.comandaNumber || ord.orderNumber}`
                  : 'Balcão';

              const paymentMethodLabel = ord.payments[0]?.method
                ? ord.payments[0].method.toUpperCase()
                : 'Pendente';

              return (
                <div key={ord.id} className="flex items-center justify-between p-4 hover:bg-stone-50/70 transition">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-xs font-black text-amber-900 shrink-0">
                      #{ord.orderNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-stone-900">
                          {modalityLabel}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            ord.paid
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {ord.paid ? 'Pago' : 'Em Aberto'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {formatDateTimeBR(ord.createdAt)} · {ord.items.length} itens · {paymentMethodLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {(ord.receiptImageUrl || ord.payments[0]?.receiptImageUrl) && (
                      <button
                        onClick={() => setViewingReceipt(ord)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-1"
                        title="Ver comprovante fotográfico"
                      >
                        <Camera className="h-3 w-3 text-emerald-600" />
                        <span className="hidden sm:inline">Comprovante</span>
                      </button>
                    )}

                    <div className="text-right">
                      <p className="font-mono text-sm font-black text-stone-900">
                        {formatBRL(ord.total)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-stone-400">
              <Receipt className="mx-auto h-10 w-10 text-stone-300" />
              <p className="mt-2 text-xs font-semibold text-stone-600">
                Você ainda não possui atendimentos registrados neste período.
              </p>
              <p className="text-[10px] text-stone-400">
                Inicie um novo atendimento pelo PDV ou nas mesas do salão.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Comprovante Fotográfico */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Comprovante do Pedido #{viewingReceipt.orderNumber}</h3>
                <p className="text-xs text-stone-500">{formatBRL(viewingReceipt.total)}</p>
              </div>
              <button
                onClick={() => setViewingReceipt(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 flex items-center justify-center max-h-64">
              <img
                src={viewingReceipt.receiptImageUrl || viewingReceipt.payments[0]?.receiptImageUrl}
                alt="Comprovante"
                className="max-h-64 w-auto object-contain"
              />
            </div>

            <div className="mt-3 rounded-xl bg-stone-50 p-2.5 text-xs text-stone-600 border border-stone-200 space-y-1">
              <div className="flex justify-between">
                <span>Forma:</span>
                <strong className="uppercase">{viewingReceipt.payments[0]?.method}</strong>
              </div>
              <div className="flex justify-between">
                <span>Data:</span>
                <strong>{formatDateTimeBR(viewingReceipt.receiptCapturedAt || viewingReceipt.createdAt)}</strong>
              </div>
            </div>

            <button
              onClick={() => setViewingReceipt(null)}
              className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
