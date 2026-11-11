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
  RotateCw,
  XCircle,
  Camera,
  Upload,
  Eye,
  Check,
  Package,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Product, OrderItem, PaymentMethod, Order, DebtRecord } from '../../types';
import {
  getProducts,
  getCategories,
  saveOrder,
  saveDebt,
  addAuditLog,
  getOrders,
  validateOrderStock,
  deductStockForOrder,
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
import { formatBRL, formatDateTimeBR, formatTimeBR } from '../../utils/formatters';
import confetti from 'canvas-confetti';

export const PosView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm, activeView } = useAuth();

  // Estado reativo do catálogo com sincronização em tempo real entre terminais
  const [products, setProducts] = useState<Product[]>(() => getProducts(currentTenant.id));
  const categories = getCategories(currentTenant.id);
  const orders = getOrders(currentTenant.id);

  useEffect(() => {
    setProducts(getProducts(currentTenant.id));

    const handleSync = () => {
      setProducts(getProducts(currentTenant.id));
    };

    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  // Formatação padronizada e didática da quantidade de estoque e unidade
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

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [includeServiceFee, setIncludeServiceFee] = useState(false);

  // Modal de Pagamento
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('dinheiro');
  const [receivedCash, setReceivedCash] = useState<number>(0);
  const [finishedOrder, setFinishedOrder] = useState<Order | null>(null);

  // Comprovantes de Pagamento (Fotografia PIX / Dinheiro)
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptSizeKb, setReceiptSizeKb] = useState<number | null>(null);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [showPresetReceiptModal, setShowPresetReceiptModal] = useState(false);
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<Order | null>(null);

  // Regras de Comprovante definidas pela Matriz
  const pixRule = currentTenant.settings?.pixReceiptRule || 'optional';
  const cashRule = currentTenant.settings?.cashReceiptRule || 'optional';
  const activeReceiptRule =
    selectedMethod === 'pix' ? pixRule : selectedMethod === 'dinheiro' ? cashRule : 'disabled';
  const isReceiptMandatory = activeReceiptRule === 'required';
  const isReceiptOptional = activeReceiptRule === 'optional';
  const isReceiptActive = activeReceiptRule !== 'disabled';

  // Modal DEVENDO (Obrigatório e Automático)
  const [isDevendoModalOpen, setIsDevendoModalOpen] = useState(false);
  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState('');
  const [debtCustomerCpf, setDebtCustomerCpf] = useState('');
  const [debtCustomerAddress, setDebtCustomerAddress] = useState('');
  const [debtNotes, setDebtNotes] = useState('');

  // Modalidades de Venda Permitidas: Balcão, Mesas, Comandas
  const [saleModality, setSaleModality] = useState<'counter' | 'table' | 'comanda'>('counter');
  const [selectedTableNumber, setSelectedTableNumber] = useState<number>(1);
  const [comandaCode, setComandaCode] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Aba / Modal de Histórico e Bloqueio de Cancelamento
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [securityBlockMessage, setSecurityBlockMessage] = useState<string | null>(null);

  const matrizInfo = getMatrizInfo();
  const serverOnline = isServerOnline();
  const isCurrentMatriz = isDeviceMatriz(activeView === 'admin' ? 'adm' : 'seller');

  // Adição ao pedido com validação estrita contra venda acima do estoque
  const handleAddToCart = (product: Product) => {
    const existing = cartItems.find((item) => item.productId === product.id);
    const currentQtyInCart = existing ? existing.quantity : 0;
    const confirmedStock = product.stockQuantity ?? 0;

    // Bloqueia adição se atingir ou exceder o estoque disponível
    if (currentQtyInCart >= confirmedStock) {
      alert(
        `Limite de estoque atingido! O item "${product.name}" possui apenas ${confirmedStock} unidades disponíveis na Matriz.`
      );
      return;
    }

    setCartItems((prev) => {
      const itemExists = prev.find((item) => item.productId === product.id);
      if (itemExists) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          total: product.sellingPrice,
        },
      ];
    });
  };

  // Atualização de quantidade no carrinho respeitando o estoque máximo disponível
  const handleUpdateQuantity = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    const confirmedStock = product?.stockQuantity ?? 999;

    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            if (newQty > confirmedStock) {
              alert(
                `Não é possível adicionar mais unidades. Quantidade máxima em estoque na Matriz: ${confirmedStock}.`
              );
              return item;
            }
            return newQty > 0
              ? { ...item, quantity: newQty, total: newQty * item.unitPrice }
              : null;
          }
          return item;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  // Remoção individual do item do pedido (retorna imediatamente a reserva ao catálogo)
  const handleRemoveFromCart = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const subtotal = cartItems.reduce((acc, item) => acc + item.total, 0);
  const serviceFee = includeServiceFee
    ? (subtotal * (currentTenant.settings?.serviceFeePercentage || 10)) / 100
    : 0;
  const total = Math.max(0, subtotal - discount + serviceFee);

  // Abertura do Modal de Pagamento
  const handleOpenPaymentModal = () => {
    if (cartItems.length === 0) return;
    setSelectedMethod('dinheiro');
    setReceivedCash(total);
    setReceiptImage(null);
    setReceiptSizeKb(null);
    setIsPaymentModalOpen(true);
  };

  // Ao selecionar método de pagamento
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setReceiptImage(null);
    setReceiptSizeKb(null);
    if (method === 'devendo') {
      setIsDevendoModalOpen(true);
    }
  };

  // Processamento e compressão inteligente da fotografia de comprovante
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingReceipt(true);
      const res = await processProductImage(file, 640, 640, 0.82);
      setReceiptImage(res.dataUrl);
      setReceiptSizeKb(Math.round(res.compressedSizeBytes / 1024));
      // Grava consumo econômico no monitor de telemetria
      recordDeltaTransfer(res.compressedSizeBytes, res.originalSizeBytes);
    } catch {
      alert('Falha ao processar e comprimir imagem do comprovante. Tente outro arquivo.');
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

  const handleFinalizeSale = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cartItems.length === 0) return;

    // Validação estrita de DEVENDO
    if (selectedMethod === 'devendo') {
      if (!debtCustomerName.trim()) {
        alert('O nome do cliente é obrigatório para registrar a pendência (DEVENDO).');
        return;
      }
      if (!debtNotes.trim()) {
        alert('O campo Observações é obrigatório para o vendedor registrar informações da pendência.');
        return;
      }
    }

    // Validação estrita de Regra de Comprovante Obrigatório (PIX e Dinheiro)
    if (
      isReceiptMandatory &&
      (selectedMethod === 'dinheiro' || selectedMethod === 'pix') &&
      !receiptImage
    ) {
      alert(
        `⚠️ COMPROVANTE OBRIGATÓRIO: A Matriz Administrativa exige fotografia do comprovante para pagamentos em ${selectedMethod.toUpperCase()}. Fotografe ou anexe a imagem para concluir a venda.`
      );
      return;
    }

    // Validação estrita de estoque na Matriz antes de autorizar a finalização da venda
    const stockValidation = validateOrderStock(currentTenant.id, cartItems);
    if (!stockValidation.valid) {
      alert(`⚠️ BLOQUEIO DE ESTOQUE: ${stockValidation.error}`);
      return;
    }

    const orderId = `ord-${Date.now()}`;
    const orderNumber = Math.floor(Math.random() * 900 + 100);
    const debtId = selectedMethod === 'devendo' ? `debt-${Date.now()}` : undefined;

    // Se a Matriz estiver offline, salva como RASCUNHO PENDENTE DE VALIDAÇÃO
    const isDraft = !serverOnline;

    const newOrder: Order = {
      id: orderId,
      tenantId: currentTenant.id,
      orderNumber,
      type: saleModality,
      tableNumber: saleModality === 'table' ? selectedTableNumber : undefined,
      comandaNumber: saleModality === 'comanda' ? (comandaCode.trim() || `CMD-${orderNumber}`) : undefined,
      status: isDraft ? 'preparing' : 'closed',
      waiterId: currentUser?.id,
      waiterName: currentUser?.name || 'Vendedor',
      customerId: selectedMethod === 'devendo' ? debtId : undefined,
      customerName: selectedMethod === 'devendo' ? debtCustomerName : undefined,
      customerPhone: selectedMethod === 'devendo' ? debtCustomerPhone : undefined,
      items: cartItems,
      subtotal,
      discount,
      serviceFee,
      total,
      payments: [
        {
          method: selectedMethod,
          amount: total,
          receivedAmount: selectedMethod === 'dinheiro' ? receivedCash || total : total,
          change: selectedMethod === 'dinheiro' ? Math.max(0, (receivedCash || total) - total) : 0,
          debtRecordId: debtId,
          receiptImageUrl: receiptImage || undefined,
          receiptType: selectedMethod === 'pix' ? 'pix' : selectedMethod === 'dinheiro' ? 'cash' : undefined,
          receiptCapturedAt: receiptImage ? new Date().toISOString() : undefined,
          receiptSellerName: receiptImage ? (currentUser?.name || 'Vendedor') : undefined,
        },
      ],
      paid: selectedMethod !== 'devendo',
      receiptImageUrl: receiptImage || undefined,
      receiptCapturedAt: receiptImage ? new Date().toISOString() : undefined,
      receiptSellerName: receiptImage ? (currentUser?.name || 'Vendedor') : undefined,
      notes: selectedMethod === 'devendo'
        ? `DEVENDO: ${debtNotes}${isDraft ? ' [RASCUNHO OFFLINE]' : ''}`
        : isDraft
        ? '[RASCUNHO LOCAL OFFLINE - Aguardando confirmação da Matriz]'
        : undefined,
      createdAt: new Date().toISOString(),
      closedAt: !isDraft ? new Date().toISOString() : undefined,
      isDemo: false,
    };

    // Se for DEVENDO, cria e persiste o registro de dívida
    if (selectedMethod === 'devendo' && debtId) {
      const newDebt: DebtRecord = {
        id: debtId,
        tenantId: currentTenant.id,
        orderId,
        orderNumber,
        customerName: debtCustomerName.trim(),
        customerPhone: debtCustomerPhone.trim() || undefined,
        customerCpf: debtCustomerCpf.trim() || undefined,
        customerAddress: debtCustomerAddress.trim() || undefined,
        amount: total,
        amountPaid: 0,
        remainingAmount: total,
        notes: debtNotes.trim(),
        sellerId: currentUser?.id || 'vendedor',
        sellerName: currentUser?.name || 'Vendedor',
        status: 'pendente',
        createdAt: new Date().toISOString(),
        settlementHistory: [],
        isDemo: false,
      };

      saveDebt(newDebt);

      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'vendedor',
        userName: currentUser?.name || 'Vendedor',
        action: 'REGISTRO_DEVENDO',
        details: `Venda #${orderNumber} (${formatBRL(total)}) lançada como DEVENDO para ${debtCustomerName}. Motivo: ${debtNotes}`,
      });
    }

    if (isDraft) {
      // Enfileira como rascunho na fila offline local
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
        details: `Venda #${orderNumber} (${formatBRL(total)}) salva como RASCUNHO LOCAL devido à Matriz estar indisponível.`,
      });
    } else {
      // Matriz online: validação e baixa oficial de estoque físico
      const deduct = deductStockForOrder(currentTenant.id, cartItems);
      if (!deduct.success) {
        alert(`⚠️ Bloqueio de estoque na Matriz: ${deduct.error}`);
        return;
      }

      saveOrder(newOrder);

      // Notifica todos os terminais conectados via Delta Sync (Prioridade 2: Estoque)
      broadcastDeltaUpdate({
        tenantId: currentTenant.id,
        type: 'stock_updated',
        title: 'Estoque Atualizado (Venda Concluída)',
        message: `Venda #${orderNumber} confirmada pela Matriz. Baixa realizada em ${cartItems.length} produto(s).`,
        priority: 2,
      });

      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'vendedor',
        userName: currentUser?.name || 'Vendedor',
        action: 'VENDA_CONFIRMADA_MATRIZ',
        details: `Venda #${orderNumber} (${formatBRL(total)}) validada e confirmada oficialmente pela Matriz com baixa de estoque.`,
      });
    }

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });

    setFinishedOrder(newOrder);
    setIsPaymentModalOpen(false);
    setIsDevendoModalOpen(false);
    setCartItems([]);
    setDiscount(0);
    setComandaCode('');
    setMobileTab('catalog');
    setDebtCustomerName('');
    setDebtCustomerPhone('');
    setDebtCustomerCpf('');
    setDebtCustomerAddress('');
    setDebtNotes('');
  };

  // Tentativa de Cancelamento de Venda
  const handleAttemptCancel = (order: Order) => {
    const result = cancelOrderWithAuthority(
      order.id,
      'Solicitação de cancelamento no PDV',
      activeView === 'admin' ? 'adm' : 'seller',
      currentUser?.role || 'waiter',
      currentUser?.name || 'Colaborador'
    );

    if (!result.success) {
      setSecurityBlockMessage(result.message);
    } else {
      alert(`✓ ${result.message}`);
      setIsHistoryModalOpen(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.internalCode.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner de Status da Matriz e Conexão */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white border border-stone-200 px-4 py-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white shadow-xs ${
              serverOnline ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {serverOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-stone-900">
                Ponto de Venda (PDV Rápido)
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  serverOnline
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800 animate-pulse'
                }`}
              >
                {serverOnline ? '🟢 Conectado à Matriz Oficial' : '🔴 Matriz Indisponível (Modo Rascunho)'}
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Autoridade Central: <strong>{matrizInfo.activeHostLabel}</strong> ({matrizInfo.ipAddress}) • Atendente:{' '}
              <strong>{currentUser?.name}</strong>
            </p>
          </div>
        </div>

        {/* Botão de Histórico e Consulta */}
        <button
          onClick={() => setIsHistoryModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition"
        >
          <Clock className="h-3.5 w-3.5 text-stone-500" />
          <span>Vendas Recentes</span>
        </button>
      </div>

      {/* Aviso importante quando Matriz estiver Offline */}
      {!serverOnline && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>ATENÇÃO AO VENDEDOR:</strong> A Matriz Administrativa está desligada ou fora da rede local. As vendas serão gravadas como <strong>RASCUNHOS LOCAIS</strong> e só serão confirmadas oficialmente quando a Matriz for reconectada.
            </span>
          </div>
        </div>
      )}

      {/* Barra de Modalidades de Venda Permitidas: Balcão, Mesa, Comanda */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white border border-stone-200 p-2.5 shadow-2xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[11px] font-black uppercase text-stone-500 mr-1 shrink-0">
            Modalidade:
          </span>
          <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSaleModality('counter')}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
                saleModality === 'counter'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <span>Balcão</span>
            </button>
            <button
              type="button"
              onClick={() => setSaleModality('table')}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
                saleModality === 'table'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <span>Mesa</span>
            </button>
            <button
              type="button"
              onClick={() => setSaleModality('comanda')}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
                saleModality === 'comanda'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <span>Comanda</span>
            </button>
          </div>
        </div>

        {/* Campo Específico de Mesa */}
        {saleModality === 'table' && (
          <div className="flex items-center gap-2 w-full sm:w-auto bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-xs text-amber-950 animate-in fade-in">
            <span className="font-bold">Mesa Selecionada:</span>
            <select
              value={selectedTableNumber}
              onChange={(e) => setSelectedTableNumber(Number(e.target.value))}
              className="rounded-lg bg-white border border-amber-300 font-bold px-2.5 py-1 text-xs text-stone-900 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  Mesa #{num}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Campo Específico de Comanda */}
        {saleModality === 'comanda' && (
          <div className="flex items-center gap-2 w-full sm:w-auto bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5 text-xs text-blue-950 animate-in fade-in">
            <span className="font-bold">Nº da Comanda:</span>
            <input
              type="text"
              placeholder="Ex: 104, B-03..."
              value={comandaCode}
              onChange={(e) => setComandaCode(e.target.value)}
              className="rounded-lg bg-white border border-blue-300 font-bold px-2.5 py-1 text-xs text-stone-900 focus:outline-none w-32"
            />
          </div>
        )}
      </div>

      {/* Switcher Rápido em Telas de Celular (lg:hidden) */}
      <div className="lg:hidden flex items-center rounded-2xl bg-stone-200/90 p-1 shadow-inner">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 min-h-[44px] ${
            mobileTab === 'catalog'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Catálogo ({filteredProducts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 min-h-[44px] ${
            mobileTab === 'cart'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>
            Pedido ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})
            {cartItems.length > 0 && ` • ${formatBRL(total)}`}
          </span>
        </button>
      </div>

      {/* Grid Principal: 7 colunas (Catálogo com Fotos) + 5 colunas (Carrinho com Botões Grandes) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Catálogo de Produtos Visual com Fotografias (7 colunas) */}
        <div className={`space-y-3 lg:col-span-7 ${mobileTab === 'cart' ? 'hidden lg:block' : 'block'}`}>
          {/* Categorias Pills Grandes */}
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

          {/* Campo de Busca Rápida */}
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

          {/* Cards Visuais de Produtos com Fotografia & Estoque Disponível Sempre Visível */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-h-[580px] overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const cartItem = cartItems.find((ci) => ci.productId === p.id);
              const reservedQty = cartItem ? cartItem.quantity : 0;
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
                      ? 'border-amber-500 bg-white ring-2 ring-amber-500/20 shadow-xs'
                      : 'border-stone-200 bg-white hover:border-amber-500 hover:shadow-md'
                  }`}
                >
                  {/* Fotografia do Produto com Badges de Estoque */}
                  <div className="relative h-28 w-full bg-stone-100 overflow-hidden">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className={`h-full w-full object-cover transition duration-300 ${
                          isOutOfStock ? 'grayscale contrast-75' : 'group-hover:scale-105'
                        }`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-stone-400 bg-stone-100">
                        <ImageIcon className="h-6 w-6 text-stone-300" />
                      </div>
                    )}

                    {/* Código interno do produto */}
                    <span className="absolute top-1.5 left-1.5 rounded-md bg-stone-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                      {p.internalCode}
                    </span>

                    {/* Indicador de reserva no carrinho atual */}
                    {reservedQty > 0 && !isOutOfStock && (
                      <span className="absolute top-1.5 right-1.5 rounded-md bg-amber-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow-xs animate-in zoom-in-95">
                        {reservedQty} no pedido
                      </span>
                    )}

                    {/* Overlay visual quando o produto estiver completamente ESGOTADO */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs">
                        <span className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-md">
                          ESGOTADO
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Dados do Produto: Nome, Preço e Estoque Disponível */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 line-clamp-2 leading-snug">
                        {p.name}
                      </h4>

                      {/* Preço Unitário */}
                      <p className="mt-1 text-sm font-black text-amber-700">
                        {formatBRL(p.sellingPrice)}
                      </p>

                      {/* QUANTIDADE DISPONÍVEL NO ESTOQUE (MANDATÓRIO — SEMPRE VISÍVEL) */}
                      <div className="mt-1.5">
                        {!serverOnline ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded-md">
                            ⚠️ Matriz offline (Não confirmada)
                          </span>
                        ) : isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md uppercase">
                            🔴 DISPONÍVEL: 00 {p.unit === 'un' || !p.unit ? 'UNIDADES' : p.unit.toUpperCase()} (ESGOTADO)
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-black rounded-md px-2 py-0.5 ${
                              remainingStock <= 5
                                ? 'bg-amber-100 text-amber-950'
                                : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                remainingStock <= 5 ? 'bg-amber-600 animate-pulse' : 'bg-emerald-600'
                              }`}
                            />
                            DISPONÍVEL: {formatStockQuantity(remainingStock, p.unit)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botão de Adição com Bloqueio Automático ao Esgotar */}
                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-[10px] text-stone-400 font-medium">
                        {reservedQty > 0 ? `Reserva: ${reservedQty} un` : 'Adicionar ao pedido'}
                      </span>

                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => handleAddToCart(p)}
                        className={`flex h-7 px-2.5 items-center justify-center gap-1 rounded-xl text-xs font-bold transition shadow-2xs ${
                          isOutOfStock
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            : 'bg-amber-600 text-white hover:bg-amber-700 active:scale-95'
                        }`}
                        title={
                          isOutOfStock
                            ? 'Produto esgotado no estoque da Matriz'
                            : 'Adicionar 1 unidade ao pedido'
                        }
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
          {/* Barra Flutuante de Atalho no Celular para ir direto ao Pedido */}
          {cartItems.length > 0 && mobileTab === 'catalog' && (
            <div className="lg:hidden sticky bottom-2 z-20 pt-2 animate-in slide-in-from-bottom-2">
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="w-full flex items-center justify-between rounded-2xl bg-amber-600 px-4 py-3.5 text-xs font-black text-white shadow-xl hover:bg-amber-700 active:scale-95 transition"
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span>{cartItems.reduce((acc, i) => acc + i.quantity, 0)} itens no pedido</span>
                </div>
                <div className="flex items-center gap-1.5 font-black text-amber-100">
                  <span>{formatBRL(total)}</span>
                  <ArrowRight className="h-4 w-4 text-white" />
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Carrinho do Pedido Atual (5 colunas) */}
        <div
          className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-5 flex flex-col justify-between h-[640px] ${
            mobileTab === 'catalog' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div>
            {/* Botão de retorno ao catálogo no celular */}
            <div className="lg:hidden mb-2.5">
              <button
                type="button"
                onClick={() => setMobileTab('catalog')}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 w-full justify-center transition"
              >
                <span>← Continuar Adicionando Produtos</span>
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-stone-900">
                  {saleModality === 'counter'
                    ? 'Venda Balcão'
                    : saleModality === 'table'
                    ? `Mesa #${selectedTableNumber}`
                    : `Comanda ${comandaCode ? `#${comandaCode}` : ''}`}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600">
                  {cartItems.reduce((acc, i) => acc + i.quantity, 0)} itens
                </span>
                {cartItems.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Deseja cancelar o pedido atual e liberar todas as unidades reservadas de volta ao estoque?')) {
                        setCartItems([]);
                      }
                    }}
                    className="rounded-lg px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition"
                    title="Liberar todas as reservas e esvaziar pedido"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Lista do Carrinho com Controles Individuais [ - ] [ Qtd ] [ + ] e Lixeira */}
            <div className="mt-3 max-h-[290px] overflow-y-auto divide-y divide-stone-100 space-y-1">
              {cartItems.length > 0 ? (
                cartItems.map((item) => {
                  const prod = products.find((p) => p.id === item.productId);
                  const confirmedStock = prod?.stockQuantity ?? 999;
                  const isMaxReached = item.quantity >= confirmedStock;
                  const remainingInCatalog = Math.max(0, confirmedStock - item.quantity);

                  return (
                    <div key={item.productId} className="flex items-center justify-between py-2">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="truncate text-xs font-bold text-stone-900">{item.productName}</p>
                        <p className="text-[11px] text-stone-400">
                          {item.quantity}x {formatBRL(item.unitPrice)} •{' '}
                          <span className="font-semibold text-stone-600">
                            Matriz: {confirmedStock} un (Restam {remainingInCatalog})
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Controles Individuais de Quantidade [ - ] [ QTD ] [ + ] */}
                        <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
                          {/* Botão Diminuir */}
                          <button
                            onClick={() => handleUpdateQuantity(item.productId, -1)}
                            className="rounded-lg p-2 text-stone-700 hover:bg-stone-200 transition min-h-[36px] min-w-[36px] flex items-center justify-center active:scale-95"
                            title="Diminuir 1 unidade (libera estoque no catálogo)"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>

                          {/* Quantidade atual claramente visível */}
                          <span className="w-7 text-center text-xs font-black text-stone-900">
                            {item.quantity}
                          </span>

                          {/* Botão Aumentar (bloqueia quando atinge estoque máximo disponível) */}
                          <button
                            disabled={isMaxReached}
                            onClick={() => handleUpdateQuantity(item.productId, 1)}
                            className={`rounded-lg p-2 transition min-h-[36px] min-w-[36px] flex items-center justify-center active:scale-95 ${
                              isMaxReached
                                ? 'opacity-30 cursor-not-allowed text-stone-400'
                                : 'text-stone-700 hover:bg-stone-200'
                            }`}
                            title={
                              isMaxReached
                                ? `Estoque máximo atingido (${confirmedStock} unidades)`
                                : 'Aumentar 1 unidade'
                            }
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Botão para remover o produto do pedido e liberar todo o estoque */}
                        <button
                          onClick={() => handleRemoveFromCart(item.productId)}
                          className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Remover produto do pedido e liberar estoque"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        {/* Subtotal do Item */}
                        <span className="w-16 text-right text-xs font-black text-stone-900">
                          {formatBRL(item.total)}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-20 text-center text-stone-400">
                  <ShoppingBag className="mx-auto h-10 w-10 text-stone-300" />
                  <p className="mt-2 text-xs font-semibold text-stone-600">Nenhum item selecionado</p>
                  <p className="text-[11px] text-stone-400">
                    Toque nos produtos com estoque disponível para adicionar
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Subtotais & BOTÃO GRANDE DE CONCLUSÃO */}
          <div className="border-t border-stone-200 pt-3 space-y-2">
            <div className="flex justify-between text-xs text-stone-600">
              <span>Subtotal</span>
              <span className="font-semibold">{formatBRL(subtotal)}</span>
            </div>

            {/* Desconto */}
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span>Desconto</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={discount || ''}
                onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="R$ 0,00"
                className="w-20 rounded-md border border-stone-200 px-2 py-0.5 text-right text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Total Geral em Destaque */}
            <div className="rounded-2xl bg-stone-900 p-3.5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Total a Pagar
                </span>
                <p className="text-2xl font-black">{formatBRL(total)}</p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-stone-400">3 Formas Disponíveis</span>
                <p className="text-[11px] font-semibold text-stone-300">Dinheiro • PIX • Devendo</p>
              </div>
            </div>

            {/* BOTÃO GRANDE DE COBRANÇA (MÍNIMO DE TOQUES) */}
            <button
              disabled={cartItems.length === 0}
              onClick={handleOpenPaymentModal}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black uppercase tracking-wide shadow-md transition ${
                cartItems.length > 0
                  ? 'bg-amber-600 text-white hover:bg-amber-500 active:scale-98'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              <Banknote className="h-5 w-5" />
              <span>Cobrar {formatBRL(total)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE PAGAMENTO (EXCLUSIVAMENTE DINHEIRO, PIX, DEVENDO) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-base">Forma de Pagamento</h3>
                <p className="text-xs text-stone-500">Escolha uma das 3 opções exclusivas</p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Total em Destaque */}
            <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-center border border-amber-200">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Valor Total da Venda
              </span>
              <p className="text-3xl font-black text-amber-950">{formatBRL(total)}</p>
            </div>

            {/* 3 BOTÕES EXCLUSIVOS */}
            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('dinheiro')}
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
                {selectedMethod === 'dinheiro' && (
                  <CheckCircle2 className="h-5 w-5 text-amber-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('pix')}
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
                      Transferência instantânea via chave do estabelecimento
                    </p>
                  </div>
                </div>
                {selectedMethod === 'pix' && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('devendo')}
                className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-xs font-bold transition ${
                  selectedMethod === 'devendo'
                    ? 'border-purple-600 bg-purple-50 text-purple-950 ring-2 ring-purple-500/30'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-800">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-purple-950">3. DEVENDO</p>
                    <p className="text-[11px] font-normal text-purple-700">
                      Abre cadastro da pendência para acerto futuro (Fiado)
                    </p>
                  </div>
                </div>
                {selectedMethod === 'devendo' && (
                  <CheckCircle2 className="h-5 w-5 text-purple-600" />
                )}
              </button>
            </div>

            {/* Troco em Dinheiro */}
            {selectedMethod === 'dinheiro' && (
              <div className="mt-3.5 rounded-2xl bg-stone-50 p-3.5 border border-stone-200">
                <label className="block text-xs font-bold text-stone-700">Valor Recebido do Cliente (R$)</label>
                <input
                  type="number"
                  step="1"
                  value={receivedCash || ''}
                  onChange={(e) => setReceivedCash(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 50"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-black text-stone-900 focus:outline-none"
                />
                {receivedCash > total && (
                  <p className="mt-2 text-xs font-black text-emerald-700">
                    Troco a Devolver: {formatBRL(receivedCash - total)}
                  </p>
                )}
              </div>
            )}

            {/* SEÇÃO DE COMPROVANTE FOTOGRÁFICO (PIX E DINHEIRO) */}
            {(selectedMethod === 'dinheiro' || selectedMethod === 'pix') && isReceiptActive && (
              <div className="mt-3.5 rounded-2xl border border-stone-200 bg-stone-50/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-stone-700" />
                    <span className="text-xs font-bold text-stone-900">
                      Fotografia do Comprovante
                    </span>
                  </div>

                  {isReceiptMandatory ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 border border-rose-200">
                      ⚠️ OBRIGATÓRIO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-200/70 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                      Opcional
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-stone-500 leading-tight">
                  {selectedMethod === 'pix'
                    ? 'Fotografe ou anexe o comprovante de transferência ou extrato bancário.'
                    : 'Fotografe as cédulas em dinheiro recebidas na transação física.'}
                </p>

                {/* Exibição da Imagem Anexada ou Opções de Captura */}
                {receiptImage ? (
                  <div className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-emerald-200 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={receiptImage}
                        alt="Comprovante de pagamento"
                        className="h-12 w-12 rounded-lg object-cover border border-stone-200"
                      />
                      <div>
                        <p className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Foto Anexada
                        </p>
                        <p className="text-[10px] text-stone-500">
                          {receiptSizeKb ? `~${receiptSizeKb} KB (Comprimida)` : 'Otimizada'} • Imutável após salvar
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setReceiptImage(null);
                        setReceiptSizeKb(null);
                      }}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600"
                      title="Substituir fotografia"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Botão Câmera Direta */}
                      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 transition shadow-2xs">
                        <Camera className="h-3.5 w-3.5 text-stone-600" />
                        <span>Câmera</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleReceiptFileChange}
                          className="hidden"
                        />
                      </label>

                      {/* Botão Galeria / Arquivo */}
                      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 transition shadow-2xs">
                        <Upload className="h-3.5 w-3.5 text-stone-600" />
                        <span>Galeria</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Botão de Exemplo Didático para Testes Instantâneos */}
                    <button
                      type="button"
                      onClick={() => setShowPresetReceiptModal(true)}
                      className="flex w-full items-center justify-center gap-1 rounded-xl bg-amber-50 py-1.5 text-[11px] font-bold text-amber-800 border border-amber-200/80 hover:bg-amber-100 transition"
                    >
                      <Sparkles className="h-3 w-3 text-amber-600" />
                      <span>Ou escolha um comprovante exemplo (PIX / Dinheiro)</span>
                    </button>

                    {isProcessingReceipt && (
                      <p className="text-center text-[11px] font-semibold text-amber-700 animate-pulse">
                        Comprimindo imagem localmente via Canvas...
                      </p>
                    )}
                  </div>
                )}

                {isReceiptMandatory && !receiptImage && (
                  <div className="rounded-xl bg-rose-50 p-2 text-[10px] font-bold text-rose-800 border border-rose-200 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                    <span>A finalização está bloqueada até a inclusão da fotografia do comprovante.</span>
                  </div>
                )}
              </div>
            )}

            {/* Botões do Modal */}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="w-1/2 rounded-xl border border-stone-200 py-3 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Voltar
              </button>

              {selectedMethod === 'devendo' ? (
                <button
                  type="button"
                  onClick={() => setIsDevendoModalOpen(true)}
                  className="w-1/2 rounded-xl bg-purple-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
                >
                  Preencher Pendência
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isReceiptMandatory && !receiptImage}
                  onClick={() => handleFinalizeSale()}
                  className={`w-1/2 rounded-xl py-3 text-xs font-bold shadow-sm transition ${
                    isReceiptMandatory && !receiptImage
                      ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  Confirmar Venda
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEVENDO (JANELA AUTOMÁTICA DE CADASTRO DA PENDÊNCIA) */}
      {isDevendoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-800">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-base">Registrar Pendência (DEVENDO)</h3>
                  <p className="text-xs text-stone-500">
                    Vincular dívida ao cliente com histórico e observações obrigatórias
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDevendoModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFinalizeSale} className="mt-4 space-y-3.5">
              {/* Valor Devido Preenchido Automaticamente */}
              <div className="rounded-2xl bg-purple-50 p-3.5 border border-purple-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
                    Valor Devido (Saldo da Venda)
                  </span>
                  <p className="text-2xl font-black text-purple-950">{formatBRL(total)}</p>
                </div>
                <span className="rounded-lg bg-purple-200/60 px-2 py-1 text-[11px] font-bold text-purple-900">
                  Preenchimento Automático
                </span>
              </div>

              {/* Nome do Cliente (Obrigatório) */}
              <div>
                <label className="block text-xs font-bold text-stone-900">
                  Nome do Cliente * (Obrigatório)
                </label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    required
                    value={debtCustomerName}
                    onChange={(e) => setDebtCustomerName(e.target.value)}
                    placeholder="Ex: Dra. Beatriz Mendes"
                    className="w-full rounded-xl border border-stone-200 py-2 pl-9 pr-3 text-xs font-bold text-stone-900 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Telefone e CPF */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700">
                    Telefone / WhatsApp (Opcional)
                  </label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                    <input
                      type="text"
                      value={debtCustomerPhone}
                      onChange={(e) => setDebtCustomerPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full rounded-xl border border-stone-200 py-2 pl-9 pr-3 text-xs text-stone-900 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">
                    CPF do Cliente (Opcional)
                  </label>
                  <input
                    type="text"
                    value={debtCustomerCpf}
                    onChange={(e) => setDebtCustomerCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="mt-1 w-full rounded-xl border border-stone-200 py-2 px-3 text-xs text-stone-900 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Endereço do Cliente (Opcional)
                </label>
                <div className="relative mt-1">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    value={debtCustomerAddress}
                    onChange={(e) => setDebtCustomerAddress(e.target.value)}
                    placeholder="Rua, número ou estabelecimento vizinho..."
                    className="w-full rounded-xl border border-stone-200 py-2 pl-9 pr-3 text-xs text-stone-900 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Observações do Vendedor (OBRIGATÓRIO) */}
              <div>
                <label className="block text-xs font-bold text-stone-900">
                  Observações do Vendedor * (Campo Obrigatório)
                </label>
                <textarea
                  required
                  rows={2}
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  placeholder="Registre obrigatoriamente a justificativa e prazo acordado..."
                  className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-xs text-stone-900 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-200 text-xs text-stone-500 flex items-center justify-between">
                <span>Vendedor: <strong>{currentUser?.name}</strong></span>
                <span>Data: {new Date().toLocaleDateString('pt-BR')}</span>
              </div>

              <div className="flex gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsDevendoModalOpen(false)}
                  className="w-1/2 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
                >
                  Confirmar Pendência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPROVANTE DE VENDA OU RASCUNHO */}
      {finishedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
                  finishedOrder.status === 'preparing'
                    ? 'bg-amber-100 text-amber-800'
                    : finishedOrder.payments[0]?.method === 'devendo'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {finishedOrder.status === 'preparing' ? (
                  <AlertCircle className="h-6 w-6" />
                ) : finishedOrder.payments[0]?.method === 'devendo' ? (
                  <FileText className="h-6 w-6" />
                ) : (
                  <CheckCircle2 className="h-6 w-6" />
                )}
              </div>
              <h3 className="mt-3 text-base font-black text-stone-900">
                {finishedOrder.status === 'preparing'
                  ? 'Venda Salva como Rascunho Local'
                  : finishedOrder.payments[0]?.method === 'devendo'
                  ? 'Venda Registrada como DEVENDO'
                  : 'Venda Concluída com Sucesso!'}
              </h3>
              <p className="text-xs text-stone-500">Pedido #{finishedOrder.orderNumber}</p>

              {finishedOrder.status === 'preparing' && (
                <div className="mt-2 rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-amber-800 border border-amber-200">
                  ⚠️ Salvo na fila offline do dispositivo. Será validado oficialmente pela Matriz assim que a conexão for restabelecida.
                </div>
              )}
            </div>

            {/* Recibo Didático */}
            <div className="mt-4 rounded-2xl bg-stone-50 p-4 text-xs font-mono border border-dashed border-stone-300 space-y-1.5">
              <div className="text-center font-bold text-stone-800">
                {currentTenant.name}
              </div>
              <div className="text-center text-[10px] text-stone-500">
                {currentTenant.document} • {formatDateTimeBR(finishedOrder.createdAt)}
              </div>
              <div className="border-t border-dashed border-stone-300 my-2" />
              {finishedOrder.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-stone-700">
                  <span>{i.quantity}x {i.productName}</span>
                  <span>{formatBRL(i.total)}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-stone-300 my-2" />
              <div className="flex justify-between font-bold text-stone-900 text-sm">
                <span>VALOR DA VENDA</span>
                <span>{formatBRL(finishedOrder.total)}</span>
              </div>
              <div className="text-[10px] font-bold text-stone-600 text-center mt-2 uppercase">
                Forma: {finishedOrder.payments[0]?.method}
                {finishedOrder.customerName && ` • Cliente: ${finishedOrder.customerName}`}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex w-1/2 items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir
              </button>
              <button
                onClick={() => setFinishedOrder(null)}
                className="w-1/2 rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800"
              >
                Nova Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VENDAS RECENTES & TESTE DE BLOQUEIO DE CANCELAMENTO */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Histórico Recente de Vendas</h3>
                <p className="text-xs text-stone-500">
                  Cancelamento de vendas finalizadas é de autoridade exclusiva da Matriz
                </p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-stone-100 space-y-2">
              {orders.slice(0, 10).map((ord) => (
                <div key={ord.id} className="pt-2 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">Pedido #{ord.orderNumber}</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-600 font-bold uppercase">
                        {ord.payments[0]?.method || 'dinheiro'}
                      </span>
                      {ord.status === 'cancelled' && (
                        <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] text-rose-800 font-bold">
                          Cancelado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      {formatDateTimeBR(ord.createdAt)} • Atendente: {ord.waiterName || 'Balcão'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900 text-sm">{formatBRL(ord.total)}</span>
                    {(ord.receiptImageUrl || ord.payments[0]?.receiptImageUrl) && (
                      <button
                        onClick={() => setViewingReceiptOrder(ord)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-1"
                        title="Visualizar fotografia do comprovante"
                      >
                        <Camera className="h-3 w-3 text-emerald-600" />
                        <span>Foto</span>
                      </button>
                    )}
                    {ord.status !== 'cancelled' && (
                      <button
                        onClick={() => handleAttemptCancel(ord)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                        title="Tentar cancelar venda"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA SELEÇÃO DE COMPROVANTES EXEMPLO (PIX / DINHEIRO) */}
      {showPresetReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-stone-900 text-sm">Comprovantes Demonstrativos</h3>
              </div>
              <button
                onClick={() => setShowPresetReceiptModal(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-stone-500">
              Escolha um comprovante real pré-otimizado para testar sem necessidade de câmera física:
            </p>

            <div className="mt-3 space-y-2">
              {PRESET_RECEIPT_PHOTOS.map((rec, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePickPresetReceipt(rec.url)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 p-2.5 text-left hover:border-amber-500 hover:bg-amber-50/40 transition group"
                >
                  <img
                    src={rec.url}
                    alt={rec.name}
                    className="h-14 w-14 rounded-xl object-cover border border-stone-200 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-stone-900 group-hover:text-amber-900">
                      {rec.name}
                    </p>
                    <p className="text-[11px] text-stone-500 line-clamp-1">{rec.description}</p>
                    <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.2 text-[9px] font-bold text-stone-600 uppercase">
                      {rec.type === 'pix' ? 'Transferência PIX' : 'Espécie (Dinheiro)'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DE COMPROVANTE (IMUTÁVEL NA MATRIZ) */}
      {viewingReceiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-sm">
                  Comprovante de Pagamento Anexado
                </h3>
                <p className="text-xs text-stone-500">
                  Pedido #{viewingReceiptOrder.orderNumber} • {formatBRL(viewingReceiptOrder.total)}
                </p>
              </div>
              <button
                onClick={() => setViewingReceiptOrder(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Imagem do Comprovante */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 flex items-center justify-center max-h-72">
              <img
                src={viewingReceiptOrder.receiptImageUrl || viewingReceiptOrder.payments[0]?.receiptImageUrl}
                alt="Comprovante"
                className="max-h-72 w-auto object-contain"
              />
            </div>

            {/* Metadados e Trilha de Segurança */}
            <div className="mt-3.5 space-y-1.5 rounded-2xl bg-stone-50 p-3 text-xs border border-stone-200">
              <div className="flex justify-between">
                <span className="text-stone-500">Forma de Pagamento:</span>
                <strong className="uppercase text-stone-800">
                  {viewingReceiptOrder.payments[0]?.method}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Vendedor Responsável:</span>
                <strong className="text-stone-800">
                  {viewingReceiptOrder.receiptSellerName || viewingReceiptOrder.waiterName || 'Balcão'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Data e Horário:</span>
                <strong className="text-stone-800">
                  {formatDateTimeBR(viewingReceiptOrder.receiptCapturedAt || viewingReceiptOrder.createdAt)}
                </strong>
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-amber-50 p-2 text-center text-[11px] font-bold text-amber-900 border border-amber-200">
              🔒 Comprovante armazenado fisicamente na Matriz. Imutável e protegido contra substituição por terminais.
            </div>

            <button
              onClick={() => setViewingReceiptOrder(null)}
              className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800"
            >
              Fechar Visualização
            </button>
          </div>
        </div>
      )}

      {/* POPUP DE BLOQUEIO DE SEGURANÇA (EXIBE AVISO RIGOROSO QUANDO VENDEDOR TENTA CANCELAR) */}
      {securityBlockMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-rose-300 bg-white p-6 shadow-2xl text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <h3 className="mt-3 text-base font-black text-rose-950">Ação Bloqueada</h3>
            <p className="mt-2 text-xs font-medium text-stone-600 leading-relaxed">
              {securityBlockMessage}
            </p>
            <div className="mt-4 rounded-xl bg-stone-50 p-2.5 border border-stone-200 text-[11px] text-stone-500">
              Regra de Integridade: Somente a <strong>{matrizInfo.activeHostLabel}</strong> pode autorizar cancelamentos oficiais.
            </div>
            <button
              onClick={() => setSecurityBlockMessage(null)}
              className="mt-5 w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800 transition"
            >
              Compreendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
