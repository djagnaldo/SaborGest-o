/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users2,
  UtensilsCrossed,
  Grid2X2,
  Receipt,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertTriangle,
  Radio,
  Monitor,
  WalletCards,
  Boxes,
  FolderArchive,
  Database,
  Palette,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { formatBRL, formatTimeBR } from '../../utils/formatters';
import {
  getOrders,
  getProducts,
  getTables,
  getAuditLogs,
  getExpenses,
  getCashSessions,
  getOrderProductSalesTotal,
} from '../../services/storage';
import { ActiveTab } from '../layout/Sidebar';

interface OverviewDashboardProps {
  onNavigate: (tab: ActiveTab) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ onNavigate }) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm, activeView } = useAuth();

  const [orders, setOrders] = useState(getOrders(currentTenant.id));
  const [products, setProducts] = useState(getProducts(currentTenant.id));
  const [tables, setTables] = useState(getTables(currentTenant.id));
  const [expenses, setExpenses] = useState(getExpenses(currentTenant.id));
  const [cashSessions, setCashSessions] = useState(getCashSessions(currentTenant.id));
  const [auditLogs, setAuditLogs] = useState(getAuditLogs(currentTenant.id).slice(0, 4));

  const loadData = () => {
    setOrders(getOrders(currentTenant.id));
    setProducts(getProducts(currentTenant.id));
    setTables(getTables(currentTenant.id));
    setExpenses(getExpenses(currentTenant.id));
    setCashSessions(getCashSessions(currentTenant.id));
    setAuditLogs(getAuditLogs(currentTenant.id).slice(0, 4));
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  // Métricas do Dia (exclui valores extras de mesa da venda de produtos)
  const paidOrders = orders.filter((o) => o.paid && o.status !== 'cancelled');
  const totalSalesToday = paidOrders.reduce((acc, o) => acc + getOrderProductSalesTotal(o), 0);
  const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const activeSession = cashSessions.find((c) => c.status === 'open');
  const cashBalance = activeSession ? activeSession.expectedAmount : 0;
  const activeTablesCount = tables.filter((t) => t.status === 'occupied' || t.status === 'closing').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabeçalho Minimalista e Arejado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Painel Geral do Administrador
          </span>
          <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
            {currentTenant.name}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Matriz Principal • Local-First • Operando em Celular Android
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 active:scale-95 transition"
          >
            <Receipt className="h-4 w-4" />
            <span>Iniciar Venda</span>
          </button>
        </div>
      </div>

      {/* 4 Cards de Métricas Principais (Sem Fiado, Sem Metas, Focado na Operação Real) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Vendas Hoje
          </span>
          <p className="mt-1 text-xl font-black text-stone-900 sm:text-2xl">
            {formatBRL(totalSalesToday)}
          </p>
          <span className="text-[11px] text-emerald-700 font-semibold">
            {paidOrders.length} pedido(s) concluído(s)
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Mesas Ocupadas
          </span>
          <p className="mt-1 text-xl font-black text-stone-900 sm:text-2xl">
            {activeTablesCount} <span className="text-sm font-normal text-stone-400">/ {tables.length}</span>
          </p>
          <span className="text-[11px] text-stone-500 font-medium">Salão em tempo real</span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Caixa Ativo (Espécie)
          </span>
          <p className="mt-1 text-xl font-black text-stone-900 sm:text-2xl">
            {formatBRL(cashBalance)}
          </p>
          <span className="text-[11px] text-stone-500 font-medium">
            {activeSession ? 'Turno aberto' : 'Caixa fechado'}
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Gastos Registrados
          </span>
          <p className="mt-1 text-xl font-black text-rose-700 sm:text-2xl">
            {formatBRL(totalExpenses)}
          </p>
          <span className="text-[11px] text-stone-400 font-medium">
            {expenses.length} despesa(s)
          </span>
        </div>
      </div>

      {/* Ações Principais (Acesso Rápido às 9 Áreas Obrigatórias) */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">
          Módulos Principais
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {/* 1. Controle de Vendedores */}
          <button
            type="button"
            onClick={() => onNavigate('team')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <Users2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Controle de Vendedores</p>
              <p className="text-[11px] text-stone-500">
                Ligar/desligar permissão de venda individual
              </p>
            </div>
          </button>

          {/* 2. Ponto de Venda (PDV) */}
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Vendas & Balcão</p>
              <p className="text-[11px] text-stone-500">
                Fechamento de mesas e venda direta no balcão
              </p>
            </div>
          </button>

          {/* 3. Mesas & Salão */}
          <button
            type="button"
            onClick={() => onNavigate('tables')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-800 shrink-0">
              <Grid2X2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Mesas & Atendimento</p>
              <p className="text-[11px] text-stone-500">
                Gerenciamento ilimitado, abertura e contas
              </p>
            </div>
          </button>

          {/* 4. Produtos & Cardápio */}
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-100 text-stone-800 shrink-0">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Produtos & Cardápio</p>
              <p className="text-[11px] text-stone-500">
                Fotos, preços, categorias e status ativo
              </p>
            </div>
          </button>

          {/* 5. Controle de Estoque */}
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800 shrink-0">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Controle de Estoque</p>
              <p className="text-[11px] text-stone-500">
                Correções, entradas de compra e histórico
              </p>
            </div>
          </button>

          {/* 6. Caixa Geral */}
          <button
            type="button"
            onClick={() => onNavigate('cash')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-800 shrink-0">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Controle de Caixa</p>
              <p className="text-[11px] text-stone-500">
                Recebimentos, despesas e saldo calculado
              </p>
            </div>
          </button>

          {/* 7. Gastos do Estabelecimento */}
          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-800 shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Controle de Gastos</p>
              <p className="text-[11px] text-stone-500">
                Lançar despesas com categoria e responsável
              </p>
            </div>
          </button>

          {/* 8. Relatórios Financeiros */}
          <button
            type="button"
            onClick={() => onNavigate('financial')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Relatórios & DRE</p>
              <p className="text-[11px] text-stone-500">
                Receitas reais, custos e resultado líquido
              </p>
            </div>
          </button>

          {/* 9. Acesso PC pelo Navegador */}
          <button
            type="button"
            onClick={() => onNavigate('server')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800 shrink-0">
              <Monitor className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Acesso pelo Navegador</p>
              <p className="text-[11px] text-stone-500">
                Chaves de acesso, QR Code e sessões em rede
              </p>
            </div>
          </button>

          {/* 10. Histórico & Arquivos */}
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-indigo-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 shrink-0">
              <FolderArchive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Histórico & Arquivos</p>
              <p className="text-[11px] text-stone-500">
                Balanços salvos, períodos arquivados e comparativos
              </p>
            </div>
          </button>

          {/* 11. Backups & Restauração */}
          <button
            type="button"
            onClick={() => onNavigate('backup')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-amber-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 shrink-0">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Backups & Restauração</p>
              <p className="text-[11px] text-stone-500">
                Cópias de segurança, restauração e reinício
              </p>
            </div>
          </button>

          {/* 12. Personalização Visual */}
          <button
            type="button"
            onClick={() => onNavigate('customization')}
            className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-2xs hover:border-purple-500 hover:shadow-md transition active:scale-98"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-700 shrink-0">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-stone-900">Personalização Visual</p>
              <p className="text-[11px] text-stone-500">
                Paleta de cores e identidade das seções
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Histórico Administrativo Recente */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-stone-400" />
            <h3 className="text-xs font-bold uppercase text-stone-700">Ocorrências Recentes na Matriz</h3>
          </div>
          <span className="text-[11px] text-stone-400">Auditoria Local</span>
        </div>

        <div className="mt-3 divide-y divide-stone-100">
          {auditLogs.map((log) => (
            <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="pr-3">
                <span className="font-bold text-stone-900">{log.action}</span>
                <p className="text-[11px] text-stone-500 truncate max-w-md">{log.details}</p>
              </div>
              <div className="text-right shrink-0 text-[10px] text-stone-400 font-mono">
                {formatTimeBR(log.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
