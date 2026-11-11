/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users2,
  UserPlus,
  Search,
  Shield,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Percent,
  Target,
  LogIn,
  AlertCircle,
  X,
  Save,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserProfile, UserRole, UserPermission } from '../../types';
import { formatBRL, getRoleName } from '../../utils/formatters';
import { DEFAULT_PERMISSIONS } from '../../services/mock-data';

export const TeamManagement: React.FC = () => {
  const { users, currentUser, isAdm, createUser, updateUser, deleteUser, switchUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    commissionRate: number;
    salesTargetMonthly: number;
    permissions: UserPermission;
  }>({
    name: '',
    email: '',
    phone: '',
    role: 'waiter',
    commissionRate: 5,
    salesTargetMonthly: 15000,
    permissions: { ...DEFAULT_PERMISSIONS.waiter },
  });

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'waiter',
      commissionRate: 5,
      salesTargetMonthly: 15000,
      permissions: { ...DEFAULT_PERMISSIONS.waiter },
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      commissionRate: user.commissionRate || 0,
      salesTargetMonthly: user.salesTargetMonthly || 0,
      permissions: { ...user.permissions },
    });
    setIsModalOpen(true);
  };

  const handleRoleChange = (newRole: UserRole) => {
    const basePerms = DEFAULT_PERMISSIONS[newRole] || DEFAULT_PERMISSIONS.waiter;
    setFormData((prev) => ({
      ...prev,
      role: newRole,
      commissionRate: newRole === 'waiter' ? 5 : newRole === 'cashier' ? 1 : 0,
      permissions: { ...basePerms },
    }));
  };

  const handlePermissionToggle = (key: keyof UserPermission) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    if (editingUser) {
      updateUser({
        ...editingUser,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        commissionRate: Number(formData.commissionRate),
        salesTargetMonthly: Number(formData.salesTargetMonthly),
        permissions: formData.permissions,
      });
    } else {
      createUser({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        commissionRate: Number(formData.commissionRate),
        salesTargetMonthly: Number(formData.salesTargetMonthly),
        permissions: formData.permissions,
      });
    }
    setIsModalOpen(false);
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Métricas
  const totalUsers = users.length;
  const waitersCount = users.filter((u) => u.role === 'waiter').length;
  const cashiersCount = users.filter((u) => u.role === 'cashier').length;
  const totalTarget = users.reduce((acc, u) => acc + (u.salesTargetMonthly || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header do Módulo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Equipe & Controle de Permissões
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Etapa 1
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Cadastre funcionários, defina permissões granulares, comissões individuais e metas de vendas.
          </p>
        </div>

        {isAdm && (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition focus:outline-none"
          >
            <UserPlus className="h-4 w-4" />
            Cadastrar Colaborador
          </button>
        )}
      </div>

      {/* Cards de Métricas da Equipe */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Total de Membros</span>
            <Users2 className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{totalUsers}</p>
          <p className="mt-1 text-[11px] text-stone-400">Equipe cadastrada</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Garçons & Atendentes</span>
            <Target className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{waitersCount}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Frente de salão</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Operadores de Caixa</span>
            <Percent className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{cashiersCount}</p>
          <p className="mt-1 text-[11px] text-stone-400">PDV e fechamento</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-medium">Meta Total Mensal</span>
            <Shield className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-stone-900">{formatBRL(totalTarget)}</p>
          <p className="mt-1 text-[11px] text-purple-600 font-medium">Soma de metas da equipe</p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        {/* Filtro por Cargo */}
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'admin', label: 'Administradores' },
            { id: 'manager', label: 'Gerentes' },
            { id: 'cashier', label: 'Caixas' },
            { id: 'waiter', label: 'Garçons' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id as any)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                roleFilter === tab.id
                  ? 'bg-amber-600 text-white font-semibold shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Input de Busca */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-stone-50/50 py-1.5 pl-9 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Tabela de Colaboradores */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-600">
            <thead className="border-b border-stone-200 bg-stone-50/80 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3.5">Colaborador</th>
                <th className="px-4 py-3.5">Cargo / Função</th>
                <th className="px-4 py-3.5">Comissão (%)</th>
                <th className="px-4 py-3.5">Meta Mensal</th>
                <th className="px-4 py-3.5">Permissões Chave</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredUsers.map((user) => {
                const isCurrent = currentUser?.id === user.id;

                return (
                  <tr key={user.id} className="hover:bg-stone-50/70 transition">
                    {/* Nome + Avatar + Status */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xs font-bold text-amber-800">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-stone-900">{user.name}</span>
                            {isCurrent && (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                                Você
                              </span>
                            )}
                            {user.isDemo && (
                              <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9px] font-medium text-stone-500">
                                Demo
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-400">{user.email} {user.phone ? `• ${user.phone}` : ''}</p>
                        </div>
                      </div>
                    </td>

                    {/* Cargo */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                          user.role === 'admin'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : user.role === 'manager'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : user.role === 'cashier'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {getRoleName(user.role)}
                      </span>
                    </td>

                    {/* Comissão */}
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-stone-800">
                        {user.commissionRate ? `${user.commissionRate}%` : 'Sem comissão'}
                      </span>
                    </td>

                    {/* Meta Mensal */}
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-stone-800">
                        {user.salesTargetMonthly ? formatBRL(user.salesTargetMonthly) : '-'}
                      </span>
                    </td>

                    {/* Permissões Chave (Badges de visualização rápida) */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {user.permissions.canAccessAdminPanel && (
                          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-700">
                            Painel ADM
                          </span>
                        )}
                        {user.permissions.canOpenCloseCash && (
                          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-700">
                            Caixa
                          </span>
                        )}
                        {user.permissions.canChangePrices && (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 font-medium">
                            Preços
                          </span>
                        )}
                        {user.permissions.canManageStock && (
                          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-700">
                            Estoque
                          </span>
                        )}
                        {user.permissions.canDeleteSales && (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 font-medium">
                            Excluir Vendas
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Simular / Alternar para este usuário */}
                        <button
                          onClick={() => switchUser(user.id)}
                          className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                          title="Alternar sessão para este usuário e testar suas permissões"
                        >
                          <LogIn className="h-3 w-3 text-amber-600" />
                          <span className="hidden sm:inline">Simular</span>
                        </button>

                        {isAdm && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(user)}
                              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                              title="Editar Colaborador e Permissões"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            {users.length > 1 && !isCurrent && (
                              <button
                                onClick={() => setDeleteConfirmId(user.id)}
                                className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Excluir Colaborador"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="rounded-xl bg-rose-50 p-2">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-stone-900">Remover Colaborador</h3>
            </div>
            <p className="mt-3 text-xs text-stone-600 leading-relaxed">
              Tem certeza que deseja remover este colaborador? Ele perderá o acesso imediato ao sistema.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteUser(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Sim, Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro / Edição com Permissões Granulares */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900">
                    {editingUser ? 'Editar Colaborador & Permissões' : 'Novo Colaborador'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Configure os dados cadastrais, cargo e permissões de acesso
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Dados Básicos */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Lucas Almeida"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">E-mail de Acesso *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Ex: lucas@restaurante.com"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(11) 98765-4321"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Cargo / Função *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="admin">Administrador (Acesso Total)</option>
                    <option value="manager">Gerente</option>
                    <option value="cashier">Operador de Caixa</option>
                    <option value="waiter">Garçom / Vendedor</option>
                  </select>
                </div>
              </div>

              {/* Metas e Comissões */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl bg-stone-50 p-3 border border-stone-200">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">Taxa de Comissão (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.commissionRate}
                    onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-stone-400">Percentual pago sobre cada venda atribuída</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Meta Mensal de Vendas (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={formData.salesTargetMonthly}
                    onChange={(e) => setFormData({ ...formData, salesTargetMonthly: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-stone-400">Meta para acompanhamento no painel do vendedor</p>
                </div>
              </div>

              {/* Matriz de Permissões Personalizadas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Permissões Granulares
                  </span>
                  <span className="text-[10px] text-stone-400">
                    O administrador pode personalizar cada regra
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-xl border border-stone-200 p-3">
                  {[
                    { key: 'canAccessAdminPanel', label: 'Acessar Painel ADM', desc: 'Permite abrir o ambiente administrativo' },
                    { key: 'canViewReports', label: 'Ver Relatórios Gerais', desc: 'Consultar estatísticas e ranking de produtos' },
                    { key: 'canViewFinancials', label: 'Ver Financeiro & Lucro', desc: 'Acessar DRE, despesas e margem do negócio' },
                    { key: 'canManageProducts', label: 'Cadastrar/Editar Produtos', desc: 'Criar produtos, categorias e fichas técnicas' },
                    { key: 'canChangePrices', label: 'Alterar Preços', desc: 'Modificar valor de venda no cardápio' },
                    { key: 'canManageStock', label: 'Ajustar Estoque', desc: 'Lançar entradas e perdas manuais de mercadoria' },
                    { key: 'canOpenCloseCash', label: 'Abrir/Fechar Caixa', desc: 'Operar sessões de caixa e sangrias' },
                    { key: 'canApplyDiscounts', label: 'Aplicar Descontos', desc: 'Permite abater valores nos pedidos' },
                    { key: 'canCancelOrders', label: 'Cancelar Itens e Pedidos', desc: 'Autorização para estorno em mesas' },
                    { key: 'canDeleteSales', label: 'Excluir Vendas Fechadas', desc: 'Apenas Administrador sênior' },
                    { key: 'canManageTeam', label: 'Gerenciar Equipe', desc: 'Adicionar ou editar outros colaboradores' },
                    { key: 'canManageSettings', label: 'Configurações da Loja', desc: 'Editar dados cadastrais e taxas' },
                  ].map((perm) => {
                    const isChecked = !!formData.permissions[perm.key as keyof UserPermission];

                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2.5 rounded-lg p-2 transition cursor-pointer border ${
                          isChecked
                            ? 'bg-amber-50/50 border-amber-200'
                            : 'bg-white border-stone-100 hover:bg-stone-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handlePermissionToggle(perm.key as keyof UserPermission)}
                          className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-stone-800">{perm.label}</p>
                          <p className="text-[10px] text-stone-400">{perm.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Botões do Formulário */}
              <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition"
                >
                  <Save className="h-3.5 w-3.5" />
                  Salvar Colaborador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
