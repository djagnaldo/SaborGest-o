/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Award, Target, TrendingUp, DollarSign, Receipt, CheckCircle2, Camera, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { getOrders } from '../../services/storage';
import { Order } from '../../types';
import { formatBRL, formatDateTimeBR } from '../../utils/formatters';

export const MySalesView: React.FC = () => {
  const { currentUser } = useAuth();
  const { currentTenant } = useTenant();
  const [viewingReceipt, setViewingReceipt] = useState<Order | null>(null);

  const allOrders = getOrders(currentTenant.id);
  // Filtrar pedidos atribuídos ao usuário atual
  const myOrders = allOrders.filter(
    (o) => o.waiterId === currentUser?.id || o.waiterName?.toLowerCase() === currentUser?.name?.toLowerCase()
  );

  const totalSold = myOrders.reduce((acc, o) => acc + (o.total || 0), 0);
  const commissionRate = currentUser?.commissionRate || 0;
  const commissionEarned = (totalSold * commissionRate) / 100;
  const monthlyTarget = currentUser?.salesTargetMonthly || 15000;
  const targetPercent = Math.min(Math.round((totalSold / (monthlyTarget || 1)) * 100), 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Minhas Vendas & Comissões
          </h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Área do Vendedor
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">
          Acompanhe seu desempenho individual, metas do mês e comissões acumuladas em tempo real.
        </p>
      </div>

      {/* Cards de Métricas do Vendedor */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Minhas Vendas Realizadas</span>
            <Receipt className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatBRL(totalSold)}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">
            {myOrders.length} atendimentos concluídos
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Comissão Acumulada</span>
            <DollarSign className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700">{formatBRL(commissionEarned)}</p>
          <p className="mt-1 text-[11px] text-stone-400">
            Taxa contratada: {commissionRate}% sobre vendas
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Progresso da Meta Mensal</span>
            <Target className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-2xl font-bold text-stone-900">{targetPercent}%</p>
            <span className="text-xs font-medium text-stone-400">Meta: {formatBRL(monthlyTarget)}</span>
          </div>
          {/* Barra de progresso */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-purple-600 transition-all duration-500"
              style={{ width: `${targetPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Histórico das Vendas do Vendedor */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 border-b border-stone-100 pb-3">
          Histórico dos Meus Pedidos Atendidos
        </h3>

        <div className="mt-3 divide-y divide-stone-100">
          {myOrders.length > 0 ? (
            myOrders.map((ord) => (
              <div key={ord.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-xs font-bold text-amber-800">
                    #{ord.orderNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-stone-900">
                        {ord.type === 'table' ? `Mesa ${ord.tableNumber}` : ord.type === 'comanda' ? `Comanda ${ord.comandaNumber || ord.orderNumber}` : 'Balcão'}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.2 text-[10px] text-stone-600 capitalize">
                        {ord.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400">
                      {formatDateTimeBR(ord.createdAt)} • {ord.items.length} itens
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
                      <span>Comprovante</span>
                    </button>
                  )}

                  <div className="text-right">
                    <p className="text-xs font-bold text-stone-900">{formatBRL(ord.total)}</p>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      +{formatBRL((ord.total * commissionRate) / 100)} comissão
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-xs text-stone-400">
              Você ainda não possui atendimentos finalizados atribuídos.
            </p>
          )}
        </div>
      </div>

      {/* Modal de Comprovante */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Comprovante de Venda</h3>
                <p className="text-xs text-stone-500">
                  Pedido #{viewingReceipt.orderNumber} • {formatBRL(viewingReceipt.total)}
                </p>
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
                <span>Registrado em:</span>
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
