/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Boxes,
  Grid2X2,
  Receipt,
  WalletCards,
  TrendingDown,
  TrendingUp,
  Users2,
  Contact2,
  Settings,
  ShoppingBag,
  Award,
  ChevronRight,
  X,
  Lock,
  Radio,
  FolderArchive,
  Database,
  Palette,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getRoleName } from '../../utils/formatters';

export type ActiveTab =
  | 'dashboard'
  | 'pos'
  | 'tables'
  | 'products'
  | 'inventory'
  | 'cash'
  | 'expenses'
  | 'team'
  | 'financial'
  | 'history'
  | 'backup'
  | 'customization'
  | 'server'
  | 'contacts'
  | 'settings'
  | 'my_sales';

interface SidebarProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const { currentUser, isAdm, activeView, setActiveView } = useAuth();

  const adminNavItems = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
    { id: 'pos', label: 'Vendas (PDV)', icon: Receipt, highlight: true },
    { id: 'tables', label: 'Mesas & Salão', icon: Grid2X2 },
    { id: 'products', label: 'Produtos & Cardápio', icon: UtensilsCrossed },
    { id: 'inventory', label: 'Controle de Estoque', icon: Boxes },
    { id: 'cash', label: 'Controle de Caixa', icon: WalletCards },
    { id: 'expenses', label: 'Controle de Gastos', icon: TrendingDown },
    { id: 'team', label: 'Controle de Vendedores', icon: Users2 },
    { id: 'financial', label: 'Relatórios & DRE', icon: TrendingUp },
    { id: 'history', label: 'Histórico & Arquivos', icon: FolderArchive, highlight: true },
    { id: 'backup', label: 'Backups & Restauração', icon: Database, highlight: true },
    { id: 'customization', label: 'Personalização Visual', icon: Palette },
    { id: 'server', label: 'Acesso PC & Servidor Local', icon: Radio },
    { id: 'contacts', label: 'Clientes & Fornecedores', icon: Contact2 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const sellerNavItems = [
    { id: 'my_sales', label: 'Início / Minhas Vendas', icon: Award, highlight: true },
    { id: 'products', label: 'Cardápio', icon: UtensilsCrossed },
    { id: 'tables', label: 'Mesas', icon: Grid2X2 },
    { id: 'pos', label: 'Balcão / Registrar Venda', icon: Receipt },
  ];

  const navItems = activeView === 'admin' ? adminNavItems : sellerNavItems;

  return (
    <>
      {/* Overlay Mobile */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-stone-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-0 max-lg:-translate-x-full'
        }`}
      >
        {/* Top Header dentro da Sidebar (Mobile) */}
        <div className="flex h-16 items-center justify-between border-b border-stone-200 px-5 lg:hidden">
          <span className="text-sm font-bold text-stone-900">Navegação</span>
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Card do Usuário e Ambiente */}
        <div className="p-4 border-b border-stone-100">
          <div
            className={`rounded-2xl p-3 border transition ${
              activeView === 'admin'
                ? 'bg-amber-50/60 border-amber-200/80 text-amber-950'
                : 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Ambiente Ativo
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeView === 'admin'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {activeView === 'admin' ? 'ÁREA ADM' : 'ÁREA DO VENDEDOR'}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-xs font-bold text-amber-700 text-sm">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-stone-900">{currentUser?.name}</p>
                <p className="truncate text-[11px] text-stone-500">
                  {currentUser ? getRoleName(currentUser.role) : ''}
                </p>
              </div>
            </div>

            {/* Quick Switch de Ambiente para Administradores */}
            {isAdm && (
              <div className="mt-3 flex items-center gap-1 rounded-xl bg-white/80 p-1 border border-stone-200/60">
                <button
                  onClick={() => setActiveView('admin')}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition ${
                    activeView === 'admin'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Modo ADM
                </button>
                <button
                  onClick={() => setActiveView('vendedor')}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition ${
                    activeView === 'vendedor'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Modo Vendedor
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lista de Navegação */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
            {activeView === 'admin' ? 'Módulos Administrativos' : 'Operação de Vendas'}
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = currentTab === item.id;
            const isDisabled = (item as any).disabled;

            return (
              <button
                key={item.id}
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    onSelectTab(item.id as ActiveTab);
                    onCloseMobile();
                  }
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                  isSelected
                    ? 'bg-stone-900 text-white shadow-xs font-semibold'
                    : isDisabled
                    ? 'text-stone-300 cursor-not-allowed opacity-60'
                    : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 ${
                      isSelected
                        ? 'text-amber-400'
                        : isDisabled
                        ? 'text-stone-300'
                        : 'text-stone-500 group-hover:text-stone-800'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {(item as any).highlight && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                      Ativo
                    </span>
                  )}
                  {(item as any).badge && (
                    <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500">
                      {(item as any).badge}
                    </span>
                  )}
                  {isDisabled && <Lock className="h-3 w-3 text-stone-400" />}
                  {isSelected && <ChevronRight className="h-3.5 w-3.5 text-white/60" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer da Sidebar com Versão e Identidade */}
        <div className="border-t border-stone-200 p-4 bg-stone-50/50">
          <div className="flex items-center justify-between text-[11px] text-stone-500">
            <span className="font-semibold text-stone-700">SaborGestão v1.0</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-[10px] text-emerald-800">
              Online
            </span>
          </div>
          <p className="mt-1 text-[10px] text-stone-400">
            Open-source • Multi-estabelecimento
          </p>
        </div>
      </aside>
    </>
  );
};
