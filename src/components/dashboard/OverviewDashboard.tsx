/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  TrendingUp,
  Users2,
  UtensilsCrossed,
  Grid2X2,
  Receipt,
  Bike,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Building2,
  DollarSign,
  AlertTriangle,
  Radio,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { formatBRL, formatDateTimeBR, getRoleName } from '../../utils/formatters';
import { getOrders, getProducts, getTables, getAuditLogs, getDebts } from '../../services/storage';
import { ActiveTab } from '../layout/Sidebar';

interface OverviewDashboardProps {
  onNavigate: (tab: ActiveTab) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ onNavigate }) => {
  const { currentTenant } = useTenant();
  const { currentUser, users, isAdm, setActiveView } = useAuth();

  const orders = getOrders(currentTenant.id);
  const products = getProducts(currentTenant.id);
  const tables = getTables(currentTenant.id);
  const debts = getDebts(currentTenant.id);
  const auditLogs = getAuditLogs(currentTenant.id).slice(0, 6);

  // Métricas
  const totalSalesToday = orders
    .filter((o) => o.paid && o.status !== 'cancelled')
    .reduce((acc, o) => acc + (o.total || 0), 0);

  const totalPendingDebts = debts
    .filter((d) => d.status !== 'quitado')
    .reduce((acc, d) => acc + d.remainingAmount, 0);

  const activeTablesCount = tables.filter((t) => t.status === 'occupied' || t.status === 'closing').length;
  const lowStockProducts = products.filter((p) => p.stockQuantity <= p.minStock);

  return (
    <div className="space-y-6">
      {/* Banner de Boas-Vindas e Identidade */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-500/30">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Sistema 100% Local-First • Zero Nuvem • SQLite</span>
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            {currentTenant.name}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-300">
            {currentTenant.segment.toUpperCase()} • {currentTenant.document || 'Sem CNPJ'} • {currentTenant.address}
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {isAdm && (
              <button
                onClick={() => onNavigate('server')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
              >
                <Radio className="h-4 w-4 animate-pulse" />
                Servidor Local & Pareamento
              </button>
            )}

            {isAdm && (
              <button
                onClick={() => onNavigate('debts')}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-500 transition"
              >
                <FileText className="h-4 w-4" />
                Fiado & Pendências ({formatBRL(totalPendingDebts)})
              </button>
            )}

            <button
              onClick={() => onNavigate('tests')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-500 transition"
            >
              <ShieldCheck className="h-4 w-4" />
              Testes de Sincronização (10)
            </button>

            <button
              onClick={() => {
                setActiveView('vendedor');
                onNavigate('pos');
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:bg-white/20 transition border border-white/10"
            >
              <Receipt className="h-4 w-4 text-amber-400" />
              Ponto de Venda (PDV)
            </button>

            <button
              onClick={() => onNavigate('tables')}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:bg-white/20 transition border border-white/10"
            >
              <Grid2X2 className="h-4 w-4 text-amber-400" />
              Mapa de Mesas ({activeTablesCount} ocupadas)
            </button>
          </div>
        </div>

        {/* Efeito decorativo de fundo */}
        <div className="absolute -right-12 -bottom-12 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Vendas Realizadas</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{formatBRL(totalSalesToday)}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">
            {orders.length} pedidos registrados
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Mesas Ocupadas</span>
            <Grid2X2 className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">
            {activeTablesCount} / {tables.length}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">Salão & Varanda</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Equipe em Serviço</span>
            <Users2 className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{users.length}</p>
          <p className="mt-1 text-[11px] text-blue-600 font-medium">
            Logado como {currentUser?.name?.split(' ')[0]}
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Itens no Cardápio</span>
            <UtensilsCrossed className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{products.length}</p>
          <p className="mt-1 text-[11px] text-purple-600 font-medium">
            {lowStockProducts.length > 0 ? (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {lowStockProducts.length} estoque baixo
              </span>
            ) : (
              'Estoque regular'
            )}
          </p>
        </div>
      </div>

      {/* Roteiro de Construção das 6 Etapas (Conforme Seção 14 do Pedido) */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-900">Evolução do Projeto por Etapas</h2>
            <p className="text-xs text-stone-500">
              Construção metódica de alta qualidade conforme especificação técnica
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            Etapa 1 Concluída
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              step: 'ETAPA 1',
              title: 'Estrutura, Identidade & Usuários',
              desc: 'Multi-tenant, Auth, RBAC (ADM vs Vendedor), comissões e permissões',
              status: 'done',
            },
            {
              step: 'ETAPA 2',
              title: 'Produtos, Categorias & Estoque',
              desc: 'Preços, margens, variações, adicionais e controle de estoque mínimo',
              status: 'ready',
            },
            {
              step: 'ETAPA 3',
              title: 'PDV, Vendas & Mesas',
              desc: 'PDV rápido, divisão de contas, comandas e formas de pagamento misto',
              status: 'ready',
            },
            {
              step: 'ETAPA 4',
              title: 'Compras, Fornecedores & Fichas',
              desc: 'Gestão de compras, fornecedores e baixa automática de estoque por receita',
              status: 'ready',
            },
            {
              step: 'ETAPA 5',
              title: 'Financeiro, Caixa & DRE',
              desc: 'Abertura/fechamento, sangria, suprimento e contas a pagar',
              status: 'ready',
            },
            {
              step: 'ETAPA 6',
              title: 'Dashboard, Auditoria & Exportação',
              desc: 'Relatórios avançados em PDF/Excel, logs de auditoria e ranking',
              status: 'ready',
            },
          ].map((item) => (
            <div
              key={item.step}
              className={`rounded-xl border p-3 transition ${
                item.status === 'done'
                  ? 'border-emerald-200 bg-emerald-50/40 text-emerald-950'
                  : 'border-stone-200 bg-stone-50/50 text-stone-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  {item.step}
                </span>
                {item.status === 'done' ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Ativo & Validado
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-stone-400">Pronto para avanço</span>
                )}
              </div>
              <h3 className="mt-1 text-xs font-bold text-stone-900">{item.title}</h3>
              <p className="mt-0.5 text-[11px] text-stone-500 leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Inferior: Ranking de Vendedores + Histórico de Auditoria */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Desempenho dos Colaboradores */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-amber-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Colaboradores & Metas do Estabelecimento
              </h3>
            </div>
            <button
              onClick={() => onNavigate('team')}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="mt-3 divide-y divide-stone-100">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-xs font-bold text-amber-800">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-900">{u.name}</p>
                    <p className="text-[10px] text-stone-400">
                      {getRoleName(u.role)} • Comissão: {u.commissionRate}%
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold text-stone-900">
                    {u.salesTargetMonthly ? formatBRL(u.salesTargetMonthly) : '-'}
                  </p>
                  <span className="text-[10px] text-stone-400">Meta mensal</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trilha de Auditoria (Audit Logs) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Registro de Auditoria & Segurança
              </h3>
            </div>
            <span className="text-[10px] text-stone-400">Rastreabilidade em tempo real</span>
          </div>

          <div className="mt-3 space-y-2.5">
            {auditLogs.length > 0 ? (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-stone-100 bg-stone-50/60 p-2.5 text-xs text-stone-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-stone-900">{log.userName}</span>
                    <span className="flex items-center gap-1 text-[10px] text-stone-400">
                      <Clock className="h-3 w-3" />
                      {formatDateTimeBR(log.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-600 font-medium">
                    <span className="rounded bg-stone-200/80 px-1.5 py-0.2 text-[9px] font-bold text-stone-800 mr-1.5">
                      {log.action}
                    </span>
                    {log.details}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-stone-400">
                Nenhuma ação recente registrada no log.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
