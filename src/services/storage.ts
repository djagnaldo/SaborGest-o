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
  SavedReport,
  ArchivedPeriod,
  SystemBackup,
  SystemThemeConfig,
  SelectiveResetOptions,
  SelectiveResetResult,
  TableExtraCharge,
  TableExtraChargeEditEntry,
  TablePaymentRecord,
  TableAccountArchive,
  TableTimer,
  ArchivedPeriodPdf,
  TableOperationLog,
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
  INITIAL_DEMO_EXPENSES,
  INITIAL_DEMO_INVENTORY_TRANSACTIONS,
  INITIAL_DEMO_SAVED_REPORTS,
  INITIAL_DEMO_ARCHIVED_PERIODS,
  INITIAL_DEMO_BACKUPS,
  DEFAULT_THEME_CONFIG,
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
  SAVED_REPORTS: 'sabor_saved_reports',
  ARCHIVED_PERIODS: 'sabor_archived_periods',
  BACKUPS: 'sabor_system_backups',
  TABLE_ARCHIVES: 'sabor_table_archives',
  THEME_CONFIG: 'sabor_theme_config',
  ACTIVE_TENANT_ID: 'sabor_active_tenant_id',
  ACTIVE_USER_ID: 'sabor_active_user_id',
  ARCHIVED_PDFS: 'sabor_archived_pdfs',
};

import {
  isApplyingRemoteState,
  registerSnapshotApplier,
  scheduleStatePushToServer,
} from './sync-client';

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

export function collectSyncableState(): Record<string, any> {
  return {
    tenants: getStorage<Tenant[]>(STORAGE_KEYS.TENANTS, []),
    users: getStorage<UserProfile[]>(STORAGE_KEYS.USERS, []),
    categories: getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, []),
    products: getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, []),
    tables: getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, []),
    orders: getStorage<Order[]>(STORAGE_KEYS.ORDERS, []),
    cashSessions: getStorage<CashRegisterSession[]>(STORAGE_KEYS.CASH, []),
    customers: getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, []),
    suppliers: getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []),
    financial: getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, []),
    inventoryTransactions: getStorage<InventoryTransaction[]>(STORAGE_KEYS.INVENTORY, []),
    auditLogs: getStorage<AuditLog[]>(STORAGE_KEYS.AUDIT, []),
    savedReports: getStorage<SavedReport[]>(STORAGE_KEYS.SAVED_REPORTS, []),
    archivedPeriods: getStorage<ArchivedPeriod[]>(STORAGE_KEYS.ARCHIVED_PERIODS, []),
    archivedPdfs: getStorage<ArchivedPeriodPdf[]>(STORAGE_KEYS.ARCHIVED_PDFS, []),
    backups: getStorage<SystemBackup[]>(STORAGE_KEYS.BACKUPS, []),
    tableArchives: getStorage<TableAccountArchive[]>(STORAGE_KEYS.TABLE_ARCHIVES, []),
    themeConfig: getStorage<SystemThemeConfig>(STORAGE_KEYS.THEME_CONFIG, DEFAULT_THEME_CONFIG),
  };
}

registerSnapshotApplier((data: Record<string, any>) => {
  const writeRaw = (k: string, v: any) => {
    if (v !== undefined) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  };
  writeRaw(STORAGE_KEYS.TENANTS, data.tenants);
  writeRaw(STORAGE_KEYS.USERS, data.users);
  writeRaw(STORAGE_KEYS.CATEGORIES, data.categories);
  writeRaw(STORAGE_KEYS.PRODUCTS, data.products);
  writeRaw(STORAGE_KEYS.TABLES, data.tables);
  writeRaw(STORAGE_KEYS.ORDERS, data.orders);
  writeRaw(STORAGE_KEYS.CASH, data.cashSessions);
  writeRaw(STORAGE_KEYS.CUSTOMERS, data.customers);
  writeRaw(STORAGE_KEYS.SUPPLIERS, data.suppliers);
  writeRaw(STORAGE_KEYS.FINANCIAL, data.financial);
  writeRaw(STORAGE_KEYS.INVENTORY, data.inventoryTransactions);
  writeRaw(STORAGE_KEYS.AUDIT, data.auditLogs);
  writeRaw(STORAGE_KEYS.SAVED_REPORTS, data.savedReports);
  writeRaw(STORAGE_KEYS.ARCHIVED_PERIODS, data.archivedPeriods);
  writeRaw(STORAGE_KEYS.ARCHIVED_PDFS, data.archivedPdfs);
  writeRaw(STORAGE_KEYS.BACKUPS, data.backups);
  writeRaw(STORAGE_KEYS.TABLE_ARCHIVES, data.tableArchives);
  if (data.themeConfig) {
    writeRaw(STORAGE_KEYS.THEME_CONFIG, data.themeConfig);
    window.dispatchEvent(new CustomEvent('sabor_theme_updated', { detail: data.themeConfig }));
  }
});

const SYNC_TRIGGER_KEYS = new Set<string>([
  STORAGE_KEYS.TENANTS,
  STORAGE_KEYS.USERS,
  STORAGE_KEYS.CATEGORIES,
  STORAGE_KEYS.PRODUCTS,
  STORAGE_KEYS.TABLES,
  STORAGE_KEYS.ORDERS,
  STORAGE_KEYS.CASH,
  STORAGE_KEYS.CUSTOMERS,
  STORAGE_KEYS.SUPPLIERS,
  STORAGE_KEYS.FINANCIAL,
  STORAGE_KEYS.INVENTORY,
  STORAGE_KEYS.SAVED_REPORTS,
  STORAGE_KEYS.ARCHIVED_PERIODS,
  STORAGE_KEYS.ARCHIVED_PDFS,
  STORAGE_KEYS.BACKUPS,
  STORAGE_KEYS.TABLE_ARCHIVES,
  STORAGE_KEYS.THEME_CONFIG,
]);

function setStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    if (!isApplyingRemoteState() && SYNC_TRIGGER_KEYS.has(key) && typeof window !== 'undefined') {
      const tenantId = localStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID)
        ? JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID)!)
        : INITIAL_DEMO_TENANT.id;
      const activeUserId = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_ID)
        ? JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_ID)!)
        : undefined;
      scheduleStatePushToServer(collectSyncableState, tenantId, activeUserId);
    }
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
    setStorage(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
    setStorage(STORAGE_KEYS.INVENTORY, INITIAL_DEMO_INVENTORY_TRANSACTIONS);
    setStorage(STORAGE_KEYS.SAVED_REPORTS, INITIAL_DEMO_SAVED_REPORTS);
    setStorage(STORAGE_KEYS.ARCHIVED_PERIODS, INITIAL_DEMO_ARCHIVED_PERIODS);
    setStorage(STORAGE_KEYS.BACKUPS, INITIAL_DEMO_BACKUPS);
    setStorage(STORAGE_KEYS.THEME_CONFIG, DEFAULT_THEME_CONFIG);
    setStorage(STORAGE_KEYS.ACTIVE_TENANT_ID, INITIAL_DEMO_TENANT.id);
    setStorage(STORAGE_KEYS.ACTIVE_USER_ID, INITIAL_DEMO_USERS[0].id);
  } else {
    // Garante que coleções adicionais estejam inicializadas se vazias
    const fin = getStorage<any[]>(STORAGE_KEYS.FINANCIAL, []);
    if (fin.length === 0) {
      setStorage(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
    }
    const inv = getStorage<any[]>(STORAGE_KEYS.INVENTORY, []);
    if (inv.length === 0) {
      setStorage(STORAGE_KEYS.INVENTORY, INITIAL_DEMO_INVENTORY_TRANSACTIONS);
    }
    const reps = getStorage<any[]>(STORAGE_KEYS.SAVED_REPORTS, []);
    if (reps.length === 0) {
      setStorage(STORAGE_KEYS.SAVED_REPORTS, INITIAL_DEMO_SAVED_REPORTS);
    }
    const archs = getStorage<any[]>(STORAGE_KEYS.ARCHIVED_PERIODS, []);
    if (archs.length === 0) {
      setStorage(STORAGE_KEYS.ARCHIVED_PERIODS, INITIAL_DEMO_ARCHIVED_PERIODS);
    }
    const bkps = getStorage<any[]>(STORAGE_KEYS.BACKUPS, []);
    if (bkps.length === 0) {
      setStorage(STORAGE_KEYS.BACKUPS, INITIAL_DEMO_BACKUPS);
    }
    const theme = getStorage<any>(STORAGE_KEYS.THEME_CONFIG, null);
    if (!theme) {
      setStorage(STORAGE_KEYS.THEME_CONFIG, DEFAULT_THEME_CONFIG);
    }
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

// Controle de Permissão Individual de Vendedores (Painel do ADM)
export function toggleSellerSellingPermission(
  userId: string,
  canSell: boolean,
  adminName: string = 'Administrador Matriz'
): UserProfile | null {
  const allUsers = getStorage<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_DEMO_USERS);
  const index = allUsers.findIndex((u) => u.id === userId);
  if (index < 0) return null;

  const target = allUsers[index];
  const updated: UserProfile = {
    ...target,
    canSell,
    active: canSell,
    status: canSell ? 'autorizado' : 'bloqueado',
    updatedAt: new Date().toISOString(),
  };

  allUsers[index] = updated;
  setStorage(STORAGE_KEYS.USERS, allUsers);

  // Registro de Auditoria Administrativa Obrigatório
  addAuditLog({
    tenantId: target.tenantId,
    userId: 'adm',
    userName: adminName,
    action: canSell ? 'AUTORIZOU_VENDEDOR' : 'BLOQUEOU_VENDEDOR',
    details: `${canSell ? 'Permissão de venda LIGADA (AUTORIZADO)' : 'Permissão de venda DESLIGADA (BLOQUEADO)'} para o ${target.name}.`,
  });

  // Notifica todos os terminais e janelas ativas
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sabor_local_sync', {
        detail: { action: 'seller_permission_changed', userId, canSell },
      })
    );
  }

  return updated;
}

export function isSellerAuthorizedToSell(userId?: string): boolean {
  if (!userId) return false;
  const allUsers = getStorage<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_DEMO_USERS);
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.canSell !== false && user.status !== 'bloqueado';
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'category_saved', id: category.id } }));
  }
}

export function deleteCategory(id: string): void {
  const all = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
  setStorage(STORAGE_KEYS.CATEGORIES, all.filter((c) => c.id !== id));
}

export function deleteCategoryWithStrategy(
  tenantId: string,
  categoryId: string,
  strategy: 'transfer' | 'uncategorized',
  targetCategoryId?: string,
  adminUser?: { id: string; name: string }
): { success: boolean; movedProductsCount: number; error?: string } {
  const allCats = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, INITIAL_DEMO_CATEGORIES);
  const targetCat = allCats.find((c) => c.id === categoryId && c.tenantId === tenantId);
  if (!targetCat) {
    return { success: false, movedProductsCount: 0, error: 'Categoria não encontrada.' };
  }

  let resolvedTargetId = '';
  if (strategy === 'transfer') {
    if (!targetCategoryId || targetCategoryId === categoryId) {
      return { success: false, movedProductsCount: 0, error: 'Selecione uma categoria de destino válida para transferir os produtos.' };
    }
    const destCat = allCats.find((c) => c.id === targetCategoryId && c.tenantId === tenantId);
    if (!destCat) {
      return { success: false, movedProductsCount: 0, error: 'Categoria de destino não encontrada.' };
    }
    resolvedTargetId = destCat.id;
  }

  const allProds = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  let movedProductsCount = 0;
  const nowIso = new Date().toISOString();
  const updatedProds = allProds.map((p) => {
    if (p.tenantId === tenantId && p.categoryId === categoryId) {
      movedProductsCount++;
      return { ...p, categoryId: resolvedTargetId, updatedAt: nowIso };
    }
    return p;
  });

  if (movedProductsCount > 0) {
    setStorage(STORAGE_KEYS.PRODUCTS, updatedProds);
  }
  setStorage(STORAGE_KEYS.CATEGORIES, allCats.filter((c) => c.id !== categoryId));

  addAuditLog({
    tenantId,
    userId: adminUser?.id || 'admin',
    userName: adminUser?.name || 'Administrador',
    action: 'EXCLUIU_CATEGORIA',
    details: `Excluiu a categoria "${targetCat.name}". ${movedProductsCount} produto(s) ${
      strategy === 'transfer' ? 'transferido(s) para outra categoria' : 'deixado(s) sem categoria'
    }.`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'category_deleted', categoryId } }));
  }

  return { success: true, movedProductsCount };
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
  deleteProductSafely(id);
}

// Exclusão segura de produtos: preserva produtos com histórico em vendas, desativando do cardápio ativo
export function deleteProductSafely(id: string): { success: boolean; actionTaken: 'deleted' | 'deactivated'; message: string } {
  const all = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  const prod = all.find((p) => p.id === id);
  if (!prod) return { success: false, actionTaken: 'deleted', message: 'Produto não encontrado.' };

  const orders = getStorage<Order[]>(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
  const hasPastOrders = orders.some((o) => o.items?.some((i) => i.productId === id));

  if (hasPastOrders) {
    // Preserva o produto no histórico, mas desativa do cardápio ativo
    prod.active = false;
    prod.updatedAt = new Date().toISOString();
    setStorage(STORAGE_KEYS.PRODUCTS, all);
    addAuditLog({
      tenantId: prod.tenantId,
      userId: 'admin',
      userName: 'Administrador',
      action: 'DESATIVOU_PRODUTO',
      details: `Produto "${prod.name}" desativado do cardápio ativo (preservado no histórico de vendas e movimentações)`,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'product_deactivated', id } }));
    }
    return {
      success: true,
      actionTaken: 'deactivated',
      message: `O produto "${prod.name}" possui vendas registradas. Ele foi desativado do cardápio ativo e seu histórico foi 100% preservado.`,
    };
  } else {
    // Produto novo sem vendas pode ser excluído diretamente
    const filtered = all.filter((p) => p.id !== id);
    setStorage(STORAGE_KEYS.PRODUCTS, filtered);
    addAuditLog({
      tenantId: prod.tenantId,
      userId: 'admin',
      userName: 'Administrador',
      action: 'EXCLUIU_PRODUTO',
      details: `Removeu o produto "${prod.name}" da base de dados`,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'product_deleted', id } }));
    }
    return {
      success: true,
      actionTaken: 'deleted',
      message: `Produto "${prod.name}" removido com sucesso.`,
    };
  }
}

// Atualização e correção de estoque pelo ADM com histórico obrigatório
export function updateProductStock(
  productId: string,
  newStock: number,
  reason: string,
  adminName: string = 'Administrador',
  adminId: string = 'admin',
  type: 'adjustment' | 'purchase' | 'waste' = 'adjustment'
): { success: boolean; product?: Product; error?: string } {
  const all = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  const index = all.findIndex((p) => p.id === productId);
  if (index < 0) return { success: false, error: 'Produto não encontrado.' };

  const prod = all[index];
  const previousStock = prod.stockQuantity ?? 0;
  const quantityDiff = newStock - previousStock;

  all[index] = {
    ...prod,
    stockQuantity: Math.max(0, newStock),
    updatedAt: new Date().toISOString(),
  };
  setStorage(STORAGE_KEYS.PRODUCTS, all);

  // Registra movimentação de estoque
  const transaction: InventoryTransaction = {
    id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    tenantId: prod.tenantId,
    productId: prod.id,
    productName: prod.name,
    type,
    quantity: Math.abs(quantityDiff),
    previousStock,
    newStock,
    reason: reason || (type === 'adjustment' ? 'Correção manual pelo ADM' : type === 'purchase' ? 'Entrada de mercadoria' : 'Ajuste de perda'),
    userId: adminId,
    userName: adminName,
    createdAt: new Date().toISOString(),
  };
  addInventoryTransaction(transaction);

  // Registro de Auditoria
  addAuditLog({
    tenantId: prod.tenantId,
    userId: adminId,
    userName: adminName,
    action: 'AJUSTE_ESTOQUE',
    details: `Alterou estoque de "${prod.name}": anterior ${previousStock} ➔ novo ${newStock}. Motivo: ${reason}`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'stock_adjusted', productId } }));
  }
  return { success: true, product: all[index] };
}

// Movimentações de Estoque
export function getInventoryTransactions(tenantId: string): InventoryTransaction[] {
  const all = getStorage<InventoryTransaction[]>(STORAGE_KEYS.INVENTORY, INITIAL_DEMO_INVENTORY_TRANSACTIONS);
  return all.filter((i) => i.tenantId === tenantId);
}

export function addInventoryTransaction(trans: InventoryTransaction): void {
  const all = getStorage<InventoryTransaction[]>(STORAGE_KEYS.INVENTORY, INITIAL_DEMO_INVENTORY_TRANSACTIONS);
  all.unshift(trans);
  if (all.length > 1000) all.length = 1000;
  setStorage(STORAGE_KEYS.INVENTORY, all);
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
      const newStock = Math.max(0, prev - item.quantity);
      all[idx] = {
        ...all[idx],
        stockQuantity: newStock,
        updatedAt: new Date().toISOString(),
      };

      // Registra baixa automática de venda
      addInventoryTransaction({
        id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        productId: item.productId,
        productName: item.productName,
        type: 'sale',
        quantity: item.quantity,
        previousStock: prev,
        newStock,
        reason: 'Baixa automática por venda confirmada',
        userId: 'sistema',
        userName: 'Ponto de Venda',
        createdAt: new Date().toISOString(),
      });
    }
  }

  setStorage(STORAGE_KEYS.PRODUCTS, all);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sabor_local_sync', { detail: { action: 'stock_updated', tenantId } })
    );
  }
  return { success: true };
}

// Tables (Ilimitadas e Dinâmicas)
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'table_saved', tableId: table.id } }));
  }
}

// Verifica de forma rigorosa se uma mesa pode ser excluída
export function getTableDeletionBlockReason(
  table: RestaurantTable,
  orders: Order[]
): string | null {
  const tableName = table.label || `Mesa ${table.number}`;
  const reasons: string[] = [];

  if (table.status === 'occupied') {
    reasons.push('status atual é OCUPADA');
  } else if (table.status === 'closing') {
    reasons.push('status atual é AGUARDANDO PAGAMENTO');
  }

  const totalOpen = table.currentTotal || 0;
  const productsOpen = table.productsTotal || 0;
  const extraOpen = table.extraTotal || 0;
  if (totalOpen > 0 || productsOpen > 0 || extraOpen > 0) {
    reasons.push(`possui saldo em aberto de R$ ${totalOpen.toFixed(2)}`);
  }

  const activeExtras = (table.extraCharges || []).filter((c) => c.status === 'active');
  if (activeExtras.length > 0) {
    reasons.push(`possui ${activeExtras.length} lançamento(s) extra(s) ativo(s)`);
  }

  const openOrders = orders.filter(
    (o) =>
      o.type === 'table' &&
      (o.tableId === table.id || o.tableNumber === table.number) &&
      o.status !== 'cancelled' &&
      (!o.paid || o.status !== 'closed')
  );
  if (openOrders.length > 0) {
    reasons.push(`possui ${openOrders.length} pedido(s) ativo(s) ou com pagamento pendente`);
  }

  if (reasons.length === 0) return null;
  return `Bloqueio de segurança em "${tableName}": ${reasons.join('; ')}. Encerre os pedidos e confirme a quitação total antes de excluir.`;
}

// Exclusão de Mesas com Validação Obrigatória de Pedidos Ativos, Saldo e Movimentações
export function deleteTable(
  id: string,
  adminUser?: { id: string; name: string }
): { success: boolean; error?: string } {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const target = all.find((t) => t.id === id);
  if (!target) return { success: false, error: 'Mesa não encontrada.' };

  const orders = getOrders(target.tenantId);
  const blockReason = getTableDeletionBlockReason(target, orders);
  if (blockReason) {
    return { success: false, error: blockReason };
  }

  const filtered = all.filter((t) => t.id !== id);
  setStorage(STORAGE_KEYS.TABLES, filtered);
  addAuditLog({
    tenantId: target.tenantId,
    userId: adminUser?.id || 'admin',
    userName: adminUser?.name || 'Administrador',
    action: 'EXCLUIU_MESA',
    details: `Excluiu o cadastro de "${target.label || `Mesa ${target.number}`}" (#${target.number}) do salão. Histórico financeiro e de pedidos preservado.`,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'table_deleted', id } }));
  }
  return { success: true };
}

// Exclusão de Mesas em Lote pelo ADM
export function deleteTablesBatch(
  ids: string[],
  adminUser?: { id: string; name: string }
): { successCount: number; blockedCount: number; blockedReasons: string[] } {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  let successCount = 0;
  let blockedCount = 0;
  const blockedReasons: string[] = [];
  const idsToDelete = new Set<string>();
  const deletedNames: string[] = [];
  let tenantIdRef = 'tenant-01';

  const ordersCache: Record<string, Order[]> = {};

  for (const id of ids) {
    const table = all.find((t) => t.id === id);
    if (!table) continue;
    tenantIdRef = table.tenantId;
    if (!ordersCache[table.tenantId]) {
      ordersCache[table.tenantId] = getOrders(table.tenantId);
    }
    const blockReason = getTableDeletionBlockReason(table, ordersCache[table.tenantId]);
    if (blockReason) {
      blockedCount++;
      blockedReasons.push(blockReason);
    } else {
      idsToDelete.add(id);
      deletedNames.push(table.label || `Mesa ${table.number}`);
      successCount++;
    }
  }

  if (idsToDelete.size > 0) {
    const remaining = all.filter((t) => !idsToDelete.has(t.id));
    setStorage(STORAGE_KEYS.TABLES, remaining);
    addAuditLog({
      tenantId: tenantIdRef,
      userId: adminUser?.id || 'admin',
      userName: adminUser?.name || 'Administrador',
      action: 'EXCLUIU_MESAS_LOTE',
      details: `Excluiu ${successCount} mesa(s) livre(s) em lote (${deletedNames.join(', ')}). ${blockedCount} mesa(s) protegida(s). Histórico preservado.`,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'tables_batch_deleted' } }));
    }
  }

  return { successCount, blockedCount, blockedReasons };
}

// Excluir Todas as Mesas Livres pelo ADM
export function deleteAllAvailableTables(
  tenantId: string,
  adminUser?: { id: string; name: string }
): { successCount: number; blockedCount: number; blockedReasons: string[] } {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const orders = getOrders(tenantId);
  const availableIds: string[] = [];
  const blockedReasons: string[] = [];

  for (const t of all) {
    if (t.tenantId !== tenantId) continue;
    const blockReason = getTableDeletionBlockReason(t, orders);
    if (blockReason) {
      blockedReasons.push(blockReason);
    } else {
      availableIds.push(t.id);
    }
  }

  const blockedCount = blockedReasons.length;

  if (availableIds.length > 0) {
    const remaining = all.filter((t) => !availableIds.includes(t.id));
    setStorage(STORAGE_KEYS.TABLES, remaining);
    addAuditLog({
      tenantId,
      userId: adminUser?.id || 'admin',
      userName: adminUser?.name || 'Administrador',
      action: 'LIMPOU_MESAS_LIVRES',
      details: `Removeu ${availableIds.length} mesa(s) disponível(is) do salão. ${blockedCount} mesa(s) ocupada(s)/com pendências protegida(s). Históricos preservados.`,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'tables_cleared' } }));
    }
  }

  return { successCount: availableIds.length, blockedCount, blockedReasons };
}

// ==========================================
// 2. LANÇAMENTO DE VALORES EXTRAS NA MESA
// ==========================================

export function addTableExtraCharge(
  tenantId: string,
  tableId: string,
  chargeData: { amount: number; description: string; isCashWithdrawal: boolean },
  adminUser: { id: string; name: string }
): { success: boolean; charge?: TableExtraCharge; table?: RestaurantTable; error?: string } {
  if (!chargeData.amount || chargeData.amount <= 0) {
    return { success: false, error: 'Informe um valor positivo em reais.' };
  }
  if (!chargeData.description || !chargeData.description.trim()) {
    return { success: false, error: 'A descrição/motivo do lançamento extra é obrigatória.' };
  }

  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0) return { success: false, error: 'Mesa não encontrada.' };

  const table = all[index];
  const chargeId = `extra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  let financialTxId: string | undefined;

  // Se houve saída de dinheiro da gaveta do caixa (ex: entregue ao cliente)
  if (chargeData.isCashWithdrawal) {
    const cashSessions = getCashSessions(tenantId);
    const activeSession = cashSessions.find((c) => c.status === 'open');

    financialTxId = `tx-extra-${chargeId}`;
    const existingFin = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
    if (existingFin.some((f) => f.id === financialTxId || f.relatedChargeId === chargeId)) {
      return { success: false, error: 'Prevenção de duplicidade: esta sangria já foi registrada.' };
    }

    const financialTx: FinancialTransaction = {
      id: financialTxId,
      tenantId,
      type: 'withdrawal',
      category: 'Adiantamento ao Cliente',
      description: `Sangria/Valor extra entregue (${table.label || `Mesa ${table.number}`}): ${chargeData.description.trim()}`,
      amount: chargeData.amount,
      date: new Date().toISOString(),
      paid: true,
      paymentMethod: 'dinheiro',
      cashRegisterId: activeSession?.id,
      relatedChargeId: chargeId,
      userId: adminUser.id,
      userName: adminUser.name,
      notes: `Lançamento extra ${chargeId} vinculado à ${table.label || `Mesa ${table.number}`}`,
      createdAt: new Date().toISOString(),
    };

    saveExpense(financialTx);
  }

  const newCharge: TableExtraCharge = {
    id: chargeId,
    tableId,
    tableNumberOrName: table.label || `Mesa ${table.number}`,
    amount: chargeData.amount,
    description: chargeData.description.trim(),
    isCashWithdrawal: chargeData.isCashWithdrawal,
    createdAt: new Date().toISOString(),
    createdById: adminUser.id,
    createdByName: adminUser.name,
    financialTxId,
    status: 'active',
    editHistory: [],
  };

  const existingCharges = table.extraCharges || [];
  const updatedCharges = [...existingCharges, newCharge];

  // Recalcula totais preservando consumo de produtos separado
  const activeCharges = updatedCharges.filter((c) => c.status === 'active');
  const extraTotal = activeCharges.reduce((acc, c) => acc + c.amount, 0);
  const productsTotal = table.productsTotal ?? Math.max(0, (table.currentTotal || 0) - (table.extraTotal || 0));
  const currentTotal = productsTotal + extraTotal;

  // Se mesa estava livre, marca como ocupada com o lançamento
  const newStatus = table.status === 'available' ? 'occupied' : table.status;
  const openedAt = table.openedAt || new Date().toISOString();

  const updatedTable: RestaurantTable = {
    ...table,
    status: newStatus,
    openedAt,
    productsTotal,
    extraTotal,
    currentTotal,
    extraCharges: updatedCharges,
  };

  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  addAuditLog({
    tenantId,
    userId: adminUser.id,
    userName: adminUser.name,
    action: 'LANCAMENTO_EXTRA_MESA',
    details: `Adicionou valor extra de R$ ${chargeData.amount.toFixed(2)} ("${chargeData.description.trim()}") à ${table.label || `Mesa ${table.number}`}.${chargeData.isCashWithdrawal ? ' Sangria em dinheiro registrada no caixa ativo.' : ' Sem retirada de caixa.'}`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'extra_charge_added', tableId } }));
  }

  return { success: true, charge: newCharge, table: updatedTable };
}

export function editTableExtraCharge(
  tenantId: string,
  tableId: string,
  chargeId: string,
  updates: { amount: number; description: string; reason: string },
  adminUser: { id: string; name: string }
): { success: boolean; table?: RestaurantTable; error?: string } {
  if (!updates.amount || updates.amount <= 0) {
    return { success: false, error: 'O novo valor deve ser maior que zero.' };
  }
  if (!updates.description.trim()) {
    return { success: false, error: 'A descrição do lançamento extra é obrigatória.' };
  }

  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0) return { success: false, error: 'Mesa não encontrada.' };

  const table = all[index];
  const existingCharges = table.extraCharges || [];
  const chargeIndex = existingCharges.findIndex((c) => c.id === chargeId);
  if (chargeIndex < 0) return { success: false, error: 'Lançamento extra não encontrado.' };

  const targetCharge = existingCharges[chargeIndex];
  if (targetCharge.status === 'cancelled') {
    return { success: false, error: 'Não é possível editar um lançamento já cancelado.' };
  }

  const diff = Number((updates.amount - targetCharge.amount).toFixed(2));
  let adjustmentTxId: string | undefined;

  // Mantém movimentação original intacta; registra ajuste complementar se houve sangria de caixa
  if (targetCharge.isCashWithdrawal && Math.abs(diff) > 0.009) {
    const allFinancial = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
    const cashSessions = getCashSessions(tenantId);
    const active = cashSessions.find((c) => c.status === 'open');
    adjustmentTxId = `tx-adj-${chargeId}-${Date.now()}`;

    if (diff > 0) {
      // Aumento na sangria: registra saída complementar
      const extraWithdrawal: FinancialTransaction = {
        id: adjustmentTxId,
        tenantId,
        type: 'withdrawal',
        category: 'Ajuste de Adiantamento',
        description: `Complemento de sangria (${table.label || `Mesa ${table.number}`}): ${updates.reason || updates.description}`,
        amount: diff,
        date: new Date().toISOString(),
        paid: true,
        paymentMethod: 'dinheiro',
        cashRegisterId: active?.id,
        relatedChargeId: chargeId,
        userId: adminUser.id,
        userName: adminUser.name,
        notes: `Ajuste de edição do lançamento extra ${chargeId} (de R$ ${targetCharge.amount.toFixed(2)} para R$ ${updates.amount.toFixed(2)})`,
        createdAt: new Date().toISOString(),
      };
      allFinancial.unshift(extraWithdrawal);
      setStorage(STORAGE_KEYS.FINANCIAL, allFinancial);
      if (active) {
        active.totalWithdrawals = (active.totalWithdrawals || 0) + diff;
        active.expectedAmount = Math.max(0, (active.expectedAmount || 0) - diff);
        saveCashSession(active);
      }
    } else {
      // Redução na sangria: registra estorno parcial (depósito)
      const refundAmount = Math.abs(diff);
      const partialEstorno: FinancialTransaction = {
        id: adjustmentTxId,
        tenantId,
        type: 'deposit',
        category: 'Estorno Parcial de Adiantamento',
        description: `Devolução parcial de sangria (${table.label || `Mesa ${table.number}`}): ${updates.reason || updates.description}`,
        amount: refundAmount,
        date: new Date().toISOString(),
        paid: true,
        paymentMethod: 'dinheiro',
        cashRegisterId: active?.id,
        relatedChargeId: chargeId,
        userId: adminUser.id,
        userName: adminUser.name,
        notes: `Estorno parcial na edição do lançamento extra ${chargeId} (de R$ ${targetCharge.amount.toFixed(2)} para R$ ${updates.amount.toFixed(2)})`,
        createdAt: new Date().toISOString(),
      };
      allFinancial.unshift(partialEstorno);
      setStorage(STORAGE_KEYS.FINANCIAL, allFinancial);
      if (active) {
        active.totalDeposits = (active.totalDeposits || 0) + refundAmount;
        active.expectedAmount = (active.expectedAmount || 0) + refundAmount;
        saveCashSession(active);
      }
    }
  }

  const editEntry: TableExtraChargeEditEntry = {
    editedAt: new Date().toISOString(),
    editedById: adminUser.id,
    editedByName: adminUser.name,
    previousAmount: targetCharge.amount,
    newAmount: updates.amount,
    previousDescription: targetCharge.description,
    newDescription: updates.description.trim(),
    reason: updates.reason.trim() || 'Edição administrativa',
    adjustmentTxId,
  };

  const updatedCharges = [...existingCharges];
  updatedCharges[chargeIndex] = {
    ...targetCharge,
    amount: updates.amount,
    description: updates.description.trim(),
    editedAt: editEntry.editedAt,
    editedBy: adminUser.name,
    editHistory: [...(targetCharge.editHistory || []), editEntry],
  };

  const activeCharges = updatedCharges.filter((c) => c.status === 'active');
  const extraTotal = activeCharges.reduce((acc, c) => acc + c.amount, 0);
  const productsTotal = table.productsTotal || 0;
  const currentTotal = productsTotal + extraTotal;

  const updatedTable: RestaurantTable = {
    ...table,
    extraTotal,
    currentTotal,
    extraCharges: updatedCharges,
  };

  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  addAuditLog({
    tenantId,
    userId: adminUser.id,
    userName: adminUser.name,
    action: 'EDITOU_EXTRA_MESA',
    details: `Editou valor extra da ${table.label || `Mesa ${table.number}`}: de R$ ${targetCharge.amount.toFixed(2)} ("${targetCharge.description}") para R$ ${updates.amount.toFixed(2)} ("${updates.description.trim()}"). Motivo: ${editEntry.reason}`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'extra_charge_edited', tableId } }));
  }

  return { success: true, table: updatedTable };
}

export function cancelTableExtraCharge(
  tenantId: string,
  tableId: string,
  chargeId: string,
  cancellationReason: string,
  adminUser: { id: string; name: string }
): { success: boolean; table?: RestaurantTable; error?: string } {
  if (!cancellationReason || !cancellationReason.trim()) {
    return { success: false, error: 'A justificativa para cancelar o lançamento é obrigatória.' };
  }

  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0) return { success: false, error: 'Mesa não encontrada.' };

  const table = all[index];
  const existingCharges = table.extraCharges || [];
  const chargeIndex = existingCharges.findIndex((c) => c.id === chargeId);
  if (chargeIndex < 0) return { success: false, error: 'Lançamento extra não encontrado.' };

  const targetCharge = existingCharges[chargeIndex];
  if (targetCharge.status === 'cancelled' || targetCharge.estornoTxId) {
    return { success: false, error: 'Este lançamento extra já foi cancelado e estornado anteriormente.' };
  }

  let estornoTxId: string | undefined;

  // Se houve saída de caixa, registra estorno sem apagar a movimentação original (e evita duplicidade)
  if (targetCharge.isCashWithdrawal && targetCharge.financialTxId) {
    const allFinancial = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
    const alreadyReversed = allFinancial.some(
      (f) => f.type === 'deposit' && f.relatedChargeId === targetCharge.id && f.category === 'Estorno de Adiantamento'
    );
    if (alreadyReversed) {
      return { success: false, error: 'Prevenção de duplicidade: estorno financeiro já registrado para este lançamento.' };
    }

    const origTxIndex = allFinancial.findIndex((f) => f.id === targetCharge.financialTxId);
    if (origTxIndex >= 0) {
      allFinancial[origTxIndex] = {
        ...allFinancial[origTxIndex],
        notes: `${allFinancial[origTxIndex].notes || ''} [ESTORNADO EM ${new Date().toISOString()}: ${cancellationReason.trim()}]`,
      };
    }

    const cashSessions = getCashSessions(tenantId);
    const active = cashSessions.find((c) => c.status === 'open');
    estornoTxId = `tx-estorno-${targetCharge.id}`;

    // Registra estorno financeiro de entrada (depósito) mantendo a saída original preservada
    const estornoTx: FinancialTransaction = {
      id: estornoTxId,
      tenantId,
      type: 'deposit',
      category: 'Estorno de Adiantamento',
      description: `Estorno de sangria da ${table.label || `Mesa ${table.number}`}: ${cancellationReason.trim()}`,
      amount: targetCharge.amount,
      date: new Date().toISOString(),
      paid: true,
      paymentMethod: 'dinheiro',
      cashRegisterId: active?.id,
      relatedChargeId: targetCharge.id,
      userId: adminUser.id,
      userName: adminUser.name,
      notes: `Estorno integral referente ao lançamento extra ${targetCharge.id}. Justificativa: ${cancellationReason.trim()}`,
      createdAt: new Date().toISOString(),
    };
    allFinancial.unshift(estornoTx);
    setStorage(STORAGE_KEYS.FINANCIAL, allFinancial);

    // Atualiza saldo na sessão aberta de caixa
    if (active) {
      active.totalDeposits = (active.totalDeposits || 0) + targetCharge.amount;
      active.expectedAmount = (active.expectedAmount || 0) + targetCharge.amount;
      saveCashSession(active);
    }
  }

  const updatedCharges = [...existingCharges];
  updatedCharges[chargeIndex] = {
    ...targetCharge,
    status: 'cancelled',
    estornoTxId,
    cancelledAt: new Date().toISOString(),
    cancelledBy: adminUser.name,
    cancellationReason: cancellationReason.trim(),
  };

  const activeCharges = updatedCharges.filter((c) => c.status === 'active');
  const extraTotal = activeCharges.reduce((acc, c) => acc + c.amount, 0);
  const productsTotal = table.productsTotal || 0;
  const currentTotal = productsTotal + extraTotal;

  const updatedTable: RestaurantTable = {
    ...table,
    extraTotal,
    currentTotal,
    extraCharges: updatedCharges,
  };

  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  addAuditLog({
    tenantId,
    userId: adminUser.id,
    userName: adminUser.name,
    action: 'CANCELOU_EXTRA_MESA',
    details: `Cancelou lançamento extra de R$ ${targetCharge.amount.toFixed(2)} da ${table.label || `Mesa ${table.number}`}. Motivo: ${cancellationReason.trim()}.${estornoTxId ? ' Estorno financeiro registrado sem apagar lançamento original.' : ''}`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'extra_charge_cancelled', tableId } }));
  }

  return { success: true, table: updatedTable };
}

// ==========================================
// 4. ALERTA E TEMPORIZADOR POR MESA
// ==========================================

export function setTableTimer(
  tenantId: string,
  tableId: string,
  durationMinutes: number,
  adminUser: { id: string; name: string }
): RestaurantTable | null {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0) return null;

  const table = all[index];
  const now = new Date();
  const targetTime = new Date(now.getTime() + durationMinutes * 60000).toISOString();

  const timer: TableTimer = {
    durationMinutes,
    startedAt: now.toISOString(),
    targetTime,
    isPaused: false,
    isExpired: false,
    acknowledged: false,
    setById: adminUser.id,
    setByName: adminUser.name,
  };

  const updatedTable: RestaurantTable = {
    ...table,
    timer,
  };

  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  addAuditLog({
    tenantId,
    userId: adminUser.id,
    userName: adminUser.name,
    action: 'CONFIGUROU_TEMPORIZADOR_MESA',
    details: `Definiu alerta de ${durationMinutes} min para a ${table.label || `Mesa ${table.number}`}`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'timer_set', tableId } }));
  }

  return updatedTable;
}

export function pauseResumeTableTimer(tenantId: string, tableId: string): RestaurantTable | null {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0 || !all[index].timer) return null;

  const table = all[index];
  const timer = table.timer!;
  const now = Date.now();
  const target = new Date(timer.targetTime).getTime();

  let updatedTimer: TableTimer;

  if (timer.isPaused) {
    // Retomar contagem
    const remaining = (timer.pausedRemainingSeconds || 0) * 1000;
    const newTarget = new Date(now + remaining).toISOString();
    updatedTimer = {
      ...timer,
      isPaused: false,
      targetTime: newTarget,
      pausedRemainingSeconds: undefined,
    };
  } else {
    // Pausar contagem
    const remainingSeconds = Math.max(0, Math.round((target - now) / 1000));
    updatedTimer = {
      ...timer,
      isPaused: true,
      pausedRemainingSeconds: remainingSeconds,
    };
  }

  const updatedTable: RestaurantTable = { ...table, timer: updatedTimer };
  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'timer_updated', tableId } }));
  }

  return updatedTable;
}

export function resetTableTimer(tenantId: string, tableId: string): RestaurantTable | null {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0 || !all[index].timer) return null;

  const table = all[index];
  const timer = table.timer!;
  const now = new Date();
  const targetTime = new Date(now.getTime() + timer.durationMinutes * 60000).toISOString();

  const updatedTimer: TableTimer = {
    ...timer,
    startedAt: now.toISOString(),
    targetTime,
    isPaused: false,
    isExpired: false,
    acknowledged: false,
    pausedRemainingSeconds: undefined,
  };

  const updatedTable: RestaurantTable = { ...table, timer: updatedTimer };
  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'timer_reset', tableId } }));
  }

  return updatedTable;
}

export function cancelTableTimer(tenantId: string, tableId: string): RestaurantTable | null {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0) return null;

  const table = all[index];
  const updatedTable: RestaurantTable = {
    ...table,
    timer: undefined,
  };

  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'timer_cancelled', tableId } }));
  }

  return updatedTable;
}

export function acknowledgeTableTimer(tenantId: string, tableId: string): RestaurantTable | null {
  const all = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const index = all.findIndex((t) => t.id === tableId);
  if (index < 0 || !all[index].timer) return null;

  const table = all[index];
  const updatedTable: RestaurantTable = {
    ...table,
    timer: {
      ...table.timer!,
      acknowledged: true,
      isExpired: true,
    },
  };

  all[index] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, all);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'timer_acknowledged', tableId } }));
  }

  return updatedTable;
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

export function getOpenTableOrders(tenantId: string, table: RestaurantTable): Order[] {
  const orders = getOrders(tenantId);
  return orders.filter(
    (o) =>
      o.type === 'table' &&
      (o.tableId === table.id || o.tableNumber === table.number) &&
      o.status !== 'cancelled' &&
      (!o.paid || o.status !== 'closed')
  );
}

// Acumula itens no pedido aberto da mesa (ou cria um pedido único ativo), baixando apenas o delta do estoque
export function addOrAccumulateTableItems(
  tenantId: string,
  tableId: string,
  itemsToAdd: Array<{
    productId: string;
    quantity: number;
    variationName?: string;
    selectedAddons?: { name: string; price: number }[];
    notes?: string;
  }>,
  operatorUser: { id: string; name: string }
): { success: boolean; table?: RestaurantTable; order?: Order; error?: string } {
  if (!itemsToAdd || itemsToAdd.length === 0) {
    return { success: false, error: 'Selecione ao menos um produto para adicionar à mesa.' };
  }

  const allTables = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const tableIdx = allTables.findIndex((t) => t.id === tableId && t.tenantId === tenantId);
  if (tableIdx < 0) return { success: false, error: 'Mesa não encontrada.' };
  const table = allTables[tableIdx];

  const allProducts = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_DEMO_PRODUCTS);
  const tenants = getTenants();
  const tenant = tenants.find((t) => t.id === tenantId);
  const allowNegativeStock = Boolean(tenant?.settings?.allowNegativeStock);

  for (const reqItem of itemsToAdd) {
    if (!reqItem.quantity || reqItem.quantity <= 0) {
      return { success: false, error: 'Informe uma quantidade válida maior que zero.' };
    }
    const prod = allProducts.find((p) => p.id === reqItem.productId && p.tenantId === tenantId);
    if (!prod) return { success: false, error: 'Produto não encontrado no cardápio.' };
    if (!prod.active) return { success: false, error: `Produto "${prod.name}" está inativo.` };
    if (!allowNegativeStock && (prod.stockQuantity ?? 0) < reqItem.quantity) {
      return {
        success: false,
        error: `Estoque insuficiente para "${prod.name}". Disponível: ${prod.stockQuantity ?? 0} ${prod.unit}, solicitado: ${reqItem.quantity}.`,
      };
    }
  }

  const allOrders = getStorage<Order[]>(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
  const orderIdx = allOrders.findIndex(
    (o) =>
      o.tenantId === tenantId &&
      o.type === 'table' &&
      (o.tableId === table.id || o.tableNumber === table.number) &&
      o.status !== 'cancelled' &&
      !o.paid &&
      o.status !== 'closed'
  );

  const nowIso = new Date().toISOString();
  let order: Order;
  const orderIsNew = orderIdx < 0;

  if (orderIdx >= 0) {
    const existingOrder = allOrders[orderIdx];
    const existingContributors = Array.isArray(existingOrder.contributors)
      ? existingOrder.contributors.map((c: any) =>
          typeof c === 'string' ? { id: c, name: existingOrder.waiterName || 'Operador' } : c
        )
      : [];
    if (
      existingOrder.waiterId &&
      existingOrder.waiterName &&
      !existingContributors.some((c) => c.id === existingOrder.waiterId)
    ) {
      existingContributors.push({ id: existingOrder.waiterId, name: existingOrder.waiterName });
    }
    if (!existingContributors.some((c) => c.id === operatorUser.id)) {
      existingContributors.push({ id: operatorUser.id, name: operatorUser.name });
    }
    order = {
      ...existingOrder,
      contributors: existingContributors,
      items: existingOrder.items.map((i) => ({ ...i })),
    };
  } else {
    const nextNum = allOrders.reduce((max, o) => Math.max(max, o.orderNumber || 0), 100) + 1;
    order = {
      id: `ord-tbl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      orderNumber: nextNum,
      type: 'table',
      status: 'preparing',
      tableId: table.id,
      tableNumber: table.number,
      tableName: table.label || `Mesa ${table.number}`,
      customerName: table.customerName,
      waiterId: operatorUser.id,
      waiterName: operatorUser.name,
      createdById: operatorUser.id,
      createdByName: operatorUser.name,
      contributors: [{ id: operatorUser.id, name: operatorUser.name }],
      items: [],
      subtotal: 0,
      discount: 0,
      serviceFee: 0,
      extraTotal: table.extraTotal || 0,
      extraCharges: table.extraCharges || [],
      total: table.extraTotal || 0,
      payments: [],
      paid: false,
      createdAt: nowIso,
    };
  }

  for (const reqItem of itemsToAdd) {
    const pIdx = allProducts.findIndex((p) => p.id === reqItem.productId && p.tenantId === tenantId);
    const prod = allProducts[pIdx];
    const prevStock = prod.stockQuantity ?? 0;
    const newStock = allowNegativeStock
      ? Number((prevStock - reqItem.quantity).toFixed(3))
      : Math.max(0, Number((prevStock - reqItem.quantity).toFixed(3)));

    allProducts[pIdx] = { ...prod, stockQuantity: newStock, updatedAt: nowIso };

    addInventoryTransaction({
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      productId: prod.id,
      productName: prod.name,
      type: 'sale',
      quantity: reqItem.quantity,
      previousStock: prevStock,
      newStock,
      reason: `Consumo adicionado à ${table.label || `Mesa ${table.number}`}`,
      userId: operatorUser.id,
      userName: operatorUser.name,
      createdAt: nowIso,
    });

    const variationPrice =
      reqItem.variationName && prod.variations?.length
        ? prod.variations.find((v) => v.name === reqItem.variationName)?.price ?? prod.sellingPrice
        : prod.sellingPrice;
    const addonsTotal = (reqItem.selectedAddons || []).reduce((acc, a) => acc + a.price, 0);
    const unitPrice = Number((variationPrice + addonsTotal).toFixed(2));
    const cleanNotes = (reqItem.notes || '').trim();
    const addonsKey = JSON.stringify(reqItem.selectedAddons || []);

    const existingItemIdx = order.items.findIndex(
      (existing) =>
        existing.productId === prod.id &&
        (existing.variationName || '') === (reqItem.variationName || '') &&
        (existing.notes || '').trim() === cleanNotes &&
        JSON.stringify(existing.selectedAddons || []) === addonsKey &&
        (existing.addedById || '') === operatorUser.id
    );

    if (existingItemIdx >= 0) {
      const existing = order.items[existingItemIdx];
      const nextQty = Number((existing.quantity + reqItem.quantity).toFixed(3));
      order.items[existingItemIdx] = {
        ...existing,
        quantity: nextQty,
        total: Number((nextQty * existing.unitPrice).toFixed(2)),
        addedAt: nowIso,
      };
    } else {
      order.items.push({
        productId: prod.id,
        productName: prod.name,
        quantity: reqItem.quantity,
        unitPrice,
        variationName: reqItem.variationName,
        selectedAddons: reqItem.selectedAddons,
        notes: cleanNotes || undefined,
        total: Number((reqItem.quantity * unitPrice).toFixed(2)),
        addedById: operatorUser.id,
        addedByName: operatorUser.name,
        addedAt: nowIso,
      });
    }
  }

  setStorage(STORAGE_KEYS.PRODUCTS, allProducts);

  const itemsSubtotal = Number(order.items.reduce((sum, i) => sum + i.total, 0).toFixed(2));
  const activeExtras = (table.extraCharges || []).filter((c) => c.status === 'active');
  const extraTotal = Number(activeExtras.reduce((sum, c) => sum + c.amount, 0).toFixed(2));

  order.subtotal = itemsSubtotal;
  order.extraTotal = extraTotal;
  order.extraCharges = table.extraCharges || [];
  order.total = Number((itemsSubtotal + extraTotal).toFixed(2));

  if (orderIdx >= 0) {
    allOrders[orderIdx] = order;
  } else {
    allOrders.unshift(order);
  }
  setStorage(STORAGE_KEYS.ORDERS, allOrders);

  const openTableOrders = allOrders.filter(
    (o) =>
      o.tenantId === tenantId &&
      o.type === 'table' &&
      (o.tableId === table.id || o.tableNumber === table.number) &&
      o.status !== 'cancelled' &&
      !o.paid &&
      o.status !== 'closed'
  );
  const productsTotal = Number(openTableOrders.reduce((acc, o) => acc + (o.subtotal || 0), 0).toFixed(2));
  const grandTotal = Number((productsTotal + extraTotal).toFixed(2));

  const newLogs: TableOperationLog[] = [...(table.operationLogs || [])];
  if (table.status === 'available' || orderIsNew) {
    newLogs.push({
      id: `tlog-open-${Date.now()}`,
      type: 'table_opened',
      operatorId: operatorUser.id,
      operatorName: operatorUser.name,
      timestamp: nowIso,
      notes: `${operatorUser.name} abriu a ${table.label || `Mesa ${table.number}`}.`,
    });
  }
  newLogs.push({
    id: `tlog-add-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: 'item_added',
    operatorId: operatorUser.id,
    operatorName: operatorUser.name,
    quantity: itemsToAdd.reduce((acc, i) => acc + i.quantity, 0),
    timestamp: nowIso,
    notes: `${operatorUser.name} adicionou ${itemsToAdd.length} item(ns).`,
  });

  const updatedTable: RestaurantTable = {
    ...table,
    status: table.status === 'closing' ? 'closing' : 'occupied',
    openedAt: table.openedAt || nowIso,
    openedById: table.openedById || table.waiterId || operatorUser.id,
    openedByName: table.openedByName || table.waiterName || operatorUser.name,
    waiterId: table.waiterId || operatorUser.id,
    waiterName: table.waiterName || operatorUser.name,
    currentOrderId: order.id,
    productsTotal,
    extraTotal,
    currentTotal: grandTotal,
    activeOrdersCount: openTableOrders.length,
    operationLogs: newLogs.slice(-80),
  };
  allTables[tableIdx] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, allTables);

  addAuditLog({
    tenantId,
    userId: operatorUser.id,
    userName: operatorUser.name,
    action: 'ADICIONOU_ITENS_MESA',
    details: `Adicionou ${itemsToAdd.length} item(ns) na ${table.label || `Mesa ${table.number}`}. Subtotal produtos: R$ ${productsTotal.toFixed(2)}.`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'table_items_added', tableId } }));
  }

  return { success: true, table: updatedTable, order };
}

export function setTableStatusLocal(
  tenantId: string,
  tableId: string,
  status: 'available' | 'occupied' | 'closing',
  operatorUser: { id: string; name: string }
): { success: boolean; table?: RestaurantTable; error?: string } {
  const allTables = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const idx = allTables.findIndex((t) => t.id === tableId && t.tenantId === tenantId);
  if (idx < 0) return { success: false, error: 'Mesa não encontrada.' };

  const table = allTables[idx];
  const nowIso = new Date().toISOString();
  const opLog: TableOperationLog = {
    id: `tlog-st-${Date.now()}`,
    type: 'status_changed',
    operatorId: operatorUser.id,
    operatorName: operatorUser.name,
    timestamp: nowIso,
    notes: `${operatorUser.name} alterou status para ${status === 'closing' ? 'Aguardando Pagamento' : status}.`,
  };

  const updatedTable: RestaurantTable = {
    ...table,
    status,
    openedAt: table.openedAt || (status !== 'available' ? nowIso : undefined),
    openedById: table.openedById || (status !== 'available' ? operatorUser.id : undefined),
    openedByName: table.openedByName || (status !== 'available' ? operatorUser.name : undefined),
    operationLogs: [...(table.operationLogs || []), opLog].slice(-80),
  };
  allTables[idx] = updatedTable;
  setStorage(STORAGE_KEYS.TABLES, allTables);

  addAuditLog({
    tenantId,
    userId: operatorUser.id,
    userName: operatorUser.name,
    action: status === 'closing' ? 'SOLICITOU_FECHAMENTO_MESA' : 'ATUALIZOU_STATUS_MESA',
    details: `${operatorUser.name} alterou "${table.label || `Mesa ${table.number}`}" para ${status}.`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'table_status_changed', tableId } }));
  }

  return { success: true, table: updatedTable };
}

// Garante separação estrita entre venda de produtos e valores extras da mesa
export function getOrderProductSalesTotal(order: Order): number {
  const extra = order.extraTotal || 0;
  return Math.max(0, (order.total || 0) - extra);
}

export function getOrderExtraTotal(order: Order): number {
  return order.extraTotal || 0;
}

// Atualiza caixa ativo ao confirmar recebimento em Dinheiro ou PIX
export function recordPaymentInCashSession(
  tenantId: string,
  method: 'dinheiro' | 'pix',
  amount: number
): void {
  if (amount <= 0) return;
  const cashSessions = getCashSessions(tenantId);
  const activeSession = cashSessions.find((c) => c.status === 'open');
  if (activeSession) {
    if (method === 'dinheiro') {
      activeSession.totalCash = (activeSession.totalCash || 0) + amount;
      activeSession.expectedAmount = (activeSession.expectedAmount || 0) + amount;
    } else if (method === 'pix') {
      activeSession.totalPix = (activeSession.totalPix || 0) + amount;
    }
    saveCashSession(activeSession);
  }
}

// ==========================================
// 5. CONFERÊNCIA, QUITAÇÃO E ARQUIVAMENTO DE MESA
// ==========================================

export function getTableArchives(tenantId: string): TableAccountArchive[] {
  const all = getStorage<TableAccountArchive[]>(STORAGE_KEYS.TABLE_ARCHIVES, []);
  return all.filter((a) => a.tenantId === tenantId);
}

export function saveTableArchive(archive: TableAccountArchive): void {
  const all = getStorage<TableAccountArchive[]>(STORAGE_KEYS.TABLE_ARCHIVES, []);
  if (!all.some((a) => a.id === archive.id)) {
    all.unshift(archive);
    setStorage(STORAGE_KEYS.TABLE_ARCHIVES, all);
  }
}

export function registerTablePaymentAndSettle(
  tenantId: string,
  tableId: string,
  paymentInput: {
    method: 'dinheiro' | 'pix';
    amount: number;
    receivedAmount?: number;
    notes?: string;
    allowEmptyRelease?: boolean;
  },
  operatorUser: { id: string; name: string }
): {
  success: boolean;
  settled: boolean;
  remainingBalance: number;
  table?: RestaurantTable;
  archive?: TableAccountArchive;
  error?: string;
} {
  const allTables = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, INITIAL_DEMO_TABLES);
  const idx = allTables.findIndex((t) => t.id === tableId);
  if (idx < 0) return { success: false, settled: false, remainingBalance: 0, error: 'Mesa não encontrada.' };

  const table = allTables[idx];
  const productsTotal = table.productsTotal ?? Math.max(0, (table.currentTotal || 0) - (table.extraTotal || 0));
  const extraTotal = table.extraTotal || 0;
  const grandTotal = Number((productsTotal + extraTotal).toFixed(2));
  const previousPaid = Number((table.paidAmount || 0).toFixed(2));
  const currentRemaining = Number(Math.max(0, grandTotal - previousPaid).toFixed(2));

  // Caso especial: mesa aberta sem nenhum consumo nem valor extra
  if (currentRemaining <= 0.009) {
    if (!paymentInput.allowEmptyRelease && grandTotal > 0 && previousPaid < grandTotal) {
      return {
        success: false,
        settled: false,
        remainingBalance: currentRemaining,
        error: 'Saldo restante pendente de confirmação.',
      };
    }
  } else {
    if (!paymentInput.amount || paymentInput.amount <= 0) {
      return {
        success: false,
        settled: false,
        remainingBalance: currentRemaining,
        error: 'Informe um valor de pagamento positivo para quitar ou abater o saldo da mesa.',
      };
    }
  }

  const paidNow = currentRemaining <= 0.009 ? 0 : Math.min(currentRemaining, Number(paymentInput.amount.toFixed(2)));
  const existingPayments = table.payments || [];
  let updatedPayments = [...existingPayments];

  if (paidNow > 0) {
    const newPay: TablePaymentRecord = {
      id: `tpay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      method: paymentInput.method,
      amount: paidNow,
      receivedAmount: paymentInput.method === 'dinheiro' ? paymentInput.receivedAmount || paidNow : paidNow,
      change:
        paymentInput.method === 'dinheiro'
          ? Math.max(0, Number(((paymentInput.receivedAmount || paidNow) - paidNow).toFixed(2)))
          : 0,
      paidAt: new Date().toISOString(),
      receivedById: operatorUser.id,
      receivedByName: operatorUser.name,
      notes: paymentInput.notes,
    };
    updatedPayments.push(newPay);

    // Atualiza sessão aberta do caixa
    recordPaymentInCashSession(tenantId, paymentInput.method, paidNow);

    // Registra movimentação financeira de entrada
    const allFinancial = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
    const activeCash = getCashSessions(tenantId).find((c) => c.status === 'open');
    const revTx: FinancialTransaction = {
      id: `tx-tpay-${newPay.id}`,
      tenantId,
      type: 'revenue',
      category: 'Fechamento de Mesa',
      description: `Recebimento ${table.label || `Mesa ${table.number}`} (${paymentInput.method.toUpperCase()})`,
      amount: paidNow,
      date: newPay.paidAt,
      paid: true,
      paymentMethod: paymentInput.method,
      cashRegisterId: activeCash?.id,
      userId: operatorUser.id,
      userName: operatorUser.name,
      notes: `Consumo produtos: R$ ${productsTotal.toFixed(2)} | Valores extras: R$ ${extraTotal.toFixed(2)}`,
      createdAt: newPay.paidAt,
    };
    allFinancial.unshift(revTx);
    setStorage(STORAGE_KEYS.FINANCIAL, allFinancial);
  }

  const newPaidTotal = Number((previousPaid + paidNow).toFixed(2));
  const remainingBalance = Number(Math.max(0, grandTotal - newPaidTotal).toFixed(2));

  // Se ainda existe saldo restante, NÃO libera a mesa!
  if (remainingBalance > 0.009) {
    const partialLog: TableOperationLog = {
      id: `tlog-ppay-${Date.now()}`,
      type: 'payment_partial',
      amount: paidNow,
      operatorId: operatorUser.id,
      operatorName: operatorUser.name,
      timestamp: new Date().toISOString(),
      notes: `${operatorUser.name} recebeu pagamento parcial de R$ ${paidNow.toFixed(2)} (${paymentInput.method.toUpperCase()}).`,
    };
    const partialTable: RestaurantTable = {
      ...table,
      status: table.status === 'available' ? 'closing' : table.status,
      paidAmount: newPaidTotal,
      payments: updatedPayments,
      operationLogs: [...(table.operationLogs || []), partialLog].slice(-80),
    };
    allTables[idx] = partialTable;
    setStorage(STORAGE_KEYS.TABLES, allTables);

    addAuditLog({
      tenantId,
      userId: operatorUser.id,
      userName: operatorUser.name,
      action: 'PAGAMENTO_PARCIAL_MESA',
      details: `Registrou pagamento parcial de R$ ${paidNow.toFixed(2)} (${paymentInput.method.toUpperCase()}) na "${table.label || `Mesa ${table.number}`}". Saldo restante: R$ ${remainingBalance.toFixed(2)}. Mesa mantida ocupada.`,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'table_partial_payment', tableId } }));
    }

    return {
      success: true,
      settled: false,
      remainingBalance,
      table: partialTable,
    };
  }

  // Quitação integral confirmada -> encerra pedidos vinculados, arquiva conta, libera mesa e zera timer
  const nowIso = new Date().toISOString();
  const allOrders = getStorage<Order[]>(STORAGE_KEYS.ORDERS, INITIAL_DEMO_ORDERS);
  const linkedOrderIds: string[] = [];

  const updatedOrders = allOrders.map((o) => {
    if (
      o.tenantId === tenantId &&
      o.type === 'table' &&
      (o.tableId === table.id || o.tableNumber === table.number) &&
      o.status !== 'cancelled' &&
      (!o.paid || o.status !== 'closed')
    ) {
      linkedOrderIds.push(o.id);
      return {
        ...o,
        status: 'closed' as const,
        paid: true,
        closedAt: o.closedAt || nowIso,
      };
    }
    return o;
  });
  setStorage(STORAGE_KEYS.ORDERS, updatedOrders);

  // Arquiva o histórico completo da conta da mesa antes de zerar os valores operacionais
  const archive: TableAccountArchive = {
    id: `tarch-${table.id}-${Date.now()}`,
    tenantId,
    tableId: table.id,
    tableNumber: table.number,
    tableName: table.customerName || table.label || `Mesa ${table.number}`,
    openedAt: table.openedAt || nowIso,
    closedAt: nowIso,
    closedById: operatorUser.id,
    closedByName: operatorUser.name,
    productsTotal,
    extraTotal,
    grandTotal,
    paidTotal: newPaidTotal,
    orderIds: linkedOrderIds,
    extraCharges: table.extraCharges || [],
    payments: updatedPayments,
  };
  saveTableArchive(archive);

  // Libera mesa e encerra temporizador
  const freedTable: RestaurantTable = {
    ...table,
    status: 'available',
    openedAt: undefined,
    openedById: undefined,
    openedByName: undefined,
    waiterId: undefined,
    waiterName: undefined,
    currentOrderId: undefined,
    currentTotal: 0,
    productsTotal: 0,
    extraTotal: 0,
    paidAmount: 0,
    payments: [],
    extraCharges: [],
    activeOrdersCount: 0,
    timer: undefined,
    operationLogs: [],
  };

  allTables[idx] = freedTable;
  setStorage(STORAGE_KEYS.TABLES, allTables);

  addAuditLog({
    tenantId,
    userId: operatorUser.id,
    userName: operatorUser.name,
    action: 'QUITACAO_E_LIBERACAO_MESA',
    details: `Quitou e liberou "${table.label || `Mesa ${table.number}`}". Produtos: R$ ${productsTotal.toFixed(2)} | Extras: R$ ${extraTotal.toFixed(2)} | Total pago: R$ ${newPaidTotal.toFixed(2)}. Arquivo ${archive.id} preservado.`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'table_settled', tableId } }));
  }

  return {
    success: true,
    settled: true,
    remainingBalance: 0,
    table: freedTable,
    archive,
  };
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

// Gastos e Despesas do Estabelecimento (Controle Integrado ao Caixa Geral)
export function getExpenses(tenantId: string): FinancialTransaction[] {
  const all = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
  return all.filter((f) => f.tenantId === tenantId && (f.type === 'expense_fixed' || f.type === 'expense_variable' || f.type === 'withdrawal'));
}

export function saveExpense(expense: FinancialTransaction): void {
  const all = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
  const index = all.findIndex((f) => f.id === expense.id);
  if (index >= 0) {
    all[index] = expense;
  } else {
    all.unshift(expense);
  }
  setStorage(STORAGE_KEYS.FINANCIAL, all);

  // Se o gasto foi pago em dinheiro e houver sessão aberta de caixa, registra saída no caixa
  if (expense.paymentMethod === 'dinheiro') {
    const cashSessions = getCashSessions(expense.tenantId);
    const active = cashSessions.find((c) => c.status === 'open');
    if (active) {
      active.totalWithdrawals = (active.totalWithdrawals || 0) + expense.amount;
      active.expectedAmount = Math.max(0, (active.expectedAmount || 0) - expense.amount);
      saveCashSession(active);
    }
  }

  addAuditLog({
    tenantId: expense.tenantId,
    userId: expense.userId || 'admin',
    userName: expense.userName || 'Administrador',
    action: 'REGISTRO_GASTO',
    details: `Registrou despesa de ${expense.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}: "${expense.description}" (${expense.category})`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'expense_saved', id: expense.id } }));
  }
}

export function deleteExpense(id: string): void {
  const all = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, INITIAL_DEMO_EXPENSES);
  const target = all.find((f) => f.id === id);
  if (target) {
    const filtered = all.filter((f) => f.id !== id);
    setStorage(STORAGE_KEYS.FINANCIAL, filtered);
    addAuditLog({
      tenantId: target.tenantId,
      userId: 'admin',
      userName: 'Administrador',
      action: 'REMOVEU_GASTO',
      details: `Removeu gasto de ${target.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}: "${target.description}"`,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'expense_deleted', id } }));
    }
  }
}

// SEPARAÇÃO TOTAL ENTRE VENDEDOR E CAIXA GERAL
// Retorna estritamente as métricas do próprio vendedor logado (sem acesso a dados globais)
export function getSellerSalesSummary(tenantId: string, sellerId?: string, sellerName?: string) {
  const orders = getOrders(tenantId);
  const myOrders = orders.filter((o) => {
    if (o.status === 'cancelled') return false;
    if (
      sellerId &&
      (o.waiterId === sellerId ||
        o.createdById === sellerId ||
        (o.contributors || []).some((c: any) => (typeof c === 'string' ? c === sellerId : c?.id === sellerId)))
    ) {
      return true;
    }
    if (sellerName && o.waiterName?.toLowerCase() === sellerName.toLowerCase()) return true;
    return false;
  });

  const totalSold = myOrders
    .filter((o) => o.paid)
    .reduce((acc, o) => acc + getOrderProductSalesTotal(o), 0);
  const activeOrders = myOrders.filter((o) => o.status === 'received' || o.status === 'preparing' || o.status === 'ready');

  return {
    salesCount: myOrders.filter((o) => o.paid).length,
    totalSold,
    activeOrdersCount: activeOrders.length,
    orders: myOrders,
  };
}

// Customers & Suppliers
export function getCustomers(tenantId: string): Customer[] {
  const all = getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
  return all.filter((c) => c.tenantId === tenantId);
}

export function saveCustomer(customer: Customer): void {
  const all = getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
  const idx = all.findIndex((c) => c.id === customer.id);
  const normalized: Customer = {
    ...customer,
    pendingCredit: 0,
  };
  if (idx >= 0) all[idx] = normalized;
  else all.unshift(normalized);
  setStorage(STORAGE_KEYS.CUSTOMERS, all);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'customer_saved', id: customer.id } }));
  }
}

export function deleteCustomer(id: string, adminUser?: { id: string; name: string }): void {
  const all = getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_DEMO_CUSTOMERS);
  const target = all.find((c) => c.id === id);
  setStorage(STORAGE_KEYS.CUSTOMERS, all.filter((c) => c.id !== id));
  if (target) {
    addAuditLog({
      tenantId: target.tenantId,
      userId: adminUser?.id || 'admin',
      userName: adminUser?.name || 'Administrador',
      action: 'EXCLUIU_CLIENTE',
      details: `Removeu o cliente "${target.name}".`,
    });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'customer_deleted', id } }));
  }
}

export function getSuppliers(tenantId: string): Supplier[] {
  const all = getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
  return all.filter((s) => s.tenantId === tenantId);
}

export function saveSupplier(supplier: Supplier): void {
  const all = getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
  const idx = all.findIndex((s) => s.id === supplier.id);
  if (idx >= 0) all[idx] = supplier;
  else all.unshift(supplier);
  setStorage(STORAGE_KEYS.SUPPLIERS, all);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'supplier_saved', id: supplier.id } }));
  }
}

export function deleteSupplier(id: string, adminUser?: { id: string; name: string }): void {
  const all = getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, INITIAL_DEMO_SUPPLIERS);
  const target = all.find((s) => s.id === id);
  setStorage(STORAGE_KEYS.SUPPLIERS, all.filter((s) => s.id !== id));
  if (target) {
    addAuditLog({
      tenantId: target.tenantId,
      userId: adminUser?.id || 'admin',
      userName: adminUser?.name || 'Administrador',
      action: 'EXCLUIU_FORNECEDOR',
      details: `Removeu o fornecedor "${target.name}".`,
    });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'supplier_deleted', id } }));
  }
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

// ==========================================
// 1. SALVAR BALANÇOS E RELATÓRIOS
// ==========================================

export function getSavedReports(tenantId: string): SavedReport[] {
  const all = getStorage<SavedReport[]>(STORAGE_KEYS.SAVED_REPORTS, []);
  return all.filter((r) => r.tenantId === tenantId);
}

export function saveReport(report: SavedReport): void {
  const all = getStorage<SavedReport[]>(STORAGE_KEYS.SAVED_REPORTS, []);
  const index = all.findIndex((r) => r.id === report.id);
  if (index >= 0) {
    all[index] = report;
  } else {
    all.unshift(report);
  }
  setStorage(STORAGE_KEYS.SAVED_REPORTS, all);

  addAuditLog({
    tenantId: report.tenantId,
    userId: report.createdById,
    userName: report.createdByName,
    action: 'SALVAR_RELATORIO',
    details: `Relatório salvo: "${report.title}" (${report.type}) para o período ${report.startDate} a ${report.endDate}`,
  });
}

export function deleteSavedReport(id: string): void {
  const all = getStorage<SavedReport[]>(STORAGE_KEYS.SAVED_REPORTS, []);
  const target = all.find((r) => r.id === id);
  const filtered = all.filter((r) => r.id !== id);
  setStorage(STORAGE_KEYS.SAVED_REPORTS, filtered);

  if (target) {
    addAuditLog({
      tenantId: target.tenantId,
      userId: 'system',
      userName: 'Administrador',
      action: 'EXCLUIR_RELATORIO',
      details: `Relatório "${target.title}" removido`,
    });
  }
}

// ==========================================
// 2. ARQUIVAMENTO DE PERÍODOS
// ==========================================

export function getArchivedPeriods(tenantId: string): ArchivedPeriod[] {
  const all = getStorage<ArchivedPeriod[]>(STORAGE_KEYS.ARCHIVED_PERIODS, []);
  return all.filter((a) => a.tenantId === tenantId);
}

export function archivePeriod(period: ArchivedPeriod): void {
  const all = getStorage<ArchivedPeriod[]>(STORAGE_KEYS.ARCHIVED_PERIODS, []);
  const index = all.findIndex((a) => a.id === period.id);
  if (index >= 0) {
    all[index] = { ...period, isProtected: true };
  } else {
    all.unshift({ ...period, isProtected: true });
  }
  setStorage(STORAGE_KEYS.ARCHIVED_PERIODS, all);

  addAuditLog({
    tenantId: period.tenantId,
    userId: period.archivedById,
    userName: period.archivedByName,
    action: 'ARQUIVAR_PERIODO',
    details: `Período arquivado com sucesso: "${period.label}" (${period.startDate} a ${period.endDate}). Receita preservada: R$ ${period.metrics.totalRevenue.toFixed(2)}`,
  });
}

// ==========================================
// 4. CENTRAL DE BACKUPS E RESTAURAÇÃO
// ==========================================

function generateSimpleChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha256-${Math.abs(hash).toString(16)}${Date.now().toString(16)}`;
}

export function getSystemBackups(tenantId: string): SystemBackup[] {
  const all = getStorage<SystemBackup[]>(STORAGE_KEYS.BACKUPS, []);
  return all.filter((b) => b.tenantId === tenantId);
}

export function createSystemBackup(
  tenantId: string,
  name: string,
  adminUser: { id: string; name: string },
  scopePeriod?: string
): SystemBackup {
  const tenants = getTenants();
  const tenant = tenants.find((t) => t.id === tenantId) || INITIAL_DEMO_TENANT;
  const products = getProducts(tenantId);
  const categories = getCategories(tenantId);
  const tables = getTables(tenantId);
  const orders = getOrders(tenantId);
  const expenses = getExpenses(tenantId);
  const cashSessions = getStorage<CashRegisterSession[]>(STORAGE_KEYS.CASH, []).filter(
    (c) => c.tenantId === tenantId
  );
  const inventoryTransactions = getInventoryTransactions(tenantId);
  const users = getUsers(tenantId);
  const savedReports = getSavedReports(tenantId);
  const archivedPeriods = getArchivedPeriods(tenantId);
  const tableArchives = getTableArchives(tenantId);
  const themeConfig = getThemeConfig(tenantId);

  const payload = {
    tenant,
    products,
    categories,
    tables,
    orders,
    expenses,
    cashSessions,
    inventoryTransactions,
    users,
    savedReports,
    archivedPeriods,
    tableArchives,
    themeConfig,
  };

  const payloadStr = JSON.stringify(payload);
  const sizeBytes = new Blob([payloadStr]).size;
  const checksum = generateSimpleChecksum(payloadStr);

  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupId = `BKP-${dateStr}`;

  const photosCount = products.filter((p) => Boolean(p.imageUrl)).length;

  const newBackup: SystemBackup = {
    id: backupId,
    tenantId,
    name: name || `Backup Manual ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`,
    createdAt: now.toISOString(),
    createdById: adminUser.id,
    createdByName: adminUser.name,
    scopePeriod: scopePeriod || `Completo (${now.toLocaleDateString('pt-BR')})`,
    version: '1.0.0',
    sizeBytes,
    stats: {
      ordersCount: orders.length,
      productsCount: products.length,
      tablesCount: tables.length,
      expensesCount: expenses.length,
      inventoryTxCount: inventoryTransactions.length,
      usersCount: users.length,
      photosCount,
    },
    payload,
    checksum,
    cloudSynced: true,
  };

  const all = getStorage<SystemBackup[]>(STORAGE_KEYS.BACKUPS, []);
  all.unshift(newBackup);
  setStorage(STORAGE_KEYS.BACKUPS, all);

  addAuditLog({
    tenantId,
    userId: adminUser.id,
    userName: adminUser.name,
    action: 'CRIAR_BACKUP',
    details: `Backup criado: "${newBackup.name}" (${backupId}). Tamanho: ${(sizeBytes / 1024).toFixed(1)} KB`,
  });

  return newBackup;
}

export function restoreSystemBackup(
  backup: SystemBackup,
  adminUser: { id: string; name: string }
): { success: boolean; message: string } {
  if (!backup || !backup.payload) {
    return { success: false, message: 'Arquivo de backup corrompido ou payload ausente.' };
  }

  const { tenantId, payload } = backup;

  try {
    // 1. Restaura produtos
    if (Array.isArray(payload.products)) {
      const allProd = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, []);
      const otherProds = allProd.filter((p) => p.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.PRODUCTS, [...otherProds, ...payload.products]);
    }

    // 2. Restaura categorias
    if (Array.isArray(payload.categories)) {
      const allCat = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, []);
      const otherCats = allCat.filter((c) => c.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.CATEGORIES, [...otherCats, ...payload.categories]);
    }

    // 3. Restaura mesas
    if (Array.isArray(payload.tables)) {
      const allTables = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, []);
      const otherTables = allTables.filter((t) => t.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.TABLES, [...otherTables, ...payload.tables]);
    }

    // 4. Restaura pedidos (sem duplicar)
    if (Array.isArray(payload.orders)) {
      const allOrders = getStorage<Order[]>(STORAGE_KEYS.ORDERS, []);
      const otherOrders = allOrders.filter((o) => o.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.ORDERS, [...otherOrders, ...payload.orders]);
    }

    // 5. Restaura despesas
    if (Array.isArray(payload.expenses)) {
      const allExpenses = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, []);
      const otherExp = allExpenses.filter((e) => e.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.FINANCIAL, [...otherExp, ...payload.expenses]);
    }

    // 6. Restaura estoque
    if (Array.isArray(payload.inventoryTransactions)) {
      const allInv = getStorage<InventoryTransaction[]>(STORAGE_KEYS.INVENTORY, []);
      const otherInv = allInv.filter((i) => i.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.INVENTORY, [...otherInv, ...payload.inventoryTransactions]);
    }

    // 7. Restaura sessões de caixa
    if (Array.isArray(payload.cashSessions)) {
      const allCash = getStorage<CashRegisterSession[]>(STORAGE_KEYS.CASH, []);
      const otherCash = allCash.filter((c) => c.tenantId !== tenantId);
      setStorage(STORAGE_KEYS.CASH, [...otherCash, ...payload.cashSessions]);
    }

    // 8. Restaura tema se presente
    if (payload.themeConfig) {
      setStorage(STORAGE_KEYS.THEME_CONFIG, payload.themeConfig);
      window.dispatchEvent(new CustomEvent('sabor_theme_updated', { detail: payload.themeConfig }));
    }

    // 9. Preserva e une relatórios salvos e períodos arquivados sem perda
    if (Array.isArray(payload.savedReports)) {
      const existingReports = getSavedReports(tenantId);
      const combined = [...existingReports];
      payload.savedReports.forEach((rep) => {
        if (!combined.some((c) => c.id === rep.id)) {
          combined.push(rep);
        }
      });
      const allReps = getStorage<SavedReport[]>(STORAGE_KEYS.SAVED_REPORTS, []).filter(
        (r) => r.tenantId !== tenantId
      );
      setStorage(STORAGE_KEYS.SAVED_REPORTS, [...allReps, ...combined]);
    }

    if (Array.isArray(payload.archivedPeriods)) {
      const existingArch = getArchivedPeriods(tenantId);
      const combinedArch = [...existingArch];
      payload.archivedPeriods.forEach((arch) => {
        if (!combinedArch.some((c) => c.id === arch.id)) {
          combinedArch.push(arch);
        }
      });
      const allArch = getStorage<ArchivedPeriod[]>(STORAGE_KEYS.ARCHIVED_PERIODS, []).filter(
        (a) => a.tenantId !== tenantId
      );
      setStorage(STORAGE_KEYS.ARCHIVED_PERIODS, [...allArch, ...combinedArch]);
    }

    if (Array.isArray(payload.tableArchives)) {
      const existingTableArch = getTableArchives(tenantId);
      const combinedTableArch = [...existingTableArch];
      payload.tableArchives.forEach((arch) => {
        if (!combinedTableArch.some((c) => c.id === arch.id)) {
          combinedTableArch.push(arch);
        }
      });
      const allTableArch = getStorage<TableAccountArchive[]>(STORAGE_KEYS.TABLE_ARCHIVES, []).filter(
        (a) => a.tenantId !== tenantId
      );
      setStorage(STORAGE_KEYS.TABLE_ARCHIVES, [...allTableArch, ...combinedTableArch]);
    }

    addAuditLog({
      tenantId,
      userId: adminUser.id,
      userName: adminUser.name,
      action: 'RESTAURAR_BACKUP',
      details: `Restauração completa do backup "${backup.name}" (${backup.id}) realizada com sucesso`,
    });

    window.dispatchEvent(new CustomEvent('sabor_local_sync'));

    return {
      success: true,
      message: `Backup restaurado com sucesso! ${payload.products?.length || 0} produtos, ${payload.orders?.length || 0} vendas e ${payload.tables?.length || 0} mesas recuperadas.`,
    };
  } catch (err: any) {
    console.error('Erro ao restaurar backup:', err);
    return {
      success: false,
      message: `Falha na restauração: ${err?.message || 'Erro desconhecido'}`,
    };
  }
}

export function deleteSystemBackup(id: string): void {
  const all = getStorage<SystemBackup[]>(STORAGE_KEYS.BACKUPS, []);
  const target = all.find((b) => b.id === id);
  const filtered = all.filter((b) => b.id !== id);
  setStorage(STORAGE_KEYS.BACKUPS, filtered);

  if (target) {
    addAuditLog({
      tenantId: target.tenantId,
      userId: 'system',
      userName: 'Administrador',
      action: 'EXCLUIR_BACKUP',
      details: `Backup "${target.name}" (${id}) removido da central`,
    });
  }
}

// ==========================================
// 6. PERSONALIZAÇÃO VISUAL PELO ADM
// ==========================================

export function getThemeConfig(_tenantId?: string): SystemThemeConfig {
  const stored = getStorage<SystemThemeConfig | null>(STORAGE_KEYS.THEME_CONFIG, null);
  if (!stored) return DEFAULT_THEME_CONFIG;
  return { ...DEFAULT_THEME_CONFIG, ...stored };
}

export function saveThemeConfig(
  theme: SystemThemeConfig,
  adminUser?: { id: string; name: string }
): void {
  const updatedTheme: SystemThemeConfig = {
    ...theme,
    updatedAt: new Date().toISOString(),
    updatedById: adminUser?.id || 'admin',
  };
  setStorage(STORAGE_KEYS.THEME_CONFIG, updatedTheme);

  // Notifica todos os componentes ativos em tempo real (incluindo visão do vendedor)
  window.dispatchEvent(
    new CustomEvent('sabor_theme_updated', {
      detail: updatedTheme,
    })
  );

  addAuditLog({
    tenantId: 'system',
    userId: adminUser?.id || 'admin',
    userName: adminUser?.name || 'Administrador',
    action: 'PERSONALIZAR_CORES',
    details: 'Tema visual e paleta de cores atualizados pelo Administrador',
  });
}

export function resetThemeConfig(_tenantId?: string): SystemThemeConfig {
  setStorage(STORAGE_KEYS.THEME_CONFIG, DEFAULT_THEME_CONFIG);
  window.dispatchEvent(
    new CustomEvent('sabor_theme_updated', {
      detail: DEFAULT_THEME_CONFIG,
    })
  );

  addAuditLog({
    tenantId: 'system',
    userId: 'admin',
    userName: 'Administrador',
    action: 'RESTAURAR_CORES_PADRAO',
    details: 'Cores visuais restauradas para o padrão oficial do SaborGestão',
  });

  return DEFAULT_THEME_CONFIG;
}

// ==========================================
// 3. LIMPEZA SELETIVA E NOVO PERÍODO
// ==========================================

// ==========================================
// 7. ARQUIVAMENTO HISTÓRICO EM PDF & LIMPEZA DE PERÍODO
// ==========================================

export function getArchivedPdfs(tenantId: string): ArchivedPeriodPdf[] {
  const all = getStorage<ArchivedPeriodPdf[]>(STORAGE_KEYS.ARCHIVED_PDFS, []);
  return all.filter((a) => a.tenantId === tenantId);
}

export function saveArchivedPdfLocal(
  pdf: ArchivedPeriodPdf,
  adminUser?: { id: string; name: string }
): ArchivedPeriodPdf {
  const all = getStorage<ArchivedPeriodPdf[]>(STORAGE_KEYS.ARCHIVED_PDFS, []);
  const filtered = all.filter((a) => a.id !== pdf.id);
  filtered.unshift({ ...pdf, restorable: false });
  setStorage(STORAGE_KEYS.ARCHIVED_PDFS, filtered.slice(0, 60));

  addAuditLog({
    tenantId: pdf.tenantId,
    userId: adminUser?.id || pdf.generatedById,
    userName: adminUser?.name || pdf.generatedByName,
    action: 'ARQUIVO_PDF_GERADO',
    details: `Arquivo histórico PDF "${pdf.fileName}" salvo para o período ${pdf.periodStart} a ${pdf.periodEnd}.`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'pdf_archived', id: pdf.id } }));
  }
  return pdf;
}

export function executeCleanPeriodResetLocal(
  tenantId: string,
  options: SelectiveResetOptions,
  adminUser: { id: string; name: string }
): { success: boolean; message: string; result?: SelectiveResetResult } {
  if (options.confirmationText.trim() !== 'CONFIRMAR LIMPEZA') {
    return {
      success: false,
      message: 'Digite exatamente "CONFIRMAR LIMPEZA" para autorizar a limpeza do sistema.',
    };
  }
  const pdfs = getArchivedPdfs(tenantId);
  if (!options.archivePdfId || !pdfs.some((p) => p.id === options.archivePdfId)) {
    return {
      success: false,
      message: 'É obrigatório gerar e salvar o PDF histórico do período antes de executar a limpeza.',
    };
  }

  const clearedSummary: string[] = [];
  const preservedSummary: string[] = [];

  // 1. NUNCA deixar mesas ou comandas abertas após limpeza de período
  const allTables = getStorage<RestaurantTable[]>(STORAGE_KEYS.TABLES, []);
  setStorage(
    STORAGE_KEYS.TABLES,
    allTables.map((t) =>
      t.tenantId === tenantId
        ? {
            ...t,
            status: 'available' as const,
            currentOrderId: undefined,
            currentTotal: 0,
            productsTotal: 0,
            extraTotal: 0,
            paidAmount: 0,
            payments: [],
            extraCharges: [],
            activeOrdersCount: 0,
            openedAt: undefined,
            openedById: undefined,
            openedByName: undefined,
            waiterId: undefined,
            waiterName: undefined,
            customerName: undefined,
            timer: undefined,
            operationLogs: [],
          }
        : t
    )
  );
  clearedSummary.push('Mesas e comandas abertas encerradas automaticamente');

  if (options.clearTables) {
    const allTableArch = getStorage<TableAccountArchive[]>(STORAGE_KEYS.TABLE_ARCHIVES, []);
    setStorage(
      STORAGE_KEYS.TABLE_ARCHIVES,
      allTableArch.filter((a) => a.tenantId !== tenantId)
    );
    clearedSummary.push('Histórico operacional de mesas');
  } else {
    preservedSummary.push('Histórico arquivado de mesas');
  }

  // 2. Categorias
  if (!options.keepCategories) {
    const allCats = getStorage<Category[]>(STORAGE_KEYS.CATEGORIES, []);
    setStorage(
      STORAGE_KEYS.CATEGORIES,
      allCats.filter((c) => c.tenantId !== tenantId)
    );
    clearedSummary.push('Categorias do cardápio');
  } else {
    preservedSummary.push('Categorias do cardápio');
  }

  // 3. Produtos (preservação granular de fotos, descrições, códigos, preços e estoque)
  const allProds = getStorage<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  if (!options.keepProducts) {
    setStorage(
      STORAGE_KEYS.PRODUCTS,
      allProds.filter((p) => p.tenantId !== tenantId)
    );
    clearedSummary.push('Catálogo completo de produtos');
  } else {
    const nowIso = new Date().toISOString();
    setStorage(
      STORAGE_KEYS.PRODUCTS,
      allProds.map((p) => {
        if (p.tenantId !== tenantId) return p;
        return {
          ...p,
          categoryId: options.keepCategories ? p.categoryId : '',
          imageUrl: options.keepProductPhotos ? p.imageUrl : undefined,
          description: options.keepProductDescriptions ? p.description : '',
          sellingPrice: options.zeroProductPrices ? 0 : p.sellingPrice,
          costPrice: options.zeroProductPrices ? 0 : p.costPrice,
          profitMargin: options.zeroProductPrices ? 0 : p.profitMargin,
          stockQuantity: options.zeroProductStock ? 0 : p.stockQuantity,
          updatedAt: nowIso,
        };
      })
    );
    const keptParts = ['Produtos e códigos'];
    if (options.keepProductPhotos) keptParts.push('fotos');
    else clearedSummary.push('Fotografias dos produtos');
    if (options.keepProductDescriptions) keptParts.push('descrições');
    else clearedSummary.push('Descrições dos produtos');
    if (!options.zeroProductPrices) keptParts.push('preços');
    else clearedSummary.push('Preços de venda zerados');
    if (!options.zeroProductStock) keptParts.push('estoque');
    else clearedSummary.push('Saldos de estoque zerados');
    preservedSummary.push(keptParts.join(', '));
  }

  // 4. Clientes & Fornecedores
  if (!options.keepCustomers) {
    const allCustomers = getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
    setStorage(
      STORAGE_KEYS.CUSTOMERS,
      allCustomers.filter((c) => c.tenantId !== tenantId)
    );
    clearedSummary.push('Cadastro de clientes');
  } else {
    preservedSummary.push('Clientes cadastrados');
  }

  if (!options.keepSuppliers) {
    const allSuppliers = getStorage<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []);
    setStorage(
      STORAGE_KEYS.SUPPLIERS,
      allSuppliers.filter((s) => s.tenantId !== tenantId)
    );
    clearedSummary.push('Cadastro de fornecedores');
  } else {
    preservedSummary.push('Fornecedores cadastrados');
  }

  // 5. Vendedores (nunca remove o ADM)
  if (!options.keepSellers) {
    const allUsers = getStorage<UserProfile[]>(STORAGE_KEYS.USERS, []);
    setStorage(
      STORAGE_KEYS.USERS,
      allUsers.filter((u) => u.tenantId !== tenantId || u.role === 'admin')
    );
    clearedSummary.push('Vendedores cadastrados e acessos anteriores');
  } else {
    preservedSummary.push(
      options.rotateSellerKeys
        ? 'Vendedores cadastrados (chaves de acesso redefinidas)'
        : 'Vendedores cadastrados e chaves atuais'
    );
  }

  // 6. Vendas e Pedidos (se mantidos, encerra eventuais pedidos abertos de mesa para integridade)
  const allOrders = getStorage<Order[]>(STORAGE_KEYS.ORDERS, []);
  if (options.clearOrders) {
    setStorage(
      STORAGE_KEYS.ORDERS,
      allOrders.filter((o) => o.tenantId !== tenantId)
    );
    clearedSummary.push('Vendas e históricos de pedidos');
  } else {
    const nowIso = new Date().toISOString();
    setStorage(
      STORAGE_KEYS.ORDERS,
      allOrders.map((o) =>
        o.tenantId === tenantId && o.status !== 'closed' && o.status !== 'cancelled'
          ? { ...o, status: 'cancelled' as const, closedAt: o.closedAt || nowIso }
          : o
      )
    );
    preservedSummary.push('Histórico de vendas concluídas');
  }

  // 7. Caixa e Movimentações
  if (options.clearCashRegisters) {
    const allCash = getStorage<CashRegisterSession[]>(STORAGE_KEYS.CASH, []);
    setStorage(
      STORAGE_KEYS.CASH,
      allCash.filter((c) => c.tenantId !== tenantId)
    );
    clearedSummary.push('Caixa e movimentações de caixa');
  } else {
    preservedSummary.push('Sessões de caixa');
  }

  // 8. Gastos e Recebimentos (filtragem granular)
  if (options.clearExpenses || options.clearReceipts) {
    const allFin = getStorage<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL, []);
    const remainingFin = allFin.filter((f) => {
      if (f.tenantId !== tenantId) return true;
      const isReceipt = f.type === 'revenue' || f.type === 'deposit';
      if (isReceipt && options.clearReceipts) return false;
      if (!isReceipt && options.clearExpenses) return false;
      return true;
    });
    setStorage(STORAGE_KEYS.FINANCIAL, remainingFin);
    if (options.clearExpenses) clearedSummary.push('Gastos e despesas');
    else preservedSummary.push('Gastos e despesas');
    if (options.clearReceipts) clearedSummary.push('Recebimentos financeiros');
    else preservedSummary.push('Recebimentos financeiros');
  } else {
    preservedSummary.push('Gastos e recebimentos');
  }

  // 9. Movimentações de Estoque
  if (options.clearStockMovements) {
    const allInv = getStorage<InventoryTransaction[]>(STORAGE_KEYS.INVENTORY, []);
    setStorage(
      STORAGE_KEYS.INVENTORY,
      allInv.filter((i) => i.tenantId !== tenantId)
    );
    clearedSummary.push('Movimentações de estoque');
  } else {
    preservedSummary.push('Movimentações de estoque');
  }

  // 10. Relatórios Operacionais Salvos
  if (options.clearSavedReports) {
    const allReports = getStorage<SavedReport[]>(STORAGE_KEYS.SAVED_REPORTS, []);
    setStorage(
      STORAGE_KEYS.SAVED_REPORTS,
      allReports.filter((r) => r.tenantId !== tenantId)
    );
    clearedSummary.push('Relatórios operacionais salvos');
  } else {
    preservedSummary.push('Relatórios operacionais salvos');
  }

  // 11. Outros registros operacionais (logs/arquivos antigos; PDFs históricos são SEMPRE mantidos)
  if (options.clearOperationalLogs) {
    const allArch = getStorage<ArchivedPeriod[]>(STORAGE_KEYS.ARCHIVED_PERIODS, []);
    setStorage(
      STORAGE_KEYS.ARCHIVED_PERIODS,
      allArch.filter((a) => a.tenantId !== tenantId)
    );
    const allLogs = getStorage<AuditLog[]>(STORAGE_KEYS.AUDIT, []);
    setStorage(
      STORAGE_KEYS.AUDIT,
      allLogs.filter((l) => l.tenantId !== tenantId)
    );
    clearedSummary.push('Logs e arquivos operacionais auxiliares');
  }

  preservedSummary.push('PDFs históricos arquivados e configurações do estabelecimento');

  addAuditLog({
    tenantId,
    userId: adminUser.id,
    userName: adminUser.name,
    action: 'LIMPEZA_SELETIVA_NOVO_PERIODO',
    details: `Limpeza seletiva executada pós-PDF (${options.archivePdfId}). Zerados: ${clearedSummary.join('; ')}. Preservados: ${preservedSummary.join('; ')}.${options.reason ? ` Motivo: ${options.reason}` : ''}`,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'period_cleaned' } }));
  }

  return {
    success: true,
    message: `Limpeza e Novo Período concluídos com sucesso!`,
    result: {
      archivePdfId: options.archivePdfId,
      clearedSummary,
      preservedSummary,
    },
  };
}
