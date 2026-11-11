/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Grid2X2,
  Clock,
  User,
  Plus,
  Receipt,
  ArrowRightLeft,
  CheckCircle2,
  X,
  Banknote,
  ShoppingBag,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { RestaurantTable } from '../../types';
import { getTables, saveTable, addAuditLog } from '../../services/storage';
import { formatBRL, formatTimeBR, getTableStatusLabel } from '../../utils/formatters';

export const TablesView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [tables, setTables] = useState<RestaurantTable[]>(getTables(currentTenant.id));
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const refreshTables = () => {
    setTables(getTables(currentTenant.id));
  };

  const handleOpenTable = (table: RestaurantTable) => {
    const updated: RestaurantTable = {
      ...table,
      status: 'occupied',
      openedAt: new Date().toISOString(),
      waiterId: currentUser?.id,
      waiterName: currentUser?.name,
      currentTotal: 0,
    };
    saveTable(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'garcom',
      userName: currentUser?.name || 'Garçom',
      action: 'ABRIU_MESA',
      details: `Abriu a ${table.label || `Mesa ${table.number}`}`,
    });
    refreshTables();
    setIsActionModalOpen(false);
  };

  const handleCloseBill = (table: RestaurantTable) => {
    const updated: RestaurantTable = {
      ...table,
      status: 'closing',
    };
    saveTable(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'garcom',
      userName: currentUser?.name || 'Garçom',
      action: 'SOLICITOU_CONTA',
      details: `Solicitou fechamento de conta para a ${table.label || `Mesa ${table.number}`}`,
    });
    refreshTables();
    setIsActionModalOpen(false);
  };

  const handleFreeTable = (table: RestaurantTable) => {
    const updated: RestaurantTable = {
      ...table,
      status: 'available',
      openedAt: undefined,
      waiterId: undefined,
      waiterName: undefined,
      currentTotal: 0,
      customerName: undefined,
    };
    saveTable(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'garcom',
      userName: currentUser?.name || 'Garçom',
      action: 'LIBEROU_MESA',
      details: `Liberou a ${table.label || `Mesa ${table.number}`} após pagamento`,
    });
    refreshTables();
    setIsActionModalOpen(false);
  };

  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
  const closingCount = tables.filter((t) => t.status === 'closing').length;
  const availableCount = tables.filter((t) => t.status === 'available').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Mesas & Comandas
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Etapa 3 Integrada
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Painel visual do salão em tempo real. Abertura, fechamento, divisão de contas e transferências.
          </p>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            {availableCount} Livres
          </span>
          <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            {occupiedCount} Ocupadas
          </span>
          {closingCount > 0 && (
            <span className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 animate-pulse">
              {closingCount} Fechando Conta
            </span>
          )}
        </div>
      </div>

      {/* Grid de Mesas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {tables.map((table) => {
          const { label, badgeClass, cardClass } = getTableStatusLabel(table.status);

          return (
            <div
              key={table.id}
              onClick={() => {
                setSelectedTable(table);
                setIsActionModalOpen(true);
              }}
              className={`flex flex-col justify-between rounded-2xl border p-4 shadow-2xs transition cursor-pointer hover:shadow-md ${cardClass}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-stone-900">
                    #{table.number}
                  </span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${badgeClass}`}>
                    {label}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-stone-600 truncate">
                  {table.label || `Mesa ${table.number}`}
                </p>
                {table.customerName && (
                  <p className="text-[10px] text-stone-400 truncate">{table.customerName}</p>
                )}
              </div>

              <div className="mt-4 border-t border-stone-100 pt-2 text-stone-600">
                {table.status !== 'available' ? (
                  <>
                    <p className="text-sm font-bold text-stone-900">
                      {formatBRL(table.currentTotal || 0)}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimeBR(table.openedAt)}
                      </span>
                      <span className="truncate max-w-[60px]">{table.waiterName?.split(' ')[0]}</span>
                    </div>
                  </>
                ) : (
                  <div className="py-2 text-center text-[11px] font-medium text-emerald-600">
                    Toque para abrir
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Ações da Mesa */}
      {isActionModalOpen && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-bold text-stone-900 text-base">
                  {selectedTable.label || `Mesa ${selectedTable.number}`}
                </h3>
                <p className="text-xs text-stone-500">Capacidade: {selectedTable.capacity} pessoas</p>
              </div>
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedTable.status === 'available' ? (
                <button
                  onClick={() => handleOpenTable(selectedTable)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
                >
                  <Plus className="h-4 w-4" />
                  Abrir Mesa / Nova Comanda
                </button>
              ) : (
                <>
                  <div className="rounded-xl bg-stone-50 p-3 border border-stone-200">
                    <div className="flex justify-between text-xs text-stone-500">
                      <span>Total Consumido</span>
                      <span className="text-base font-bold text-stone-900">
                        {formatBRL(selectedTable.currentTotal)}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-stone-400">
                      <span>Atendente: {selectedTable.waiterName || 'Não atribuído'}</span>
                      <span>Desde: {formatTimeBR(selectedTable.openedAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCloseBill(selectedTable)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition"
                  >
                    <Receipt className="h-4 w-4 text-amber-700" />
                    Solicitar Conta / Pré-Fechamento
                  </button>

                  <button
                    onClick={() => handleFreeTable(selectedTable)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Registrar Pagamento & Liberar Mesa
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
