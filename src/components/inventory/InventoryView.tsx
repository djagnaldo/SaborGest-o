/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Boxes,
  ChefHat,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Search,
  Plus,
  History,
  RotateCw,
  Edit3,
  PackagePlus,
  CheckCircle2,
  X,
  Filter,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Product, InventoryTransaction } from '../../types';
import {
  getProducts,
  updateProductStock,
  getInventoryTransactions,
} from '../../services/storage';
import { formatBRL, formatDateTimeBR } from '../../utils/formatters';

export const InventoryView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modais de Ajuste e Entrada
  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null);
  const [newStockInput, setNewStockInput] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('');

  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryProductId, setEntryProductId] = useState<string>('');
  const [entryQuantity, setEntryQuantity] = useState<number>(10);
  const [entryUnitCost, setEntryUnitCost] = useState<number>(0);
  const [entryReason, setEntryReason] = useState<string>('');

  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = () => {
    const prods = getProducts(currentTenant.id);
    setProducts(prods);
    const trans = getInventoryTransactions(currentTenant.id);
    setTransactions(trans);
    if (prods.length > 0 && !entryProductId) {
      setEntryProductId(prods[0].id);
    }
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  // Abrir Modal de Ajuste/Correção
  const handleOpenAdjust = (prod: Product) => {
    setAdjustModalProduct(prod);
    setNewStockInput(prod.stockQuantity ?? 0);
    setAdjustReason('Contagem física de inventário');
  };

  // Salvar Correção de Estoque pelo ADM
  const handleSaveAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalProduct) return;
    if (!adjustReason.trim()) {
      alert('Informe o motivo da alteração de estoque.');
      return;
    }

    const res = updateProductStock(
      adjustModalProduct.id,
      newStockInput,
      adjustReason.trim(),
      currentUser?.name || 'Administrador',
      currentUser?.id || 'admin',
      'adjustment'
    );

    if (res.success) {
      loadData();
      setAdjustModalProduct(null);
      showFeedback(`✓ Estoque de "${adjustModalProduct.name}" corrigido para ${newStockInput} ${adjustModalProduct.unit}.`);
    } else {
      alert(res.error || 'Erro ao atualizar estoque.');
    }
  };

  // Salvar Entrada de Mercadoria
  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const targetProd = products.find((p) => p.id === entryProductId);
    if (!targetProd) return;
    if (entryQuantity <= 0) {
      alert('Informe uma quantidade positiva para a entrada.');
      return;
    }

    const currentStock = targetProd.stockQuantity ?? 0;
    const newStock = currentStock + entryQuantity;
    const reasonText = entryReason.trim() || 'Entrada de compra de mercadoria';

    const res = updateProductStock(
      targetProd.id,
      newStock,
      reasonText,
      currentUser?.name || 'Administrador',
      currentUser?.id || 'admin',
      'purchase'
    );

    if (res.success) {
      loadData();
      setIsEntryModalOpen(false);
      showFeedback(`✓ Entrada de +${entryQuantity} ${targetProd.unit} registrada para "${targetProd.name}".`);
    } else {
      alert(res.error || 'Erro ao registrar entrada.');
    }
  };

  const lowStock = products.filter((p) => p.stockQuantity <= p.minStock);
  const totalItemsCount = products.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.internalCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTransactions = transactions.filter(
    (t) =>
      t.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.userName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div className="rounded-2xl border border-stone-800 bg-stone-900 px-4 py-3 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-top-2 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-stone-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Controle de Estoque
            </h1>
            <span className="text-xs text-stone-500 font-medium">
              · {products.length} produtos monitorados
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Gerenciamento livre de estoque pelo ADM. Correções, entradas de mercadorias e histórico completo.
          </p>
        </div>

        {isAdm && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEntryQuantity(10);
                setEntryReason('Entrada de mercadoria com fornecedor');
                setIsEntryModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 active:scale-95 transition"
            >
              <PackagePlus className="h-4 w-4" />
              <span>+ Entrada de Mercadoria</span>
            </button>
          </div>
        )}
      </div>

      {/* 3 Cards de Métricas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Produtos em Alerta
          </span>
          <p className="mt-1 text-2xl font-black text-amber-600">
            {lowStock.length}
          </p>
          <span className="text-[11px] text-stone-500 font-medium">
            Abaixo do estoque mínimo configurado
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Unidades Físicas em Estoque
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900">
            {totalItemsCount}
          </p>
          <span className="text-[11px] text-stone-500 font-medium">
            Saldo acumulado de todos os produtos
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Movimentações Registradas
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900">
            {transactions.length}
          </p>
          <span className="text-[11px] text-stone-500 font-medium">
            Histórico auditado na Matriz
          </span>
        </div>
      </div>

      {/* Tabs de Navegação Interna: Posição de Estoque vs Histórico */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-2">
        <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1 border border-stone-200">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'stock'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Boxes className="h-3.5 w-3.5" />
            <span>Posição de Estoque</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Histórico de Movimentações ({transactions.length})</span>
          </button>
        </div>

        {/* Busca */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            placeholder="Filtrar por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ABA 1: POSIÇÃO DE ESTOQUE */}
      {activeTab === 'stock' && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
          <table className="w-full text-left text-xs text-stone-600">
            <thead className="border-b border-stone-200 bg-stone-50/70 text-[10px] font-semibold uppercase text-stone-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Estoque Disponível</th>
                <th className="px-4 py-3">Estoque Mínimo</th>
                <th className="px-4 py-3">Preço Venda</th>
                <th className="px-4 py-3">Status</th>
                {isAdm && <th className="px-4 py-3 text-right">Ação ADM</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredProducts.map((p) => {
                const isAlert = p.stockQuantity <= p.minStock;

                return (
                  <tr key={p.id} className="hover:bg-stone-50/70 transition">
                    <td className="px-4 py-3 font-mono text-stone-400 text-[11px]">{p.internalCode}</td>
                    <td className="px-4 py-3 font-bold text-stone-900">
                      <div className="flex items-center gap-2">
                        {p.imageUrl && (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-7 w-7 rounded-lg object-cover border border-stone-200 shrink-0"
                          />
                        )}
                        <span>{p.name}</span>
                        {!p.active && (
                          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                            Desativado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-stone-900 text-sm">
                      {p.stockQuantity} <span className="text-xs font-normal text-stone-400">{p.unit}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-400">
                      {p.minStock} {p.unit}
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-900">
                      {formatBRL(p.sellingPrice)}
                    </td>
                    <td className="px-4 py-3">
                      {isAlert ? (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 flex items-center gap-1 w-max border border-amber-200">
                          <AlertTriangle className="h-3 w-3" /> Repor Estoque
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold text-[11px]">Regular</span>
                      )}
                    </td>
                    {isAdm && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenAdjust(p)}
                          className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition"
                          title="Corrigir quantidade em estoque"
                        >
                          <Edit3 className="h-3 w-3 text-stone-500" />
                          <span>Corrigir</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ABA 2: HISTÓRICO DE MOVIMENTAÇÕES (OBRIGATÓRIO) */}
      {activeTab === 'history' && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
          <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
              Histórico Completo de Alterações de Estoque
            </h2>
            <span className="text-[11px] text-stone-400">
              Registrado com responsável, data e motivo
            </span>
          </div>

          {filteredTransactions.length > 0 ? (
            <table className="w-full text-left text-xs text-stone-600">
              <thead className="border-b border-stone-200 bg-stone-50/70 text-[10px] font-semibold uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Data / Hora</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Qtd Anterior</th>
                  <th className="px-4 py-3">Novo Saldo</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Motivo / Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredTransactions.map((t) => {
                  const typeLabel =
                    t.type === 'purchase'
                      ? 'Entrada (+)'
                      : t.type === 'sale'
                      ? 'Venda (-)'
                      : t.type === 'waste'
                      ? 'Perda (-)'
                      : 'Correção';

                  const typeColor =
                    t.type === 'purchase'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : t.type === 'sale'
                      ? 'bg-stone-100 text-stone-800 border-stone-200'
                      : t.type === 'waste'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200';

                  return (
                    <tr key={t.id} className="hover:bg-stone-50/70 transition">
                      <td className="px-4 py-3 text-[11px] font-mono text-stone-500">
                        {formatDateTimeBR(t.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-bold text-stone-900">
                        {t.productName}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${typeColor}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-500">
                        {t.previousStock} un
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-stone-900">
                        {t.newStock} un
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {t.userName}
                      </td>
                      <td className="px-4 py-3 text-stone-500 italic max-w-xs truncate">
                        {t.reason || 'Sem observações'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-stone-400">
              <History className="mx-auto h-10 w-10 text-stone-300" />
              <p className="mt-2 text-xs font-semibold text-stone-600">Nenhuma movimentação encontrada</p>
              <p className="text-[10px] text-stone-400">
                Toda alteração de estoque pelo ADM e toda venda baixada aparecerão aqui.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CORRIGIR QUANTIDADE DE ESTOQUE (ADM) */}
      {adjustModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-lg">Corrigir Estoque</h3>
                <p className="text-xs text-stone-500">{adjustModalProduct.name}</p>
              </div>
              <button
                onClick={() => setAdjustModalProduct(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="mt-4 space-y-3.5">
              <div className="rounded-xl bg-stone-50 p-3 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 font-semibold uppercase">Estoque Anterior</span>
                  <p className="text-lg font-black text-stone-900">
                    {adjustModalProduct.stockQuantity} {adjustModalProduct.unit}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-stone-400 font-semibold uppercase">Responsável</span>
                  <p className="text-xs font-bold text-stone-700">{currentUser?.name}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Nova Quantidade Disponível <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newStockInput}
                  onChange={(e) => setNewStockInput(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm font-mono font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Motivo da Alteração <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Contagem física, Ajuste de quebra, Conferência"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalProduct(null)}
                  className="w-1/2 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition"
                >
                  Confirmar Correção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENTRADA DE MERCADORIA (ADM) */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-lg">Entrada de Mercadoria</h3>
                <p className="text-xs text-stone-500">Adicionar itens recebidos ao estoque físico</p>
              </div>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Selecionar Produto <span className="text-rose-500">*</span>
                </label>
                <select
                  value={entryProductId}
                  onChange={(e) => setEntryProductId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Atual: {p.stockQuantity} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    Quantidade Adicionada <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={entryQuantity}
                    onChange={(e) => setEntryQuantity(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs font-mono font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    Custo Unitário (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0,00"
                    value={entryUnitCost || ''}
                    onChange={(e) => setEntryUnitCost(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs font-mono text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Fornecedor / Observação da Entrada
                </label>
                <input
                  type="text"
                  placeholder="Ex: Compra Distribuidora Bebidas SP - NF 4920"
                  value={entryReason}
                  onChange={(e) => setEntryReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="w-1/2 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition"
                >
                  Salvar Entrada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
