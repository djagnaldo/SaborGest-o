/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  QrCode,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Mail,
  User,
  KeyRound,
  Phone,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { UserProfile } from '../../types';
import {
  getUsers,
  saveUser,
  deleteUser as removeUserFromStorage,
  toggleSellerSellingPermission,
  addAuditLog,
} from '../../services/storage';
import { apiRequest, generateWebAccessKey, fetchWebAccessStatus } from '../../services/sync-client';
import QRCode from 'qrcode';

export const SellerControlPanel: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();
  const [sellers, setSellers] = useState<UserProfile[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<UserProfile | null>(null);
  const [qrModalSeller, setQrModalSeller] = useState<UserProfile | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Formulário de Cadastro/Edição
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAccessCode, setFormAccessCode] = useState('');
  const [formCommission, setFormCommission] = useState<number>(5);

  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [sellerWebKey, setSellerWebKey] = useState<string>('');
  const [qrServerNotice, setQrServerNotice] = useState<string | null>(null);
  const [confirmDeleteSeller, setConfirmDeleteSeller] = useState<UserProfile | null>(null);

  const loadSellers = () => {
    const allUsers = getUsers(currentTenant.id);
    const list = allUsers.filter((u) => u.role !== 'admin');
    setSellers(list);
  };

  useEffect(() => {
    loadSellers();

    const handleSync = () => loadSellers();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Alternância do Controle Liga/Desliga da Permissão de Venda (local + servidor WebSocket)
  const handleTogglePermission = async (seller: UserProfile) => {
    const currentCanSell = seller.canSell !== false && seller.status !== 'bloqueado';
    const nextCanSell = !currentCanSell;

    const updated = toggleSellerSellingPermission(seller.id, nextCanSell, currentUser?.name);
    try {
      await apiRequest(`/api/users/${encodeURIComponent(seller.id)}/toggle-sell`, {
        method: 'POST',
        activeUserId: currentUser?.id,
        body: { canSell: nextCanSell },
      });
    } catch {
      // Offline fallback já salvo localmente
    }
    if (updated) {
      loadSellers();
      showFeedback(
        nextCanSell
          ? `Permissão de venda LIGADA para ${seller.name} (AUTORIZADO)`
          : `Permissão de venda DESLIGADA para ${seller.name} (BLOQUEADO e desconectado)`
      );
    }
  };

  const handleOpenSellerQr = async (seller: UserProfile) => {
    setQrModalSeller(seller);
    setSellerWebKey('');
    setQrImageUrl('');
    setQrServerNotice(null);
    try {
      const status = await fetchWebAccessStatus(currentTenant.id, currentUser?.id);
      const portalUrl = status.urls[0] || `${window.location.origin}/?portal=web`;
      const dataUrl = await QRCode.toDataURL(portalUrl, { width: 240, margin: 2 });
      setQrImageUrl(dataUrl);
      if (seller.canSell !== false && seller.status !== 'bloqueado') {
        const res = await generateWebAccessKey({
          tenantId: currentTenant.id,
          mode: 'seller',
          userId: seller.id,
          expiresInHours: 24,
          activeUserId: currentUser?.id,
        });
        setSellerWebKey(res.plainKey);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.startsWith('NATIVE_SERVER_STOPPED:')) {
        setQrServerNotice('Inicie o Servidor Nativo na aba "Acesso Web" para gerar o QR Code da rede Wi-Fi e a chave individual deste vendedor.');
      } else {
        const fallbackUrl = `${window.location.origin}/?portal=web`;
        QRCode.toDataURL(fallbackUrl, { width: 240, margin: 2 }).then(setQrImageUrl).catch(() => {});
      }
    }
  };

  // Abrir Modal de Adição
  const handleOpenAdd = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormAccessCode(Math.floor(1000 + Math.random() * 9000).toString());
    setFormCommission(5);
    setIsAddModalOpen(true);
  };

  // Salvar Novo Vendedor
  const handleSaveNewSeller = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showFeedback('Informe o nome do vendedor.');
      return;
    }

    const newId = `user-vend-${Date.now()}`;
    const newQrToken = `QR-VEND-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    const newSeller: UserProfile = {
      id: newId,
      tenantId: currentTenant.id,
      name: formName.trim(),
      email: formEmail.trim() || `${formName.toLowerCase().replace(/\s+/g, '')}@saborreal.com.br`,
      phone: formPhone.trim(),
      role: 'waiter',
      active: true,
      canSell: true,
      status: 'autorizado',
      accessCode: formAccessCode.trim() || '1234',
      qrToken: newQrToken,
      deviceModel: 'Terminal Android Autorizado',
      commissionRate: formCommission,
      permissions: {
        canAccessAdminPanel: false,
        canViewReports: false,
        canViewFinancials: false,
        canManageProducts: false,
        canManageStock: false,
        canChangePrices: false,
        canCancelOrders: false,
        canDeleteSales: false,
        canOpenCloseCash: false,
        canApplyDiscounts: false,
        canManageTeam: false,
        canManageSettings: false,
      },
      createdAt: new Date().toISOString(),
    };

    saveUser(newSeller);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'adm',
      userName: currentUser?.name || 'Administrador Matriz',
      action: 'CADASTRO_VENDEDOR',
      details: `Cadastrou o ${newSeller.name} com permissão inicial AUTORIZADA.`,
    });

    loadSellers();
    setIsAddModalOpen(false);
    showFeedback(`✓ Vendedor "${newSeller.name}" cadastrado e AUTORIZADO com sucesso!`);
  };

  // Abrir Modal de Edição
  const handleOpenEdit = (seller: UserProfile) => {
    setEditingSeller(seller);
    setFormName(seller.name);
    setFormEmail(seller.email);
    setFormPhone(seller.phone || '');
    setFormAccessCode(seller.accessCode || '1234');
    setFormCommission(seller.commissionRate || 5);
    setIsEditModalOpen(true);
  };

  // Salvar Edição
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeller) return;
    if (!formName.trim()) {
      showFeedback('Informe o nome do vendedor.');
      return;
    }

    const updated: UserProfile = {
      ...editingSeller,
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      accessCode: formAccessCode.trim(),
      commissionRate: formCommission,
      updatedAt: new Date().toISOString(),
    };

    saveUser(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'adm',
      userName: currentUser?.name || 'Administrador Matriz',
      action: 'EDICAO_VENDEDOR',
      details: `Atualizou os dados cadastrais do ${updated.name}.`,
    });

    loadSellers();
    setIsEditModalOpen(false);
    showFeedback(`Dados do vendedor "${updated.name}" atualizados com sucesso.`);
  };

  const handleConfirmDeleteSeller = () => {
    if (!confirmDeleteSeller) return;
    removeUserFromStorage(confirmDeleteSeller.id);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'adm',
      userName: currentUser?.name || 'Administrador Matriz',
      action: 'REMOCAO_VENDEDOR',
      details: `Removeu o vendedor ${confirmDeleteSeller.name} do sistema.`,
    });
    loadSellers();
    showFeedback(`Vendedor "${confirmDeleteSeller.name}" removido.`);
    setConfirmDeleteSeller(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Feedback Toast */}
      {feedbackMessage && (
        <div className="rounded-2xl border border-stone-800 bg-stone-900 px-4 py-3 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-top-2 flex items-center justify-between">
          <span>{feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-stone-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CABEÇALHO DO PAINEL — Conforme Especificação Oficial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-stone-900 sm:text-2xl">
            PAINEL DO ADM — CONTROLE DE VENDEDORES
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Gerenciamento individual de acesso. Cada vendedor opera somente com autorização ativa da Matriz.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 active:scale-95 transition"
        >
          <UserPlus className="h-4 w-4" />
          <span>+ Novo Vendedor</span>
        </button>
      </div>

      {/* LISTA DE CARTÕES INDIVIDUAIS DOS VENDEDORES — FIEL AO CONCEITO VISUAL EXATO */}
      <div className="space-y-4">
        {sellers.length > 0 ? (
          sellers.map((seller) => {
            const isAuthorized = seller.canSell !== false && seller.status !== 'bloqueado';

            return (
              <div
                key={seller.id}
                className={`rounded-2xl border p-5 shadow-xs transition duration-200 ${
                  isAuthorized
                    ? 'border-stone-200 bg-white hover:border-emerald-300'
                    : 'border-rose-200 bg-rose-50/30 hover:border-rose-300'
                }`}
              >
                {/* Linha 1: Nome do Vendedor em Destaque | Identificação Visual do Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-stone-900 sm:text-lg">
                      {seller.name}
                    </span>
                    {seller.accessCode && (
                      <span className="text-[11px] font-mono text-stone-400">
                        PIN: {seller.accessCode}
                      </span>
                    )}
                  </div>

                  {/* IDENTIFICAÇÃO VISUAL DO STATUS: AUTORIZADO (VERDE) OU BLOQUEADO (VERMELHO) */}
                  <div>
                    {isAuthorized ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        AUTORIZADO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-rose-800">
                        <span className="h-2 w-2 rounded-full bg-rose-600" />
                        BLOQUEADO
                      </span>
                    )}
                  </div>
                </div>

                {/* Linha 2: Texto "Permissão para vender" | LIGADA ou DESLIGADA */}
                <div className="mt-3 flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-semibold text-stone-600">
                    Permissão para vender
                  </span>
                  <span
                    className={`font-black uppercase tracking-wide ${
                      isAuthorized ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isAuthorized ? 'LIGADA' : 'DESLIGADA'}
                  </span>
                </div>

                {/* Linha 3: Controle Liga/Desliga Claramente Visível e de Fácil Utilização */}
                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                  <span className="text-[11px] text-stone-400">
                    {isAuthorized
                      ? 'Vendedor liberado para registrar vendas'
                      : 'Vendedor impedido de confirmar novos pedidos'}
                  </span>

                  {/* BOTAO LIGA / DESLIGA REPRODUZIDO FIELMENTE */}
                  <button
                    type="button"
                    onClick={() => handleTogglePermission(seller)}
                    className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-xs transition active:scale-95 min-h-[44px] ${
                      isAuthorized
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                        : 'border-2 border-stone-300 bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                    title={
                      isAuthorized
                        ? 'Clique para DESLIGAR a permissão de venda deste vendedor'
                        : 'Clique para LIGAR a permissão de venda deste vendedor'
                    }
                  >
                    {isAuthorized ? (
                      <span>[ LIGADO ]</span>
                    ) : (
                      <span>[ DESLIGADO ]</span>
                    )}
                  </button>
                </div>

                {/* Linha 4: Ações Administrativas Adicionais (Discretas e Limpas) */}
                <div className="mt-3 flex items-center justify-between border-t border-stone-100/80 pt-2 text-xs text-stone-400">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-3.5 w-3.5 text-stone-400" />
                    <span className="text-[11px] truncate max-w-[200px]">
                      {seller.deviceModel || 'Dispositivo Vinculado'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenSellerQr(seller)}
                      className="flex items-center gap-1 rounded-lg px-2.5 min-h-[38px] text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
                      title="Gerar chave web e QR Code individual do vendedor"
                    >
                      <QrCode className="h-3.5 w-3.5 text-amber-600" />
                      <span>Chave Web / QR</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(seller)}
                      className="flex items-center gap-1 rounded-lg px-2.5 min-h-[38px] text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
                      title="Editar vendedor"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-stone-500" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => setConfirmDeleteSeller(seller)}
                      className="flex items-center gap-1 rounded-lg px-2.5 min-h-[38px] text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Remover vendedor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remover</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-stone-400">
            <User className="mx-auto h-12 w-12 text-stone-300" />
            <h3 className="mt-3 text-sm font-bold text-stone-700">Nenhum vendedor cadastrado</h3>
            <p className="mt-1 text-xs text-stone-400">
              Cadastre o primeiro vendedor para liberar o acesso ao terminal de vendas.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              <UserPlus className="h-4 w-4" />
              <span>Adicionar Vendedor</span>
            </button>
          </div>
        )}
      </div>

      {/* MODAL: ADICIONAR VENDEDOR */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">Novo Vendedor</h3>
                <p className="text-xs text-stone-500">Convite por e-mail ou credencial para o celular</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewSeller} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Nome do Vendedor <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Vendedor Lucas ou Juliana"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">Código PIN de Acesso</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Ex: 1024"
                    value={formAccessCode}
                    onChange={(e) => setFormAccessCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs font-mono font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">Comissão (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formCommission}
                    onChange={(e) => setFormCommission(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">E-mail para Convite</label>
                <input
                  type="email"
                  placeholder="vendedor@saborreal.com.br"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">WhatsApp / Celular</label>
                <input
                  type="tel"
                  placeholder="(11) 98888-7777"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900 border border-amber-200">
                <p>
                  O vendedor será criado com <strong>PERMISSÃO DE VENDA LIGADA (AUTORIZADO)</strong> por padrão.
                  Você poderá desligar a qualquer momento diretamente no painel.
                </p>
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
                  Cadastrar e Autorizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR VENDEDOR */}
      {isEditModalOpen && editingSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">Editar Vendedor</h3>
                <p className="text-xs text-stone-500">{editingSeller.name}</p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700">Nome do Vendedor</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">Código PIN de Acesso</label>
                  <input
                    type="text"
                    value={formAccessCode}
                    onChange={(e) => setFormAccessCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs font-mono font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">Comissão (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formCommission}
                    onChange={(e) => setFormCommission(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">E-mail</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">WhatsApp / Celular</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-1/2 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QR CODE INDIVIDUAL DO VENDEDOR */}
      {qrModalSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <span className="text-xs font-bold uppercase text-stone-400">Credencial do Vendedor</span>
              <button
                onClick={() => setQrModalSeller(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-black text-stone-900">{qrModalSeller.name}</h3>
              <p className="text-xs text-stone-500">
                Aponte a câmera do navegador para o QR Code e informe a Chave de Acesso Web abaixo.
              </p>

              {qrServerNotice ? (
                <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900">
                  {qrServerNotice}
                </div>
              ) : (
                <div className="my-4 mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border border-stone-200 bg-white p-2 shadow-xs">
                  {qrImageUrl ? (
                    <img src={qrImageUrl} alt="QR Code Vendedor" className="w-full h-full object-contain" />
                  ) : (
                    <QrCode className="h-24 w-24 text-stone-300" />
                  )}
                </div>
              )}

              {sellerWebKey && (
                <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-left">
                  <p className="text-[11px] font-bold text-amber-900">Chave Individual MODO VENDEDOR (24h):</p>
                  <p className="font-mono text-base font-extrabold text-stone-900 mt-0.5 select-all">
                    {sellerWebKey}
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-stone-50 p-3 border border-stone-200 text-left text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">PIN Local:</span>
                  <span className="font-mono font-bold text-stone-900">
                    {qrModalSeller.accessCode || '1234'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Status na Matriz:</span>
                  <span
                    className={`font-bold ${
                      qrModalSeller.canSell !== false && qrModalSeller.status !== 'bloqueado'
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {qrModalSeller.canSell !== false && qrModalSeller.status !== 'bloqueado'
                      ? 'LIGADA (AUTORIZADO)'
                      : 'DESLIGADA (BLOQUEADO)'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  const textToCopy = sellerWebKey || qrModalSeller.qrToken || qrModalSeller.id;
                  navigator.clipboard?.writeText(textToCopy);
                  showFeedback('Chave copiada para a área de transferência.');
                }}
                className="mt-4 w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{sellerWebKey ? 'Copiar Chave Web do Vendedor' : 'Copiar Token do Vendedor'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmDeleteSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-stone-900">Remover Vendedor?</h3>
            <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
              Confirma a remoção de <strong>{confirmDeleteSeller.name}</strong>? Todas as vendas anteriores permanecerão preservadas nos relatórios históricos.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmDeleteSeller(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSeller}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white cursor-pointer"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
