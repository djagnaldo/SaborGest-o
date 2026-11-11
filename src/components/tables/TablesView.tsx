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
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { RestaurantTable, TableExtraCharge, TableTimer } from '../../types';
import {
  getTables,
  saveTable,
  deleteTable,
  deleteTablesBatch,
  deleteAllAvailableTables,
  addTableExtraCharge,
  cancelTableExtraCharge,
  setTableTimer,
  pauseResumeTableTimer,
  resetTableTimer,
  cancelTableTimer,
  acknowledgeTableTimer,
  addAuditLog,
} from '../../services/storage';
import { formatBRL, formatTimeBR } from '../../utils/formatters';
import { playTableAlarmSound } from '../../utils/soundAlert';

interface TablesViewProps {
  onStartSaleForTable?: (tableNumber: number) => void;
}

export const TablesView: React.FC<TablesViewProps> = ({ onStartSaleForTable }) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

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

  // Modal de Temporizador / Alerta (ADM)
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number>(15);
  const [customTimerMinutes, setCustomTimerMinutes] = useState<number>(15);

  // Modo de Seleção Múltipla para Exclusão em Lote (ADM)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIdsForBatch, setSelectedIdsForBatch] = useState<string[]>([]);

  // Feedback & Filtros
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'closing'>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estado temporal em tempo real para contagem regressiva
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  const loadTables = () => {
    const list = getTables(currentTenant.id);
    list.sort((a, b) => a.number - b.number);
    setTables(list);
    if (selectedTable) {
      const updated = list.find((t) => t.id === selectedTable.id);
      if (updated) setSelectedTable(updated);
    }
  };

  useEffect(() => {
    loadTables();
    const handleSync = () => loadTables();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  // Timer em tempo real a cada 1 segundo para contagem regressiva e disparo de alarme
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      // Verifica se alguma mesa acabou de expirar o temporizador para emitir alerta sonoro
      tables.forEach((table) => {
        if (table.timer && !table.timer.isPaused && !table.timer.acknowledged) {
          const target = new Date(table.timer.targetTime).getTime();
          if (now >= target && !table.timer.isExpired) {
            // Dispara som de alerta suave
            playTableAlarmSound();
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

    // Bloqueio rigoroso: Não permite exclusão se houver pedido ativo ou valor em aberto
    if (table.status === 'occupied' || table.status === 'closing' || (table.currentTotal && table.currentTotal > 0)) {
      showFeedback(
        `⛔ Bloqueio de Segurança: Não é permitido excluir "${table.label || `Mesa ${table.number}`}" enquanto houver atendimento ativo ou conta em aberto (${formatBRL(table.currentTotal)}). Encerre a conta antes de excluir.`,
        'error'
      );
      return;
    }

    if (confirm(`Confirma a exclusão de "${table.label || `Mesa ${table.number}`}"? Esta ação removerá a mesa do salão.`)) {
      const result = deleteTable(table.id);
      if (result.success) {
        loadTables();
        setIsActionModalOpen(false);
        showFeedback(`✓ "${table.label || `Mesa ${table.number}`}" excluída com sucesso.`);
      } else {
        showFeedback(result.error || 'Erro ao excluir mesa.', 'error');
      }
    }
  };

  // ADM: Exclusão em Lote das Selecionadas
  const handleExecuteBatchDelete = () => {
    if (selectedIdsForBatch.length === 0) return;

    if (confirm(`Confirma a exclusão em lote de ${selectedIdsForBatch.length} mesa(s) selecionada(s)? Apenas mesas livres serão removidas.`)) {
      const res = deleteTablesBatch(selectedIdsForBatch);
      loadTables();
      setSelectedIdsForBatch([]);
      setIsBatchMode(false);

      if (res.blockedCount > 0) {
        showFeedback(
          `✓ ${res.successCount} mesa(s) livre(s) excluída(s). ⚠️ ${res.blockedCount} mesa(s) NÃO foram excluídas por estarem ocupadas ou com saldo em aberto.`,
          'error'
        );
      } else {
        showFeedback(`✓ ${res.successCount} mesa(s) excluída(s) com sucesso em lote.`);
      }
    }
  };

  // ADM: Excluir Todas as Mesas Disponíveis
  const handleDeleteAllAvailable = () => {
    const availableTotal = tables.filter((t) => t.status === 'available' && (!t.currentTotal || t.currentTotal <= 0)).length;
    if (availableTotal === 0) {
      showFeedback('Não há mesas disponíveis sem pedidos para excluir.', 'error');
      return;
    }

    if (confirm(`ATENÇÃO: Deseja realmente excluir TODAS as ${availableTotal} mesas disponíveis do salão? Mesas ocupadas ou em atendimento permanecerão protegidas.`)) {
      const res = deleteAllAvailableTables(currentTenant.id);
      loadTables();
      showFeedback(`✓ ${res.successCount} mesas disponíveis foram removidas do salão.`);
    }
  };

  // ADM: Adicionar Valor Extra à Mesa
  const handleAddExtraChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !currentUser || !isAdm) return;

    if (!extraAmount || extraAmount <= 0) {
      showFeedback('Informe um valor válido em reais (R$).', 'error');
      return;
    }

    if (!extraDescription.trim()) {
      showFeedback('Informe a descrição obrigatória do lançamento extra.', 'error');
      return;
    }

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
  };

  // ADM: Cancelar Lançamento Extra da Mesa
  const handleCancelExtraCharge = (chargeId: string, chargeAmount: number) => {
    if (!selectedTable || !currentUser || !isAdm) return;

    const reason = prompt(`Informe o motivo do cancelamento do valor extra de ${formatBRL(chargeAmount)}:`, 'Cancelamento solicitado pelo ADM');
    if (reason === null) return;

    const res = cancelTableExtraCharge(
      currentTenant.id,
      selectedTable.id,
      chargeId,
      reason || 'Cancelado pelo ADM',
      { id: currentUser.id, name: currentUser.name }
    );

    if (res.success && res.table) {
      setSelectedTable(res.table);
      loadTables();
      showFeedback(`✓ Lançamento extra cancelado e estornado com sucesso.`);
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

  // Ações Operacionais de Salão (Abertura, Pedido, Liberação)
  const handleOpenTable = (table: RestaurantTable) => {
    const updated: RestaurantTable = {
      ...table,
      status: 'occupied',
      openedAt: new Date().toISOString(),
      waiterId: currentUser?.id,
      waiterName: currentUser?.name,
      currentTotal: table.currentTotal || 0,
    };
    saveTable(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'garcom',
      userName: currentUser?.name || 'Vendedor',
      action: 'ABRIU_MESA',
      details: `Iniciou atendimento na mesa "${table.label || `Mesa ${table.number}`}"`,
    });
    loadTables();
    setIsActionModalOpen(false);

    if (onStartSaleForTable) {
      onStartSaleForTable(table.number);
    }
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
      userName: currentUser?.name || 'Vendedor',
      action: 'SOLICITOU_CONTA',
      details: `Solicitou fechamento de conta da mesa "${table.label || `Mesa ${table.number}`}"`,
    });
    loadTables();
    setIsActionModalOpen(false);
    showFeedback(`Conta de "${table.label || `Mesa ${table.number}`}" solicitada (Aguardando Pagamento).`);
  };

  const handleFreeTable = (table: RestaurantTable) => {
    const updated: RestaurantTable = {
      ...table,
      status: 'available',
      openedAt: undefined,
      waiterId: undefined,
      waiterName: undefined,
      currentTotal: 0,
      productsTotal: 0,
      extraTotal: 0,
      extraCharges: [],
      timer: undefined,
    };
    saveTable(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'garcom',
      userName: currentUser?.name || 'Vendedor',
      action: 'LIBEROU_MESA',
      details: `Liberou a mesa "${table.label || `Mesa ${table.number}`}" após encerramento`,
    });
    loadTables();
    setIsActionModalOpen(false);
    showFeedback(`✓ "${table.label || `Mesa ${table.number}`}" liberada e disponível para novo atendimento.`);
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
            Controle ilimitado de salão, comandas nominais, lançamentos extras e alertas com temporizador
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
                    setSelectedTable(table);
                    setIsActionModalOpen(true);
                  }
                }}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 shadow-2xs transition cursor-pointer hover:shadow-md ${cardBaseStyle} ${
                  isFlashingAlert
                    ? 'border-2 border-rose-600! animate-pulse ring-2 ring-rose-500/50 bg-rose-50/30'
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
                          {formatBRL(table.currentTotal || 0)}
                        </p>
                        <span className="text-[9px] text-stone-400">Total</span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTimeBR(table.openedAt)}
                        </span>
                        <span className="truncate max-w-[65px]">
                          {table.waiterName?.split(' ')[0] || 'Atendimento'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Mesa #{selectedTable.number}
                </span>
                <h3 className="font-black text-stone-900 text-lg">
                  {selectedTable.label || `Mesa ${selectedTable.number}`}
                </h3>
                <p className="text-xs text-stone-500">
                  Capacidade para {selectedTable.capacity} pessoas • Status: <strong>{selectedTable.status}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3.5 text-xs">
              {/* Alerta de Tempo / Temporizador Vencido no Modal */}
              {selectedTable.timer && (
                <div
                  className={`rounded-2xl p-3 border flex items-center justify-between ${
                    getTimerDisplay(selectedTable.timer)?.isExpired
                      ? 'bg-rose-50 border-rose-300 text-rose-950 animate-pulse'
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
                      <button
                        onClick={() => {
                          const res = pauseResumeTableTimer(currentTenant.id, selectedTable.id);
                          if (res) setSelectedTable(res);
                        }}
                        className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                        title="Pausar / Retomar contagem"
                      >
                        {selectedTable.timer.isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </button>

                      <button
                        onClick={() => {
                          const res = resetTableTimer(currentTenant.id, selectedTable.id);
                          if (res) setSelectedTable(res);
                        }}
                        className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                        title="Reiniciar tempo"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          const res = cancelTableTimer(currentTenant.id, selectedTable.id);
                          if (res) setSelectedTable(res);
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

              {/* Resumo Financeiro da Mesa (Consumo vs Valores Extras) */}
              <div className="rounded-2xl bg-stone-50 p-4 border border-stone-200 space-y-2">
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Consumo de Produtos:</span>
                  <strong>{formatBRL(selectedTable.productsTotal || (selectedTable.currentTotal - (selectedTable.extraTotal || 0)) || 0)}</strong>
                </div>

                {selectedTable.extraTotal !== undefined && selectedTable.extraTotal > 0 && (
                  <div className="flex justify-between text-xs text-indigo-700 font-semibold">
                    <span>Valores Extras Lançados:</span>
                    <span>+{formatBRL(selectedTable.extraTotal)}</span>
                  </div>
                )}

                <div className="border-t border-stone-200/80 pt-2 flex justify-between items-baseline">
                  <span className="text-xs font-bold text-stone-700">Total da Conta</span>
                  <span className="text-xl font-black text-stone-900">
                    {formatBRL(selectedTable.currentTotal || 0)}
                  </span>
                </div>

                {selectedTable.openedAt && (
                  <div className="flex justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                    <span>Atendente: <strong>{selectedTable.waiterName || 'Salão'}</strong></span>
                    <span>Aberta às: <strong>{formatTimeBR(selectedTable.openedAt)}</strong></span>
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
                        <div key={charge.id} className={`p-2.5 flex items-center justify-between ${isCancelled ? 'bg-stone-50 opacity-60 line-through' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-900">{formatBRL(charge.amount)}</span>
                              {charge.isCashWithdrawal && (
                                <span className="rounded bg-rose-50 px-1 text-[9px] font-bold text-rose-700 border border-rose-200">
                                  Saída do Caixa
                                </span>
                              )}
                              {isCancelled && (
                                <span className="rounded bg-stone-200 px-1 text-[9px] font-bold text-stone-600">
                                  Cancelado
                                </span>
                              )}
                            </div>
                            <p className="text-stone-600 truncate mt-0.5">{charge.description}</p>
                            <span className="text-[10px] text-stone-400">
                              Por {charge.createdByName} às {formatTimeBR(charge.createdAt)}
                            </span>
                          </div>

                          {isAdm && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleCancelExtraCharge(charge.id, charge.amount)}
                              className="ml-2 text-stone-400 hover:text-rose-600 p-1"
                              title="Cancelar e estornar valor extra"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
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

              {/* Ações de Salão */}
              <div className="space-y-2 pt-2 border-t border-stone-100">
                {selectedTable.status === 'available' ? (
                  <>
                    <button
                      onClick={() => handleOpenTable(selectedTable)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-95 transition"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Iniciar Atendimento nesta Mesa</span>
                    </button>

                    {isAdm && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
                        <button
                          onClick={() => {
                            setIsActionModalOpen(false);
                            handleOpenEdit(selectedTable);
                          }}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Editar</span>
                        </button>

                        <button
                          onClick={() => handleDeleteTable(selectedTable)}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Continuar Pedido / Ir para o PDV */}
                    {onStartSaleForTable && (
                      <button
                        onClick={() => {
                          setIsActionModalOpen(false);
                          onStartSaleForTable(selectedTable.number);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-xs font-bold text-white hover:bg-stone-800 active:scale-95 transition shadow-xs"
                      >
                        <Receipt className="h-4 w-4 text-amber-400" />
                        <span>Adicionar Mais Itens ao Pedido (PDV)</span>
                      </button>
                    )}

                    {selectedTable.status === 'occupied' && (
                      <button
                        onClick={() => handleCloseBill(selectedTable)}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-900 hover:bg-blue-100 transition"
                      >
                        <Receipt className="h-4 w-4 text-blue-700" />
                        <span>Solicitar Conta / Aguardando Pagamento</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleFreeTable(selectedTable)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirmar Pagamento & Liberar Mesa</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs"
                >
                  Confirmar Lançamento Extra
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
    </div>
  );
};
