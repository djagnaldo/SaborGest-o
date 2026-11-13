/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Phone,
  MapPin,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Building2,
  Mail,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Customer, Supplier } from '../../types';
import {
  getCustomers,
  getSuppliers,
  saveCustomer,
  deleteCustomer,
  saveSupplier,
  deleteSupplier,
  addAuditLog,
} from '../../services/storage';
import {
  upsertCustomerApi,
  deleteCustomerApi,
  upsertSupplierApi,
  deleteSupplierApi,
} from '../../services/sync-client';
import { formatBRL } from '../../utils/formatters';

export const ContactsView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { isAdm, currentUser } = useAuth();
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>(() => getCustomers(currentTenant.id));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => getSuppliers(currentTenant.id));
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Cliente
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custForm, setCustForm] = useState({ name: '', phone: '', address: '', notes: '' });

  // Modal Fornecedor
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [suppForm, setSuppForm] = useState({
    name: '',
    category: 'Alimentos & Insumos',
    phone: '',
    email: '',
    document: '',
    pendingBalance: 0,
  });

  // Confirmação de Exclusão
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'customer' | 'supplier';
    id: string;
    name: string;
  } | null>(null);

  const refresh = () => {
    setCustomers(getCustomers(currentTenant.id));
    setSuppliers(getSuppliers(currentTenant.id));
  };

  useEffect(() => {
    refresh();
    const onSync = () => refresh();
    window.addEventListener('sabor_local_sync', onSync);
    return () => window.removeEventListener('sabor_local_sync', onSync);
  }, [currentTenant.id]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const openNewCustomer = () => {
    setEditingCustomer(null);
    setCustForm({ name: '', phone: '', address: '', notes: '' });
    setCustomerModalOpen(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCustForm({
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
    });
    setCustomerModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name.trim()) return;
    const payload: Customer = editingCustomer
      ? {
          ...editingCustomer,
          name: custForm.name.trim(),
          phone: custForm.phone.trim(),
          address: custForm.address.trim() || undefined,
          notes: custForm.notes.trim() || undefined,
          pendingCredit: 0,
        }
      : {
          id: `cust-${Date.now()}`,
          tenantId: currentTenant.id,
          name: custForm.name.trim(),
          phone: custForm.phone.trim(),
          address: custForm.address.trim() || undefined,
          notes: custForm.notes.trim() || undefined,
          totalSpent: 0,
          pendingCredit: 0,
          ordersCount: 0,
          createdAt: new Date().toISOString(),
        };

    saveCustomer(payload);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: editingCustomer ? 'EDITOU_CLIENTE' : 'CRIOU_CLIENTE',
      details: `${editingCustomer ? 'Atualizou' : 'Cadastrou'} cliente "${payload.name}".`,
    });
    try {
      await upsertCustomerApi(currentTenant.id, payload, currentUser?.id);
    } catch {
      // fallback offline preservado
    }
    setCustomerModalOpen(false);
    refresh();
    showToast(editingCustomer ? 'Cliente atualizado!' : 'Cliente cadastrado com sucesso!');
  };

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSuppForm({
      name: '',
      category: 'Alimentos & Insumos',
      phone: '',
      email: '',
      document: '',
      pendingBalance: 0,
    });
    setSupplierModalOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSuppForm({
      name: s.name,
      category: s.category || 'Geral',
      phone: s.phone || '',
      email: s.email || '',
      document: s.document || '',
      pendingBalance: s.pendingBalance || 0,
    });
    setSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppForm.name.trim()) return;
    const payload: Supplier = editingSupplier
      ? {
          ...editingSupplier,
          name: suppForm.name.trim(),
          category: suppForm.category.trim() || 'Geral',
          phone: suppForm.phone.trim(),
          email: suppForm.email.trim() || undefined,
          document: suppForm.document.trim() || undefined,
          pendingBalance: Number(suppForm.pendingBalance || 0),
        }
      : {
          id: `supp-${Date.now()}`,
          tenantId: currentTenant.id,
          name: suppForm.name.trim(),
          category: suppForm.category.trim() || 'Geral',
          phone: suppForm.phone.trim(),
          email: suppForm.email.trim() || undefined,
          document: suppForm.document.trim() || undefined,
          pendingBalance: Number(suppForm.pendingBalance || 0),
          createdAt: new Date().toISOString(),
        };

    saveSupplier(payload);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: editingSupplier ? 'EDITOU_FORNECEDOR' : 'CRIOU_FORNECEDOR',
      details: `${editingSupplier ? 'Atualizou' : 'Cadastrou'} fornecedor "${payload.name}".`,
    });
    try {
      await upsertSupplierApi(currentTenant.id, payload, currentUser?.id);
    } catch {
      // fallback offline preservado
    }
    setSupplierModalOpen(false);
    refresh();
    showToast(editingSupplier ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado com sucesso!');
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const actor = currentUser ? { id: currentUser.id, name: currentUser.name } : undefined;
    if (confirmDelete.kind === 'customer') {
      deleteCustomer(confirmDelete.id, actor);
      try {
        await deleteCustomerApi(currentTenant.id, confirmDelete.id, currentUser?.id);
      } catch {
        // noop
      }
      showToast(`Cliente "${confirmDelete.name}" removido.`);
    } else {
      deleteSupplier(confirmDelete.id, actor);
      try {
        await deleteSupplierApi(currentTenant.id, confirmDelete.id, currentUser?.id);
      } catch {
        // noop
      }
      showToast(`Fornecedor "${confirmDelete.name}" removido.`);
    }
    setConfirmDelete(null);
    refresh();
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.address || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Clientes & Fornecedores
          </h1>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Cadastro completo de clientes do estabelecimento e parceiros fornecedores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200">
            <button
              type="button"
              onClick={() => setTab('customers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'customers' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
              }`}
            >
              Clientes ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('suppliers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'suppliers' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
              }`}
            >
              Fornecedores ({suppliers.length})
            </button>
          </div>

          {isAdm && (
            <button
              type="button"
              onClick={tab === 'customers' ? openNewCustomer : openNewSupplier}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {tab === 'customers' ? 'Novo Cliente' : 'Novo Fornecedor'}
            </button>
          )}
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
        <input
          type="text"
          placeholder={
            tab === 'customers'
              ? 'Buscar cliente por nome, telefone ou endereço...'
              : 'Buscar fornecedor por nome, categoria ou telefone...'
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Grid de Contatos */}
      {tab === 'customers' ? (
        filteredCustomers.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-xs text-stone-500">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-stone-900 text-sm truncate">{c.name}</h3>
                      <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 text-stone-400 shrink-0" />
                        <span>{c.phone || 'Sem telefone'}</span>
                      </p>
                    </div>
                    {isAdm && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditCustomer(c)}
                          className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-800"
                          title="Editar cliente"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ kind: 'customer', id: c.id, name: c.name })}
                          className="p-1.5 rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Excluir cliente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {c.address && (
                    <p className="text-xs text-stone-500 flex items-start gap-1">
                      <MapPin className="h-3 w-3 text-stone-400 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{c.address}</span>
                    </p>
                  )}

                  {c.notes && (
                    <p className="text-[11px] text-stone-500 bg-stone-50 rounded-lg px-2.5 py-1.5 border border-stone-100">
                      {c.notes}
                    </p>
                  )}
                </div>

                <div className="border-t border-stone-100 pt-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-stone-400">Pedidos Registrados</span>
                    <p className="font-bold text-stone-800">{c.ordersCount || 0} pedido(s)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-stone-400">Total Consumido</span>
                    <p className="font-bold text-emerald-700">{formatBRL(c.totalSpent || 0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredSuppliers.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-xs text-stone-500">
          Nenhum fornecedor encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                      {s.category}
                    </span>
                    <h3 className="font-bold text-stone-900 text-sm mt-1 truncate">{s.name}</h3>
                    <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3 text-stone-400 shrink-0" />
                      <span>{s.phone || 'Sem telefone'}</span>
                    </p>
                  </div>
                  {isAdm && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditSupplier(s)}
                        className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-800"
                        title="Editar fornecedor"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ kind: 'supplier', id: s.id, name: s.name })}
                        className="p-1.5 rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Excluir fornecedor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {s.email && (
                  <p className="text-[11px] text-stone-500 flex items-center gap-1">
                    <Mail className="h-3 w-3 text-stone-400 shrink-0" />
                    <span className="truncate">{s.email}</span>
                  </p>
                )}

                {s.document && (
                  <p className="text-[11px] text-stone-500 flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-stone-400 shrink-0" />
                    <span>CNPJ/CPF: {s.document}</span>
                  </p>
                )}
              </div>

              <div className="border-t border-stone-100 pt-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-stone-400">Situação</span>
                  <p className="font-semibold text-emerald-700">Ativo</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-stone-400">Saldo de Compras</span>
                  <p className="font-bold text-stone-800">{formatBRL(s.pendingBalance || 0)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL CLIENTE (CRIAR / EDITAR) */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-black text-stone-900 text-base">
                {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button
                type="button"
                onClick={() => setCustomerModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={custForm.name}
                  onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                  placeholder="Ex: Maria Oliveira"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={custForm.phone}
                  onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                  placeholder="(11) 99999-0000"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">Endereço</label>
                <input
                  type="text"
                  value={custForm.address}
                  onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
                  placeholder="Rua, número e bairro"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={custForm.notes}
                  onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
                  placeholder="Preferências de atendimento..."
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 font-semibold text-stone-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FORNECEDOR (CRIAR / EDITAR) */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-black text-stone-900 text-base">
                {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button
                type="button"
                onClick={() => setSupplierModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Razão Social / Nome *</label>
                <input
                  type="text"
                  required
                  value={suppForm.name}
                  onChange={(e) => setSuppForm({ ...suppForm, name: e.target.value })}
                  placeholder="Ex: Distribuidora Central"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Categoria *</label>
                  <input
                    type="text"
                    required
                    value={suppForm.category}
                    onChange={(e) => setSuppForm({ ...suppForm, category: e.target.value })}
                    placeholder="Ex: Bebidas, Carnes..."
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={suppForm.phone}
                    onChange={(e) => setSuppForm({ ...suppForm, phone: e.target.value })}
                    placeholder="(11) 3333-0000"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">CNPJ / CPF</label>
                  <input
                    type="text"
                    value={suppForm.document}
                    onChange={(e) => setSuppForm({ ...suppForm, document: e.target.value })}
                    placeholder="00.000.000/0001-00"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={suppForm.email}
                    onChange={(e) => setSuppForm({ ...suppForm, email: e.target.value })}
                    placeholder="contato@fornecedor.com"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSupplierModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 font-semibold text-stone-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar Fornecedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-stone-900 text-base">
              Confirmar Exclusão
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Deseja realmente remover{' '}
              <strong>{confirmDelete.name}</strong> ({confirmDelete.kind === 'customer' ? 'Cliente' : 'Fornecedor'})? Esta ação será registrada na auditoria.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="w-1/2 min-h-[42px] rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="w-1/2 min-h-[42px] rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
