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

export type PaymentMethod = 'dinheiro' | 'pix' | 'devendo';

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

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: number;
  type: OrderType;
  status: OrderStatus;
  tableNumber?: number;
  tableId?: string;
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
  status: TableStatus;
  capacity: number;
  currentOrderId?: string;
  currentTotal: number;
  openedAt?: string;
  waiterId?: string;
  waiterName?: string;
  customerName?: string;
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
