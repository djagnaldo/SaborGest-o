/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Search,
  Plus,
  Minus,
  Trash2,
  QrCode,
  Banknote,
  CheckCircle2,
  Printer,
  ShoppingBag,
  X,
  Image as ImageIcon,
  ShieldAlert,
  Camera,
  Upload,
  Grid2X2,
  Clock,
  ArrowRight,
  Ban,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Product, OrderItem, Order, RestaurantTable, Category } from '../../types';
import {
  getProducts,
  getCategories,
  getOrders,
  getTables,
  getOpenTableOrders,
  registerTablePaymentAndSettle,
  saveOrder,
  recordPaymentInCashSession,
  validateOrderStock,
  deductStockForOrder,
  isSellerAuthorizedToSell,
  getOrderProductSalesTotal,
  getOrderExtraTotal,
} from '../../services/storage';
import { cancelOrderWithAuthority, recordDeltaTransfer } from '../../services/local-db';
import { apiRequest, refreshSnapshotFromServer, getWsConnectionStatus } from '../../services/sync-client';
import { processProductImage, PRESET_RECEIPT_PHOTOS } from '../../utils/image-processor';
import { formatBRL, formatDateTimeBR, formatTimeBR } from '../../utils/formatters';
import { QuantitySelectorModal } from './QuantitySelectorModal';

interface PosViewProps {
  mode?: 'sales' | 'counter';
  preselectedTableNumber?: number | null;
  onConsumePreselectedTable?: () => void;
  onNavigateToTables?: () => void;
  onNavigateToCounter?: () => void;
}

const formatUnitStock = (qty: number, unit?: string) => {
  if (unit === 'kg') return `${Number(qty || 0).toFixed(2)} kg`;
  if (unit === 'l') return `${Number(qty || 0).toFixed(2)} L`;
  if (unit === 'g') return `${Math.round(qty || 0)} g`;
  if (unit === 'ml') return `${Math.round(qty || 0)} ml`;
  return `${qty || 0} ${unit || 'un'}`;
};

const formatModalityBadge = (ord: Order) => {
  if (ord.type === 'table') {
    return ord.tableName || `Mesa #${ord.tableNumber || ''}`;
  }
  if (ord.type === 'comanda') {
    return `Registro Histórico${ord.comandaNumber ? ` #${ord.comandaNumber}` : ''}`;
  }
  return 'Balcão';
};

export const PosView: React.FC<PosViewProps> = ({
  mode = 'sales',
  preselectedTableNumber,
  onConsumePreselectedTable,
  onNavigateToTables,
  onNavigateToCounter,
}) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Feedback toast inline (substitui qualquer window.alert)
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadData = () => {
    setProducts(getProducts(currentTenant.id).filter((p) => p.active));
    setCategories(getCategories(currentTenant.id).filter((c) => c.active));
    const sortedTables = [...getTables(currentTenant.id)].sort((a, b) => a.number - b.number);
    setTables(sortedTables);
    setOrders(getOrders(currentTenant.id));
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  const isSellerBlocked = !isAdm && !isSellerAuthorizedToSell(currentUser?.id);

  // =========================================================================
  // ESTADOS EXCLUSIVOS DO MODO BALCÃO (mode === 'counter')
  // =========================================================================
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [productForModal, setProductForModal] = useState<Product | null>(null);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [counterCustomerName, setCounterCustomerName] = useState('');
  const [counterMethod, setCounterMethod] = useState<'dinheiro' | 'pix'>('dinheiro');
  const [counterReceivedCash, setCounterReceivedCash] = useState<number>(0);
  const [isSubmittingCounter, setIsSubmittingCounter] = useState(false);
  const [finishedCounterOrder, setFinishedCounterOrder] = useState<Order | null>(null);

  // Comprovantes fotográficos (Balcão)
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptSizeKb, setReceiptSizeKb] = useState<number | null>(null);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [showPresetReceiptModal, setShowPresetReceiptModal] = useState(false);

  const pixRule = currentTenant.settings?.pixReceiptRule || 'optional';
  const cashRule = currentTenant.settings?.cashReceiptRule || 'optional';
  const activeReceiptRule = counterMethod === 'pix' ? pixRule : cashRule;
  const isReceiptMandatory = activeReceiptRule === 'required';

  // =========================================================================
  // ESTADOS EXCLUSIVOS DO MODO VENDAS / FECHAMENTO DE MESAS (mode === 'sales')
  // =========================================================================
  const [settlingTable, setSettlingTable] = useState<RestaurantTable | null>(null);
  const [settleMethod, setSettleMethod] = useState<'dinheiro' | 'pix'>('dinheiro');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleReceivedCash, setSettleReceivedCash] = useState<number>(0);
  const [settleNotes, setSettleNotes] = useState('');
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);

  // Filtros e histórico de vendas
  const [historyFilter, setHistoryFilter] = useState<'today' | 'all' | 'counter' | 'table' | 'cancelled'>('today');
  const [historySearch, setHistorySearch] = useState('');
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Se vier mesa pré-selecionada na aba Vendas, abre fechamento da conta diretamente
  useEffect(() => {
    if (mode === 'sales' && preselectedTableNumber) {
      const target = tables.find((t) => t.number === preselectedTableNumber);
      if (target) {
        openTableSettlementModal(target);
      }
      onConsumePreselectedTable?.();
    }
  }, [mode, preselectedTableNumber, tables]);

  const openTableSettlementModal = (table: RestaurantTable) => {
    const productsTotal = table.productsTotal ?? Math.max(0, (table.currentTotal || 0) - (table.extraTotal || 0));
    const extraTotal = table.extraTotal || 0;
    const grandTotal = Number((productsTotal + extraTotal).toFixed(2));
    const paidAlready = Number((table.paidAmount || 0).toFixed(2));
    const remaining = Number(Math.max(0, grandTotal - paidAlready).toFixed(2));

    setSettlingTable(table);
    setSettleMethod('dinheiro');
    setSettleAmount(remaining);
    setSettleReceivedCash(remaining);
    setSettleNotes('');
  };

  // Mantém settlingTable sincronizada se outro dispositivo atualizar durante modal aberto
  useEffect(() => {
    if (settlingTable) {
      const refreshed = tables.find((t) => t.id === settlingTable.id);
      if (refreshed) {
        setSettlingTable(refreshed);
      }
    }
  }, [tables]);

  // =========================================================================
  // LÓGICA DO BALCÃO
  // =========================================================================
  const filteredCatalog = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
      const q = searchTerm.trim().toLowerCase();
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.internalCode.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [products, selectedCategory, searchTerm]);

  const cartSubtotal = useMemo(
    () => Number(cartItems.reduce((acc, i) => acc + i.total, 0).toFixed(2)),
    [cartItems]
  );

  const handleConfirmAddBalcao = (payload: {
    product: Product;
    quantity: number;
    variationName?: string;
    selectedAddons?: { name: string; price: number }[];
    notes?: string;
  }) => {
    if (isSellerBlocked) {
      showFeedback('Sua permissão para vender está bloqueada pelo Administrador.', 'error');
      return;
    }

    const allowNeg = Boolean(currentTenant.settings?.allowNegativeStock);
    const currentInCartForProduct = cartItems
      .filter((i) => i.productId === payload.product.id)
      .reduce((acc, i) => acc + i.quantity, 0);
    const available = payload.product.stockQuantity ?? 0;

    if (!allowNeg && currentInCartForProduct + payload.quantity > available + 0.0001) {
      showFeedback(
        `Estoque insuficiente para "${payload.product.name}". Disponível: ${formatUnitStock(available, payload.product.unit)}.`,
        'error'
      );
      return;
    }

    const variationPrice =
      payload.variationName && payload.product.variations?.length
        ? payload.product.variations.find((v) => v.name === payload.variationName)?.price ??
          payload.product.sellingPrice
        : payload.product.sellingPrice;
    const addonsTotal = (payload.selectedAddons || []).reduce((acc, a) => acc + a.price, 0);
    const unitPrice = Number((variationPrice + addonsTotal).toFixed(2));
    const cleanNotes = (payload.notes || '').trim();
    const addonsKey = JSON.stringify(payload.selectedAddons || []);

    setCartItems((prev) => {
      const matchIdx = prev.findIndex(
        (existing) =>
          existing.productId === payload.product.id &&
          (existing.variationName || '') === (payload.variationName || '') &&
          (existing.notes || '').trim() === cleanNotes &&
          JSON.stringify(existing.selectedAddons || []) === addonsKey
      );
      if (matchIdx >= 0) {
        return prev.map((it, idx) => {
          if (idx !== matchIdx) return it;
          const nextQty = Number((it.quantity + payload.quantity).toFixed(3));
          return {
            ...it,
            quantity: nextQty,
            total: Number((nextQty * it.unitPrice).toFixed(2)),
          };
        });
      }
      return [
        ...prev,
        {
          productId: payload.product.id,
          productName: payload.product.name,
          quantity: payload.quantity,
          unitPrice,
          variationName: payload.variationName,
          selectedAddons: payload.selectedAddons,
          notes: cleanNotes || undefined,
          total: Number((payload.quantity * unitPrice).toFixed(2)),
        },
      ];
    });

    setProductForModal(null);
  };

  const handleUpdateCartQty = (idx: number, delta: number) => {
    const item = cartItems[idx];
    if (!item) return;
    const prod = products.find((p) => p.id === item.productId);
    const allowNeg = Boolean(currentTenant.settings?.allowNegativeStock);
    const otherQtyInCart = cartItems
      .filter((i, iIdx) => iIdx !== idx && i.productId === item.productId)
      .reduce((acc, i) => acc + i.quantity, 0);
    const nextQty = Number((item.quantity + delta).toFixed(3));

    if (nextQty <= 0) {
      setCartItems((prev) => prev.filter((_, i) => i !== idx));
      return;
    }

    if (!allowNeg && prod && otherQtyInCart + nextQty > (prod.stockQuantity ?? 0) + 0.0001) {
      showFeedback(
        `Limite de estoque atingido (${formatUnitStock(prod.stockQuantity, prod.unit)}).`,
        'error'
      );
      return;
    }

    setCartItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, quantity: nextQty, total: Number((nextQty * it.unitPrice).toFixed(2)) }
          : it
      )
    );
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingReceipt(true);
      const res = await processProductImage(file, 640, 640, 0.82);
      setReceiptImage(res.dataUrl);
      setReceiptSizeKb(Math.round(res.compressedSizeBytes / 1024));
      recordDeltaTransfer(res.compressedSizeBytes, res.originalSizeBytes);
    } catch {
      showFeedback('Falha ao processar imagem do comprovante.', 'error');
    } finally {
      setIsProcessingReceipt(false);
      e.target.value = '';
    }
  };

  const handleFinalizeCounterSale = async () => {
    if (cartItems.length === 0 || isSubmittingCounter) return;

    if (isSellerBlocked) {
      showFeedback('Operação bloqueada: sua permissão para vender foi desligada pelo Administrador.', 'error');
      return;
    }

    if (isReceiptMandatory && !receiptImage) {
      showFeedback(
        `Comprovante obrigatório para pagamentos em ${counterMethod.toUpperCase()}.`,
        'error'
      );
      return;
    }

    const stockCheck = validateOrderStock(currentTenant.id, cartItems);
    if (!stockCheck.valid) {
      showFeedback(stockCheck.error || 'Estoque insuficiente para concluir a venda.', 'error');
      return;
    }

    setIsSubmittingCounter(true);
    const mutationId = `cnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const itemsPayload = cartItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      variationName: i.variationName,
      selectedAddons: i.selectedAddons,
      notes: i.notes,
    }));

    try {
      const res = await apiRequest<{ ok: boolean; order: Order }>('/api/pos/counter-sale', {
        method: 'POST',
        activeUserId: currentUser?.id,
        queueOnOffline: true,
        body: {
          tenantId: currentTenant.id,
          items: itemsPayload,
          paymentMethod: counterMethod,
          receivedAmount: counterMethod === 'dinheiro' ? counterReceivedCash || cartSubtotal : cartSubtotal,
          customerName: counterCustomerName.trim() || undefined,
          receiptImageUrl: receiptImage || undefined,
          mutationId,
        },
      });

      if (!getWsConnectionStatus().connected) {
        await refreshSnapshotFromServer(currentTenant.id, currentUser?.id);
      }

      setFinishedCounterOrder(res.order);
      setCartItems([]);
      setCounterCustomerName('');
      setCounterReceivedCash(0);
      setReceiptImage(null);
      setReceiptSizeKb(null);
      loadData();
      try {
        confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
      } catch {
        // noop
      }
      showFeedback(`Venda no Balcão #${res.order.orderNumber} confirmada com sucesso!`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.startsWith('OFFLINE_QUEUED:')) {
        // Fallback offline local preservando estoque e pedido
        const deduct = deductStockForOrder(currentTenant.id, cartItems);
        if (!deduct.success) {
          showFeedback(deduct.error || 'Falha ao baixar estoque local.', 'error');
          setIsSubmittingCounter(false);
          return;
        }
        const orderNumber = Math.floor(Math.random() * 900 + 100);
        const nowIso = new Date().toISOString();
        const receivedVal =
          counterMethod === 'dinheiro' ? counterReceivedCash || cartSubtotal : cartSubtotal;
        const offlineOrder: Order = {
          id: `ord-cnt-${Date.now()}`,
          tenantId: currentTenant.id,
          orderNumber,
          type: 'counter',
          status: 'closed',
          waiterId: currentUser?.id,
          waiterName: currentUser?.name || 'Operador',
          customerName: counterCustomerName.trim() || undefined,
          items: cartItems,
          subtotal: cartSubtotal,
          discount: 0,
          serviceFee: 0,
          total: cartSubtotal,
          payments: [
            {
              method: counterMethod,
              amount: cartSubtotal,
              receivedAmount: receivedVal,
              change: counterMethod === 'dinheiro' ? Math.max(0, receivedVal - cartSubtotal) : 0,
              receiptImageUrl: receiptImage || undefined,
              receiptType: counterMethod === 'pix' ? 'pix' : 'cash',
              receiptCapturedAt: receiptImage ? nowIso : undefined,
              receiptSellerName: receiptImage ? currentUser?.name : undefined,
            },
          ],
          paid: true,
          receiptImageUrl: receiptImage || undefined,
          notes: '[SINCRONIZAÇÃO PENDENTE]',
          createdAt: nowIso,
          closedAt: nowIso,
          isDemo: false,
        };
        saveOrder(offlineOrder);
        recordPaymentInCashSession(currentTenant.id, counterMethod, cartSubtotal);
        setFinishedCounterOrder(offlineOrder);
        setCartItems([]);
        setCounterCustomerName('');
        setCounterReceivedCash(0);
        setReceiptImage(null);
        setReceiptSizeKb(null);
        loadData();
        showFeedback('Venda salva offline no Balcão e enfileirada para sincronização.');
      } else {
        showFeedback(msg || 'Não foi possível concluir a venda no balcão.', 'error');
      }
    } finally {
      setIsSubmittingCounter(false);
    }
  };

  // =========================================================================
  // LÓGICA DA ABA VENDAS: FECHAMENTO DE MESAS + HISTÓRICO
  // =========================================================================
  const openTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          t.status !== 'available' ||
          (t.currentTotal || 0) > 0 ||
          (t.productsTotal || 0) > 0 ||
          (t.extraTotal || 0) > 0
      ),
    [tables]
  );

  const handleConfirmTableSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingTable || !currentUser || isSubmittingSettle) return;
    if (isSellerBlocked) {
      showFeedback('Operação bloqueada: sua permissão de venda foi desligada pelo Administrador.', 'error');
      return;
    }

    const productsTotal =
      settlingTable.productsTotal ??
      Math.max(0, (settlingTable.currentTotal || 0) - (settlingTable.extraTotal || 0));
    const extraTotal = settlingTable.extraTotal || 0;
    const grandTotal = Number((productsTotal + extraTotal).toFixed(2));
    const paidAlready = Number((settlingTable.paidAmount || 0).toFixed(2));
    const remaining = Number(Math.max(0, grandTotal - paidAlready).toFixed(2));

    if (remaining > 0.009 && (!settleAmount || settleAmount <= 0)) {
      showFeedback('Informe um valor de pagamento positivo.', 'error');
      return;
    }

    setIsSubmittingSettle(true);
    const mutationId = `stl-${settlingTable.id}-${Date.now()}`;

    try {
      const res = await apiRequest<{
        ok: boolean;
        settled: boolean;
        remainingBalance: number;
        table: RestaurantTable;
      }>(`/api/tables/${encodeURIComponent(settlingTable.id)}/settle`, {
        method: 'POST',
        activeUserId: currentUser.id,
        queueOnOffline: true,
        body: {
          tenantId: currentTenant.id,
          method: settleMethod,
          amount: remaining <= 0.009 ? 0 : settleAmount,
          receivedAmount: settleMethod === 'dinheiro' ? settleReceivedCash || settleAmount : settleAmount,
          notes: settleNotes.trim() || undefined,
          allowEmptyRelease: remaining <= 0.009,
          mutationId,
        },
      });

      if (!getWsConnectionStatus().connected) {
        await refreshSnapshotFromServer(currentTenant.id, currentUser.id);
      }

      loadData();
      if (res.settled) {
        setSettlingTable(null);
        showFeedback(
          `Conta da ${settlingTable.label || `Mesa ${settlingTable.number}`} quitada e liberada!`
        );
      } else {
        setSettlingTable(res.table);
        setSettleAmount(res.remainingBalance);
        setSettleReceivedCash(res.remainingBalance);
        showFeedback(
          `Pagamento parcial registrado. Saldo restante: ${formatBRL(res.remainingBalance)}.`
        );
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.startsWith('OFFLINE_QUEUED:')) {
        const localRes = registerTablePaymentAndSettle(
          currentTenant.id,
          settlingTable.id,
          {
            method: settleMethod,
            amount: settleAmount,
            receivedAmount: settleMethod === 'dinheiro' ? settleReceivedCash || settleAmount : settleAmount,
            notes: settleNotes.trim() || undefined,
            allowEmptyRelease: remaining <= 0.009,
          },
          { id: currentUser.id, name: currentUser.name }
        );
        if (localRes.success) {
          loadData();
          if (localRes.settled) {
            setSettlingTable(null);
            showFeedback('Mesa quitada offline e enfileirada para sincronização.');
          } else if (localRes.table) {
            setSettlingTable(localRes.table);
            setSettleAmount(localRes.remainingBalance);
            setSettleReceivedCash(localRes.remainingBalance);
            showFeedback(
              `Pagamento parcial salvo offline. Saldo restante: ${formatBRL(localRes.remainingBalance)}.`
            );
          }
        } else {
          showFeedback(localRes.error || 'Erro ao processar pagamento.', 'error');
        }
      } else {
        showFeedback(msg || 'Não foi possível registrar o pagamento da mesa.', 'error');
      }
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder || !currentUser || !isAdm) return;

    try {
      await apiRequest(`/api/orders/${encodeURIComponent(cancellingOrder.id)}/cancel`, {
        method: 'POST',
        activeUserId: currentUser.id,
        queueOnOffline: true,
        body: {
          reason: cancelReason.trim() || 'Cancelado pelo Administrador',
        },
      });
      if (!getWsConnectionStatus().connected) {
        await refreshSnapshotFromServer(currentTenant.id, currentUser.id);
      }
      setCancellingOrder(null);
      setCancelReason('');
      loadData();
      showFeedback(`Venda #${cancellingOrder.orderNumber} cancelada com estorno automático de estoque.`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.startsWith('OFFLINE_QUEUED:')) {
        const localRes = cancelOrderWithAuthority(
          cancellingOrder.id,
          cancelReason.trim() || 'Cancelado pelo Administrador',
          'adm',
          currentUser.role,
          currentUser.name
        );
        if (localRes.success) {
          setCancellingOrder(null);
          setCancelReason('');
          loadData();
          showFeedback('Venda cancelada localmente e enfileirada.');
        } else {
          showFeedback(localRes.message || 'Não foi possível cancelar a venda.', 'error');
        }
      } else {
        showFeedback(msg || 'Erro ao cancelar venda.', 'error');
      }
    }
  };

  const filteredOrders = useMemo(() => {
    const todayStr = new Date().toDateString();
    const q = historySearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (!isAdm && currentUser) {
        const isContributor =
          Array.isArray(o.contributors) &&
          o.contributors.some((c: any) => (typeof c === 'string' ? c === currentUser.id : c?.id === currentUser.id));
        const isOwner =
          o.waiterId === currentUser.id ||
          o.createdById === currentUser.id ||
          isContributor ||
          (!o.waiterId && o.waiterName === currentUser.name);
        if (!isOwner) return false;
      }
      if (historyFilter === 'today' && new Date(o.createdAt).toDateString() !== todayStr) return false;
      if (historyFilter === 'counter' && o.type !== 'counter') return false;
      if (historyFilter === 'table' && o.type !== 'table') return false;
      if (historyFilter === 'cancelled' && o.status !== 'cancelled') return false;
      if (q) {
        const matchNum = String(o.orderNumber).includes(q);
        const matchWaiter = o.waiterName?.toLowerCase().includes(q);
        const matchCustomer = o.customerName?.toLowerCase().includes(q);
        const matchTable = o.tableName?.toLowerCase().includes(q);
        if (!matchNum && !matchWaiter && !matchCustomer && !matchTable) return false;
      }
      return true;
    });
  }, [orders, historyFilter, historySearch, isAdm, currentUser]);

  // =========================================================================
  // RENDER: MODO BALCÃO INDEPENDENTE
  // =========================================================================
  if (mode === 'counter') {
    const counterChange =
      counterMethod === 'dinheiro' && counterReceivedCash > cartSubtotal
        ? counterReceivedCash - cartSubtotal
        : 0;

    return (
      <div className="space-y-5">
        {feedback && (
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold shadow-sm ${
              feedback.type === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-950'
            }`}
          >
            <span>{feedback.text}</span>
            <button onClick={() => setFeedback(null)} className="p-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isSellerBlocked && (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
            <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">Permissão de Venda Bloqueada</h3>
              <p className="text-xs text-rose-800">
                O Administrador bloqueou sua operação de vendas no momento.
              </p>
            </div>
          </div>
        )}

        {/* Header Balcão */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Balcão — Venda Rápida
            </h1>
            <p className="mt-0.5 text-xs text-stone-500">
              Venda direta no balcão sem vínculo com mesas. Aceita Dinheiro ou PIX com baixa imediata de estoque.
            </p>
          </div>

          {onNavigateToTables && (
            <button
              type="button"
              onClick={onNavigateToTables}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <Grid2X2 className="h-4 w-4 text-amber-600" />
              <span>Ir para Mesas</span>
            </button>
          )}
        </div>

        {/* Tela de Sucesso do Balcão */}
        {finishedCounterOrder ? (
          <div className="mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-lg space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Venda Concluída no Balcão
              </span>
              <h2 className="mt-1 text-2xl font-black text-stone-900 tabular-nums">
                Pedido #{finishedCounterOrder.orderNumber}
              </h2>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-stone-500">Modalidade:</span>
                <span className="font-bold text-stone-900">Balcão</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Forma de Pagamento:</span>
                <span className="font-bold uppercase text-stone-900">
                  {finishedCounterOrder.payments[0]?.method || 'Dinheiro'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Total Recebido:</span>
                <span className="font-black text-emerald-700 tabular-nums">
                  {formatBRL(finishedCounterOrder.total)}
                </span>
              </div>
              {(finishedCounterOrder.payments[0]?.change || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Troco:</span>
                  <span className="font-bold text-amber-700 tabular-nums">
                    {formatBRL(finishedCounterOrder.payments[0]?.change || 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-stone-500">Operador:</span>
                <span className="font-semibold text-stone-900">{finishedCounterOrder.waiterName}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setFinishedCounterOrder(null)}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
              >
                <Plus className="h-4 w-4" />
                <span>Nova Venda</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Esquerda: Catálogo de Produtos */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              {/* Busca e Categorias */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto por nome ou código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full min-h-[46px] rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`min-h-[40px] shrink-0 rounded-xl px-4 text-xs font-bold transition ${
                      selectedCategory === 'all'
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    Todos ({products.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`min-h-[40px] shrink-0 rounded-xl px-4 text-xs font-bold transition ${
                        selectedCategory === cat.id
                          ? 'bg-amber-600 text-white'
                          : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid de Produtos */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {filteredCatalog.map((prod) => {
                  const outOfStock = !currentTenant.settings?.allowNegativeStock && (prod.stockQuantity ?? 0) <= 0;

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      disabled={outOfStock || isSellerBlocked}
                      onClick={() => setProductForModal(prod)}
                      className={`flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition ${
                        outOfStock || isSellerBlocked
                          ? 'border-stone-200 opacity-50 cursor-not-allowed'
                          : 'border-stone-200 hover:border-amber-500 hover:shadow-md active:scale-[0.98]'
                      }`}
                    >
                      <div className="relative h-28 w-full bg-stone-100 overflow-hidden">
                        {prod.imageUrl ? (
                          <img
                            src={prod.imageUrl}
                            alt={prod.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-stone-300">
                            <ImageIcon className="h-7 w-7" />
                          </div>
                        )}
                        <span className="absolute top-2 left-2 rounded-md bg-stone-900/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                          {prod.internalCode}
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col justify-between p-3">
                        <p className="text-xs font-bold text-stone-900 line-clamp-2 leading-snug">
                          {prod.name}
                        </p>
                        <div className="mt-2 flex items-baseline justify-between gap-1">
                          <span className="text-sm font-black text-amber-700 tabular-nums">
                            {formatBRL(prod.sellingPrice)}
                            {prod.unit !== 'un' && (
                              <span className="text-[10px] font-semibold text-stone-500">/{prod.unit}</span>
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-semibold tabular-nums ${
                              outOfStock ? 'text-rose-600' : 'text-stone-500'
                            }`}
                          >
                            {outOfStock ? 'Sem estoque' : formatUnitStock(prod.stockQuantity, prod.unit)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direita: Carrinho & Pagamento do Balcão */}
            <div className="lg:col-span-5 xl:col-span-4">
              <div className="sticky top-20 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-amber-600" />
                    <h2 className="text-sm font-bold text-stone-900">Carrinho do Balcão</h2>
                  </div>
                  <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700 tabular-nums">
                    {cartItems.length} {cartItems.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>

                {/* Lista de Itens */}
                {cartItems.length === 0 ? (
                  <div className="py-8 text-center text-stone-400">
                    <Receipt className="mx-auto h-9 w-9 text-stone-300" />
                    <p className="mt-2 text-xs font-semibold text-stone-600">Carrinho vazio</p>
                    <p className="text-[11px] text-stone-400">
                      Toque nos produtos do catálogo ao lado para lançar.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-stone-100 pr-1">
                    {cartItems.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-stone-900 truncate">
                            {item.productName}
                            {item.variationName ? ` (${item.variationName})` : ''}
                          </p>
                          <p className="text-[11px] text-stone-500 tabular-nums">
                            {item.quantity} × {formatBRL(item.unitPrice)}
                          </p>
                          {item.notes && (
                            <p className="text-[10px] italic text-amber-700 truncate">Obs: {item.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(idx, -1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                            aria-label="Diminuir"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-bold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(idx, 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                            aria-label="Aumentar"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCartItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <span className="w-16 text-right text-xs font-black text-stone-900 tabular-nums">
                          {formatBRL(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cliente opcional */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-600">
                    Nome do Cliente (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Balcão / Carlos"
                    value={counterCustomerName}
                    onChange={(e) => setCounterCustomerName(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Forma de Pagamento (Dinheiro / PIX) */}
                <div>
                  <span className="block text-[11px] font-bold text-stone-600 mb-1.5">
                    Forma de Pagamento
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCounterMethod('dinheiro')}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${
                        counterMethod === 'dinheiro'
                          ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/20'
                          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <Banknote className="h-4 w-4" />
                      <span>Dinheiro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCounterMethod('pix')}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${
                        counterMethod === 'pix'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20'
                          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <QrCode className="h-4 w-4" />
                      <span>PIX</span>
                    </button>
                  </div>
                </div>

                {/* Dinheiro recebido & Troco */}
                {counterMethod === 'dinheiro' && cartItems.length > 0 && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-semibold text-stone-700">Valor Recebido (R$):</label>
                      <input
                        type="number"
                        step="0.50"
                        min="0"
                        value={counterReceivedCash || ''}
                        onChange={(e) => setCounterReceivedCash(parseFloat(e.target.value) || 0)}
                        placeholder={cartSubtotal.toFixed(2)}
                        className="w-28 min-h-[38px] rounded-lg border border-stone-300 bg-white px-2.5 text-right font-mono text-xs font-bold text-stone-900"
                      />
                    </div>
                    {counterChange > 0 && (
                      <div className="flex justify-between font-black text-emerald-700">
                        <span>Troco:</span>
                        <span className="tabular-nums">{formatBRL(counterChange)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Comprovante quando habilitado */}
                {activeReceiptRule !== 'disabled' && cartItems.length > 0 && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-700">
                        Comprovante {isReceiptMandatory ? '(Obrigatório)' : '(Opcional)'}
                      </span>
                      {receiptImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setReceiptImage(null);
                            setReceiptSizeKb(null);
                          }}
                          className="text-[11px] font-semibold text-rose-600 hover:underline"
                        >
                          Remover
                        </button>
                      )}
                    </div>

                    {receiptImage ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                        <img
                          src={receiptImage}
                          alt="Comprovante"
                          className="h-10 w-10 rounded object-cover"
                        />
                        <span className="text-[11px] font-semibold text-emerald-800">
                          Comprovante anexado ({receiptSizeKb || 32} KB)
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 text-[11px] font-bold text-stone-700 hover:bg-stone-50">
                          <Camera className="h-3.5 w-3.5" />
                          <span>{isProcessingReceipt ? 'Lendo...' : 'Foto / Galeria'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleReceiptFileChange}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPresetReceiptModal(true)}
                          className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Modelo</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Total & Botão Finalizar */}
                <div className="border-t border-stone-200 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-stone-500">Total a Receber</span>
                    <span className="text-2xl font-black text-stone-900 tabular-nums">
                      {formatBRL(cartSubtotal)}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={cartItems.length === 0 || isSubmittingCounter || isSellerBlocked}
                    onClick={handleFinalizeCounterSale}
                    className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 active:scale-[0.99] transition"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    <span>
                      {isSubmittingCounter ? 'Finalizando...' : 'Finalizar Venda no Balcão'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Quantidade / Peso */}
        {productForModal && (
          <QuantitySelectorModal
            product={productForModal}
            allowNegativeStock={Boolean(currentTenant.settings?.allowNegativeStock)}
            onClose={() => setProductForModal(null)}
            onConfirm={handleConfirmAddBalcao}
          />
        )}

        {/* Modal de Comprovante de Exemplo */}
        {showPresetReceiptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <h3 className="text-sm font-bold text-stone-900">Selecionar Modelo de Comprovante</h3>
                <button
                  onClick={() => setShowPresetReceiptModal(false)}
                  className="p-1 text-stone-400 hover:text-stone-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PRESET_RECEIPT_PHOTOS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setReceiptImage(preset.url);
                      setReceiptSizeKb(34);
                      setShowPresetReceiptModal(false);
                    }}
                    className="rounded-xl border border-stone-200 p-2 text-left hover:border-amber-500"
                  >
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="h-24 w-full rounded-lg object-cover"
                    />
                    <p className="mt-1.5 text-xs font-bold text-stone-800 truncate">{preset.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // RENDER: MODO VENDAS (FECHAMENTO DE CONTAS DE MESAS + HISTÓRICO)
  // =========================================================================
  const settlingProductsTotal = settlingTable
    ? settlingTable.productsTotal ??
      Math.max(0, (settlingTable.currentTotal || 0) - (settlingTable.extraTotal || 0))
    : 0;
  const settlingExtraTotal = settlingTable?.extraTotal || 0;
  const settlingGrandTotal = Number((settlingProductsTotal + settlingExtraTotal).toFixed(2));
  const settlingPaidAlready = Number((settlingTable?.paidAmount || 0).toFixed(2));
  const settlingRemaining = Number(Math.max(0, settlingGrandTotal - settlingPaidAlready).toFixed(2));
  const settlingOpenOrders = settlingTable ? getOpenTableOrders(currentTenant.id, settlingTable) : [];
  const settlingChange =
    settleMethod === 'dinheiro' && settleReceivedCash > settleAmount
      ? settleReceivedCash - settleAmount
      : 0;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold shadow-sm ${
            feedback.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-950'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isSellerBlocked && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
          <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Permissão de Venda Bloqueada</h3>
            <p className="text-xs text-rose-800">
              Você pode consultar o histórico, mas não pode finalizar pagamentos ou recebimentos.
            </p>
          </div>
        </div>
      )}

      {/* Header da Aba Vendas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Vendas & Fechamento de Contas
          </h1>
          <p className="mt-0.5 text-xs text-stone-500">
            Receba pagamentos das mesas em aberto (Dinheiro ou PIX) e acompanhe as vendas registradas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToTables && (
            <button
              type="button"
              onClick={onNavigateToTables}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <Grid2X2 className="h-4 w-4 text-amber-600" />
              <span>Lançar Itens em Mesas</span>
            </button>
          )}
          {onNavigateToCounter && (
            <button
              type="button"
              onClick={onNavigateToCounter}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Ir para Balcão</span>
            </button>
          )}
        </div>
      </div>

      {/* SEÇÃO 1: CONTAS DE MESAS EM ABERTO PARA PAGAMENTO */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-stone-900">
              Contas de Mesas em Aberto ({openTables.length})
            </h2>
            <p className="text-xs text-stone-500">
              Toque em uma mesa para conferir os itens consumidos, valores extras e registrar pagamento.
            </p>
          </div>
        </div>

        {openTables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <Grid2X2 className="mx-auto h-9 w-9 text-stone-300" />
            <p className="mt-2 text-sm font-bold text-stone-700">
              Nenhuma mesa com conta em aberto no momento
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              Para iniciar atendimento em mesa, abra a aba <strong>Mesas</strong> e adicione produtos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {openTables.map((table) => {
              const pTotal =
                table.productsTotal ?? Math.max(0, (table.currentTotal || 0) - (table.extraTotal || 0));
              const eTotal = table.extraTotal || 0;
              const grand = Number((pTotal + eTotal).toFixed(2));
              const paid = Number((table.paidAmount || 0).toFixed(2));
              const rem = Number(Math.max(0, grand - paid).toFixed(2));

              return (
                <div
                  key={table.id}
                  className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                          {table.status === 'closing' ? 'Pagamento Parcial' : 'Em Consumo'}
                        </span>
                        <h3 className="mt-1.5 text-base font-black text-stone-900">
                          {table.label || `Mesa ${table.number}`}
                        </h3>
                        {table.customerName && (
                          <p className="text-xs text-stone-500">Cliente: {table.customerName}</p>
                        )}
                        {(table.openedByName || table.waiterName) && (
                          <p className="text-[11px] text-stone-500">
                            Aberta por: <strong>{table.openedByName || table.waiterName}</strong>
                          </p>
                        )}
                      </div>
                      <span className="text-lg font-black text-stone-900 tabular-nums">
                        {formatBRL(rem)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 rounded-xl bg-stone-50 p-2.5 text-xs border border-stone-100">
                      <div className="flex justify-between text-stone-600">
                        <span>Consumo de Produtos:</span>
                        <span className="font-bold tabular-nums">{formatBRL(pTotal)}</span>
                      </div>
                      {eTotal > 0 && (
                        <div className="flex justify-between text-purple-700">
                          <span>Valores Extras:</span>
                          <span className="font-bold tabular-nums">+{formatBRL(eTotal)}</span>
                        </div>
                      )}
                      {paid > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Já Pago:</span>
                          <span className="font-bold tabular-nums">-{formatBRL(paid)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSellerBlocked}
                    onClick={() => openTableSettlementModal(table)}
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-40 transition"
                  >
                    <Banknote className="h-4 w-4 text-amber-400" />
                    <span>Receber & Fechar Conta</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SEÇÃO 2: HISTÓRICO RECENTE DE VENDAS */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-stone-900">
              {isAdm ? 'Vendas Registradas' : 'Minhas Vendas Registradas'}
            </h2>
            <p className="text-xs text-stone-500">
              {isAdm
                ? 'Consulte vendas de Balcão e Mesas quitadas ou em andamento.'
                : 'Exibindo exclusivamente suas vendas e atendimentos realizados neste estabelecimento.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                placeholder="Buscar #pedido ou operador..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="min-h-[38px] rounded-xl border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1">
              {(
                [
                  { id: 'today', label: 'Hoje' },
                  { id: 'all', label: 'Todas' },
                  { id: 'counter', label: 'Balcão' },
                  { id: 'table', label: 'Mesas' },
                  { id: 'cancelled', label: 'Canceladas' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    historyFilter === tab.id
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-stone-100">
          {filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Clock className="mx-auto h-8 w-8 text-stone-300" />
              <p className="mt-2 text-xs font-semibold text-stone-600">
                Nenhuma venda encontrada para o filtro selecionado.
              </p>
            </div>
          ) : (
            filteredOrders.slice(0, 40).map((ord) => {
              const paymentLabel =
                ord.payments && ord.payments.length > 0
                  ? ord.payments.map((p) => p.method.toUpperCase()).join(' + ')
                  : 'Em aberto';

              return (
                <div
                  key={ord.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-stone-50/70 transition"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100 font-mono text-xs font-black text-stone-800">
                      #{ord.orderNumber}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-stone-900">
                          {formatModalityBadge(ord)}
                        </span>
                        {ord.status === 'cancelled' ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            Cancelada
                          </span>
                        ) : ord.paid ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            Quitada
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Em Aberto
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        {formatDateTimeBR(ord.createdAt)} · {ord.waiterName || 'Operador'} ·{' '}
                        {ord.items.length} item(ns) · {paymentLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5">
                    <span className="text-sm font-black text-stone-900 tabular-nums">
                      {formatBRL(ord.total)}
                    </span>

                    <button
                      type="button"
                      onClick={() => setViewingOrder(ord)}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 hover:bg-stone-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Detalhes</span>
                    </button>

                    {isAdm && ord.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancellingOrder(ord);
                          setCancelReason('');
                        }}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        <span>Cancelar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* MODAL: FECHAMENTO E QUITAÇÃO DE MESA */}
      {settlingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">
                  Fechamento: {settlingTable.label || `Mesa ${settlingTable.number}`}
                </h3>
                <p className="text-xs text-stone-500">
                  Conferência de consumo acumulado e recebimento em Dinheiro ou PIX
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettlingTable(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Itens consumidos acumulados */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Consumo Lançado na Mesa
              </span>
              {settlingOpenOrders.length === 0 ? (
                <p className="text-xs text-stone-500">Nenhum produto lançado.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-stone-200/70 text-xs">
                  {settlingOpenOrders.flatMap((ord) =>
                    ord.items.map((item, idx) => (
                      <div key={`${ord.id}-${idx}`} className="py-1.5 flex justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-stone-800 font-medium block">
                            <strong className="tabular-nums">{item.quantity}×</strong> {item.productName}
                            {item.variationName ? ` (${item.variationName})` : ''}
                          </span>
                          {item.addedByName && (
                            <span className="text-[10px] text-stone-500">
                              Lançado por: {item.addedByName}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-stone-900 tabular-nums shrink-0">
                          {formatBRL(item.total)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="border-t border-stone-200 pt-2 space-y-1 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal Produtos:</span>
                  <span className="font-bold tabular-nums">{formatBRL(settlingProductsTotal)}</span>
                </div>
                {settlingExtraTotal > 0 && (
                  <div className="flex justify-between text-purple-700">
                    <span>Valores Extras da Mesa:</span>
                    <span className="font-bold tabular-nums">+{formatBRL(settlingExtraTotal)}</span>
                  </div>
                )}
                {settlingPaidAlready > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Pagamentos Parciais Anteriores:</span>
                    <span className="font-bold tabular-nums">-{formatBRL(settlingPaidAlready)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-sm font-black text-stone-900">
                  <span>Saldo a Receber:</span>
                  <span className="tabular-nums">{formatBRL(settlingRemaining)}</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleConfirmTableSettlement} className="space-y-4">
              {settlingRemaining > 0.009 && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettleMethod('dinheiro')}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${
                        settleMethod === 'dinheiro'
                          ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/20'
                          : 'border-stone-200 bg-white text-stone-700'
                      }`}
                    >
                      <Banknote className="h-4 w-4" />
                      <span>Dinheiro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettleMethod('pix')}
                      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${
                        settleMethod === 'pix'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20'
                          : 'border-stone-200 bg-white text-stone-700'
                      }`}
                    >
                      <QrCode className="h-4 w-4" />
                      <span>PIX</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-stone-700">
                        Valor a Abater / Quitar (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={settlingRemaining}
                        required
                        value={settleAmount || ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setSettleAmount(v);
                          if (settleMethod === 'dinheiro') setSettleReceivedCash(v);
                        }}
                        className="mt-1 w-full min-h-[44px] rounded-xl border border-stone-200 px-3 font-mono text-sm font-bold text-stone-900"
                      />
                    </div>

                    {settleMethod === 'dinheiro' && (
                      <div>
                        <label className="block text-xs font-bold text-stone-700">
                          Valor Recebido (Espécie)
                        </label>
                        <input
                          type="number"
                          step="0.50"
                          min="0"
                          value={settleReceivedCash || ''}
                          onChange={(e) => setSettleReceivedCash(parseFloat(e.target.value) || 0)}
                          className="mt-1 w-full min-h-[44px] rounded-xl border border-stone-200 px-3 font-mono text-sm font-bold text-stone-900"
                        />
                      </div>
                    )}
                  </div>

                  {settlingChange > 0 && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-800 flex justify-between">
                      <span>Troco a Devolver:</span>
                      <span className="tabular-nums">{formatBRL(settlingChange)}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-stone-700">
                      Observação do Pagamento (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Pagamento parcial / Dividido entre clientes"
                      value={settleNotes}
                      onChange={(e) => setSettleNotes(e.target.value)}
                      className="mt-1 w-full min-h-[42px] rounded-xl border border-stone-200 px-3 text-xs text-stone-900"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setSettlingTable(null)}
                  className="w-1/3 min-h-[48px] rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSettle}
                  className="w-2/3 min-h-[48px] rounded-xl bg-emerald-600 text-xs font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  {isSubmittingSettle
                    ? 'Processando...'
                    : settlingRemaining <= 0.009
                    ? 'Liberar Mesa Sem Consumo'
                    : settleAmount + 0.009 >= settlingRemaining
                    ? 'Quitar Conta & Liberar Mesa'
                    : 'Registrar Pagamento Parcial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES DA VENDA */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">
                  Pedido #{viewingOrder.orderNumber}
                </h3>
                <p className="text-xs text-stone-500">
                  {formatModalityBadge(viewingOrder)} · {formatDateTimeBR(viewingOrder.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setViewingOrder(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5 rounded-2xl bg-stone-50 p-3 text-xs border border-stone-200">
              {viewingOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between gap-2">
                  <span className="text-stone-800">
                    <strong className="tabular-nums">{item.quantity}×</strong> {item.productName}
                  </span>
                  <span className="font-bold text-stone-900 tabular-nums">
                    {formatBRL(item.total)}
                  </span>
                </div>
              ))}
              {getOrderExtraTotal(viewingOrder) > 0 && (
                <div className="flex justify-between border-t border-stone-200 pt-1.5 text-purple-700 font-semibold">
                  <span>Valores Extras:</span>
                  <span className="tabular-nums">{formatBRL(getOrderExtraTotal(viewingOrder))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-stone-200 pt-1.5 text-sm font-black text-stone-900">
                <span>Total:</span>
                <span className="tabular-nums">{formatBRL(viewingOrder.total)}</span>
              </div>
            </div>

            {viewingOrder.payments.length > 0 && (
              <div className="space-y-1 text-xs">
                <span className="font-bold uppercase text-[10px] text-stone-500">Pagamentos:</span>
                {viewingOrder.payments.map((pay, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between rounded-xl border border-stone-200 px-3 py-2"
                  >
                    <span className="font-bold uppercase text-stone-800">{pay.method}</span>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      {formatBRL(pay.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(viewingOrder.receiptImageUrl || viewingOrder.payments[0]?.receiptImageUrl) && (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 flex items-center justify-center max-h-56">
                <img
                  src={viewingOrder.receiptImageUrl || viewingOrder.payments[0]?.receiptImageUrl}
                  alt="Comprovante"
                  className="max-h-56 w-auto object-contain"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setViewingOrder(null)}
              className="w-full min-h-[44px] rounded-xl bg-stone-900 text-xs font-bold text-white hover:bg-stone-800"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CANCELAMENTO DE VENDA (EXCLUSIVO ADM) */}
      {cancellingOrder && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900">
                  Cancelar Pedido #{cancellingOrder.orderNumber}
                </h3>
                <p className="text-xs text-stone-500">
                  O estoque dos produtos será estornado automaticamente.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmCancelOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Motivo do Cancelamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Lançamento em duplicidade / desistência do cliente"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-xl border border-stone-200 px-3 text-xs text-stone-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingOrder(null)}
                  className="w-1/2 min-h-[44px] rounded-xl border border-stone-200 text-xs font-bold text-stone-700"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="w-1/2 min-h-[44px] rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
