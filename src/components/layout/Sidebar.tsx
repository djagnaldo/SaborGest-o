/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  ChevronDown,
  X,
  Globe,
  FolderArchive,
  Database,
  Palette,
  LogOut,
  Building2,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { getRoleName } from '../../utils/formatters';

export type ActiveTab =
  | 'dashboard'
  | 'pos'
  | 'counter'
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
  onOpenNewTenant: () => void;
  onOpenEditTenant: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
  onOpenNewTenant,
  onOpenEditTenant,
}) => {
  const { currentUser, users, isAdm, activeView, setActiveView, switchUser, webPortalAuth, logout } = useAuth();
  const { currentTenant, tenants, switchTenant } = useTenant();
  const [showTenantSwitcher, setShowTenantSwitcher] = useState(false);
  const [showOperatorSwitcher, setShowOperatorSwitcher] = useState(false);

  const adminNavItems: Array<{ id: ActiveTab; label: string; icon: any }> = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
    { id: 'pos', label: 'Vendas', icon: Receipt },
    { id: 'counter', label: 'Balcão', icon: ShoppingBag },
    { id: 'tables', label: 'Mesas', icon: Grid2X2 },
    { id: 'products', label: 'Produtos & Cardápio', icon: UtensilsCrossed },
    { id: 'inventory', label: 'Controle de Estoque', icon: Boxes },
    { id: 'cash', label: 'Controle de Caixa', icon: WalletCards },
    { id: 'expenses', label: 'Controle de Gastos', icon: TrendingDown },
    { id: 'team', label: 'Controle de Vendedores', icon: Users2 },
    { id: 'financial', label: 'Relatórios & DRE', icon: TrendingUp },
    { id: 'history', label: 'Histórico & Arquivos', icon: FolderArchive },
    { id: 'backup', label: 'Backups & Restauração', icon: Database },
    { id: 'customization', label: 'Personalização Visual', icon: Palette },
    { id: 'server', label: 'Acesso pelo Navegador', icon: Globe },
    { id: 'contacts', label: 'Clientes & Fornecedores', icon: Contact2 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const sellerNavItems: Array<{ id: ActiveTab; label: string; icon: any }> = [
    { id: 'my_sales', label: 'Minhas Vendas', icon: Award },
    { id: 'counter', label: 'Balcão', icon: ShoppingBag },
    { id: 'tables', label: 'Mesas', icon: Grid2X2 },
    { id: 'pos', label: 'Vendas / Contas', icon: Receipt },
    { id: 'products', label: 'Cardápio', icon: UtensilsCrossed },
  ];

  const navItems = activeView === 'admin' ? adminNavItems : sellerNavItems;

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-stone-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-stone-200 px-5 lg:hidden">
          <span className="text-sm font-bold text-stone-900">Navegação</span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Card do Usuário, Estabelecimento e Ambiente */}
        <div className="p-4 border-b border-stone-100 space-y-2.5">
          {isAdm && !webPortalAuth && (
            <div>
              <button
                type="button"
                onClick={() => setShowTenantSwitcher(!showTenantSwitcher)}
                className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs hover:bg-stone-100 transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-stone-900">{currentTenant?.name}</p>
                    <p className="truncate text-[10px] text-stone-500 capitalize">
                      {currentTenant?.segment || 'Estabelecimento'}
                    </p>
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-stone-400 shrink-0" />
              </button>

              {showTenantSwitcher && (
                <div className="mt-1.5 rounded-xl border border-stone-200 bg-white p-1.5 shadow-sm space-y-1">
                  {tenants.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        switchTenant(t.id);
                        setShowTenantSwitcher(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs ${
                        t.id === currentTenant?.id
                          ? 'bg-amber-50 text-amber-900 font-bold'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      {t.id === currentTenant?.id && <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    </button>
                  ))}
                  <div className="border-t border-stone-100 pt-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTenantSwitcher(false);
                        onOpenEditTenant();
                      }}
                      className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTenantSwitcher(false);
                        onOpenNewTenant();
                      }}
                      className="flex items-center justify-center gap-1 flex-1 rounded-lg bg-amber-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                    >
                      <Plus className="h-3 w-3" />
                      Novo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            className={`rounded-2xl p-3 border transition ${
              activeView === 'admin'
                ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Perfil Ativo
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  activeView === 'admin'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                {activeView === 'admin' ? 'MODO ADM' : 'MODO VENDEDOR'}
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
              {!webPortalAuth && users.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowOperatorSwitcher(!showOperatorSwitcher)}
                  className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-stone-600 border border-stone-200/80"
                  title="Alternar operador na Matriz"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {showOperatorSwitcher && !webPortalAuth && (
              <div className="mt-2 rounded-xl bg-white border border-stone-200 p-1.5 space-y-1 max-h-40 overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      switchUser(u.id);
                      setShowOperatorSwitcher(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] ${
                      u.id === currentUser?.id
                        ? 'bg-amber-50 text-amber-900 font-bold'
                        : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className="truncate">{u.name}</span>
                    <span className="text-[10px] text-stone-400 shrink-0">{getRoleName(u.role)}</span>
                  </button>
                ))}
              </div>
            )}

            {isAdm && (
              <div className="mt-3 flex items-center gap-1 rounded-xl bg-white/80 p-1 border border-stone-200/60">
                <button
                  type="button"
                  onClick={() => setActiveView('admin')}
                  className={`flex-1 min-h-[34px] rounded-lg py-1 text-[11px] font-semibold transition ${
                    activeView === 'admin'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Modo ADM
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('vendedor')}
                  className={`flex-1 min-h-[34px] rounded-lg py-1 text-[11px] font-semibold transition ${
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

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`group flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 ${
                      isSelected ? 'text-amber-400' : 'text-stone-500 group-hover:text-stone-800'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {isSelected && <ChevronRight className="h-3.5 w-3.5 text-white/60" />}
              </button>
            );
          })}
        </nav>

        {/* Footer da Sidebar */}
        <div className="border-t border-stone-200 p-4 bg-stone-50/70 space-y-2.5">
          {webPortalAuth && (
            <button
              type="button"
              onClick={logout}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Encerrar Sessão Web</span>
            </button>
          )}
          <div className="flex items-center justify-between text-[11px] text-stone-500">
            <span className="font-semibold text-stone-700">SaborGestão</span>
            <span className="text-[10px] font-semibold text-stone-500">
              {webPortalAuth ? 'Navegador Web' : 'Matriz Local'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
