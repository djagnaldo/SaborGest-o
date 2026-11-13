/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Grid2X2,
  Clock,
  User,
  Plus,
  Receipt,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Search,
  Timer,
  DollarSign,
  Ban,
  Pause,
  Play,
  RotateCcw,
  Bell,
  BellOff,
  CheckSquare,
  Square,
  ShieldAlert,
  Info,
  Archive,
  ShoppingBag,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  RestaurantTable,
  TableExtraCharge,
  TableTimer,
  TableAccountArchive,
  Product,
  Category,
  Order,
} from '../../types';
import {
  getTables,
  saveTable,
  deleteTable,
  deleteTablesBatch,
  deleteAllAvailableTables,
  addTableExtraCharge,
  editTableExtraCharge,
  cancelTableExtraCharge,
  setTableTimer,
  pauseResumeTableTimer,
  resetTableTimer,
  cancelTableTimer,
  acknowledgeTableTimer,
  getTableArchives,
  getOrders,
  getProducts,
  getCategories,
  getOpenTableOrders,
  addOrAccumulateTableItems,
  setTableStatusLocal,
  getTableDeletionBlockReason,
  addAuditLog,
} from '../../services/storage';
import { apiRequest, updateTableStatusApi } from '../../services/sync-client';
import { QuantitySelectorModal } from '../pos/QuantitySelectorModal';
import { formatBRL, formatTimeBR, formatDateTimeBR } from '../../utils/formatters';
import { playTableAlarmSound } from '../../utils/soundAlert';
import {
  sendTableExpiredNotification,
  requestNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
} from '../../utils/notifications';

interface TablesViewProps {
  onStartSaleForTable?: (tableNumber: number) => void;
  onGoToSales?: () => void;
}

export const TablesView: React.FC<TablesViewProps> = ({ onGoToSales }) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openTableOrders, setOpenTableOrders] = useState<Order[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'catalog' | 'summary'>('catalog');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategoryId, setCatalogCategoryId] = useState<string>('all');
  const [productForQtyModal, setProductForQtyModal] = useState<Product | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Modais de Criação e Edição pelo ADM
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);

  // Form State para Nova Mesa / Edição
  const [formNumber, setFormNumber] = useState<number>(1);
  const [formLabel, setFormLabel] = useState<string>('');
  const [formCustomerName, setFormCustomerName] = useState<string>('');
  const [isNamedTable, setIsNamedTable] = useState<boolean>(false);
  const [formCapacity, setFormCapacity] = useState<number>(4);

  // Modais de Lançamento Extra (ADM)
  const [isExtraChargeModalOpen, setIsExtraChargeModalOpen] = useState(false);
  const [extraAmount, setExtraAmount] = useState<number>(10);
  const [extraDescription, setExtraDescription] = useState<string>('Valor entregue ao cliente');
  const [isCashWithdrawal, setIsCashWithdrawal] = useState<boolean>(true);
  const [isSubmittingExtra, setIsSubmittingExtra] = useState<boolean>(false);

  // Modal de Edição de Lançamento Extra (ADM)
  const [editingExtraCharge, setEditingExtraCharge] = useState<TableExtraCharge | null>(null);
  const [editExtraAmount, setEditExtraAmount] = useState<number>(0);
  const [editExtraDescription, setEditExtraDescription] = useState<string>('');
  const [editExtraReason, setEditExtraReason] = useState<string>('');

  // Modal de Temporizador / Alerta (ADM)
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [customTimerMinutes, setCustomTimerMinutes] = useState<number>(15);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>(getNotificationPermission());

  // Modal de Histórico Arquivado de Mesas
  const [isArchivesModalOpen, setIsArchivesModalOpen] = useState(false);
  const [tableArchives, setTableArchives] = useState<TableAccountArchive[]>([]);

  // Modo de Seleção Múltipla para Exclusão em Lote (ADM)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIdsForBatch, setSelectedIdsForBatch] = useState<string[]>([]);

  // Feedback & Filtros & Modais de Confirmação
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'closing'>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [cancelExtraModal, setCancelExtraModal] = useState<{
    chargeId: string;
    amount: number;
    reason: string;
  } | null>(null);

  // Estado temporal em tempo real para contagem regressiva
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  const loadTables = () => {
    const list = getTables(currentTenant.id);
    list.sort((a, b) => a.number - b.number);
    setTables(list);
    setProducts(getProducts(currentTenant.id).filter((p) => p.active));
    setCategories(getCategories(currentTenant.id).filter((c) => c.active));
    if (selectedTable) {
      const updated = list.find((t) => t.id === selectedTable.id);
      if (updated) {
        setSelectedTable(updated);
        setOpenTableOrders(getOpenTableOrders(currentTenant.id, updated));
      }
    }
  };

  useEffect(() => {
    loadTables();
    const handleSync = () => loadTables();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  // Timer em tempo real a cada 1 segundo para contagem regressiva, disparo de alarme e notificação Android
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      // Verifica se alguma mesa acabou de expirar o temporizador para emitir alerta sonoro e notificação
      tables.forEach((table) => {
        if (table.timer && !table.timer.isPaused && !table.timer.acknowledged) {
          const target = new Date(table.timer.targetTime).getTime();
          if (now >= target && !table.timer.isExpired) {
            // Dispara som sintetizado de alerta suave
            playTableAlarmSound();
            // Dispara notificação compatível com Android / segundo plano
            sendTableExpiredNotification(
              table.label || `Mesa ${table.number}`,
              table.timer.durationMinutes
            );
            // Marca como expirado no storage
            table.timer.isExpired = true;
            saveTable(table);
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tables]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  // ADM: Abrir Modal de Nova Mesa
  const handleOpenCreate = () => {
    const maxNum = tables.reduce((acc, t) => Math.max(acc, t.number), 0);
    const nextNum = maxNum + 1;
    setFormNumber(nextNum);
    setFormLabel(`Mesa ${nextNum < 10 ? '0' + nextNum : nextNum}`);
    setFormCustomerName('');
    setIsNamedTable(false);
    setFormCapacity(4);
    setIsCreateModalOpen(true);
  };

  // ADM: Salvar Nova Mesa
  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNumber || formNumber <= 0) {
      showFeedback('Informe um número válido para a mesa.', 'error');
      return;
    }

    const exists = tables.some((t) => t.number === formNumber);
    if (exists) {
      showFeedback(`Já existe uma mesa cadastrada com o número ${formNumber}. Escolha outro número.`, 'error');
      return;
    }

    const finalLabel = isNamedTable && formCustomerName.trim()
      ? formCustomerName.trim()
      : formLabel.trim() || `Mesa ${formNumber}`;

    const newTable: RestaurantTable = {
      id: `tbl-${Date.now()}-${formNumber}`,
      tenantId: currentTenant.id,
      number: formNumber,
      label: finalLabel,
      customerName: isNamedTable ? formCustomerName.trim() : undefined,
      isNamedTable,
      status: 'available',
      capacity: formCapacity || 4,
      currentTotal: 0,
      productsTotal: 0,
      extraTotal: 0,
      extraCharges: [],
    };

    saveTable(newTable);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: 'CRIOU_MESA',
      details: `Cadastrou nova mesa: "${finalLabel}" (Número ${formNumber}, Capacidade: ${newTable.capacity} pessoas)`,
    });

    loadTables();
    setIsCreateModalOpen(false);
    showFeedback(`✓ "${finalLabel}" cadastrada com sucesso no salão!`);
  };

  // ADM: Abrir Modal de Edição
  const handleOpenEdit = (table: RestaurantTable, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTable(table);
    setFormNumber(table.number);
    setFormLabel(table.label || `Mesa ${table.number}`);
    setFormCustomerName(table.customerName || (table.isNamedTable ? table.label || '' : ''));
    setIsNamedTable(Boolean(table.isNamedTable));
    setFormCapacity(table.capacity || 4);
    setIsEditModalOpen(true);
  };

  // ADM: Salvar Edição
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable) return;

    if (formNumber !== editingTable.number) {
      const exists = tables.some((t) => t.number === formNumber && t.id !== editingTable.id);
      if (exists) {
        showFeedback(`Já existe outra mesa cadastrada com o número ${formNumber}.`, 'error');
        return;
      }
    }

    const finalLabel = isNamedTable && formCustomerName.trim()
      ? formCustomerName.trim()
      : formLabel.trim() || `Mesa ${formNumber}`;

    const updated: RestaurantTable = {
      ...editingTable,
      number: formNumber,
      label: finalLabel,
      customerName: isNamedTable ? formCustomerName.trim() : undefined,
      isNamedTable,
      capacity: formCapacity || 4,
    };

    saveTable(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: 'EDITOU_MESA',
      details: `Atualizou identificação da mesa: "${finalLabel}" (Número ${updated.number}, Capacidade: ${updated.capacity})`,
    });

    loadTables();
    setIsEditModalOpen(false);
    showFeedback(`✓ Identificação da mesa "${finalLabel}" atualizada!`);
  };

  // ADM: Excluir Mesa Individual (Com validação obrigatória)
  const handleDeleteTable = (table: RestaurantTable, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdm) return;

    const blockReason = getTableDeletionBlockReason(table, getOrders(currentTenant.id));
    if (blockReason) {
      showFeedback(`⛔ ${blockReason}`, 'error');
      return;
    }

    setConfirmModal({
      title: `Excluir "${table.label || `Mesa ${table.number}`}"`,
      message:
        'Esta ação removerá apenas o cadastro da mesa; todo o histórico financeiro e de pedidos será preservado.',
      confirmLabel: 'Confirmar Exclusão',
      onConfirm: () => {
        const result = deleteTable(
          table.id,
          currentUser ? { id: currentUser.id, name: currentUser.name } : undefined
        );
        if (result.success) {
          loadTables();
          setIsActionModalOpen(false);
          showFeedback(`✓ "${table.label || `Mesa ${table.number}`}" excluída com sucesso.`);
        } else {
          showFeedback(result.error || 'Erro ao excluir mesa.', 'error');
        }
        setConfirmModal(null);
      },
    });
  };

  // ADM: Exclusão em Lote das Selecionadas
  const handleExecuteBatchDelete = () => {
    if (!isAdm || selectedIdsForBatch.length === 0) return;

    setConfirmModal({
      title: `Excluir ${selectedIdsForBatch.length} mesa(s) selecionada(s)`,
      message:
        'Mesas ocupadas, com pedidos pendentes ou saldo em aberto serão protegidas automaticamente.',
      confirmLabel: 'Excluir Selecionadas',
      onConfirm: () => {
        const res = deleteTablesBatch(
          selectedIdsForBatch,
          currentUser ? { id: currentUser.id, name: currentUser.name } : undefined
        );
        loadTables();
        setSelectedIdsForBatch([]);
        setIsBatchMode(false);
        setConfirmModal(null);

        if (res.blockedCount > 0) {
          showFeedback(
            `✓ ${res.successCount} mesa(s) livre(s) excluída(s). ⚠️ ${res.blockedCount} mesa(s) protegida(s): ${res.blockedReasons[0]}`,
            'error'
          );
        } else {
          showFeedback(`✓ ${res.successCount} mesa(s) excluída(s) com sucesso em lote.`);
        }
      },
    });
  };

  // ADM: Excluir Todas as Mesas Disponíveis
  const handleDeleteAllAvailable = () => {
    if (!isAdm) return;
    const orders = getOrders(currentTenant.id);
    const availableTotal = tables.filter((t) => !getTableDeletionBlockReason(t, orders)).length;
    if (availableTotal === 0) {
      showFeedback('Não há mesas livres sem pendências para excluir.', 'error');
      return;
    }

    setConfirmModal({
      title: `Excluir todas as ${availableTotal} mesa(s) livre(s)`,
      message:
        'Mesas ocupadas ou com pendências financeiras permanecerão protegidas e os históricos continuam preservados.',
      confirmLabel: 'Excluir Todas Livres',
      onConfirm: () => {
        const res = deleteAllAvailableTables(
          currentTenant.id,
          currentUser ? { id: currentUser.id, name: currentUser.name } : undefined
        );
        loadTables();
        setConfirmModal(null);
        showFeedback(
          `✓ ${res.successCount} mesa(s) livre(s) removida(s). ${res.blockedCount} mesa(s) em atendimento protegida(s).`
        );
      },
    });
  };

  // ADM: Adicionar Valor Extra à Mesa
  const handleAddExtraChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !currentUser || !isAdm || isSubmittingExtra) return;

    if (!extraAmount || extraAmount <= 0) {
      showFeedback('Informe um valor válido em reais (R$).', 'error');
      return;
    }

    if (!extraDescription.trim()) {
      showFeedback('Informe a descrição obrigatória do lançamento extra.', 'error');
      return;
    }

    setIsSubmittingExtra(true);
    try {
      const res = addTableExtraCharge(
        currentTenant.id,
        selectedTable.id,
        {
          amount: extraAmount,
          description: extraDescription.trim(),
          isCashWithdrawal,
        },
        { id: currentUser.id, name: currentUser.name }
      );

      if (res.success && res.table) {
        setSelectedTable(res.table);
        loadTables();
        setIsExtraChargeModalOpen(false);
        setExtraAmount(10);
        setExtraDescription('');
        showFeedback(`✓ Lançamento extra de ${formatBRL(extraAmount)} adicionado à conta de "${res.table.label}"!`);
      } else {
        showFeedback(res.error || 'Erro ao adicionar valor extra.', 'error');
      }
    } finally {
      setIsSubmittingExtra(false);
    }
  };

  // ADM: Abrir Edição de Lançamento Extra
  const handleOpenEditExtraCharge = (charge: TableExtraCharge) => {
    if (!isAdm || charge.status === 'cancelled') return;
    setEditingExtraCharge(charge);
    setEditExtraAmount(charge.amount);
    setEditExtraDescription(charge.description);
    setEditExtraReason('');
  };

  // ADM: Salvar Edição de Lançamento Extra
  const handleSaveEditExtraCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !editingExtraCharge || !currentUser || !isAdm) return;

    const res = editTableExtraCharge(
      currentTenant.id,
      selectedTable.id,
      editingExtraCharge.id,
      {
        amount: editExtraAmount,
        description: editExtraDescription,
        reason: editExtraReason || 'Correção administrativa',
      },
      { id: currentUser.id, name: currentUser.name }
    );

    if (res.success && res.table) {
      setSelectedTable(res.table);
      loadTables();
      setEditingExtraCharge(null);
      showFeedback('✓ Lançamento extra atualizado e ajuste financeiro registrado no histórico!');
    } else {
      showFeedback(res.error || 'Erro ao editar lançamento extra.', 'error');
    }
  };

  // ADM: Cancelar Lançamento Extra da Mesa (Modal React sem prompt nativo)
  const handleCancelExtraCharge = (chargeId: string, chargeAmount: number) => {
    if (!selectedTable || !currentUser || !isAdm) return;
    setCancelExtraModal({ chargeId, amount: chargeAmount, reason: '' });
  };

  const handleConfirmCancelExtraCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !currentUser || !isAdm || !cancelExtraModal) return;
    if (!cancelExtraModal.reason.trim()) {
      showFeedback('É obrigatório informar a justificativa para cancelar e estornar o lançamento.', 'error');
      return;
    }

    const res = cancelTableExtraCharge(
      currentTenant.id,
      selectedTable.id,
      cancelExtraModal.chargeId,
      cancelExtraModal.reason.trim(),
      { id: currentUser.id, name: currentUser.name }
    );

    if (res.success && res.table) {
      setSelectedTable(res.table);
      loadTables();
      setCancelExtraModal(null);
      showFeedback('✓ Lançamento extra cancelado e estorno registrado mantendo o histórico original!');
    } else {
      showFeedback(res.error || 'Erro ao cancelar lançamento extra.', 'error');
    }
  };

  // ADM: Configurar Temporizador / Alerta de Tempo
  const handleSetTimer = (minutes: number) => {
    if (!selectedTable || !currentUser || !isAdm) return;
    const updated = setTableTimer(currentTenant.id, selectedTable.id, minutes, {
      id: currentUser.id,
      name: currentUser.name,
    });
    if (updated) {
      setSelectedTable(updated);
      loadTables();
      setIsTimerModalOpen(false);
      showFeedback(`⏱️ Alerta de ${minutes} minutos ativado para "${updated.label}"!`);
    }
  };

  // Formatação de Contagem Regressiva
  const getTimerDisplay = (timer?: TableTimer) => {
    if (!timer) return null;
    const target = new Date(timer.targetTime).getTime();
    const remaining = timer.isPaused
      ? timer.pausedRemainingSeconds || 0
      : Math.round((target - currentTime) / 1000);

    const isExpired = remaining <= 0;
    const absRemaining = Math.abs(remaining);
    const mins = Math.floor(absRemaining / 60);
    const secs = absRemaining % 60;
    const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return {
      formatted,
      isExpired,
      isPaused: Boolean(timer.isPaused),
      acknowledged: Boolean(timer.acknowledged),
    };
  };

  const handleOpenTableModal = (table: RestaurantTable) => {
    setSelectedTable(table);
    setOpenTableOrders(getOpenTableOrders(currentTenant.id, table));
    setModalTab('catalog');
    setCatalogSearch('');
    setCatalogCategoryId('all');
    setIsActionModalOpen(true);
  };

  const handleConfirmAddProductToTable = async (payload: {
    product: Product;
    quantity: number;
    variationName?: string;
    selectedAddons?: { name: string; price: number }[];
    notes?: string;
  }) => {
    if (!selectedTable || !currentUser || isAddingItem) return;
    if (!isAdm && (currentUser.canSell === false || currentUser.status === 'bloqueado')) {
      showFeedback('Sua permissão de venda está bloqueada pelo Administrador.', 'error');
      return;
    }

    setIsAddingItem(true);
    const mutationId = `tbl-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const itemPayload = {
      productId: payload.product.id,
      quantity: payload.quantity,
      variationName: payload.variationName,
      selectedAddons: payload.selectedAddons,
      notes: payload.notes,
    };

    try {
      // Atualiza no armazenamento local imediatamente (offline-first)
      const localRes = addOrAccumulateTableItems(
        currentTenant.id,
        selectedTable.id,
        [itemPayload],
        { id: currentUser.id, name: currentUser.name }
      );
      if (!localRes.success) {
        showFeedback(localRes.error || 'Não foi possível adicionar o produto.', 'error');
        return;
      }

      // Envia para o servidor autoritativo em tempo real (com fila se offline)
      try {
        const remoteRes = await apiRequest(`/api/tables/${encodeURIComponent(selectedTable.id)}/items`, {
          method: 'POST',
          activeUserId: currentUser.id,
          queueOnOffline: true,
          body: {
            tenantId: currentTenant.id,
            items: [itemPayload],
            mutationId,
          },
        });
        if (remoteRes?.table) {
          setSelectedTable(remoteRes.table);
        }
      } catch (err: any) {
        if (!String(err?.message || '').startsWith('OFFLINE_QUEUED:')) {
          // Se servidor recusou por estoque, mostra feedback real
          if (localRes.table) setSelectedTable(localRes.table);
        }
      }

      setProductForQtyModal(null);
      loadTables();
      if (localRes.table) {
        setSelectedTable(localRes.table);
        setOpenTableOrders(getOpenTableOrders(currentTenant.id, localRes.table));
      }
      showFeedback(
        `${payload.quantity}x ${payload.product.name} adicionado à ${selectedTable.label || `Mesa ${selectedTable.number}`} (quantidade acumulada).`
      );
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleMarkAwaitingPayment = async (table: RestaurantTable) => {
    const actor = { id: currentUser?.id || 'garcom', name: currentUser?.name || 'Vendedor' };
    const localRes = setTableStatusLocal(currentTenant.id, table.id, 'closing', actor);
    try {
      const remoteRes = await updateTableStatusApi(currentTenant.id, table.id, 'closing', actor.id);
      if (remoteRes?.table) {
        setSelectedTable(remoteRes.table);
      }
    } catch {
      if (localRes.table) setSelectedTable(localRes.table);
    }
    loadTables();
    showFeedback(
      `"${table.label || `Mesa ${table.number}`}" marcada como Aguardando Pagamento. Finalize o recebimento na aba Vendas.`
    );
  };

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPerm(perm);
    if (perm === 'granted') {
      showFeedback('🔔 Notificações em segundo plano ativadas para alertas de mesas!');
    } else {
      showFeedback('Permissão de notificação negada ou indisponível neste dispositivo.', 'error');
    }
  };

  // Contadores
  const availableCount = tables.filter((t) => t.status === 'available').length;
  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
  const closingCount = tables.filter((t) => t.status === 'closing').length;

  const filteredTables = tables.filter((t) => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Toast de Feedback */}
      {feedbackMessage && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-semibold shadow-lg animate-in slide-in-from-top-2 flex items-center justify-between ${
            feedbackMessage.type === 'error'
              ? 'border-rose-300 bg-rose-900 text-rose-50'
              : 'border-emerald-300 bg-stone-900 text-emerald-300'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="ml-3 text-stone-400 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header com Ações Administrativas de Mesas */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Mesas & Atendimento
            </h1>
            <span className="text-xs text-stone-500 font-medium">
              · {tables.length} mesas cadastradas
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Controle ilimitado de salão, mesas nominais, lançamento de consumo com acúmulo automático e temporizador
          </p>
        </div>

        {/* Barra de Ações do ADM */}
        {isAdm && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Modo de Seleção em Lote */}
            <button
              type="button"
              onClick={() => {
                setIsBatchMode(!isBatchMode);
                setSelectedIdsForBatch([]);
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition shadow-xs ${
                isBatchMode
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              <span>{isBatchMode ? 'Sair da Seleção' : 'Seleção em Lote'}</span>
            </button>

            {/* Excluir Selecionadas (Quando em Modo de Seleção) */}
            {isBatchMode && (
              <button
                type="button"
                onClick={handleExecuteBatchDelete}
                disabled={selectedIdsForBatch.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-40 transition"
              >
                <Trash2 className="h-4 w-4" />
                <span>Excluir Selecionadas ({selectedIdsForBatch.length})</span>
              </button>
            )}

            {/* Excluir Todas as Mesas Disponíveis */}
            {!isBatchMode && availableCount > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllAvailable}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-xs font-bold text-rose-700 shadow-xs hover:bg-rose-100 transition"
                title="Exclui todas as mesas que estão livres no momento"
              >
                <Trash2 className="h-4 w-4 text-rose-600" />
                <span>Excluir Todas Livres</span>
              </button>
            )}

            {/* Botão de Notificações Android / Segundo Plano */}
            {isNotificationSupported() && (
              <button
                type="button"
                onClick={handleEnableNotifications}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition shadow-xs ${
                  notificationPerm === 'granted'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
                title="Ativar notificações no dispositivo quando o temporizador de uma mesa encerrar"
              >
                <Bell className="h-4 w-4" />
                <span>{notificationPerm === 'granted' ? 'Alertas Ativos' : 'Ativar Alertas'}</span>
              </button>
            )}

            {/* Histórico de Contas Arquivadas */}
            <button
              type="button"
              onClick={() => {
                setTableArchives(getTableArchives(currentTenant.id));
                setIsArchivesModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs font-bold text-stone-700 shadow-xs hover:bg-stone-50 transition"
              title="Consultar contas encerradas e arquivadas (preservadas mesmo após exclusão de mesas)"
            >
              <Archive className="h-4 w-4 text-stone-500" />
              <span>Contas Arquivadas</span>
            </button>

            {/* Botão de Adicionar Nova Mesa */}
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition"
            >
              <Plus className="h-4 w-4" />
              <span>+ Adicionar Mesa</span>
            </button>
          </div>
        )}
      </div>

      {/* Filtros de Status (Disponível, Ocupada, Aguardando Pagamento) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1 border border-stone-200">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Todas ({tables.length})
          </button>
          <button
            onClick={() => setStatusFilter('available')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'available'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Disponíveis ({availableCount})
          </button>
          <button
            onClick={() => setStatusFilter('occupied')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'occupied'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Ocupadas ({occupiedCount})
          </button>
          <button
            onClick={() => setStatusFilter('closing')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'closing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Aguardando Pagamento ({closingCount})
          </button>
        </div>

        <span className="text-[11px] text-stone-500">
          {isBatchMode
            ? 'Marque as caixas das mesas que deseja excluir.'
            : 'Toque em uma mesa para iniciar atendimento, lançar valores extras ou configurar temporizador.'}
        </span>
      </div>

      {/* Grid de Mesas */}
      {filteredTables.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filteredTables.map((table) => {
            const isAvailable = table.status === 'available';
            const isOccupied = table.status === 'occupied';
            const isClosing = table.status === 'closing';

            const timerInfo = getTimerDisplay(table.timer);
            const isTimerExpired = timerInfo?.isExpired;
            const isTimerActive = Boolean(timerInfo && !timerInfo.isPaused);

            // Borda piscando em vermelho intermitente quando o temporizador chega a zero
            const isFlashingAlert = isTimerExpired && !table.timer?.acknowledged;

            const isSelectedInBatch = selectedIdsForBatch.includes(table.id);

            const statusLabel = isAvailable
              ? 'Disponível'
              : isOccupied
              ? 'Ocupada'
              : 'Aguardando Pagamento';

            const cardBaseStyle = isAvailable
              ? 'border-emerald-200 bg-white hover:border-emerald-400'
              : isOccupied
              ? 'border-amber-300 bg-amber-50/40 hover:border-amber-500'
              : 'border-blue-300 bg-blue-50/40 hover:border-blue-500';

            const badgeStyle = isAvailable
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : isOccupied
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-blue-100 text-blue-900 border-blue-300';

            return (
              <div
                key={table.id}
                onClick={() => {
                  if (isBatchMode) {
                    if (isSelectedInBatch) {
                      setSelectedIdsForBatch((prev) => prev.filter((id) => id !== table.id));
                    } else {
                      setSelectedIdsForBatch((prev) => [...prev, table.id]);
                    }
                  } else {
                    handleOpenTableModal(table);
                  }
                }}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 shadow-2xs transition cursor-pointer hover:shadow-md ${cardBaseStyle} ${
                  isFlashingAlert
                    ? 'border-2 border-rose-600! ring-2 ring-rose-500/50 bg-rose-50/40'
                    : ''
                } ${isSelectedInBatch ? 'ring-2 ring-indigo-600 bg-indigo-50/40' : ''}`}
              >
                {/* Checkbox de Seleção em Lote */}
                {isBatchMode && (
                  <div className="absolute top-2.5 right-2.5 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelectedInBatch) {
                          setSelectedIdsForBatch((prev) => prev.filter((id) => id !== table.id));
                        } else {
                          setSelectedIdsForBatch((prev) => [...prev, table.id]);
                        }
                      }}
                      className="rounded p-0.5 bg-white text-indigo-700 shadow-xs"
                    >
                      {isSelectedInBatch ? (
                        <CheckSquare className="h-5 w-5 text-indigo-600" />
                      ) : (
                        <Square className="h-5 w-5 text-stone-300" />
                      )}
                    </button>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black text-stone-900">
                      #{table.number}
                    </span>
                    {!isBatchMode && (
                      <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${badgeStyle}`}>
                        {statusLabel}
                      </span>
                    )}
                  </div>

                  {/* Nome da Mesa (Nome do Cliente ou Número Tradicional) */}
                  <p className="mt-1 text-xs font-black text-stone-900 truncate" title={table.label}>
                    {table.label || `Mesa ${table.number}`}
                  </p>

                  <p className="text-[10px] text-stone-500">
                    Capacidade: {table.capacity || 4} pessoas
                  </p>

                  {/* Alerta de Tempo / Temporizador Ativo */}
                  {timerInfo && (
                    <div
                      className={`mt-2 flex items-center justify-between rounded-lg px-2 py-1 text-[10px] font-bold border ${
                        timerInfo.isExpired
                          ? 'bg-rose-100 text-rose-900 border-rose-300'
                          : timerInfo.isPaused
                          ? 'bg-stone-100 text-stone-700 border-stone-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {timerInfo.isExpired ? 'ALERTA VENCIDO' : 'TEMPO:'}
                      </span>
                      <span className="font-mono">{timerInfo.formatted}</span>
                    </div>
                  )}

                  {/* Indicador de Valores Extras Lançados */}
                  {table.extraTotal && table.extraTotal > 0 ? (
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 border border-indigo-200">
                      <DollarSign className="h-2.5 w-2.5" />
                      <span>Extra: +{formatBRL(table.extraTotal)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 border-t border-stone-100 pt-2 text-stone-600">
                  {!isAvailable ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-black text-stone-900">
                          {formatBRL(Math.max(0, (table.currentTotal || 0) - (table.paidAmount || 0)))}
                        </p>
                        <span className="text-[9px] text-stone-400">
                          {table.paidAmount && table.paidAmount > 0 ? 'Restante' : 'Total'}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTimeBR(table.openedAt)}
                        </span>
                        <span className="truncate max-w-[85px]" title={`Aberta por: ${table.openedByName || table.waiterName || 'Atendimento'}`}>
                          {(table.openedByName || table.waiterName || 'Salão').split(' ')[0]}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="py-1 text-center text-[11px] font-bold text-emerald-700">
                      Livre
                    </div>
                  )}

                  {/* Botões Rápidos de ADM no Card */}
                  {isAdm && !isBatchMode && (
                    <div className="mt-2 pt-2 border-t border-stone-100/70 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleOpenEdit(table, e)}
                        className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
                        title="Editar nome, identificação ou capacidade"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>

                      {isAvailable && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTable(table, e)}
                          className="p-1 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Excluir mesa vazia"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-stone-400">
          <Grid2X2 className="mx-auto h-12 w-12 text-stone-300" />
          <h3 className="mt-3 text-sm font-bold text-stone-700">Nenhuma mesa encontrada</h3>
          <p className="mt-1 text-xs text-stone-400">
            {statusFilter !== 'all'
              ? 'Não há mesas correspondentes ao filtro selecionado.'
              : 'Cadastre as mesas do seu estabelecimento para iniciar o controle do salão.'}
          </p>
          {isAdm && (
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Primeira Mesa</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL PRINCIPAL: AÇÕES & DETALHES COMPLETOS DA MESA SELECIONADA */}
      {/* ========================================================================= */}
      {isActionModalOpen && selectedTable && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-stone-900/60 p-0 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-2xl max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 gap-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                  Mesa #{selectedTable.number} • {selectedTable.status === 'available' ? 'Disponível' : selectedTable.status === 'closing' ? 'Aguardando Pagamento' : 'Ocupada'}
                </span>
                <h3 className="font-black text-stone-900 text-lg truncate">
                  {selectedTable.label || `Mesa ${selectedTable.number}`}
                </h3>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">Consumo Total</span>
                  <span className="text-lg font-extrabold text-stone-900 tabular-nums">
                    {formatBRL(selectedTable.currentTotal || 0)}
                  </span>
                </div>
                <button
                  onClick={() => setIsActionModalOpen(false)}
                  className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Navegação interna do Modal: Cardápio para Lançar vs Resumo & Extras */}
            <div className="grid grid-cols-2 gap-2 mt-3 bg-stone-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setModalTab('catalog')}
                className={`min-h-[44px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modalTab === 'catalog'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-amber-600" />
                Adicionar Produtos
              </button>
              <button
                type="button"
                onClick={() => setModalTab('summary')}
                className={`min-h-[44px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modalTab === 'summary'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Receipt className="w-4 h-4 text-emerald-600" />
                Consumo & Detalhes ({openTableOrders.reduce((acc, o) => acc + o.items.length, 0)})
              </button>
            </div>

            {modalTab === 'catalog' ? (
              <div className="flex-1 overflow-y-auto py-3 space-y-3">
                {/* Busca & Filtro por Categoria */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Buscar item do cardápio..."
                      className="w-full min-h-[44px] pl-9 pr-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <select
                    value={catalogCategoryId}
                    onChange={(e) => setCatalogCategoryId(e.target.value)}
                    className="min-h-[44px] px-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700"
                  >
                    <option value="all">Todas Categorias</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grid do Catálogo na Mesa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {products
                    .filter((p) => {
                      const matchesCat = catalogCategoryId === 'all' || p.categoryId === catalogCategoryId;
                      const q = catalogSearch.trim().toLowerCase();
                      const matchesSearch =
                        !q || p.name.toLowerCase().includes(q) || p.internalCode.toLowerCase().includes(q);
                      return matchesCat && matchesSearch;
                    })
                    .map((product) => {
                      const outOfStock =
                        !currentTenant.settings?.allowNegativeStock && (product.stockQuantity ?? 0) <= 0;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => setProductForQtyModal(product)}
                          className="min-h-[76px] p-2.5 rounded-xl border border-stone-200 bg-white hover:border-amber-500 hover:bg-amber-50/40 disabled:opacity-45 text-left flex items-center gap-3 transition cursor-pointer"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-14 h-14 rounded-lg object-cover shrink-0 border border-stone-200"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-stone-100 flex items-center justify-center shrink-0 text-xs font-bold text-stone-500">
                              {product.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-stone-900 line-clamp-1">{product.name}</p>
                            <p className="text-xs font-extrabold text-amber-600 tabular-nums mt-0.5">
                              {formatBRL(product.sellingPrice)} / {product.unit}
                            </p>
                            <p className="text-[11px] text-stone-500 tabular-nums">
                              Estoque: {product.stockQuantity ?? 0} {product.unit}
                            </p>
                          </div>
                          <span className="min-w-[36px] min-h-[36px] rounded-lg bg-stone-900 text-white flex items-center justify-center shrink-0">
                            <Plus className="w-4 h-4" />
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto py-3 space-y-3.5 text-xs">
                {/* Itens Consumidos (Acumulados) */}
                <div className="space-y-2">
                  <p className="font-bold text-stone-800 text-xs">Itens Lançados nesta Mesa</p>
                  {openTableOrders.length === 0 ||
                  openTableOrders.every((o) => o.items.length === 0) ? (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center text-stone-500">
                      Nenhum produto lançado ainda. Use a aba "Adicionar Produtos".
                    </div>
                  ) : (
                    <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 bg-white">
                      {openTableOrders.flatMap((ord) =>
                        ord.items.map((item, idx) => (
                          <div key={`${ord.id}-${idx}`} className="p-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-stone-900 truncate">
                                <span className="text-amber-700 font-mono mr-1.5 tabular-nums">
                                  {item.quantity}x
                                </span>
                                {item.productName}
                              </p>
                              <p className="text-[11px] text-stone-500 tabular-nums">
                                Unitário: {formatBRL(item.unitPrice)}
                                {item.variationName ? ` • ${item.variationName}` : ''}
                                {item.addedByName ? ` • Lançado por: ${item.addedByName}` : ''}
                                {item.notes ? ` • Obs: ${item.notes}` : ''}
                              </p>
                            </div>
                            <span className="font-bold text-stone-900 tabular-nums shrink-0">
                              {formatBRL(item.total)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Registro Cronológico de Autoria Colaborativa na Mesa */}
                {selectedTable.operationLogs && selectedTable.operationLogs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-bold text-stone-800 text-xs">Registro de Movimentações da Mesa</p>
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 max-h-32 overflow-y-auto space-y-1 text-[11px]">
                      {selectedTable.operationLogs.map((log) => (
                        <div key={log.id} className="flex items-start justify-between gap-2 text-stone-600">
                          <span>
                            <strong className="text-stone-800">{log.operatorName}</strong>:{' '}
                            {log.productName
                              ? `${log.quantity ?? 1}× ${log.productName}${log.notes ? ` (${log.notes})` : ''}`
                              : log.notes || log.type}
                          </span>
                          <span className="font-mono text-[10px] text-stone-400 shrink-0">
                            {formatTimeBR(log.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerta de Tempo / Temporizador Vencido no Modal */}
                {selectedTable.timer && (
                  <div
                    className={`rounded-2xl p-3 border flex items-center justify-between ${
                      getTimerDisplay(selectedTable.timer)?.isExpired
                        ? 'bg-rose-50 border-rose-300 text-rose-950'
                        : 'bg-amber-50 border-amber-200 text-amber-950'
                    }`}
                  >
                  <div className="flex items-center gap-2">
                    <Timer className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-bold">
                        {getTimerDisplay(selectedTable.timer)?.isExpired ? '⚠️ TEMPO ESGOTADO' : 'Temporizador da Mesa'}
                      </p>
                      <p className="text-[11px] font-mono">
                        Restante: {getTimerDisplay(selectedTable.timer)?.formatted} (Definido por {selectedTable.timer.setByName})
                      </p>
                    </div>
                  </div>

                  {isAdm && (
                    <div className="flex items-center gap-1">
                      {getTimerDisplay(selectedTable.timer)?.isExpired && !selectedTable.timer.acknowledged && (
                        <button
                          onClick={() => {
                            const res = acknowledgeTableTimer(currentTenant.id, selectedTable.id);
                            if (res) {
                              setSelectedTable(res);
                              loadTables();
                              showFeedback('✓ Alerta visual/sonoro da mesa reconhecido.');
                            }
                          }}
                          className="px-2 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700"
                          title="Silenciar alerta piscando"
                        >
                          Reconhecer
                        </button>
                      )}

                      <button
                        onClick={() => {
                          const res = pauseResumeTableTimer(currentTenant.id, selectedTable.id);
                          if (res) {
                            setSelectedTable(res);
                            loadTables();
                          }
                        }}
                        className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                        title="Pausar / Retomar contagem"
                      >
                        {selectedTable.timer.isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </button>

                      <button
                        onClick={() => {
                          const res = resetTableTimer(currentTenant.id, selectedTable.id);
                          if (res) {
                            setSelectedTable(res);
                            loadTables();
                          }
                        }}
                        className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                        title="Reiniciar tempo"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          const res = cancelTableTimer(currentTenant.id, selectedTable.id);
                          if (res) {
                            setSelectedTable(res);
                            loadTables();
                          }
                        }}
                        className="p-1.5 rounded-lg bg-white border border-stone-200 text-rose-600 hover:bg-rose-50"
                        title="Cancelar alerta"
                      >
                        <BellOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Botão de Temporizador para o ADM (se não tiver ativo) */}
              {isAdm && !selectedTable.timer && (
                <button
                  type="button"
                  onClick={() => setIsTimerModalOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-xs"
                >
                  <Timer className="h-4 w-4 text-amber-700" />
                  <span>Configurar Alerta / Temporizador da Mesa</span>
                </button>
              )}

              {/* Resumo Financeiro da Mesa (Consumo vs Valores Extras vs Pagamentos vs Saldo) */}
              <div className="rounded-2xl bg-stone-50 p-4 border border-stone-200 space-y-2">
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Consumo de Produtos:</span>
                  <strong>{formatBRL(selectedTable.productsTotal ?? Math.max(0, (selectedTable.currentTotal || 0) - (selectedTable.extraTotal || 0)))}</strong>
                </div>

                {selectedTable.extraTotal !== undefined && selectedTable.extraTotal > 0 && (
                  <div className="flex justify-between text-xs text-indigo-700 font-semibold">
                    <span>Valores Extras Lançados:</span>
                    <span>+{formatBRL(selectedTable.extraTotal)}</span>
                  </div>
                )}

                <div className="border-t border-stone-200/80 pt-2 flex justify-between items-baseline">
                  <span className="text-xs font-bold text-stone-700">Total Geral a Receber</span>
                  <span className="text-base font-black text-stone-900">
                    {formatBRL(selectedTable.currentTotal || 0)}
                  </span>
                </div>

                {(selectedTable.paidAmount || 0) > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700 font-semibold">
                    <span>Pagamentos Registrados:</span>
                    <span>-{formatBRL(selectedTable.paidAmount || 0)}</span>
                  </div>
                )}

                <div className="border-t border-stone-200 pt-2 flex justify-between items-baseline">
                  <span className="text-xs font-bold text-stone-800">Saldo Restante</span>
                  <span className="text-xl font-black text-amber-700">
                    {formatBRL(Math.max(0, (selectedTable.currentTotal || 0) - (selectedTable.paidAmount || 0)))}
                  </span>
                </div>

                {selectedTable.openedAt && (
                  <div className="flex justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                    <span>
                      Aberta por: <strong>{selectedTable.openedByName || selectedTable.waiterName || 'Salão'}</strong>
                    </span>
                    <span>
                      Aberta às: <strong>{formatTimeBR(selectedTable.openedAt)}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* SEÇÃO DE LANÇAMENTOS EXTRAS (Valores entregues ao cliente, despesas autorizadas, etc.) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    Lançamentos Extras da Mesa
                  </span>

                  {isAdm && (
                    <button
                      type="button"
                      onClick={() => setIsExtraChargeModalOpen(true)}
                      className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition"
                    >
                      + Lançar Valor Extra
                    </button>
                  )}
                </div>

                {/* Lista de Extras */}
                {selectedTable.extraCharges && selectedTable.extraCharges.length > 0 ? (
                  <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white overflow-hidden text-[11px]">
                    {selectedTable.extraCharges.map((charge) => {
                      const isCancelled = charge.status === 'cancelled';
                      return (
                        <div key={charge.id} className={`p-2.5 flex items-start justify-between ${isCancelled ? 'bg-stone-50 opacity-70' : ''}`}>
                          <div className={`min-w-0 flex-1 ${isCancelled ? 'line-through' : ''}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-stone-900">{formatBRL(charge.amount)}</span>
                              {charge.isCashWithdrawal && (
                                <span className="rounded bg-rose-50 px-1 text-[9px] font-bold text-rose-700 border border-rose-200">
                                  Saída do Caixa
                                </span>
                              )}
                              {charge.editedAt && !isCancelled && (
                                <span className="rounded bg-amber-50 px-1 text-[9px] font-bold text-amber-800 border border-amber-200">
                                  Editado
                                </span>
                              )}
                              {isCancelled && (
                                <span className="rounded bg-stone-200 px-1 text-[9px] font-bold text-stone-700">
                                  Estornado
                                </span>
                              )}
                            </div>
                            <p className="text-stone-700 truncate mt-0.5">{charge.description}</p>
                            <span className="text-[10px] text-stone-400 block">
                              Por {charge.createdByName} às {formatTimeBR(charge.createdAt)}
                            </span>
                            {isCancelled && charge.cancellationReason && (
                              <span className="text-[10px] text-rose-700 block no-underline">
                                Motivo estorno: {charge.cancellationReason}
                              </span>
                            )}
                          </div>

                          {isAdm && !isCancelled && (
                            <div className="ml-2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditExtraCharge(charge)}
                                className="text-stone-400 hover:text-amber-700 p-1 rounded hover:bg-amber-50"
                                title="Editar valor ou descrição"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelExtraCharge(charge.id, charge.amount)}
                                className="text-stone-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50"
                                title="Cancelar e estornar valor extra"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-stone-100 bg-stone-50 p-2.5 text-center text-stone-400 text-[11px]">
                    Nenhum valor extra lançado nesta mesa.
                  </div>
                )}
              </div>

              {/* Ações de Salão (SEM fechamento/pagamento — recebimentos ficam exclusivamente na aba Vendas) */}
              <div className="space-y-2.5 pt-2 border-t border-stone-100">
                {selectedTable.status !== 'available' ? (
                  <>
                    {selectedTable.status === 'occupied' && (
                      <button
                        type="button"
                        onClick={() => handleMarkAwaitingPayment(selectedTable)}
                        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-xs font-bold text-blue-900 hover:bg-blue-100 transition cursor-pointer"
                      >
                        <Receipt className="h-4 w-4 text-blue-700" />
                        <span>Marcar como Aguardando Pagamento</span>
                      </button>
                    )}

                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-stone-600">
                        Recebimento e quitação da conta são realizados na aba <strong>Vendas</strong>.
                      </span>
                      {onGoToSales && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionModalOpen(false);
                            onGoToSales();
                          }}
                          className="min-h-[38px] px-3 rounded-lg bg-stone-900 text-white text-[11px] font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                        >
                          Ir para Vendas
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  isAdm && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionModalOpen(false);
                          handleOpenEdit(selectedTable);
                        }}
                        className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Editar Mesa</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTable(selectedTable)}
                        className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Excluir Mesa</span>
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE QUANTIDADE / PESO PARA MESA */}
      <QuantitySelectorModal
        product={productForQtyModal}
        allowNegativeStock={Boolean(currentTenant.settings?.allowNegativeStock)}
        confirmLabel="Lançar na Mesa"
        onClose={() => setProductForQtyModal(null)}
        onConfirm={handleConfirmAddProductToTable}
      />

      {/* ========================================================================= */}
      {/* MODAL: ADICIONAR VALOR EXTRA À MESA (EXCLUSIVO ADM) */}
      {/* ========================================================================= */}
      {isExtraChargeModalOpen && selectedTable && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Função Exclusiva ADM
                </span>
                <h3 className="font-black text-stone-900 text-base">Adicionar Valor Extra à Mesa</h3>
                <p className="text-xs text-stone-500">Mesa: {selectedTable.label}</p>
              </div>
              <button
                onClick={() => setIsExtraChargeModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExtraChargeSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Valor em Reais (R$) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.50"
                  required
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-bold text-stone-900 focus:border-emerald-600 focus:outline-hidden"
                  placeholder="10.00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Descrição do Lançamento <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={extraDescription}
                  onChange={(e) => setExtraDescription(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900 focus:border-emerald-600 focus:outline-hidden"
                  placeholder="Ex: Valor entregue ao cliente para lazer do filho, ajuda de custo..."
                />
              </div>

              {/* Opção de Saída de Dinheiro do Caixa (Exemplo Prático R$ 10,00) */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950">
                <label className="flex items-start gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={isCashWithdrawal}
                    onChange={(e) => setIsCashWithdrawal(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-bold block text-xs">
                      Houve saída física de dinheiro da gaveta do caixa
                    </span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Registra a saída financeira imediata no caixa. O valor integrará a cobrança final do cliente para compensação.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsExtraChargeModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtra}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs"
                >
                  {isSubmittingExtra ? 'Salvando...' : 'Confirmar Lançamento Extra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIGURAR TEMPORIZADOR / ALERTA DE TEMPO DA MESA (ADM) */}
      {/* ========================================================================= */}
      {isTimerModalOpen && selectedTable && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Alerta Administrativo
                </span>
                <h3 className="font-black text-stone-900 text-base">Temporizador da Mesa</h3>
                <p className="text-xs text-stone-500">Mesa: {selectedTable.label}</p>
              </div>
              <button
                onClick={() => setIsTimerModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <p className="text-stone-600 text-[11px]">
                Defina quanto tempo deseja aguardar antes de receber o alerta visual na mesa:
              </p>

              {/* Presets Rápidos */}
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15, 20, 30, 45].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSetTimer(m)}
                    className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-50 py-2.5 font-bold text-stone-800 hover:border-amber-500 hover:bg-amber-50 transition"
                  >
                    <span className="text-sm">{m}</span>
                    <span className="text-[10px] text-stone-500 font-normal">minutos</span>
                  </button>
                ))}
              </div>

              {/* Tempo Personalizado */}
              <div className="pt-2 border-t border-stone-100">
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Tempo Personalizado (Minutos):
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={customTimerMinutes}
                    onChange={(e) => setCustomTimerMinutes(parseInt(e.target.value) || 1)}
                    className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleSetTimer(customTimerMinutes)}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
                  >
                    Iniciar
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-stone-50 p-3 text-[11px] text-stone-500 border border-stone-100">
                <p>
                  <strong>Lembrete:</strong> Ao zerar a contagem, a borda do cartão piscará em vermelho intermitente com alerta sonoro. O temporizador não fechará a mesa automaticamente.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR NOVA MESA (ADM) — Suporte a Nome do Cliente / Evento */}
      {/* ========================================================================= */}
      {isCreateModalOpen && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-lg">Nova Mesa</h3>
                <p className="text-xs text-stone-500">Cadastre mesas convencionais ou nominais</p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="mt-4 space-y-3.5 text-xs">
              {/* Opção: Nome do Cliente / Evento */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-indigo-950">
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={isNamedTable}
                    onChange={(e) => setIsNamedTable(e.target.checked)}
                    className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Identificar Mesa com Nome do Cliente / Evento</span>
                </label>
                <p className="text-[10px] text-indigo-800 mt-1">
                  Exemplos: "Mesa João", "Família Silva", "Aniversário Maria"
                </p>
              </div>

              {isNamedTable ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Nome do Cliente / Evento <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-hidden"
                    placeholder="Ex: Mesa João, Família Silva..."
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Identificação / Rótulo
                  </label>
                  <input
                    type="text"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
                    placeholder="Ex: Mesa 05, Varanda 02..."
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Número Interno da Mesa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formNumber}
                  onChange={(e) => setFormNumber(parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Capacidade (Lugares / Pessoas)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(parseInt(e.target.value) || 4)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-xs"
                >
                  Salvar Mesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR MESA (ADM) */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingTable && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-lg">Editar Mesa</h3>
                <p className="text-xs text-stone-500">Alterar identificação ou capacidade</p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5 text-xs">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-indigo-950">
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={isNamedTable}
                    onChange={(e) => setIsNamedTable(e.target.checked)}
                    className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Identificar Mesa com Nome do Cliente / Evento</span>
                </label>
              </div>

              {isNamedTable ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Nome do Cliente / Evento <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-hidden"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Nome / Identificação da Mesa
                  </label>
                  <input
                    type="text"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Número da Mesa
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formNumber}
                  onChange={(e) => setFormNumber(parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Capacidade (Lugares)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(parseInt(e.target.value) || 4)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR VALOR EXTRA DA MESA (EXCLUSIVO ADM) */}
      {/* ========================================================================= */}
      {editingExtraCharge && selectedTable && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Edição Auditada — ADM
                </span>
                <h3 className="font-black text-stone-900 text-base">Editar Valor Extra</h3>
                <p className="text-xs text-stone-500">Mesa: {selectedTable.label || `Mesa ${selectedTable.number}`}</p>
              </div>
              <button
                onClick={() => setEditingExtraCharge(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditExtraCharge} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Novo Valor em Reais (R$) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editExtraAmount}
                  onChange={(e) => setEditExtraAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-bold text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Descrição <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={editExtraDescription}
                  onChange={(e) => setEditExtraDescription(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Motivo da Alteração
                </label>
                <input
                  type="text"
                  value={editExtraReason}
                  onChange={(e) => setEditExtraReason(e.target.value)}
                  placeholder="Ex: Correção de valor entregue ao cliente"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
                />
              </div>

              {editingExtraCharge.isCashWithdrawal && (
                <p className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                  A diferença financeira será lançada como ajuste no caixa sem apagar a movimentação original.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditingExtraCharge(null)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-xs"
                >
                  Salvar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* ========================================================================= */}
      {/* MODAL: HISTÓRICO DE CONTAS DE MESAS ARQUIVADAS (ADM) */}
      {/* ========================================================================= */}
      {isArchivesModalOpen && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-lg">Histórico de Contas de Mesas</h3>
                <p className="text-xs text-stone-500">
                  Registros preservados mesmo após liberação ou exclusão do cadastro das mesas
                </p>
              </div>
              <button
                onClick={() => setIsArchivesModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-2.5 text-xs">
              {tableArchives.length === 0 ? (
                <div className="rounded-2xl border border-stone-100 bg-stone-50 p-8 text-center text-stone-400">
                  Nenhuma conta de mesa arquivada até o momento.
                </div>
              ) : (
                tableArchives.map((arch) => (
                  <div key={arch.id} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-black text-stone-900 text-sm">
                          {arch.tableName} (#{arch.tableNumber})
                        </span>
                        <span className="ml-2 text-[10px] text-stone-500 font-mono">{arch.id}</span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-700">
                        Quitado: {formatBRL(arch.paidTotal)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-stone-600 bg-white rounded-xl p-2.5 border border-stone-100">
                      <div>Produtos: <strong>{formatBRL(arch.productsTotal)}</strong></div>
                      <div>Extras: <strong>{formatBRL(arch.extraTotal)}</strong></div>
                      <div>Total: <strong>{formatBRL(arch.grandTotal)}</strong></div>
                    </div>
                    <div className="flex flex-wrap justify-between text-[10px] text-stone-500">
                      <span>Fechada em {formatDateTimeBR(arch.closedAt)} por {arch.closedByName}</span>
                      <span>{arch.payments.length} pagamento(s) • {arch.extraCharges.length} lançamento(s) extra</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE MESA(S) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-stone-900 text-base">{confirmModal.title}</h3>
            <p className="text-xs text-stone-600 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="w-1/2 min-h-[42px] rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="w-1/2 min-h-[42px] rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE JUSTIFICATIVA PARA CANCELAR VALOR EXTRA */}
      {cancelExtraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmCancelExtraCharge}
            className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4"
          >
            <div>
              <h3 className="font-black text-stone-900 text-base">Cancelar Valor Extra</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Estornar lançamento de <strong>{formatBRL(cancelExtraModal.amount)}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Justificativa obrigatória *
              </label>
              <textarea
                rows={3}
                required
                value={cancelExtraModal.reason}
                onChange={(e) => setCancelExtraModal({ ...cancelExtraModal, reason: e.target.value })}
                placeholder="Informe o motivo do cancelamento/estorno..."
                className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelExtraModal(null)}
                className="w-1/2 min-h-[42px] rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="w-1/2 min-h-[42px] rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmar Estorno
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
