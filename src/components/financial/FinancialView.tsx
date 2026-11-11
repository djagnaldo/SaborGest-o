/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, DollarSign, Wallet } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { getOrders } from '../../services/storage';
import { formatBRL } from '../../utils/formatters';

export const FinancialView: React.FC = () => {
  const { currentTenant } = useTenant();
  const orders = getOrders(currentTenant.id);

  const totalGrossRevenue = orders
    .filter((o) => o.paid && o.status !== 'cancelled')
    .reduce((acc, o) => acc + (o.total || 0), 0);

  // Estimativa de despesas operacionais demonstrativas
  const estimatedFixedExpenses = 3200.0;
  const estimatedCostOfGoods = totalGrossRevenue * 0.35; // 35% CMV
  const netEstimatedProfit = totalGrossRevenue - (estimatedFixedExpenses + estimatedCostOfGoods);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Financeiro & DRE Gerencial
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Etapa 5 Integrada
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">
          Acompanhamento de receitas, CMV (Custo de Mercadorias Vendidas) e margem líquida estimada.
        </p>
      </div>

      {/* Grid de Indicadores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Receita Bruta Acumulada</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatBRL(totalGrossRevenue)}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Vendas registradas no PDV</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">CMV Estimado (Insumos)</span>
            <ArrowDownRight className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-700">{formatBRL(estimatedCostOfGoods)}</p>
          <p className="mt-1 text-[11px] text-stone-400">~35% sobre faturamento</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Resultado Operacional</span>
            <Wallet className="h-4 w-4 text-purple-600" />
          </div>
          <p
            className={`mt-2 text-2xl font-bold ${
              netEstimatedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatBRL(netEstimatedProfit)}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">Receita menos custos estimados</p>
        </div>
      </div>

      {/* DRE Simplificado */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 border-b border-stone-100 pb-3">
          Demonstrativo de Resultado do Exercício (DRE Sintético)
        </h3>

        <div className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b border-stone-100 font-semibold text-stone-800">
            <span>(+) Receita Operacional Bruta</span>
            <span className="text-emerald-700">{formatBRL(totalGrossRevenue)}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-stone-100 text-stone-600">
            <span>(-) Custos de Mercadorias (CMV)</span>
            <span className="text-rose-600">-{formatBRL(estimatedCostOfGoods)}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-stone-100 font-semibold text-stone-800">
            <span>(=) Lucro Bruto</span>
            <span>{formatBRL(totalGrossRevenue - estimatedCostOfGoods)}</span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-stone-100 text-stone-600">
            <span>(-) Despesas Fixas & Operacionais</span>
            <span className="text-rose-600">-{formatBRL(estimatedFixedExpenses)}</span>
          </div>

          <div className="flex justify-between py-2 border-t-2 border-stone-300 font-bold text-stone-900 text-sm">
            <span>(=) Lucro Líquido Estimado</span>
            <span className={netEstimatedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
              {formatBRL(netEstimatedProfit)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
