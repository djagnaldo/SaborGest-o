/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Wallet,
  Receipt,
  Calendar,
  Building2,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { getOrders, getExpenses, getOrderProductSalesTotal, getOrderExtraTotal } from '../../services/storage';
import { formatBRL } from '../../utils/formatters';

export const FinancialView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { isAdm } = useAuth();

  const [orders, setOrders] = useState(getOrders(currentTenant.id));
  const [expenses, setExpenses] = useState(getExpenses(currentTenant.id));

  const loadData = () => {
    setOrders(getOrders(currentTenant.id));
    setExpenses(getExpenses(currentTenant.id));
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  // Receitas Reais das Vendas de Produtos (exclui valores extras de mesa)
  const paidOrders = orders.filter((o) => o.paid && o.status !== 'cancelled');
  const totalRevenue = paidOrders.reduce((acc, o) => acc + getOrderProductSalesTotal(o), 0);
  const totalExtraRecovered = paidOrders.reduce((acc, o) => acc + getOrderExtraTotal(o), 0);

  let totalCashSales = 0;
  let totalPixSales = 0;
  paidOrders.forEach((o) => {
    const productRevenue = getOrderProductSalesTotal(o);
    const payments = o.payments || [];
    if (payments.length === 0) return;

    const sumPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const ratio = sumPayments > 0 ? productRevenue / sumPayments : 1;

    payments.forEach((p) => {
      const share = Number(((p.amount || 0) * ratio).toFixed(2));
      if (p.method === 'dinheiro') totalCashSales += share;
      if (p.method === 'pix') totalPixSales += share;
    });
  });

  // Gastos e Despesas Reais
  const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

  // Gastos agrupados por categoria
  const expensesByCategory: Record<string, number> = {};
  expenses.forEach((e) => {
    expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + (e.amount || 0);
  });

  // Resultado Líquido
  const netProfit = totalRevenue - totalExpenses;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Relatórios Financeiros & DRE
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Demonstrativo gerencial consolidado. Receitas de vendas, gastos operacionais e resultado líquido.
          </p>
        </div>
      </div>

      {/* Grid de 3 Indicadores Principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Receita Total de Vendas
            </span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-stone-900">{formatBRL(totalRevenue)}</p>
          <p className="mt-1 text-[11px] text-emerald-700 font-semibold">
            {paidOrders.length} pedido(s) confirmados no PDV
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Total de Gastos & Despesas
            </span>
            <ArrowDownRight className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-rose-700">{formatBRL(totalExpenses)}</p>
          <p className="mt-1 text-[11px] text-stone-400 font-medium">
            {expenses.length} lançamento(s) de despesa
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Resultado Líquido do Período
            </span>
            <Wallet className="h-4 w-4 text-stone-700" />
          </div>
          <p
            className={`mt-2 text-2xl font-black ${
              netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatBRL(netProfit)}
          </p>
          <p className="mt-1 text-[11px] text-stone-400 font-medium">
            Receitas menos despesas registradas
          </p>
        </div>
      </div>

      {/* DRE Simplificado e Objetivo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* DRE Sintético */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 border-b border-stone-100 pb-3">
            DRE — Demonstrativo do Resultado
          </h2>

          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between py-2 border-b border-stone-100 font-bold text-stone-900">
              <span>(+) Receita Bruta de Vendas</span>
              <span className="text-emerald-700 font-mono">{formatBRL(totalRevenue)}</span>
            </div>

            <div className="pl-3 flex justify-between py-1 text-stone-500 text-[11px]">
              <span>· Vendas em Dinheiro</span>
              <span className="font-mono">{formatBRL(totalCashSales)}</span>
            </div>

            <div className="pl-3 flex justify-between py-1 border-b border-stone-100 text-stone-500 text-[11px]">
              <span>· Vendas via PIX</span>
              <span className="font-mono">{formatBRL(totalPixSales)}</span>
            </div>

            {totalExtraRecovered > 0 && (
              <div className="flex justify-between py-1.5 border-b border-stone-100 text-indigo-700 text-[11px] font-semibold">
                <span>(i) Valores Extras Ressarcidos (Mesas — não contabilizados como venda)</span>
                <span className="font-mono">{formatBRL(totalExtraRecovered)}</span>
              </div>
            )}

            <div className="flex justify-between py-2 border-b border-stone-100 font-bold text-stone-900">
              <span>(-) Gastos & Despesas Operacionais</span>
              <span className="text-rose-700 font-mono">-{formatBRL(totalExpenses)}</span>
            </div>

            <div className="flex justify-between py-3 border-t-2 border-stone-300 font-black text-stone-900 text-sm">
              <span>(=) Resultado Operacional Líquido</span>
              <span className={`font-mono ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatBRL(netProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* Despesas por Categoria */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 border-b border-stone-100 pb-3">
            Despesas por Categoria
          </h2>

          <div className="mt-3 space-y-2.5 text-xs">
            {Object.keys(expensesByCategory).length > 0 ? (
              Object.entries(expensesByCategory).map(([cat, val]) => {
                const percent = totalExpenses > 0 ? Math.round((val / totalExpenses) * 100) : 0;

                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-stone-800">{cat}</span>
                      <span className="font-mono font-bold text-stone-900">
                        {formatBRL(val)}{' '}
                        <span className="text-[10px] text-stone-400 font-normal">({percent}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-600 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-xs text-stone-400">
                Nenhuma despesa cadastrada no período.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
