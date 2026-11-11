/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Contact2, UserPlus, Phone, MapPin, Search, AlertCircle, Plus } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { getCustomers, getSuppliers, saveCustomer, saveSupplier } from '../../services/storage';
import { formatBRL } from '../../utils/formatters';

export const ContactsView: React.FC = () => {
  const { currentTenant } = useTenant();
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
  const [searchTerm, setSearchTerm] = useState('');

  const customers = getCustomers(currentTenant.id);
  const suppliers = getSuppliers(currentTenant.id);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Clientes & Fornecedores
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Contatos
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Gerencie o histórico de pedidos, pendências de fiado e compras com fornecedores.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200">
          <button
            onClick={() => setTab('customers')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'customers' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            Clientes ({customers.length})
          </button>
          <button
            onClick={() => setTab('suppliers')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'suppliers' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            Fornecedores ({suppliers.length})
          </button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
        <input
          type="text"
          placeholder={tab === 'customers' ? 'Buscar cliente por nome ou telefone...' : 'Buscar fornecedor...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:outline-none"
        />
      </div>

      {/* Grid de Contatos */}
      {tab === 'customers' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCustomers.map((c) => (
            <div key={c.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">{c.name}</h3>
                  <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3 text-stone-400" /> {c.phone}
                  </p>
                </div>
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                  {c.ordersCount} pedidos
                </span>
              </div>

              {c.address && (
                <p className="text-xs text-stone-500 flex items-start gap-1">
                  <MapPin className="h-3 w-3 text-stone-400 mt-0.5 shrink-0" />
                  <span className="line-clamp-1">{c.address}</span>
                </p>
              )}

              <div className="border-t border-stone-100 pt-2 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-stone-400">Total Gasto</span>
                  <p className="font-bold text-stone-800">{formatBRL(c.totalSpent)}</p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-stone-400">Saldo Devedor / Fiado</span>
                  <p className={`font-bold ${c.pendingCredit > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatBRL(c.pendingCredit)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((s) => (
            <div key={s.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs space-y-3">
              <div>
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                  {s.category}
                </span>
                <h3 className="font-bold text-stone-900 text-sm mt-1">{s.name}</h3>
                <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3 text-stone-400" /> {s.phone}
                </p>
              </div>

              {s.document && (
                <p className="text-xs text-stone-400">CNPJ: {s.document}</p>
              )}

              <div className="border-t border-stone-100 pt-2 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-stone-400">Status</span>
                  <p className="font-medium text-emerald-600">Ativo</p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-stone-400">A Pagar</span>
                  <p className="font-bold text-stone-800">{formatBRL(s.pendingBalance)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
