/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Store,
  ChevronDown,
  User,
  Shield,
  ShoppingBag,
  Plus,
  RefreshCw,
  Trash2,
  LogOut,
  Database,
  Building2,
  CheckCircle2,
  Menu,
  Bell,
  Globe,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { getRoleName, formatDateTimeBR } from '../../utils/formatters';
import {
  getMatrizInfo,
  getNotifications,
  markNotificationAsRead,
  clearAllNotifications,
} from '../../services/local-db';
import { TerminalNotification } from '../../types';

interface HeaderProps {
  onOpenNewTenant: () => void;
  onOpenEditTenant: () => void;
  onToggleSidebarMobile: () => void;
  onOpenPcAccess?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewTenant,
  onOpenEditTenant,
  onToggleSidebarMobile,
  onOpenPcAccess,
}) => {
  const { currentTenant, tenants, switchTenant, clearTenantDemoData, reloadTenantDemoData } = useTenant();
  const matriz = getMatrizInfo();
  const {
    currentUser,
    users,
    isAdm,
    activeView,
    setActiveView,
    switchUser,
    webPortalAuth,
    wsConnected,
    logout,
  } = useAuth();

  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dataDropdownOpen, setDataDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<TerminalNotification[]>([]);

  useEffect(() => {
    if (currentTenant) {
      setNotifications(getNotifications(currentTenant.id));
    }

    const handleSync = () => {
      if (currentTenant) {
        setNotifications(getNotifications(currentTenant.id));
      }
    };

    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-stone-200 bg-white/95 px-3 backdrop-blur-md sm:px-6">
      {/* Esquerda: Menu Mobile + Marca + Seletor de Estabelecimento */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebarMobile}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 lg:hidden shrink-0"
          title="Abrir menu"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Marca */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
            <Store className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <span className="block text-sm font-black tracking-tight text-stone-900">
              SaborGestão
            </span>
            <p className="text-[11px] text-stone-500 leading-none">
              {webPortalAuth
                ? webPortalAuth.session.mode === 'admin'
                  ? 'Navegador · Modo Administrador'
                  : 'Navegador · Modo Vendedor'
                : 'Gestão & Ponto de Venda'}
            </p>
          </div>
        </div>

        <div className="hidden h-6 w-px bg-stone-200 md:block mx-1" />

        {/* Seletor de Estabelecimento */}
        <div className="relative min-w-0">
          <button
            type="button"
            disabled={!isAdm}
            onClick={() => {
              if (!isAdm) return;
              setTenantDropdownOpen(!tenantDropdownOpen);
              setUserDropdownOpen(false);
              setDataDropdownOpen(false);
              setNotifDropdownOpen(false);
            }}
            className="flex min-h-[40px] items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/80 px-2.5 sm:px-3 py-1.5 text-left text-sm font-medium text-stone-800 transition hover:bg-stone-100 disabled:opacity-90 disabled:cursor-default"
          >
            <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="max-w-[110px] sm:max-w-[180px] truncate">
              <span className="block truncate text-xs font-semibold text-stone-900">
                {currentTenant?.name || 'Estabelecimento'}
              </span>
              <span className="hidden sm:block truncate text-[10px] text-stone-500 capitalize">
                {currentTenant?.segment || 'Geral'}
              </span>
            </div>
            {isAdm && <ChevronDown className="h-3.5 w-3.5 text-stone-400 shrink-0" />}
          </button>

          {tenantDropdownOpen && isAdm && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Estabelecimentos
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {tenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      switchTenant(t.id);
                      setTenantDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      t.id === currentTenant?.id
                        ? 'bg-amber-50 text-amber-900 font-semibold border border-amber-200'
                        : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="truncate">
                      <p className="truncate text-xs font-medium">{t.name}</p>
                      <p className="text-[10px] text-stone-400">
                        {t.document || 'Sem CNPJ'} · {t.segment}
                      </p>
                    </div>
                    {t.id === currentTenant?.id && (
                      <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-2 border-t border-stone-100 pt-2 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setTenantDropdownOpen(false);
                    onOpenEditTenant();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  <Building2 className="h-3.5 w-3.5 text-stone-500" />
                  Editar Dados do Estabelecimento
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTenantDropdownOpen(false);
                    onOpenNewTenant();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo Estabelecimento
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Direita: Estado Sync + Perfil + Acesso Web + Notificações */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Indicador Discreto de Sincronização em Rede */}
        <span
          className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
            wsConnected
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-stone-200 bg-stone-50 text-stone-600'
          }`}
          title={
            wsConnected
              ? 'Sincronização em tempo real ativa com o servidor'
              : 'Modo local (sem conexão WebSocket ativa)'
          }
        >
          {wsConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span>{wsConnected ? 'Tempo Real' : 'Local'}</span>
        </span>

        {/* Alternância ADM / Vendedor (somente quando usuário é ADM) */}
        {isAdm && (
          <div className="hidden lg:flex items-center rounded-xl bg-stone-100 p-1 border border-stone-200">
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                activeView === 'admin'
                  ? 'bg-white text-stone-900 shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Shield className="h-3.5 w-3.5 text-amber-600" />
              <span>ADM</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('vendedor')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                activeView === 'vendedor'
                  ? 'bg-amber-600 text-white shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Vendedor</span>
            </button>
          </div>
        )}

        {/* Atalho Acesso pelo Navegador (somente ADM) */}
        {onOpenPcAccess && isAdm && (
          <button
            type="button"
            onClick={onOpenPcAccess}
            className="hidden sm:flex min-h-[40px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100 transition"
            title="Configurar Acesso pelo Navegador e QR Code"
          >
            <Globe className="h-4 w-4 text-blue-600" />
            <span className="hidden lg:inline">Acesso Web</span>
          </button>
        )}

        {/* Menu Banco Local (somente ADM e fora do portal web) */}
        {isAdm && !webPortalAuth && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setDataDropdownOpen(!dataDropdownOpen);
                setUserDropdownOpen(false);
                setTenantDropdownOpen(false);
                setNotifDropdownOpen(false);
              }}
              className="flex min-h-[40px] items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
              title="Dados de Demonstração e Banco Local"
            >
              <Database className="h-3.5 w-3.5 text-stone-500" />
              <span className="hidden xl:inline text-xs">Dados</span>
              <ChevronDown className="h-3 w-3 text-stone-400" />
            </button>

            {dataDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl ring-1 ring-black/5 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                  <span className="text-xs font-bold text-stone-900">Armazenamento Local</span>
                  <span className="text-[10px] font-semibold text-stone-500">
                    {matriz.activeHostLabel}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      clearTenantDemoData();
                      setDataDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    Limpar Dados de Demonstração
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reloadTenantDemoData();
                      setDataDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-stone-600" />
                    Recarregar Exemplo Completo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notificações */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifDropdownOpen(!notifDropdownOpen);
              setUserDropdownOpen(false);
              setDataDropdownOpen(false);
              setTenantDropdownOpen(false);
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition"
            title="Notificações"
            aria-label="Notificações"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl ring-1 ring-black/5 z-50">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <span className="text-xs font-bold text-stone-900">
                  Notificações ({unreadCount} não lidas)
                </span>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        notifications.forEach((n) => markNotificationAsRead(n.id));
                        setNotifications(getNotifications(currentTenant.id));
                      }}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold text-stone-600 hover:bg-stone-100"
                    >
                      Marcar Lidas
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      clearAllNotifications(currentTenant.id);
                      setNotifications([]);
                    }}
                    className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    title="Limpar histórico"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2.5 max-h-72 overflow-y-auto space-y-1.5 divide-y divide-stone-50">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.read) {
                          markNotificationAsRead(n.id);
                          setNotifications(getNotifications(currentTenant.id));
                        }
                      }}
                      className={`rounded-xl p-2.5 text-left cursor-pointer ${
                        !n.read ? 'bg-amber-50/60 border border-amber-200/60' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px] text-stone-400">
                        <span className="font-bold text-amber-800">Evento</span>
                        <span className="font-mono">{formatDateTimeBR(n.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 text-xs font-bold text-stone-900">{n.title}</p>
                      <p className="mt-0.5 text-[11px] text-stone-600">{n.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-stone-400">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                    <p className="mt-2 text-xs font-semibold text-stone-600">
                      Nenhuma notificação pendente
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Perfil / Operador */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setUserDropdownOpen(!userDropdownOpen);
              setTenantDropdownOpen(false);
              setDataDropdownOpen(false);
              setNotifDropdownOpen(false);
            }}
            className="flex min-h-[40px] items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/70 p-1.5 sm:px-3 hover:bg-stone-100"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-xs font-bold text-amber-800">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
            </div>
            <div className="hidden text-left sm:block">
              <span className="block text-xs font-semibold text-stone-900 max-w-[110px] truncate">
                {currentUser?.name || 'Operador'}
              </span>
              <span className="block text-[10px] text-stone-500 font-medium">
                {currentUser ? getRoleName(currentUser.role) : ''}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-xl ring-1 ring-black/5 z-50">
              <div className="p-2 border-b border-stone-100">
                <p className="text-xs font-bold text-stone-900">{currentUser?.name}</p>
                <p className="text-[11px] text-stone-500 truncate">{currentUser?.email}</p>
                <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                  {currentUser ? getRoleName(currentUser.role) : ''}
                </span>
              </div>

              {webPortalAuth ? (
                <div className="pt-2 space-y-2">
                  <p className="px-2 text-[11px] text-stone-500">
                    Conectado via chave de acesso (
                    {webPortalAuth.session.mode === 'admin' ? 'MODO ADMINISTRADOR' : 'MODO VENDEDOR'}
                    ).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                    }}
                    className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Encerrar Sessão</span>
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Alternar Operador na Matriz
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          switchUser(u.id);
                          setUserDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                          u.id === currentUser?.id
                            ? 'bg-amber-50 text-amber-900 font-semibold'
                            : 'text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <div className="truncate">
                          <p className="truncate font-medium">{u.name}</p>
                          <p className="text-[10px] text-stone-400">{getRoleName(u.role)}</p>
                        </div>
                        {u.id === currentUser?.id && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
