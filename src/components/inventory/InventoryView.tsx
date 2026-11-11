/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Boxes, ChefHat, ArrowDown, ArrowUp, AlertTriangle, Search, Plus } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { getProducts, saveProduct, addAuditLog } from '../../services/storage';
import { formatBRL } from '../../utils/formatters';

export const InventoryView: React.FC = () => {
  const { currentTenant } = useTenant();
  const [products, setProducts] = useState(getProducts(currentTenant.id));
  const [searchTerm, setSearchTerm] = useState('');

  const lowStock = products.filter((p) => p.stockQuantity <= p.minStock);
  const compositeProducts = products.filter((p) => p.isComposite);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.internalCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Estoque Inteligente & Fichas Técnicas
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Etapas 2 & 4
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">
          Acompanhamento de saldo físico, alertas de reposição e baixa automática de ingredientes por receita.
        </p>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-xs font-medium text-stone-500">Itens em Alerta de Estoque</span>
          <p className="mt-2 text-2xl font-bold text-amber-600">{lowStock.length}</p>
          <p className="mt-1 text-[11px] text-stone-400">Abaixo do estoque mínimo</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-xs font-medium text-stone-500">Produtos com Ficha Técnica</span>
          <p className="mt-2 text-2xl font-bold text-purple-700">{compositeProducts.length}</p>
          <p className="mt-1 text-[11px] text-purple-600">Baixa automática de insumos</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-xs font-medium text-stone-500">Total de SKUs Ativos</span>
          <p className="mt-2 text-2xl font-bold text-stone-900">{products.length}</p>
          <p className="mt-1 text-[11px] text-stone-400">Produtos cadastrados</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
        <input
          type="text"
          placeholder="Buscar produto por nome ou código..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-xs text-stone-900 focus:outline-none"
        />
      </div>

      {/* Tabela de Estoque */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs text-stone-600">
          <thead className="border-b border-stone-200 bg-stone-50/70 text-[10px] font-semibold uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Estoque Atual</th>
              <th className="px-4 py-3">Estoque Mínimo</th>
              <th className="px-4 py-3">Custo Unitário</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filteredProducts.map((p) => {
              const isAlert = p.stockQuantity <= p.minStock;

              return (
                <tr key={p.id} className="hover:bg-stone-50/70">
                  <td className="px-4 py-3 font-mono text-stone-500">{p.internalCode}</td>
                  <td className="px-4 py-3 font-bold text-stone-900">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.isComposite ? (
                      <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 flex items-center gap-1 w-max">
                        <ChefHat className="h-3 w-3" /> Ficha Técnica
                      </span>
                    ) : (
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">
                        Item Simples
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-stone-900">
                    {p.stockQuantity} {p.unit}
                  </td>
                  <td className="px-4 py-3 text-stone-500">{p.minStock} {p.unit}</td>
                  <td className="px-4 py-3 font-semibold text-stone-700">{formatBRL(p.costPrice)}</td>
                  <td className="px-4 py-3">
                    {isAlert ? (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 flex items-center gap-1 w-max border border-amber-200">
                        <AlertTriangle className="h-3 w-3" /> Repor Estoque
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-semibold text-[11px]">Regular</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
