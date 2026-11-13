/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Store, Trash2, CheckCircle2, Menu, Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { formatDateTimeBR } from '../../utils/formatters';
import {
  getNotifications,
  markNotificationAsRead,
  clearAllNotifications,
} from '../../services/local-db';
import { TerminalNotification } from '../../types';

interface HeaderProps {
  onToggleSidebarMobile: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebarMobile }) => {
  const { currentTenant } = useTenant();
  const { webPortalAuth } = useAuth();

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
      {/* Esquerda: Menu Mobile + Marca */}
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

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-sm font-black tracking-tight text-stone-900">
              SaborGestão
            </span>
            <p className="text-[11px] text-stone-500 leading-none truncate max-w-[200px] sm:max-w-none">
              {webPortalAuth
                ? webPortalAuth.session.mode === 'admin'
                  ? 'Navegador · Modo Administrador'
                  : 'Navegador · Modo Vendedor'
                : currentTenant?.name || 'Gestão & Ponto de Venda'}
            </p>
          </div>
        </div>
      </div>

      {/* Direita: Apenas Sininho de Notificações */}
      <div className="flex items-center shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
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
      </div>
    </header>
  );
};
