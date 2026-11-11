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
  LogIn,
  LogOut,
  Sparkles,
  Database,
  Building2,
  CheckCircle2,
  Menu,
  Bell,
  CheckCheck,
  Tag,
  Camera,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { getRoleName, formatDateTimeBR } from '../../utils/formatters';
import {
  getMatrizInfo,
  getNotifications,
  markNotificationAsRead,
  clearAllNotifications,
  getDeltaStats,
} from '../../services/local-db';
import { TerminalNotification } from '../../types';

interface HeaderProps {
  onOpenNewTenant: () => void;
  onOpenEditTenant: () => void;
  onToggleSidebarMobile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewTenant,
  onOpenEditTenant,
  onToggleSidebarMobile,
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
    loginWithGoogle,
    logout,
    firebaseUser,
  } = useAuth();

  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dataDropdownOpen, setDataDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<TerminalNotification[]>([]);
  const [deltaStats, setDeltaStats] = useState(getDeltaStats());

  useEffect(() => {
    if (currentTenant) {
      setNotifications(getNotifications(currentTenant.id));
      setDeltaStats(getDeltaStats());
    }

    const handleSync = () => {
      if (currentTenant) {
        setNotifications(getNotifications(currentTenant.id));
        setDeltaStats(getDeltaStats());
      }
    };

    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
      {/* Lado Esquerdo: Mobile Menu + Identidade + Seletor de Estabelecimento */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebarMobile}
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden"
          title="Abrir menu"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 text-white shadow-sm ring-2 ring-amber-500/20">
            <Store className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold tracking-tight text-stone-900">SaborGestão</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PDV & ERP
              </span>
            </div>
            <p className="text-xs text-stone-500">Gestão Inteligente p/ Gastronomia</p>
          </div>
        </div>

        {/* Separador vertical */}
        <div className="hidden h-6 w-px bg-stone-200 md:block mx-1" />

        {/* Seletor de Estabelecimento (Multi-tenant) */}
        <div className="relative">
          <button
            onClick={() => {
              setTenantDropdownOpen(!tenantDropdownOpen);
              setUserDropdownOpen(false);
              setDataDropdownOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-1.5 text-left text-sm font-medium text-stone-800 transition hover:bg-stone-100 focus:outline-none"
          >
            <Building2 className="h-4 w-4 text-amber-600" />
            <div className="max-w-[140px] truncate sm:max-w-[190px]">
              <span className="block truncate text-xs font-semibold text-stone-900">
                {currentTenant?.name || 'Selecionar Estabelecimento'}
              </span>
              <span className="block truncate text-[10px] text-stone-500 capitalize">
                {currentTenant?.segment || 'Geral'}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
          </button>

          {tenantDropdownOpen && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
                Estabelecimentos Cadastrados
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {tenants.map((t) => (
                  <button
                    key={t.id}
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
                        {t.document || 'Sem CNPJ'} • {t.segment}
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
                  onClick={() => {
                    setTenantDropdownOpen(false);
                    onOpenEditTenant();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  <Building2 className="h-3.5 w-3.5 text-stone-500" />
                  Editar Dados do Estabelecimento
                </button>
                <button
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

      {/* Lado Direito: Alternância ADM / Vendedor + Perfil + Ações de Demonstração */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Toggle de Ambiente: Área Administrativa vs Área do Vendedor */}
        <div className="hidden md:flex items-center rounded-xl bg-stone-100 p-1 border border-stone-200">
          <button
            onClick={() => setActiveView('admin')}
            disabled={!isAdm}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              activeView === 'admin'
                ? 'bg-white text-stone-900 shadow-sm font-semibold'
                : isAdm
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-stone-400 cursor-not-allowed opacity-60'
            }`}
            title={!isAdm ? 'Disponível apenas para Administrador ou Gerente' : 'Visão Geral e Administrativa'}
          >
            <Shield className="h-3.5 w-3.5 text-amber-600" />
            Painel ADM
          </button>
          <button
            onClick={() => setActiveView('vendedor')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              activeView === 'vendedor'
                ? 'bg-amber-600 text-white shadow-sm font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            title="Interface ágil para Vendedor, Garçom e Caixa"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Área do Vendedor
          </button>
        </div>

        {/* Menu de Gestão de Dados (Demonstração / Banco Local) */}
        <div className="relative">
          <button
            onClick={() => {
              setDataDropdownOpen(!dataDropdownOpen);
              setUserDropdownOpen(false);
              setTenantDropdownOpen(false);
            }}
            className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            title="Banco Local SQLite & Dados"
          >
            <Database className="h-3.5 w-3.5 text-stone-500" />
            <span className="hidden xl:inline text-xs">Banco Local</span>
            <ChevronDown className="h-3 w-3 text-stone-400" />
          </button>

          {dataDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl ring-1 ring-black/5 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <span className="text-xs font-bold text-stone-900">Banco SQLite Local</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Matriz: {matriz.activeHost === 'android_phone' ? 'Celular ADM' : 'PC Windows'}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-stone-500 leading-relaxed">
                Autoridade Central Única. Todos os dados residem fisicamente na Matriz Ativa ({matriz.activeHostLabel}), sem nuvem e sem dependência de internet.
              </p>
              <div className="mt-3 space-y-1.5">
                <button
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

        {/* Central de Notificações & Deltas com Badge Não Lida */}
        <div className="relative">
          <button
            onClick={() => {
              setNotifDropdownOpen(!notifDropdownOpen);
              setUserDropdownOpen(false);
              setDataDropdownOpen(false);
              setTenantDropdownOpen(false);
            }}
            className="relative flex items-center justify-center rounded-xl border border-stone-200 bg-white p-2 text-stone-700 hover:bg-stone-50 transition focus:outline-none"
            title="Central de Notificações e Eventos Delta"
            aria-label="Central de Notificações"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white shadow-xs animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl ring-1 ring-black/5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <Bell className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold text-stone-900">
                    Central de Notificações
                  </span>
                  {unreadCount > 0 ? (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800">
                      {unreadCount} novas
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                      Todas lidas
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => {
                        notifications.forEach((n) => markNotificationAsRead(n.id));
                        setNotifications(getNotifications(currentTenant.id));
                      }}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold text-stone-600 hover:bg-stone-100 transition"
                      title="Marcar todas como lidas"
                    >
                      Marcar Lidas
                    </button>
                  )}
                  <button
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

              {/* Lista de Notificações com Hierarquia de Prioridades (1 a 7) */}
              <div className="mt-2.5 max-h-72 overflow-y-auto space-y-1.5 divide-y divide-stone-50 pr-0.5">
                {notifications.length > 0 ? (
                  notifications.map((n) => {
                    const priorityBadge = (p: number) => {
                      switch (p) {
                        case 1:
                          return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                        case 2:
                          return 'bg-amber-100 text-amber-800 border-amber-200';
                        case 3:
                          return 'bg-blue-100 text-blue-800 border-blue-200';
                        case 4:
                          return 'bg-purple-100 text-purple-800 border-purple-200';
                        case 5:
                          return 'bg-indigo-100 text-indigo-800 border-indigo-200';
                        case 6:
                          return 'bg-pink-100 text-pink-800 border-pink-200';
                        default:
                          return 'bg-stone-100 text-stone-700 border-stone-200';
                      }
                    };

                    return (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.read) {
                            markNotificationAsRead(n.id);
                            setNotifications(getNotifications(currentTenant.id));
                          }
                        }}
                        className={`rounded-xl p-2.5 transition text-left cursor-pointer ${
                          !n.read
                            ? 'bg-amber-50/50 border border-amber-200/60 shadow-2xs'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`rounded-md px-1.5 py-0.2 text-[9px] font-black uppercase border ${priorityBadge(
                              n.priority
                            )}`}
                          >
                            Prioridade {n.priority}
                          </span>
                          <span className="text-[10px] text-stone-400 font-mono">
                            {formatDateTimeBR(n.timestamp)}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-bold text-stone-900 leading-snug">
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-600 leading-tight">
                          {n.message}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-stone-400">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-2 text-xs font-semibold text-stone-600">
                      Nenhuma notificação pendente
                    </p>
                    <p className="text-[10px] text-stone-400">
                      Todos os dados estão perfeitamente sincronizados
                    </p>
                  </div>
                )}
              </div>

              {/* Rodapé Didático de Telemetria de Dados */}
              <div className="mt-3 border-t border-stone-100 pt-2 flex items-center justify-between text-[10px] text-stone-500 bg-stone-50/70 p-2 rounded-xl">
                <span>Delta Sync: <strong>{(deltaStats.totalBytesDownloaded / 1024).toFixed(1)} KB</strong></span>
                <span className="font-bold text-emerald-700">
                  Economizou {(deltaStats.totalBytesSaved / 1024).toFixed(1)} KB (96%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Seletor Rápido de Colaborador / Perfil */}
        <div className="relative">
          <button
            onClick={() => {
              setUserDropdownOpen(!userDropdownOpen);
              setTenantDropdownOpen(false);
              setDataDropdownOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/70 p-1.5 sm:px-3 sm:py-1.5 hover:bg-stone-100 focus:outline-none"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-xs font-bold text-amber-800">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
            </div>
            <div className="hidden text-left sm:block">
              <span className="block text-xs font-semibold text-stone-900 max-w-[120px] truncate">
                {currentUser?.name || 'Entrar'}
              </span>
              <span className="block text-[10px] text-stone-500 font-medium">
                {currentUser ? getRoleName(currentUser.role) : 'Não logado'}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50">
              <div className="p-2 border-b border-stone-100">
                <p className="text-xs font-semibold text-stone-900">{currentUser?.name}</p>
                <p className="text-[11px] text-stone-500 truncate">{currentUser?.email}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                    {currentUser ? getRoleName(currentUser.role) : ''}
                  </span>
                  {currentUser?.commissionRate ? (
                    <span className="text-[10px] text-stone-500">
                      • {currentUser.commissionRate}% de comissão
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Troca Rápida de Colaborador para Testes */}
              <div className="py-2">
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center justify-between">
                  <span>Alternar Colaborador Local</span>
                  <Sparkles className="h-3 w-3 text-amber-500" />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setUserDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition ${
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

              {/* Status de Autenticação Local */}
              <div className="border-t border-stone-100 p-2 text-center text-[11px] text-stone-500 bg-stone-50 rounded-xl">
                Autenticação local segura via Token & Hash (Sem dependência de nuvem)
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
