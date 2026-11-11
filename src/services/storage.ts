/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Tenant,
  UserProfile,
  Category,
  Product,
  RestaurantTable,
  Order,
  OrderItem,
  CashRegisterSession,
  Customer,
  Supplier,
  FinancialTransaction,
  InventoryTransaction,
  AuditLog,
  DebtRecord,
} from '../types';
import {
  INITIAL_DEMO_TENANT,
  INITIAL_DEMO_USERS,
  INITIAL_DEMO_CATEGORIES,
  INITIAL_DEMO_PRODUCTS,
  INITIAL_DEMO_TABLES,
  INITIAL_DEMO_ORDERS,
  INITIAL_DEMO_DEBTS,
  INITIAL_DEMO_CASH_SESSION,
  INITIAL_DEMO_CUSTOMERS,
  INITIAL_DEMO_SUPPLIERS,
} from './mock-data';

const STORAGE_KEYS = {
  TENANTS: 'sabor_tenants',
  USERS: 'sabor_users',
  CATEGORIES: 'sabor_categories',
  PRODUCTS: 'sabor_products',
  TABLES: 'sabor_tables',
  ORDERS: 'sabor_orders',
  DEBTS: 'sabor_debts',
  CASH: 'sabor_cash',
  CUSTOMERS: 'sabor_customers',
  SUPPLIERS: 'sabor_suppliers',
  FINANCIAL: 'sabor_financial',
  INVENTORY: 'sabor_inventory',
  AUDIT: 'sabor_audit',
  ACTIVE_TENANT_ID: 'sabor_active_tenant_id',
  ACTIVE_USER_ID: 'sabor_active_user_id',
};

function getStorage<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error reading ${key} from storage:`, e);
    return defaultVal;
  }
}

function setStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(`Error writing ${key} to storage:`, e);
  }
}

// Initialize seed data if empty
export function initLocalStorage(): void {
  const tenants = getStorage<Tenant[]>(STORAGE_KEYS.TENANTS, []);
  if (tenants.length === 0) {
    setStorage(STORAGE_KEYS.TENANTS, [INITIAL_DEMO_TENANT]);
    setStorage(STORAGE_KEYS.USERS, INITIAL_DEMO_USERS);
    setStorage(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
    setStorage(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
    setStorage(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
    setStorage(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
    setStorage(STORAGE_KEYS.DEBTS, INITIAL_DEMO_DEBTS);
    setStorage(STORAGE_KEYS.CASH, [INITIAL_DEMO_CASH_SESSION]);
    setStorage(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
    setStorage(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
    setStorage(STORAGE_KEYS.ACTIVE_TENANT_ID, INITIAL_DEMO_TENANT.id);
    setStorage(STORAGE_KEYS.ACTIVE_USER_ID, INITIAL_DEMO_USERS[0].id);
  }
}

// Tenants
export function getTenants(): Tenant[] {
  return getStorage<Tenant[]>(STORAGE_KEYS.TENANTS, [INITIAL_DEMO_TENANT]);
}

export function saveTenant(tenant: Tenant): void {
  const tenants = getTenants();
  const index = tenants.findIndex((t) => t.id === tenant.id);
  if (index >= 0) {
    tenants[index] = { ...tenant, updatedAt: new Date().toISOString() };
  } else {
    tenants.push({ ...tenant, createdAt: new Date().toISOString() });
  }
  setStorage(STORAGE_KEYS.TENANTS, tenants);
}

export function getActiveTenantId(): string {
  return getStorage<string>(STORAGE_KEYS.ACTIVE_TENANT_ID, INITIAL_DEMO_TENANT.id);
}

export function setActiveTenantId(id: string): void {
  setStorage(STORAGE_KEYS.ACTIVE_TENANT_ID, id);
}

// Users
export function getUsers(tenantId: string): UserProfile[] {
  const allUsers = getStorage<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_DEMO_USERS);
  return allUsers.filter((u) => u.tenantId === tenantId);
}

export function saveUser(user: UserProfile): void {
  const allUsers = getStorage<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_DEMO_USERS);
  const index = allUsers.findIndex((u) => u.id === user.id);
  if (index >= 0) {
    allUsers[index] = { ...user, updatedAt: new Date().toISOString() };
  } else {
    allUsers.push({ ...user, createdAt: new Date().toISOString() });
  }
  setStorage(STORAGE_KEYS.USERS, allUsers);
}

export function deleteUser(id: string): void {
  const allUsers = getStorage<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_DEMO_USERS);
  const filtered = allUsers.filter((u) => u.id !== id);
  setStorage(STORAGE_KEYS.USERS, filtered);
}

export function getActiveUserId(): string {
  return getStorage<string>(STORAGE_KEYS.ACTIVE_USER_ID, INITIAL_DEMO_USERS[0].id);
}

export function setActiveUserId(id: string): void {
  setStorage(STORAGE_KEYS.ACTIVE_USER_ID, id);
}

// Categories
export function getCategories(tenantId: string): Category[] {
  const all = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
  return all.filter((c) => c.tenantId === tenantId);
}

export function saveCategory(category: Category): void {
  const all = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
  const index = all.findIndex((c) => c.id === category.id);
  if (index >= 0) {
    all[index] = category;
  } else {
    all.push(category);
  }
  setStorage(STORAGE_KEYS.CATEGORIES, all);
}

export function deleteCategory(id: string): void {
  const all = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
  setStorage(STORAGE_KEYS.CATEGORIES, all.filter((c) => c.id !== id));
}

// Products
export function getProducts(tenantId: string): Product[] {
  const all = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  // Garante que cada produto demo possua fotografia
  const enriched = all.map((p) => {
    if (!p.imageUrl) {
      const match = INITIAL_DEMO_PRODUCTS.find((demo) => demo.id === p.id);
      if (match?.imageUrl) {
        return { ...p, imageUrl: match.imageUrl };
      }
    }
    return p;
  });
  return enriched.filter((p) => p.tenantId === tenantId);
}

export function saveProduct(product: Product): void {
  const all = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  const index = all.findIndex((p) => p.id === product.id);
  if (index >= 0) {
    all[index] = { ...product, updatedAt: new Date().toISOString() };
  } else {
    all.push({ ...product, createdAt: new Date().toISOString() });
  }
  setStorage(STORAGE_KEYS.PRODUCTS, all);
}

export function deleteProduct(id: string): void {
  const all = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  setStorage(STORAGE_KEYS.PRODUCTS, all.filter((p) => p.id !== id));
}

// Validação de estoque oficial na Matriz antes de autorizar a venda
export function validateOrderStock(
  tenantId: string,
  items: OrderItem[]
): { valid: boolean; error?: string } {
  const products = getProducts(tenantId);
  for (const item of items) {
    const prod = products.find((p) => p.id === item.productId);
    if (prod) {
      if ((prod.stockQuantity ?? 0) < item.quantity) {
        return {
          valid: false,
          error: `Estoque insuficiente para "${prod.name}". Disponível na Matriz: ${prod.stockQuantity ?? 0}, Solicitado: ${item.quantity}.`,
        };
      }
    }
  }
  return { valid: true };
}

// Baixa oficial de estoque na Matriz e notificação de atualização delta
export function deductStockForOrder(
  tenantId: string,
  items: OrderItem[]
): { success: boolean; error?: string } {
  const check = validateOrderStock(tenantId, items);
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const all = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  for (const item of items) {
    const idx = all.findIndex((p) => p.id === item.productId && p.tenantId === tenantId);
    if (idx >= 0) {
      const prev = all[idx].stockQuantity ?? 0;
      all[idx] = {
        ...all[idx],
        stockQuantity: Math.max(0, prev - item.quantity),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  setStorage(STORAGE_KEYS.PRODUCTS, all);
  // Dispara evento para atualização imediata de todos os componentes da interface
  window.dispatchEvent(
    new CustomEvent('sabor_local_sync', { detail: { action: 'stock_updated', tenantId } })
  );
  return { success: true };
}

// Tables
export function getTables(tenantId: string): RestaurantTable[] {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  return all.filter((t) => t.tenantId === tenantId);
}

export function saveTable(table: RestaurantTable): void {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === table.id);
  if (index >= 0) {
    all[index] = table;
  } else {
    all.push(table);
  }
  setStorage(STORAGE_KEYS.TABLES, all);
}

// Orders
export function getOrders(tenantId: string): Order[] {
  const all = getStorage<Order[]>(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
  return all.filter((o) => o.tenantId === tenantId);
}

export function saveOrder(order: Order): void {
  const all = getStorage<Order[]>(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
  const index = all.findIndex((o) => o.id === order.id);
  if (index >= 0) {
    all[index] = order;
  } else {
    all.unshift(order);
  }
  setStorage(STORAGE_KEYS.ORDERS, all);
}

// Fiado e Pendências (Debts)
export function getDebts(tenantId: string): DebtRecord[] {
  const all = getStorage<DebtRecord[]>(STORAGE_KEYS.DEBTS, INITIAL_DEMO_DEBTS);
  return all.filter((d) => d.tenantId === tenantId);
}

export function saveDebt(debt: DebtRecord): void {
  const all = getStorage<DebtRecord[]>(STORAGE_KEYS.DEBTS, INITIAL_DEMO_DEBTS);
  const index = all.findIndex((d) => d.id === debt.id);
  if (index >= 0) {
    all[index] = debt;
  } else {
    all.unshift(debt);
  }
  setStorage(STORAGE_KEYS.DEBTS, all);

  // Sincroniza o saldo devedor do cliente se existir
  const customers = getCustomers(debt.tenantId);
  const custIndex = customers.findIndex(
    (c) =>
      c.name.toLowerCase() === debt.customerName.toLowerCase() ||
      (debt.customerPhone && c.phone === debt.customerPhone)
  );

  if (custIndex >= 0) {
    customers[custIndex].pendingCredit = Math.max(
      0,
      (customers[custIndex].pendingCredit || 0) + (debt.remainingAmount || debt.amount)
    );
    setStorage(STORAGE_KEYS.CUSTOMERS, customers);
  } else {
    // Cria o cliente automaticamente se não existia
    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      tenantId: debt.tenantId,
      name: debt.customerName,
      phone: debt.customerPhone || '',
      address: debt.customerAddress || '',
      totalSpent: debt.amount,
      pendingCredit: debt.remainingAmount,
      ordersCount: 1,
      createdAt: new Date().toISOString(),
    };
    customers.push(newCust);
    setStorage(STORAGE_KEYS.CUSTOMERS, customers);
  }
}

export function settleDebt(
  debtId: string,
  amountPaid: number,
  paymentMethod: 'dinheiro' | 'pix',
  notes?: string,
  receivedBy?: string
): DebtRecord {
  const all = getStorage<DebtRecord[]>(STORAGE_KEYS.DEBTS, INITIAL_DEMO_DEBTS);
  const index = all.findIndex((d) => d.id === debtId);
  if (index < 0) {
    throw new Error('Dívida não encontrada');
  }

  const debt = all[index];
  const newAmountPaid = debt.amountPaid + amountPaid;
  const newRemaining = Math.max(0, debt.amount - newAmountPaid);
  const isFullySettled = newRemaining <= 0;

  const settlementEntry = {
    id: `settle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    amount: amountPaid,
    paymentMethod,
    date: new Date().toISOString(),
    receivedBy: receivedBy || 'Administrador',
    notes: notes || 'Recebimento de fiado',
  };

  const updated: DebtRecord = {
    ...debt,
    amountPaid: newAmountPaid,
    remainingAmount: newRemaining,
    status: isFullySettled ? 'quitado' : 'parcial',
    settledAt: isFullySettled ? new Date().toISOString() : debt.settledAt,
    settledBy: isFullySettled ? receivedBy || 'Administrador' : debt.settledBy,
    settlementHistory: [...(debt.settlementHistory || []), settlementEntry],
  };

  all[index] = updated;
  setStorage(STORAGE_KEYS.DEBTS, all);

  // Abate no cadastro do cliente
  const customers = getCustomers(debt.tenantId);
  const custIndex = customers.findIndex(
    (c) =>
      c.name.toLowerCase() === debt.customerName.toLowerCase() ||
      (debt.customerPhone && c.phone === debt.customerPhone)
  );
  if (custIndex >= 0) {
    customers[custIndex].pendingCredit = Math.max(0, customers[custIndex].pendingCredit - amountPaid);
    setStorage(STORAGE_KEYS.CUSTOMERS, customers);
  }

  // Registra no Caixa ativo se houver sessão aberta
  const cashSessions = getCashSessions(debt.tenantId);
  const activeSession = cashSessions.find((c) => c.status === 'open');
  if (activeSession) {
    if (paymentMethod === 'dinheiro') {
      activeSession.totalCash += amountPaid;
      activeSession.expectedAmount += amountPaid;
    } else {
      activeSession.totalPix += amountPaid;
    }
    saveCashSession(activeSession);
  }

  // Log de Auditoria
  addAuditLog({
    tenantId: debt.tenantId,
    userId: 'admin',
    userName: receivedBy || 'Administrador',
    action: 'BAIXA_FIADO',
    details: `Recebeu ${amountPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} via ${paymentMethod.toUpperCase()} da pendência do cliente ${debt.customerName}. Restante: ${newRemaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
  });

  return updated;
}

// Cash Registers
export function getCashSessions(tenantId: string): CashRegisterSession[] {
  const all = getStorage<CashRegisterSession[]>(STORAGE_KEYS.CASH, [INITIAL_DEMO_CASH_SESSION]);
  return all.filter((c) => c.tenantId === tenantId);
}

export function saveCashSession(session: CashRegisterSession): void {
  const all = getStorage<CashRegisterSession[]>(STORAGE_KEYS.CASH, [INITIAL_DEMO_CASH_SESSION]);
  const index = all.findIndex((c) => c.id === session.id);
  if (index >= 0) {
    all[index] = session;
  } else {
    all.unshift(session);
  }
  setStorage(STORAGE_KEYS.CASH, all);
}

// Customers & Suppliers
export function getCustomers(tenantId: string): Customer[] {
  const all = getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
  return all.filter((c) => c.tenantId === tenantId);
}

export function saveCustomer(customer: Customer): void {
  const all = getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
  const idx = all.findIndex((c) => c.id === customer.id);
  if (idx >= 0) all[idx] = customer;
  else all.push(customer);
  setStorage(STORAGE_KEYS.CUSTOMERS, all);
}

export function getSuppliers(tenantId: string): Supplier[] {
  const all = getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
  return all.filter((s) => s.tenantId === tenantId);
}

export function saveSupplier(supplier: Supplier): void {
  const all = getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
  const idx = all.findIndex((s) => s.id === supplier.id);
  if (idx >= 0) all[idx] = supplier;
  else all.push(supplier);
  setStorage(STORAGE_KEYS.SUPPLIERS, all);
}

// Audit Log
export function addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
  const all = getStorage<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
  const newLog: AuditLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  all.unshift(newLog);
  // Keep last 500 logs
  if (all.length > 500) all.length = 500;
  setStorage(STORAGE_KEYS.AUDIT, all);
}

export function getAuditLogs(tenantId: string): AuditLog[] {
  const all = getStorage<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
  return all.filter((l) => l.tenantId === tenantId);
}

// Clean up DEMO data only (Section 13)
export function removeDemoData(tenantId: string): void {
  const removeDemo = <T extends { isDemo?: boolean; tenantId?: string }>(key: string) => {
    const list = getStorage<T[]>(key, []);
    const filtered = list.filter((item) => !(item.isDemo && item.tenantId === tenantId));
    setStorage(key, filtered);
  };

  removeDemo(STORAGE_KEYS.CATEGORIES);
  removeDemo(STORAGE_KEYS.PRODUCTS);
  removeDemo(STORAGE_KEYS.TABLES);
  removeDemo(STORAGE_KEYS.ORDERS);
  removeDemo(STORAGE_KEYS.DEBTS);
  removeDemo(STORAGE_KEYS.CASH);
  removeDemo(STORAGE_KEYS.CUSTOMERS);
  removeDemo(STORAGE_KEYS.SUPPLIERS);
}

// Reload demo data if user wants to repopulate
export function reloadDemoData(tenantId: string): void {
  removeDemoData(tenantId);
  setStorage(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
  setStorage(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  setStorage(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  setStorage(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
  setStorage(STORAGE_KEYS.DEBTS, INITIAL_DEMO_DEBTS);
  setStorage(STORAGE_KEYS.CASH, [INITIAL_DEMO_CASH_SESSION]);
  setStorage(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
  setStorage(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
}
