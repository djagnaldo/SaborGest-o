/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingDown,
  Plus,
  Trash2,
  Calendar,
  Tag,
  DollarSign,
  Wallet,
  Receipt,
  User,
  X,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { FinancialTransaction, PaymentMethod } from '../../types';
import { getExpenses, saveExpense, deleteExpense } from '../../services/storage';
import { formatBRL, formatDateTimeBR } from '../../utils/formatters';

const EXPENSE_CATEGORIES = [
  'Insumos & Alimentos',
  'Bebidas & Gelo',
  'Energia & Água',
  'Aluguel & Condomínio',
  'Salários & Diárias',
  'Manutenção & Limpeza',
  'Embalagens & Descartáveis',
  'Internet & Telefone',
  'Impostos & Taxas',
  'Outros Gastos',
];

export const ExpensesView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [expenses, setExpenses] = useState<FinancialTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<FinancialTransaction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');
  const [notes, setNotes] = useState('');

  const loadExpenses = () => {
    const list = getExpenses(currentTenant.id);
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(list);
  };

  useEffect(() => {
    loadExpenses();
    const handleSync = () => loadExpenses();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  const handleOpenAdd = () => {
    setFormError(null);
    setDescription('');
    setAmount(0);
    setCategory(EXPENSE_CATEGORIES[0]);
    setDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('dinheiro');
    setNotes('');
    setIsAddModalOpen(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amount <= 0) {
      setFormError('Informe a descrição e um valor positivo para o gasto.');
      return;
    }

    const newExpense: FinancialTransaction = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId: currentTenant.id,
      type: 'expense_variable',
      category,
      description: description.trim(),
      amount,
      date: new Date(date).toISOString(),
      paid: true,
      paymentMethod,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    saveExpense(newExpense);
    loadExpenses();
    setIsAddModalOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteExpense) return;
    deleteExpense(confirmDeleteExpense.id);
    setConfirmDeleteExpense(null);
    loadExpenses();
  };

  // Cálculos de Totais
  const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const cashExpenses = expenses
    .filter((e) => e.paymentMethod === 'dinheiro')
    .reduce((acc, e) => acc + (e.amount || 0), 0);
  const pixExpenses = expenses
    .filter((e) => e.paymentMethod === 'pix')
    .reduce((acc, e) => acc + (e.amount || 0), 0);

  const filteredExpenses = expenses.filter((e) => {
    const matchesCategory = selectedCategory === 'all' || e.category === selectedCategory;
    const matchesSearch =
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.userName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Controle de Gastos & Despesas
            </h1>
            <span className="text-xs text-stone-500 font-medium">
              · {expenses.length} lançamentos
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Registro detalhado de saídas do estabelecimento. Cada despesa abate no caixa e nos relatórios financeiros.
          </p>
        </div>

        {isAdm && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 active:scale-95 transition"
          >
            <Plus className="h-4 w-4" />
            <span>+ Novo Gasto</span>
          </button>
        )}
      </div>

      {/* 3 Cards de Resumo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Total de Gastos Registrados
          </span>
          <p className="mt-1 text-2xl font-black text-rose-700">
            {formatBRL(totalExpenses)}
          </p>
          <span className="text-[11px] text-stone-500 font-medium">
            {expenses.length} despesa(s) registrada(s)
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Saídas em Dinheiro (Caixa)
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900">
            {formatBRL(cashExpenses)}
          </p>
          <span className="text-[11px] text-stone-400 font-medium">
            Abatido diretamente do Caixa Físico
          </span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Pagos via PIX / Transferência
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900">
            {formatBRL(pixExpenses)}
          </p>
          <span className="text-[11px] text-stone-400 font-medium">
            Conta Bancária do Estabelecimento
          </span>
        </div>
      </div>

      {/* Barra de Busca e Filtro de Categoria */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por descrição, categoria ou responsável..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 focus:border-amber-500 focus:outline-none"
        >
          <option value="all">Todas as Categorias</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Lista de Gastos */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
            Lançamentos de Despesas
          </h2>
          <span className="text-[11px] text-stone-400">
            {filteredExpenses.length} item(ns)
          </span>
        </div>

        {filteredExpenses.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-4 hover:bg-stone-50/70 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 shrink-0">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-stone-900">
                        {expense.description}
                      </p>
                      <span className="text-[10px] text-stone-500 font-medium">
                        · {expense.category}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {formatDateTimeBR(expense.date)} · Pago via{' '}
                      <strong className="uppercase">{expense.paymentMethod || 'Dinheiro'}</strong> ·{' '}
                      Por {expense.userName}
                    </p>
                    {expense.notes && (
                      <p className="text-[10px] text-stone-400 italic mt-0.5">{expense.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-black text-rose-700">
                    -{formatBRL(expense.amount)}
                  </span>

                  {isAdm && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteExpense(expense)}
                      className="rounded-lg p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Excluir lançamento de despesa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-stone-400">
            <Receipt className="mx-auto h-10 w-10 text-stone-300" />
            <p className="mt-2 text-xs font-semibold text-stone-600">Nenhum gasto registrado</p>
            <p className="text-[10px] text-stone-400">
              Clique em "+ Novo Gasto" para cadastrar despesas operacionais.
            </p>
          </div>
        )}
      </div>

      {/* MODAL: REGISTRAR NOVO GASTO */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-lg">Novo Gasto</h3>
                <p className="text-xs text-stone-500">Registrar despesa do estabelecimento</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="mt-4 space-y-3.5">
              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Descrição da Despesa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de carvão, Reposição de gelo, Conta de luz"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    Valor (R$) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0,00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs font-mono font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">Data do Gasto</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="dinheiro">Dinheiro (Caixa)</option>
                    <option value="pix">PIX / Transferência</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Responsável / Comprovante
                </label>
                <input
                  type="text"
                  disabled
                  value={currentUser?.name || 'Administrador'}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2.5 text-xs text-stone-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">Observações (Opcional)</label>
                <input
                  type="text"
                  placeholder="Número de nota fiscal, fornecedor, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5 text-[11px] text-stone-500 border border-stone-200">
                Gastos pagos em <strong>Dinheiro</strong> abatem automaticamente do saldo do caixa geral ativo.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition"
                >
                  Salvar Despesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REACT: CONFIRMAR EXCLUSÃO DE GASTO */}
      {confirmDeleteExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">Excluir Lançamento de Gasto</h3>
                <p className="text-xs text-stone-500">
                  Confirma a exclusão do gasto "{confirmDeleteExpense.description}"?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteExpense(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
