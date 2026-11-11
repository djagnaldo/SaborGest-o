/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'manager' | 'cashier' | 'waiter';

export interface UserPermission {
  canAccessAdminPanel: boolean;
  canViewReports: boolean;
  canViewFinancials: boolean;
  canManageProducts: boolean;
  canManageStock: boolean;
  canChangePrices: boolean;
  canCancelOrders: boolean;
  canDeleteSales: boolean;
  canOpenCloseCash: boolean;
  canApplyDiscounts: boolean;
  canManageTeam: boolean;
  canManageSettings: boolean;
}

export interface UserProfile {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatarUrl?: string;
  active: boolean;
  canSell?: boolean; // Permissão para vender (LIGADA / DESLIGADA)
  status?: 'autorizado' | 'bloqueado';
  accessCode?: string; // Código individual ou PIN
  qrToken?: string; // Token único de pareamento do dispositivo
  deviceModel?: string;
  lastSyncAt?: string;
  commissionRate: number; // e.g. 5%
  salesTargetMonthly?: number; // e.g. R$ 15.000,00
  permissions: UserPermission;
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
}

export type EstablishmentSegment =
  | 'restaurante'
  | 'bar'
  | 'hamburgueria'
  | 'pizzaria'
  | 'lanchonete'
  | 'cafeteria'
  | 'outro';

export interface TenantSettings {
  allowNegativeStock: boolean;
  serviceFeePercentage: number; // e.g. 10%
  couvertFee?: number;
  printAutoOnOrder: boolean;
  requireTableWaiter: boolean;
  currency: string;
  taxDocument?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  pixReceiptRule?: 'disabled' | 'optional' | 'required';
  cashReceiptRule?: 'disabled' | 'optional' | 'required';
}

export interface Tenant {
  id: string;
  name: string;
  tradeName: string;
  document: string; // CNPJ / CPF
  phone: string;
  address: string;
  segment: EstablishmentSegment;
  ownerId: string;
  ownerEmail: string;
  settings: TenantSettings;
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  icon?: string;
  color?: string;
  order: number;
  active: boolean;
  createdAt: string;
  isDemo?: boolean;
}

export interface RecipeIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string; // g, ml, un
  costEstimated: number;
}

export interface ProductVariation {
  id: string;
  name: string; // e.g. "Pequeno", "Médio", "Grande" ou "500ml"
  price: number;
  costPrice?: number;
}

export interface ProductAddon {
  id: string;
  name: string; // e.g. "Bacon Extra", "Borda Recheada"
  price: number;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  internalCode: string;
  barcode?: string;
  categoryId: string;
  description: string;
  imageUrl?: string;
  costPrice: number;
  sellingPrice: number;
  profitMargin: number; // calculada: ((sellingPrice - costPrice) / sellingPrice) * 100
  unit: 'un' | 'kg' | 'g' | 'l' | 'ml' | 'porcao' | 'fatia';
  stockQuantity: number;
  minStock: number;
  supplierId?: string;
  active: boolean;
  isComposite: boolean; // se possui ficha técnica / ingredientes
  recipe?: RecipeIngredient[];
  variations?: ProductVariation[];
  addons?: ProductAddon[];
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
}

export type OrderType = 'counter' | 'table' | 'comanda';

export type OrderStatus =
  | 'received'
  | 'preparing'
  | 'ready'
  | 'closed'
  | 'cancelled';

export type PaymentMethod = 'dinheiro' | 'pix' | 'devendo' | 'pendente';

export interface DebtRecord {
  id: string;
  tenantId: string;
  orderId: string;
  orderNumber: number;
  customerName: string;
  customerPhone?: string;
  customerCpf?: string;
  customerAddress?: string;
  amount: number;
  amountPaid: number;
  remainingAmount: number;
  notes: string; // Obrigatório para o vendedor
  sellerId: string;
  sellerName: string;
  status: 'pendente' | 'parcial' | 'quitado';
  createdAt: string;
  settledAt?: string;
  settledBy?: string;
  settlementHistory: {
    id: string;
    amount: number;
    paymentMethod: 'dinheiro' | 'pix';
    date: string;
    receivedBy: string;
    notes?: string;
  }[];
  isDemo?: boolean;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  variationName?: string;
  selectedAddons?: { name: string; price: number }[];
  notes?: string;
  total: number;
}

export interface OrderPayment {
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number;
  change?: number;
  debtRecordId?: string;
  receiptImageUrl?: string;
  receiptType?: 'pix' | 'cash';
  receiptCapturedAt?: string;
  receiptSellerName?: string;
}

export interface TableExtraCharge {
  id: string;
  tableId: string;
  tableNumberOrName: string;
  amount: number;
  description: string;
  isCashWithdrawal: boolean; // Houve saída de dinheiro da gaveta do caixa
  createdAt: string;
  createdById: string;
  createdByName: string;
  financialTxId?: string; // ID da saída registrada no controle de gastos/caixa
  status: 'active' | 'cancelled';
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
}

export interface TableTimer {
  durationMinutes: number;
  startedAt: string; // ISO
  targetTime: string; // ISO
  pausedRemainingSeconds?: number;
  isPaused?: boolean;
  isExpired?: boolean;
  acknowledged?: boolean;
  setById: string;
  setByName: string;
}

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: number;
  type: OrderType;
  status: OrderStatus;
  tableNumber?: number;
  tableId?: string;
  tableName?: string;
  comandaNumber?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  waiterId?: string;
  waiterName?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  serviceFee: number;
  extraTotal?: number;
  extraCharges?: TableExtraCharge[];
  total: number;
  payments: OrderPayment[];
  paid: boolean;
  notes?: string;
  receiptImageUrl?: string;
  receiptCapturedAt?: string;
  receiptSellerName?: string;
  isDraft?: boolean;
  pendingValidation?: boolean;
  createdAt: string;
  closedAt?: string;
  isDemo?: boolean;
}

export type NotificationType =
  | 'product_created'
  | 'photo_updated'
  | 'price_changed'
  | 'stock_updated'
  | 'product_unavailable'
  | 'permissions_updated'
  | 'system_update';

export interface TerminalNotification {
  id: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  entityId?: string;
  read: boolean;
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  payload?: any;
}

export interface DeltaSyncStats {
  totalBytesDownloaded: number;
  totalBytesSaved: number;
  deltaEventsCount: number;
  lastDeltaSyncAt: string;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'closing';

export interface RestaurantTable {
  id: string;
  tenantId: string;
  number: number;
  label?: string;
  customerName?: string;
  isNamedTable?: boolean; // Se foi criada com identificação nominal do cliente
  status: TableStatus;
  capacity: number;
  currentOrderId?: string;
  currentTotal: number;
  productsTotal?: number;
  extraTotal?: number;
  extraCharges?: TableExtraCharge[];
  activeOrdersCount?: number;
  timer?: TableTimer;
  openedAt?: string;
  waiterId?: string;
  waiterName?: string;
  isDemo?: boolean;
}

export interface CashRegisterSession {
  id: string;
  tenantId: string;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  status: 'open' | 'closed';
  initialAmount: number;
  totalCash: number;
  totalPix: number;
  totalDevendo: number; // fiado / dívidas registradas
  totalWithdrawals: number; // sangria
  totalDeposits: number; // reforço / suprimento
  expectedAmount: number;
  countedAmount?: number;
  discrepancy?: number;
  notes?: string;
  isDemo?: boolean;
}

export interface FinancialTransaction {
  id: string;
  tenantId: string;
  type: 'expense_fixed' | 'expense_variable' | 'revenue' | 'withdrawal' | 'deposit';
  category: string;
  description: string;
  amount: number;
  date: string;
  dueDate?: string;
  paid: boolean;
  paymentMethod?: PaymentMethod;
  cashRegisterId?: string;
  userId: string;
  userName: string;
  notes?: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  totalSpent: number;
  pendingCredit: number; // saldo fiado
  ordersCount: number;
  createdAt: string;
  isDemo?: boolean;
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  document?: string;
  phone: string;
  email?: string;
  address?: string;
  category: string;
  pendingBalance: number;
  createdAt: string;
  isDemo?: boolean;
}

export interface InventoryTransaction {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  type: 'purchase' | 'sale' | 'waste' | 'adjustment';
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number;
  reason?: string;
  userId: string;
  userName: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  ip?: string;
  timestamp: string;
}

export type ReportType =
  | 'vendas'
  | 'produtos'
  | 'estoque'
  | 'movimentacoes_estoque'
  | 'recebimentos'
  | 'gastos'
  | 'mesas'
  | 'vendedores'
  | 'financeiro_geral';

export type ReportPeriodType =
  | 'diario'
  | 'semanal'
  | 'mensal'
  | 'anual'
  | 'personalizado';

export interface SavedReport {
  id: string;
  tenantId: string;
  title: string;
  type: ReportType;
  periodType: ReportPeriodType;
  startDate: string;
  endDate: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  establishmentName: string;
  establishmentDocument?: string;
  summary: Record<string, any>;
  items: any[];
  notes?: string;
  isDemo?: boolean;
}

export interface ArchivedPeriod {
  id: string;
  tenantId: string;
  label: string;
  periodType: ReportPeriodType;
  startDate: string;
  endDate: string;
  archivedAt: string;
  archivedById: string;
  archivedByName: string;
  notes?: string;
  metrics: {
    totalRevenue: number;
    ordersCount: number;
    cashTotal: number;
    pixTotal: number;
    expensesTotal: number;
    netProfit: number;
    itemsSold: number;
  };
  snapshot: {
    orders: Order[];
    products: Product[];
    inventoryTransactions: InventoryTransaction[];
    expenses: FinancialTransaction[];
    tables: RestaurantTable[];
    cashSessions: CashRegisterSession[];
  };
  isProtected: boolean;
  isDemo?: boolean;
}

export interface SystemBackup {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  scopePeriod?: string;
  version: string;
  sizeBytes: number;
  stats: {
    ordersCount: number;
    productsCount: number;
    tablesCount: number;
    expensesCount: number;
    inventoryTxCount: number;
    usersCount: number;
    photosCount: number;
  };
  payload: {
    tenant: Tenant;
    products: Product[];
    categories: Category[];
    tables: RestaurantTable[];
    orders: Order[];
    expenses: FinancialTransaction[];
    cashSessions: CashRegisterSession[];
    inventoryTransactions: InventoryTransaction[];
    users: UserProfile[];
    savedReports: SavedReport[];
    archivedPeriods: ArchivedPeriod[];
    themeConfig?: SystemThemeConfig;
  };
  checksum: string;
  cloudSynced?: boolean;
  isDemo?: boolean;
}

export interface SystemThemeConfig {
  posColor: string; // Cor da seção de vendas (Hex)
  inventoryColor: string; // Cor da seção de estoque (Hex)
  productsColor: string; // Cor da seção de produtos (Hex)
  tablesColor: string; // Cor da seção de mesas (Hex)
  cashColor: string; // Cor da seção de caixa (Hex)
  expensesColor: string; // Cor da seção de gastos (Hex)
  reportsColor: string; // Cor da seção de relatórios (Hex)
  primaryButtonColor: string; // Cor dos botões principais (Hex)
  statusColor: string; // Cor de destaque e identificação dos status (Hex)
  updatedAt: string;
  updatedById: string;
}

export interface ResetOperationOptions {
  resetTables: boolean;
  resetProducts: boolean;
  resetStock: boolean;
  resetSales: boolean;
  resetExpenses: boolean;
  resetMovements: boolean;
  createBackupFirst: boolean;
  confirmationText: string;
  reason?: string;
}
