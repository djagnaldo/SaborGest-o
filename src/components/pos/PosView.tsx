/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  QrCode,
  Banknote,
  FileText,
  CheckCircle2,
  Printer,
  Sparkles,
  ShoppingBag,
  AlertCircle,
  X,
  User,
  Phone,
  MapPin,
  Clock,
  WifiOff,
  Wifi,
  Image as ImageIcon,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  XCircle,
  Camera,
  Upload,
  Eye,
  Check,
  Grid2X2,
  CreditCard,
  Edit3,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Product, OrderItem, PaymentMethod, Order, DebtRecord, RestaurantTable } from '../../types';
import {
  getProducts,
  getCategories,
  saveOrder,
  saveDebt,
  addAuditLog,
  getOrders,
  getTables,
  saveTable,
  saveTableArchive,
  recordPaymentInCashSession,
  validateOrderStock,
  deductStockForOrder,
  isSellerAuthorizedToSell,
} from '../../services/storage';
import {
  isServerOnline,
  enqueueSyncOperation,
  getMatrizInfo,
  isDeviceMatriz,
  cancelOrderWithAuthority,
  recordDeltaTransfer,
  broadcastDeltaUpdate,
} from '../../services/local-db';
import { processProductImage, PRESET_RECEIPT_PHOTOS } from '../../utils/image-processor';
import { formatBRL, formatDateTimeBR, formatTimeBR, getTableStatusLabel } from '../../utils/formatters';
import confetti from 'canvas-confetti';

// ETAPAS DO NOVO FLUXO DE VENDAS OBRIGATÓRIO:
// 1. Escolher modalidade (Mesas, Balcão, Comandas)
// 2. Selecionar a mesa quando aplicável
// 3. Selecionar os produtos do cardápio
// 4. Definir quantidades e observações
// 5. Conferir o pedido
// 6. Selecionar a forma de pagamento
// 7. Confirmar a operação
export type SaleFlowStep =
  | 'step1_modality'
  | 'step2_table'
  | 'step2_comanda'
  | 'step3_catalog'
  | 'step4_review'
  | 'step5_payment'
  | 'step6_success';

interface PosViewProps {
  preselectedTableNumber?: number | null;
  onConsumePreselectedTable?: () => void;
}

export const PosView: React.FC<PosViewProps> = ({
  preselectedTableNumber,
  onConsumePreselectedTable,
}) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm, activeView } = useAuth();

  // Estado da etapa do fluxo dinâmico
  const [currentStep, setCurrentStep] = useState<SaleFlowStep>('step1_modality');

  // Modalidade e Destino
  const [saleModality, setSaleModality] = useState<'table' | 'counter' | 'comanda'>('counter');
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [comandaCode, setComandaCode] = useState<string>('');

  useEffect(() => {
    if (preselectedTableNumber) {
      setSaleModality('table');
      setSelectedTableNumber(preselectedTableNumber);
      setCurrentStep('step3_catalog');
      if (onConsumePreselectedTable) onConsumePreselectedTable();
    }
  }, [preselectedTableNumber, onConsumePreselectedTable]);

  // Produtos e Carrinho
  const [products, setProducts] = useState<Product[]>(getProducts(currentTenant.id));
  const [categories, setCategories] = useState(getCategories(currentTenant.id));
  const [tables, setTables] = useState<RestaurantTable[]>(getTables(currentTenant.id));
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [includeServiceFee, setIncludeServiceFee] = useState(false);

  // Modal de Adição com Observação (Item customizado)
  const [activeItemForNotes, setActiveItemForNotes] = useState<{ product: Product; notes: string; quantity: number } | null>(null);

  // Pagamento (As 3 Formas Exclusivas: Dinheiro, PIX, Devendo)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('dinheiro');
  const [receivedCash, setReceivedCash] = useState<number>(0);
  const [finishedOrder, setFinishedOrder] = useState<Order | null>(null);

  // Comprovantes fotográficos
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptSizeKb, setReceiptSizeKb] = useState<number | null>(null);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [showPresetReceiptModal, setShowPresetReceiptModal] = useState(false);

  // Regras de Comprovante definidas pela Matriz
  const pixRule = currentTenant.settings?.pixReceiptRule || 'optional';
  const cashRule = currentTenant.settings?.cashReceiptRule || 'optional';
  const activeReceiptRule =
    selectedMethod === 'pix' ? pixRule : selectedMethod === 'dinheiro' ? cashRule : 'disabled';
  const isReceiptMandatory = activeReceiptRule === 'required';

  // DEVENDO (Campos Obrigatórios)
  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState('');
  const [debtCustomerCpf, setDebtCustomerCpf] = useState('');
  const [debtCustomerAddress, setDebtCustomerAddress] = useState('');
  const [debtNotes, setDebtNotes] = useState('');

  // Histórico recente e cancelamento
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [securityBlockMessage, setSecurityBlockMessage] = useState<string | null>(null);

  const matrizInfo = getMatrizInfo();
  const serverOnline = isServerOnline();

  // Verifica se o vendedor atual está bloqueado pelo ADM
  const isSellerBlocked = !isSellerAuthorizedToSell(currentUser?.id);

  // Sincronização em tempo real de estoque, mesas e usuários
  useEffect(() => {
    setProducts(getProducts(currentTenant.id));
    setCategories(getCategories(currentTenant.id));
    setTables(getTables(currentTenant.id));

    const handleSync = () => {
      setProducts(getProducts(currentTenant.id));
      setCategories(getCategories(currentTenant.id));
      setTables(getTables(currentTenant.id));
    };

    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  // Formatação didática de quantidade de estoque
  const formatStockQuantity = (qty: number, unit?: string) => {
    const formattedNum = qty < 10 && qty >= 0 ? `0${qty}` : `${qty}`;
    if (!unit || unit === 'un') {
      return `${formattedNum} ${qty === 1 ? 'UNIDADE' : 'UNIDADES'}`;
    }
    if (unit === 'kg') return `${qty.toFixed(2)} KG`;
    if (unit === 'g') return `${qty} G`;
    if (unit === 'l') return `${qty} L`;
    if (unit === 'ml') return `${qty} ML`;
    if (unit === 'porcao') return `${formattedNum} ${qty === 1 ? 'PORÇÃO' : 'PORÇÕES'}`;
    if (unit === 'fatia') return `${formattedNum} ${qty === 1 ? 'FATIA' : 'FATIAS'}`;
    return `${formattedNum} ${unit.toUpperCase()}`;
  };

  // ADICIONAR ITEM AO PEDIDO (Validação de Estoque Físico)
  const handleAddToCart = (product: Product, customNotes?: string, customQty: number = 1) => {
    if (isSellerBlocked) {
      alert('⛔ OPERAÇÃO BLOQUEADA: Sua permissão para vender foi desligada pelo Administrador.');
      return;
    }

    const existing = cartItems.find((item) => item.productId === product.id && item.notes === (customNotes || ''));
    const currentQtyInCart = existing ? existing.quantity : 0;
    const confirmedStock = product.stockQuantity ?? 0;

    if (currentQtyInCart + customQty > confirmedStock) {
      alert(
        `Limite de estoque atingido! O item "${product.name}" possui apenas ${confirmedStock} unidades disponíveis na Matriz.`
      );
      return;
    }

    setCartItems((prev) => {
      const matchIndex = prev.findIndex((i) => i.productId === product.id && i.notes === (customNotes || ''));
      if (matchIndex >= 0) {
        return prev.map((item, idx) =>
          idx === matchIndex
            ? {
                ...item,
                quantity: item.quantity + customQty,
                total: (item.quantity + customQty) * item.unitPrice,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: customQty,
          unitPrice: product.sellingPrice,
          total: customQty * product.sellingPrice,
          notes: customNotes || undefined,
        },
      ];
    });

    setActiveItemForNotes(null);
  };

  // Alterar Quantidade no Carrinho
  const handleUpdateQuantity = (index: number, delta: number) => {
    const item = cartItems[index];
    if (!item) return;
    const prod = products.find((p) => p.id === item.productId);
    const confirmedStock = prod?.stockQuantity ?? 999;

    setCartItems((prev) =>
      prev
        .map((it, idx) => {
          if (idx === index) {
            const nextQty = it.quantity + delta;
            if (nextQty > confirmedStock) {
              alert(`Limite de estoque da Matriz atingido: ${confirmedStock} unidades.`);
              return it;
            }
            return nextQty > 0 ? { ...it, quantity: nextQty, total: nextQty * it.unitPrice } : null;
          }
          return it;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const handleRemoveFromCart = (index: number) => {
    setCartItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Mesa selecionada e Valores Extras da Mesa
  const selectedTable =
    saleModality === 'table' && selectedTableNumber !== null
      ? tables.find((t) => t.number === selectedTableNumber)
      : null;

  const tableActiveExtraCharges =
    selectedTable?.extraCharges?.filter((c) => c.status === 'active') || [];
  const tableExtraTotal = tableActiveExtraCharges.reduce((acc, c) => acc + c.amount, 0);

  // Cálculos de Totais
  const subtotal = cartItems.reduce((acc, item) => acc + item.total, 0);
  const serviceFee = includeServiceFee
    ? (subtotal * (currentTenant.settings?.serviceFeePercentage || 10)) / 100
    : 0;
  const total = Math.max(0, subtotal - discount + serviceFee + tableExtraTotal);

  // Processamento de Comprovante de Pagamento
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
      alert('Falha ao processar e comprimir imagem do comprovante.');
    } finally {
      setIsProcessingReceipt(false);
      e.target.value = '';
    }
  };

  const handlePickPresetReceipt = (url: string) => {
    setReceiptImage(url);
    setReceiptSizeKb(34);
    recordDeltaTransfer(34 * 1024, 750 * 1024);
    setShowPresetReceiptModal(false);
  };

  // ETAPA 7: CONFIRMAR OPERAÇÃO & FINALIZAR VENDA
  const handleFinalizeSale = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cartItems.length === 0) return;

    // 1. Validação estrita de Bloqueio do Vendedor pela Matriz
    if (isSellerBlocked) {
      alert('⛔ ACESSO DE VENDA BLOQUEADO: Sua permissão para vender foi desligada pelo Administrador.');
      return;
    }

    // 2. Validação da Modalidade de Mesa
    if (saleModality === 'table' && !selectedTableNumber) {
      alert('É proibido finalizar venda de mesa sem selecionar a mesa correspondente.');
      setCurrentStep('step2_table');
      return;
    }

    // 3. Validação de Comprovante Obrigatório (PIX e Dinheiro)
    if (
      isReceiptMandatory &&
      (selectedMethod === 'dinheiro' || selectedMethod === 'pix') &&
      !receiptImage
    ) {
      alert(
        `⚠️ COMPROVANTE OBRIGATÓRIO: A Matriz Administrativa exige fotografia do comprovante para pagamentos em ${selectedMethod.toUpperCase()}.`
      );
      return;
    }

    // 4. Validação de Estoque Físico Centralizado na Matriz
    const stockValidation = validateOrderStock(currentTenant.id, cartItems);
    if (!stockValidation.valid) {
      alert(`⚠️ BLOQUEIO DE ESTOQUE NA MATRIZ: ${stockValidation.error}`);
      return;
    }

    const orderId = `ord-${Date.now()}`;
    const orderNumber = Math.floor(Math.random() * 900 + 100);
    const isPendente = selectedMethod === 'pendente' || selectedMethod === 'devendo';
    const isDraft = !serverOnline;

    const newOrder: Order = {
      id: orderId,
      tenantId: currentTenant.id,
      orderNumber,
      type: saleModality,
      tableNumber: saleModality === 'table' ? selectedTableNumber || undefined : undefined,
      tableName:
        saleModality === 'table' && selectedTable
          ? selectedTable.customerName || selectedTable.label || `Mesa ${selectedTable.number}`
          : undefined,
      extraTotal: tableExtraTotal > 0 ? tableExtraTotal : undefined,
      extraCharges: tableActiveExtraCharges.length > 0 ? tableActiveExtraCharges : undefined,
      comandaNumber:
        saleModality === 'comanda'
          ? comandaCode.trim() || `CMD-${orderNumber}`
          : undefined,
      status: isPendente ? 'received' : isDraft ? 'preparing' : 'closed',
      waiterId: currentUser?.id,
      waiterName: currentUser?.name || 'Vendedor',
      customerName: debtCustomerName.trim() || undefined,
      customerPhone: debtCustomerPhone.trim() || undefined,
      items: cartItems,
      subtotal,
      discount,
      serviceFee,
      total,
      payments: [
        {
          method: isPendente ? 'pendente' : selectedMethod,
          amount: total,
          receivedAmount: selectedMethod === 'dinheiro' ? receivedCash || total : total,
          change: selectedMethod === 'dinheiro' ? Math.max(0, (receivedCash || total) - total) : 0,
          receiptImageUrl: receiptImage || undefined,
          receiptType: selectedMethod === 'pix' ? 'pix' : selectedMethod === 'dinheiro' ? 'cash' : undefined,
          receiptCapturedAt: receiptImage ? new Date().toISOString() : undefined,
          receiptSellerName: receiptImage ? currentUser?.name || 'Vendedor' : undefined,
        },
      ],
      paid: !isPendente,
      receiptImageUrl: receiptImage || undefined,
      receiptCapturedAt: receiptImage ? new Date().toISOString() : undefined,
      receiptSellerName: receiptImage ? currentUser?.name || 'Vendedor' : undefined,
      notes: isPendente
        ? `PENDENTE DE PAGAMENTO${debtNotes ? `: ${debtNotes}` : ''}${isDraft ? ' [RASCUNHO OFFLINE]' : ''}`
        : isDraft
        ? '[RASCUNHO LOCAL OFFLINE - Aguardando confirmação da Matriz]'
        : undefined,
      createdAt: new Date().toISOString(),
      closedAt: !isDraft && !isPendente ? new Date().toISOString() : undefined,
      isDemo: false,
    };

    if (isDraft) {
      enqueueSyncOperation({
        deviceId: 'dev-seller-terminal',
        userEmail: currentUser?.email || 'vendedor@sabor.com.br',
        entity: 'orders',
        action: 'create',
        payload: { ...newOrder, isDraft: true },
      });
      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'vendedor',
        userName: currentUser?.name || 'Vendedor',
        action: 'RASCUNHO_OFFLINE',
        details: `Venda #${orderNumber} (${formatBRL(total)}) salva como RASCUNHO LOCAL (Matriz offline).`,
      });
    } else {
      // Baixa física definitiva de estoque na Matriz
      const deduct = deductStockForOrder(currentTenant.id, cartItems);
      if (!deduct.success) {
        alert(`⚠️ Bloqueio de estoque na Matriz: ${deduct.error}`);
        return;
      }

      saveOrder(newOrder);

      // Registra pagamento no caixa ativo quando quitado (Dinheiro ou PIX)
      if (!isPendente && (selectedMethod === 'dinheiro' || selectedMethod === 'pix')) {
        recordPaymentInCashSession(currentTenant.id, selectedMethod, total);
      }

      // Sincroniza a mesa se for modalidade mesa
      if (saleModality === 'table' && selectedTable) {
        const addedProductsNet = Math.max(0, subtotal - discount + serviceFee);
        if (!isPendente) {
          // Arquiva histórico completo da conta antes de liberar a mesa
          saveTableArchive({
            id: `tarch-${selectedTable.id}-${Date.now()}`,
            tenantId: currentTenant.id,
            tableId: selectedTable.id,
            tableNumber: selectedTable.number,
            tableName: selectedTable.customerName || selectedTable.label || `Mesa ${selectedTable.number}`,
            openedAt: selectedTable.openedAt || newOrder.createdAt,
            closedAt: newOrder.closedAt || new Date().toISOString(),
            closedById: currentUser?.id || 'vendedor',
            closedByName: currentUser?.name || 'Vendedor',
            productsTotal: (selectedTable.productsTotal || 0) + addedProductsNet,
            extraTotal: tableExtraTotal,
            grandTotal: (selectedTable.productsTotal || 0) + addedProductsNet + tableExtraTotal,
            paidTotal: total,
            orderIds: [newOrder.id],
            extraCharges: selectedTable.extraCharges || [],
            payments: [
              {
                id: `tpay-${Date.now()}`,
                method: selectedMethod === 'pix' ? 'pix' : 'dinheiro',
                amount: total,
                receivedAmount: selectedMethod === 'dinheiro' ? receivedCash || total : total,
                change: selectedMethod === 'dinheiro' ? Math.max(0, (receivedCash || total) - total) : 0,
                paidAt: newOrder.createdAt,
                receivedById: currentUser?.id || 'vendedor',
                receivedByName: currentUser?.name || 'Vendedor',
              },
            ],
          });

          // Venda paga integralmente: mesa é liberada e valores/temporizador encerrados
          saveTable({
            ...selectedTable,
            status: 'available',
            openedAt: undefined,
            waiterId: undefined,
            waiterName: undefined,
            currentTotal: 0,
            productsTotal: 0,
            extraTotal: 0,
            paidAmount: 0,
            payments: [],
            activeOrdersCount: 0,
            extraCharges: [],
            timer: undefined,
          });
        } else {
          // Pendente: soma consumo de produtos sem duplicar extraTotal no currentTotal
          const existingProducts =
            selectedTable.productsTotal ?? Math.max(0, (selectedTable.currentTotal || 0) - tableExtraTotal);
          const updatedProductsTotal = existingProducts + addedProductsNet;
          saveTable({
            ...selectedTable,
            status: 'occupied',
            openedAt: selectedTable.openedAt || newOrder.createdAt,
            waiterId: selectedTable.waiterId || currentUser?.id,
            waiterName: selectedTable.waiterName || currentUser?.name,
            productsTotal: updatedProductsTotal,
            extraTotal: tableExtraTotal,
            currentTotal: updatedProductsTotal + tableExtraTotal,
            activeOrdersCount: (selectedTable.activeOrdersCount || 0) + 1,
          });
        }
      }

      broadcastDeltaUpdate({
        tenantId: currentTenant.id,
        type: 'stock_updated',
        title: 'Estoque Atualizado',
        message: `Venda #${orderNumber} confirmada pela Matriz. Baixa em ${cartItems.length} produto(s).`,
        priority: 2,
      });

      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'vendedor',
        userName: currentUser?.name || 'Vendedor',
        action: 'VENDA_CONFIRMADA_MATRIZ',
        details: `Venda #${orderNumber} (${formatBRL(total)}) validada e confirmada oficialmente pela Matriz.`,
      });
    }

    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });

    setFinishedOrder(newOrder);
    setCurrentStep('step6_success');
  };

  // Resetar e Iniciar Nova Venda (Retorna para a Etapa 1 da Ordem Obrigatória)
  const handleResetForNewSale = () => {
    setCartItems([]);
    setDiscount(0);
    setIncludeServiceFee(false);
    setSelectedTableNumber(null);
    setComandaCode('');
    setFinishedOrder(null);
    setReceiptImage(null);
    setReceiptSizeKb(null);
    setDebtCustomerName('');
    setDebtCustomerPhone('');
    setDebtCustomerCpf('');
    setDebtCustomerAddress('');
    setDebtNotes('');
    setSelectedMethod('dinheiro');
    setCurrentStep('step1_modality');
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.internalCode.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // TELA DE BLOQUEIO SE O ADM DESLIGOU A PERMISSÃO DESTE VENDEDOR
  if (isSellerBlocked) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border-2 border-rose-300 bg-white p-8 text-center shadow-xl animate-in zoom-in-95 my-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
          <ShieldAlert className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-xl font-black uppercase text-stone-900 tracking-tight">
          Acesso de Venda Bloqueado
        </h2>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-100 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-rose-800">
          Permissão para vender: DESLIGADA
        </div>
        <p className="mt-4 text-xs leading-relaxed text-stone-600">
          O Administrador da Matriz desligou a autorização de venda para o seu usuário (
          <strong>{currentUser?.name}</strong>). Novas vendas e pedidos estão bloqueados até que o ADM ligue a permissão novamente no Painel do ADM.
        </p>
        <div className="mt-6 rounded-2xl bg-stone-50 p-4 border border-stone-200 text-left text-xs space-y-1">
          <div className="flex justify-between text-stone-500">
            <span>Terminal:</span>
            <span className="font-bold text-stone-900">{currentUser?.deviceModel || 'Celular Android'}</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Status na Matriz:</span>
            <span className="font-bold text-rose-700 uppercase">BLOQUEADO</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Vendas Confirmadas Anteriores:</span>
            <span className="font-bold text-stone-900">Preservadas com Segurança</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Top Banner de Status da Matriz e Conexão (Minimalista) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white border border-stone-200 px-4 py-2.5 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl text-white font-bold text-xs shadow-xs ${
              serverOnline ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {serverOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-stone-900">Ponto de Venda</span>
              <span
                className={`text-[10px] font-bold ${
                  serverOnline ? 'text-emerald-700' : 'text-rose-700 animate-pulse'
                }`}
              >
                {serverOnline ? '● Matriz Conectada' : '● Matriz Offline (Modo Rascunho)'}
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Operador: <strong>{currentUser?.name}</strong> • Matriz: {matrizInfo.activeHostLabel}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsHistoryModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition"
        >
          <Clock className="h-3.5 w-3.5 text-stone-500" />
          <span>Vendas Recentes</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ETAPA 1 DA ORDEM OBRIGATÓRIA: ESCOLHER MODALIDADE (MESAS, BALCÃO, COMANDAS) */}
      {/* ========================================================================= */}
      {currentStep === 'step1_modality' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="text-center py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Passo 1 de 5
            </span>
            <h2 className="text-xl font-black text-stone-900 tracking-tight sm:text-2xl mt-0.5">
              Escolha a Modalidade de Atendimento
            </h2>
            <p className="text-xs text-stone-500 max-w-md mx-auto mt-1">
              Selecione o local de consumo para iniciar o atendimento.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {/* 1. MESAS */}
            <button
              type="button"
              onClick={() => {
                setSaleModality('table');
                setCurrentStep('step2_table');
              }}
              className="group flex flex-col items-center justify-between rounded-3xl border-2 border-stone-200 bg-white p-6 text-center shadow-xs hover:border-amber-500 hover:shadow-md transition active:scale-98 min-h-[180px]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 group-hover:scale-110 transition">
                <Grid2X2 className="h-7 w-7" />
              </div>
              <div className="my-2">
                <h3 className="text-base font-black uppercase text-stone-900">Mesas</h3>
                <p className="text-xs text-stone-500 mt-1">
                  Atendimento em mesas do salão com seleção obrigatória da mesa
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 group-hover:underline">
                Selecionar Mesa ➔
              </span>
            </button>

            {/* 2. BALCÃO */}
            <button
              type="button"
              onClick={() => {
                setSaleModality('counter');
                setSelectedTableNumber(null);
                setCurrentStep('step3_catalog');
              }}
              className="group flex flex-col items-center justify-between rounded-3xl border-2 border-stone-200 bg-white p-6 text-center shadow-xs hover:border-amber-500 hover:shadow-md transition active:scale-98 min-h-[180px]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-800 group-hover:scale-110 transition">
                <Receipt className="h-7 w-7" />
              </div>
              <div className="my-2">
                <h3 className="text-base font-black uppercase text-stone-900">Balcão</h3>
                <p className="text-xs text-stone-500 mt-1">
                  Venda direta no balcão e atendimento rápido sem mesa
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 group-hover:underline">
                Abrir Cardápio ➔
              </span>
            </button>

            {/* 3. COMANDAS */}
            <button
              type="button"
              onClick={() => {
                setSaleModality('comanda');
                setSelectedTableNumber(null);
                setCurrentStep('step2_comanda');
              }}
              className="group flex flex-col items-center justify-between rounded-3xl border-2 border-stone-200 bg-white p-6 text-center shadow-xs hover:border-amber-500 hover:shadow-md transition active:scale-98 min-h-[180px]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-800 group-hover:scale-110 transition">
                <CreditCard className="h-7 w-7" />
              </div>
              <div className="my-2">
                <h3 className="text-base font-black uppercase text-stone-900">Comandas</h3>
                <p className="text-xs text-stone-500 mt-1">
                  Cartão de consumo individual ou número de comanda física
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 group-hover:underline">
                Informar Comanda ➔
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 2 DA ORDEM OBRIGATÓRIA: SELECIONAR A MESA (OBRIGATÓRIO PARA MESAS) */}
      {/* ========================================================================= */}
      {currentStep === 'step2_table' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep('step1_modality')}
                className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar</span>
              </button>
              <div>
                <h2 className="text-base font-black text-stone-900 sm:text-lg">
                  Passo 2: Selecione a Mesa Obrigatória
                </h2>
                <p className="text-xs text-stone-500">
                  É obrigatório escolher a mesa antes de selecionar produtos.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
              {tables.length} Mesas no Salão
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 max-h-[500px] overflow-y-auto p-1">
            {tables.map((tbl) => {
              const { label, badgeClass, cardClass } = getTableStatusLabel(tbl.status);

              return (
                <button
                  key={tbl.id}
                  type="button"
                  onClick={() => {
                    setSelectedTableNumber(tbl.number);
                    setCurrentStep('step3_catalog');
                  }}
                  className={`flex flex-col justify-between rounded-2xl border p-4 text-left shadow-2xs transition hover:shadow-md active:scale-95 min-h-[110px] ${cardClass}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-lg font-black text-stone-900">#{tbl.number}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${badgeClass}`}>
                      {label}
                    </span>
                  </div>
                  <div className="mt-2 text-stone-600">
                    <p className="text-xs font-bold truncate">
                      {tbl.customerName ? `👤 ${tbl.customerName}` : tbl.label || `Mesa ${tbl.number}`}
                    </p>
                    {tbl.currentTotal && tbl.currentTotal > 0 ? (
                      <p className="text-[11px] font-black text-amber-700">Saldo: {formatBRL(tbl.currentTotal)}</p>
                    ) : (
                      <p className="text-[10px] text-stone-400">Capacidade: {tbl.capacity} p</p>
                    )}
                    {tbl.extraTotal && tbl.extraTotal > 0 ? (
                      <span className="inline-block mt-0.5 rounded bg-purple-100 px-1 text-[9px] font-bold text-purple-800">
                        + Extra: {formatBRL(tbl.extraTotal)}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-2 text-[10px] font-bold text-amber-700">
                    Toque para abrir ➔
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 2 (COMANDAS): INFORMAR NÚMERO DA COMANDA */}
      {/* ========================================================================= */}
      {currentStep === 'step2_comanda' && (
        <div className="max-w-md mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <button
              type="button"
              onClick={() => setCurrentStep('step1_modality')}
              className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar</span>
            </button>
            <h2 className="text-base font-black text-stone-900">Identificação da Comanda</h2>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Número ou Código da Comanda
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Ex: 104 ou Cartão 12"
                value={comandaCode}
                onChange={(e) => setComandaCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-3 text-base font-mono font-black text-stone-900 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase text-stone-400">
                Atalhos Rápidos:
              </span>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setComandaCode(`CMD-${n < 10 ? `0${n}` : n}`)}
                    className="rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-black text-stone-700 hover:bg-amber-50 hover:border-amber-300"
                  >
                    #{n}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!comandaCode.trim()) {
                  setComandaCode(`CMD-${Math.floor(100 + Math.random() * 900)}`);
                }
                setCurrentStep('step3_catalog');
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-xs font-black uppercase text-white hover:bg-amber-700 transition"
            >
              <span>Avançar para o Cardápio ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 3 DA ORDEM OBRIGATÓRIA: SELECIONAR OS PRODUTOS DO CARDÁPIO */}
      {/* ========================================================================= */}
      {currentStep === 'step3_catalog' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Barra de Contexto do Atendimento Atual */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-amber-950">Atendimento:</span>
              <span className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-black text-white shadow-xs">
                {saleModality === 'table'
                  ? `🍽️ Mesa #${selectedTableNumber}`
                  : saleModality === 'comanda'
                  ? `📋 Comanda ${comandaCode ? `#${comandaCode}` : ''}`
                  : '🏷️ Balcão Rápido'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep('step1_modality')}
                className="text-[11px] font-bold text-amber-900 underline hover:text-amber-950"
              >
                Trocar Local
              </button>

              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep('step4_review')}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:bg-amber-700"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>Conferir Pedido ({cartItems.reduce((a, b) => a + b.quantity, 0)}) ➔</span>
                </button>
              )}
            </div>
          </div>

          {/* Categorias & Busca */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                selectedCategory === 'all'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              Todos ({products.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  selectedCategory === c.id
                    ? 'bg-amber-600 text-white font-bold shadow-xs'
                    : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar item pelo nome ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Grid de Produtos com Estoque Visível Obrigatório */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 max-h-[520px] overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const reservedQty = cartItems
                .filter((ci) => ci.productId === p.id)
                .reduce((acc, i) => acc + i.quantity, 0);
              const confirmedStock = p.stockQuantity ?? 0;
              const remainingStock = Math.max(0, confirmedStock - reservedQty);
              const isOutOfStock = remainingStock <= 0;

              return (
                <div
                  key={p.id}
                  className={`group flex flex-col justify-between overflow-hidden rounded-2xl border text-left shadow-2xs transition ${
                    isOutOfStock
                      ? 'border-rose-200 bg-stone-50/70 opacity-85'
                      : reservedQty > 0
                      ? 'border-amber-500 bg-white ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-white hover:border-amber-500'
                  }`}
                >
                  <div className="relative h-28 w-full bg-stone-100 overflow-hidden">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className={`h-full w-full object-cover transition ${
                          isOutOfStock ? 'grayscale contrast-75' : 'group-hover:scale-105'
                        }`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-stone-400 bg-stone-100">
                        <ImageIcon className="h-6 w-6 text-stone-300" />
                      </div>
                    )}
                    <span className="absolute top-1.5 left-1.5 rounded-md bg-stone-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      {p.internalCode}
                    </span>
                    {reservedQty > 0 && !isOutOfStock && (
                      <span className="absolute top-1.5 right-1.5 rounded-md bg-amber-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow-xs">
                        {reservedQty} no pedido
                      </span>
                    )}
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs">
                        <span className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-black uppercase text-white">
                          ESGOTADO
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 line-clamp-2 leading-snug">
                        {p.name}
                      </h4>
                      <p className="mt-1 text-sm font-black text-amber-700">
                        {formatBRL(p.sellingPrice)}
                      </p>

                      {/* QUANTIDADE DISPONÍVEL NO ESTOQUE VISÍVEL */}
                      <div className="mt-1.5">
                        {isOutOfStock ? (
                          <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded uppercase">
                            🔴 DISPONÍVEL: 00 UNIDADES (ESGOTADO)
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-black rounded px-1.5 py-0.5 ${
                              remainingStock <= 5
                                ? 'bg-amber-100 text-amber-950'
                                : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            DISPONÍVEL: {formatStockQuantity(remainingStock, p.unit)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() =>
                          setActiveItemForNotes({
                            product: p,
                            notes: '',
                            quantity: 1,
                          })
                        }
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 text-xs flex items-center gap-1"
                        title="Adicionar com observação personalizada"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span className="text-[10px]">Obs</span>
                      </button>

                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => handleAddToCart(p)}
                        className={`flex h-8 px-3 items-center justify-center gap-1 rounded-xl text-xs font-bold transition ${
                          isOutOfStock
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            : 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{isOutOfStock ? 'Esgotado' : 'Adicionar'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra Fixa Inferior com Resumo & Avanço para Conferência */}
          {cartItems.length > 0 && (
            <div className="sticky bottom-2 z-20 pt-2 animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between rounded-2xl bg-stone-900 px-5 py-3 text-white shadow-xl">
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-400">Total do Pedido</span>
                  <p className="text-xl font-black">
                    {cartItems.reduce((acc, i) => acc + i.quantity, 0)} itens • {formatBRL(total)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStep('step4_review')}
                  className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-black uppercase text-white hover:bg-amber-500 active:scale-95 transition shadow-sm"
                >
                  <span>Conferir Pedido ➔</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 4 DA ORDEM OBRIGATÓRIA: CONFERIR O PEDIDO */}
      {/* ========================================================================= */}
      {currentStep === 'step4_review' && (
        <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <button
              type="button"
              onClick={() => setCurrentStep('step3_catalog')}
              className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>+ Adicionar Mais Itens</span>
            </button>
            <h2 className="text-base font-black text-stone-900 sm:text-lg">
              Passo 4: Conferência do Pedido
            </h2>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
            {/* Informações do Atendimento */}
            <div className="flex items-center justify-between rounded-xl bg-stone-50 p-3 border border-stone-200 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-stone-400">Atendimento:</span>
                <p className="font-black text-stone-900 text-sm">
                  {saleModality === 'table'
                    ? `Mesa #${selectedTableNumber}`
                    : saleModality === 'comanda'
                    ? `Comanda #${comandaCode}`
                    : 'Venda Balcão'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-stone-400">Atendente:</span>
                <p className="font-bold text-stone-800">{currentUser?.name}</p>
              </div>
            </div>

            {/* Lista dos Itens Selecionados */}
            <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto pr-1">
              {cartItems.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-stone-900 truncate">{item.productName}</p>
                    {item.notes && (
                      <p className="text-[11px] font-semibold text-amber-700">Obs: {item.notes}</p>
                    )}
                    <p className="text-[11px] text-stone-400">
                      {item.quantity}x {formatBRL(item.unitPrice)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="rounded-lg p-1.5 text-stone-700 hover:bg-stone-200"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-black text-stone-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        className="rounded-lg p-1.5 text-stone-700 hover:bg-stone-200"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(idx)}
                      className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <span className="w-16 text-right text-xs font-black text-stone-900">
                      {formatBRL(item.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totais & Desconto */}
            <div className="border-t border-stone-200 pt-3 space-y-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Consumo de Produtos:</span>
                <span className="font-bold">{formatBRL(subtotal)}</span>
              </div>

              {tableExtraTotal > 0 && (
                <div className="flex justify-between items-center rounded-xl bg-purple-50 p-2.5 border border-purple-200 text-purple-950">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wide">
                      + Valores Extras da Mesa:
                    </span>
                    <p className="text-[10px] text-purple-700 mt-0.5">
                      {tableActiveExtraCharges.map((c) => `${c.description} (${formatBRL(c.amount)})`).join(' • ')}
                    </p>
                  </div>
                  <span className="text-sm font-black text-purple-900">+{formatBRL(tableExtraTotal)}</span>
                </div>
              )}

              {includeServiceFee && (
                <div className="flex justify-between text-stone-600">
                  <span>Taxa de Atendimento ({currentTenant.settings?.serviceFeePercentage || 10}%):</span>
                  <span className="font-bold">{formatBRL(serviceFee)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-stone-600">
                <span>Desconto (R$):</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0,00"
                  className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-right text-xs font-bold text-stone-900 focus:outline-none"
                />
              </div>

              <div className="rounded-2xl bg-stone-900 p-4 text-white flex items-center justify-between mt-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-400">Total a Pagar</span>
                  <p className="text-2xl font-black">{formatBRL(total)}</p>
                  {tableExtraTotal > 0 && (
                    <p className="text-[10px] text-stone-300">
                      Produtos: {formatBRL(subtotal)} + Extras: {formatBRL(tableExtraTotal)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep('step5_payment')}
                  className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase text-white hover:bg-amber-500 shadow-md active:scale-95 transition"
                >
                  <span>Avançar para Pagamento ➔</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 5 DA ORDEM OBRIGATÓRIA: SELECIONAR FORMA DE PAGAMENTO & CONFIRMAR */}
      {/* ========================================================================= */}
      {currentStep === 'step5_payment' && (
        <div className="max-w-lg mx-auto space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <button
              type="button"
              onClick={() => setCurrentStep('step4_review')}
              className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar ao Pedido</span>
            </button>
            <h2 className="text-base font-black text-stone-900">Passo 5: Forma de Pagamento</h2>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
            <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Valor Total da Venda
              </span>
              <p className="text-3xl font-black text-amber-950 mt-0.5">{formatBRL(total)}</p>
              {tableExtraTotal > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-100/80 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                  <span>Consumo: {formatBRL(subtotal)}</span>
                  <span>+</span>
                  <span>Valores Extras: {formatBRL(tableExtraTotal)}</span>
                </div>
              )}
            </div>

            {/* As 3 Formas Exclusivas: DINHEIRO, PIX, DEVENDO */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedMethod('dinheiro')}
                className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-xs font-bold transition ${
                  selectedMethod === 'dinheiro'
                    ? 'border-amber-600 bg-amber-50/70 text-amber-950 ring-2 ring-amber-500/30'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black">1. DINHEIRO</p>
                    <p className="text-[11px] font-normal text-stone-500">
                      Recebimento em espécie e cálculo de troco
                    </p>
                  </div>
                </div>
                {selectedMethod === 'dinheiro' && <CheckCircle2 className="h-5 w-5 text-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('pix')}
                className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-xs font-bold transition ${
                  selectedMethod === 'pix'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/30'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black">2. PIX</p>
                    <p className="text-[11px] font-normal text-stone-500">
                      Chave instantânea e QR Code de recebimento
                    </p>
                  </div>
                </div>
                {selectedMethod === 'pix' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('pendente')}
                className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-xs font-bold transition ${
                  selectedMethod === 'pendente' || selectedMethod === 'devendo'
                    ? 'border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-500/30'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-blue-950">3. PENDENTE DE PAGAMENTO</p>
                    <p className="text-[11px] font-normal text-blue-700">
                      Registro de pedido em aberto sem acerto imediato
                    </p>
                  </div>
                </div>
                {(selectedMethod === 'pendente' || selectedMethod === 'devendo') && (
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                )}
              </button>
            </div>

            {/* Detalhes de Dinheiro */}
            {selectedMethod === 'dinheiro' && (
              <div className="rounded-2xl bg-stone-50 p-4 border border-stone-200 space-y-2 text-xs">
                <label className="block font-bold text-stone-700">Valor Recebido do Cliente (R$)</label>
                <input
                  type="number"
                  step="0.5"
                  value={receivedCash || ''}
                  onChange={(e) => setReceivedCash(parseFloat(e.target.value) || 0)}
                  placeholder={`Ex: ${total.toFixed(2)}`}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-900 focus:outline-none"
                />
                {receivedCash > total && (
                  <p className="text-xs font-black text-emerald-700 pt-1">
                    Troco a Devolver: {formatBRL(receivedCash - total)}
                  </p>
                )}
              </div>
            )}

            {/* Detalhes de PENDENTE DE PAGAMENTO */}
            {(selectedMethod === 'pendente' || selectedMethod === 'devendo') && (
              <div className="rounded-2xl bg-blue-50/70 p-4 border border-blue-200 space-y-3 text-xs">
                <span className="font-black uppercase text-blue-900 text-[11px]">
                  Informações do Pedido em Aberto
                </span>
                <div>
                  <label className="block font-bold text-stone-800">Identificação / Nome do Cliente (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Beatriz ou Balcão Lateral"
                    value={debtCustomerName}
                    onChange={(e) => setDebtCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-800">Observações (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Pagar no final do expediente / Mesa em consumo"
                    value={debtNotes}
                    onChange={(e) => setDebtNotes(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-blue-800">
                  O pedido será salvo como <strong>Pendente de Pagamento</strong> no histórico para posterior quitação.
                </p>
              </div>
            )}

            {/* Botão de Confirmação Final */}
            <button
              type="button"
              onClick={handleFinalizeSale}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-xs font-black uppercase text-white shadow-md hover:bg-emerald-700 active:scale-95 transition"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>Confirmar Operação e Baixar Estoque</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 6: SUCESSO & COMPROVANTE OFICIAL */}
      {/* ========================================================================= */}
      {currentStep === 'step6_success' && finishedOrder && (
        <div className="max-w-md mx-auto space-y-4 animate-in zoom-in-95 duration-200 text-center">
          <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-xl space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">
                Operação Concluída com Sucesso
              </span>
              <h3 className="text-xl font-black text-stone-900 mt-0.5">
                Venda #{finishedOrder.orderNumber} Confirmada!
              </h3>
              <p className="text-xs text-stone-500">
                Baixa de estoque confirmada pela Matriz Administrativa.
              </p>
            </div>

            <div className="rounded-2xl bg-stone-50 p-4 border border-stone-200 text-left text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-stone-500">Modalidade:</span>
                <span className="font-bold text-stone-900 uppercase">
                  {finishedOrder.type === 'table'
                    ? `Mesa #${finishedOrder.tableNumber}`
                    : finishedOrder.type === 'comanda'
                    ? `Comanda #${finishedOrder.comandaNumber}`
                    : 'Balcão'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Pagamento:</span>
                <span className="font-bold text-stone-900 uppercase">
                  {finishedOrder.payments[0]?.method}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Total Pago:</span>
                <span className="font-bold text-emerald-700">{formatBRL(finishedOrder.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Vendedor:</span>
                <span className="font-bold text-stone-900">{finishedOrder.waiterName}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir Recibo</span>
              </button>

              <button
                type="button"
                onClick={handleResetForNewSale}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2.5 text-xs font-black uppercase text-white hover:bg-amber-700"
              >
                <span>+ Nova Venda</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Observação do Item (Ex: "Sem cebola", "Ponto da carne") */}
      {activeItemForNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <h3 className="text-sm font-black text-stone-900">
                Observação: {activeItemForNotes.product.name}
              </h3>
              <button onClick={() => setActiveItemForNotes(null)} className="text-stone-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700">Quantidade</label>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveItemForNotes((prev) =>
                        prev ? { ...prev, quantity: Math.max(1, prev.quantity - 1) } : null
                      )
                    }
                    className="rounded-lg border border-stone-200 p-2 text-stone-700"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-black">
                    {activeItemForNotes.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveItemForNotes((prev) => (prev ? { ...prev, quantity: prev.quantity + 1 } : null))
                    }
                    className="rounded-lg border border-stone-200 p-2 text-stone-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">Observação / Instrução</label>
                <input
                  type="text"
                  placeholder="Ex: Sem cebola, gelo e limão..."
                  value={activeItemForNotes.notes}
                  onChange={(e) =>
                    setActiveItemForNotes((prev) => (prev ? { ...prev, notes: e.target.value } : null))
                  }
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  handleAddToCart(
                    activeItemForNotes.product,
                    activeItemForNotes.notes,
                    activeItemForNotes.quantity
                  )
                }
                className="w-full rounded-xl bg-amber-600 py-2.5 text-xs font-black uppercase text-white hover:bg-amber-700"
              >
                Confirmar e Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Vendas Recentes */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-black text-stone-900">Vendas Recentes no Estabelecimento</h3>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-stone-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-stone-100">
              {getOrders(currentTenant.id).slice(0, 8).map((ord) => (
                <div key={ord.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-stone-900">#{ord.orderNumber}</span> •{' '}
                    <span className="text-stone-500">
                      {ord.type === 'table'
                        ? `Mesa #${ord.tableNumber}`
                        : ord.type === 'comanda'
                        ? `Comanda #${ord.comandaNumber}`
                        : 'Balcão'}
                    </span>
                    <p className="text-[10px] text-stone-400">
                      {formatTimeBR(ord.createdAt)} • {ord.waiterName} • {ord.items.length} itens
                    </p>
                  </div>
                  <span className="font-black text-stone-900">{formatBRL(ord.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
