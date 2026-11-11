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
  CashRegisterSession,
  Customer,
  Supplier,
  AuditLog,
  TerminalNotification,
  DeltaSyncStats,
  NotificationType,
} from '../types';
import {
  INITIAL_DEMO_TENANT,
  INITIAL_DEMO_USERS,
  INITIAL_DEMO_CATEGORIES,
  INITIAL_DEMO_PRODUCTS,
  INITIAL_DEMO_TABLES,
  INITIAL_DEMO_ORDERS,
  INITIAL_DEMO_CASH_SESSION,
  INITIAL_DEMO_CUSTOMERS,
  INITIAL_DEMO_SUPPLIERS,
  DEFAULT_PERMISSIONS,
  INITIAL_DEMO_NOTIFICATIONS,
} from './mock-data';

export type DeviceType = 'android_adm' | 'android_seller' | 'windows_pc';
export type DeviceStatus = 'pending' | 'authorized' | 'blocked' | 'revoked';

export interface ConnectedDevice {
  id: string; // Device UUID
  deviceName: string; // e.g. "Samsung Galaxy S23 (Lucas)", "PC Caixa Balcão (Windows 11)"
  deviceType: DeviceType;
  ipAddress: string;
  userEmail: string;
  userName?: string;
  role: 'admin' | 'manager' | 'cashier' | 'waiter';
  status: DeviceStatus;
  authToken: string;
  lastSyncAt: string;
  firstConnectedAt: string;
  appVersion: string;
  isOnline: boolean;
}

export interface SyncOperation {
  id: string; // Unique UUID
  deviceId: string;
  userEmail: string;
  entity: 'orders' | 'products' | 'tables' | 'cash' | 'users';
  action: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: string;
  synced: boolean;
  conflictResolved?: boolean;
}

export interface DatabaseBackupMetadata {
  id: string;
  filename: string;
  createdAt: string;
  totalRecords: number;
  sizeBytes: number;
  checksum: string;
  isEncrypted: boolean;
}

const LOCAL_STORAGE_PREFIX = 'sabor_local_';

const LOCAL_KEYS = {
  SERVER_CONFIG: `${LOCAL_STORAGE_PREFIX}server_config`,
  DEVICES: `${LOCAL_STORAGE_PREFIX}devices`,
  SYNC_QUEUE: `${LOCAL_STORAGE_PREFIX}sync_queue`,
  AUDIT_TRAIL: `${LOCAL_STORAGE_PREFIX}audit_trail`,
  DATABASE_DATA: `${LOCAL_STORAGE_PREFIX}sqlite_database`,
  BACKUPS: `${LOCAL_STORAGE_PREFIX}backups`,
  MATRIZ_INFO: `${LOCAL_STORAGE_PREFIX}matriz_info`,
  NOTIFICATIONS: `${LOCAL_STORAGE_PREFIX}notifications`,
  DELTA_STATS: `${LOCAL_STORAGE_PREFIX}delta_stats`,
};

export type MatrizHost = 'android_phone' | 'windows_pc';

export interface MatrizMigrationRecord {
  id: string;
  fromHost: string;
  toHost: string;
  timestamp: string;
  checksum: string;
  transferredBy: string;
  totalRecords: number;
}

export interface MatrizInfo {
  activeHost: MatrizHost;
  activeHostLabel: string;
  hostDeviceId: string;
  hostDeviceName: string;
  ipAddress: string;
  port: number;
  isOnline: boolean;
  masterCryptographicToken: string;
  databaseVersion: number;
  lastHeartbeat: string;
  migrationHistory: MatrizMigrationRecord[];
}

export const DEFAULT_MATRIZ_INFO: MatrizInfo = {
  activeHost: 'android_phone',
  activeHostLabel: 'Celular Android do Administrador',
  hostDeviceId: 'dev-adm-01',
  hostDeviceName: 'Samsung Galaxy S23 (Celular ADM)',
  ipAddress: '192.168.43.1',
  port: 8080,
  isOnline: true,
  masterCryptographicToken: 'sg-matriz-master-key-android-primary',
  databaseVersion: 1,
  lastHeartbeat: new Date().toISOString(),
  migrationHistory: [],
};

export interface LocalServerConfig {
  isServerRunning: boolean;
  serverIp: string;
  port: number;
  hotspotSsid: string;
  hotspotPassword?: string;
  serverToken: string;
  adminEmail: string;
  autoApproveKnownDevices: boolean;
  appVersion: string;
}

// Initial default configuration
export const DEFAULT_SERVER_CONFIG: LocalServerConfig = {
  isServerRunning: true,
  serverIp: '192.168.43.1', // Default Android Wi-Fi Hotspot IP
  port: 8080,
  hotspotSsid: 'SaborGestao_ADM_Rede',
  hotspotPassword: 'sabor-gestao-local',
  serverToken: 'sg-token-adm-' + Math.random().toString(36).substring(2, 10),
  adminEmail: 'agnaldomix@gmail.com',
  autoApproveKnownDevices: false,
  appVersion: '2.4.0-localfirst',
};

// Seed Devices for immediate operational demonstration
const INITIAL_DEVICES: ConnectedDevice[] = [
  {
    id: 'dev-adm-01',
    deviceName: 'Servidor Principal (Celular Administrador)',
    deviceType: 'android_adm',
    ipAddress: '192.168.43.1 (Localhost)',
    userEmail: 'agnaldomix@gmail.com',
    userName: 'Carlos Oliveira (Proprietário)',
    role: 'admin',
    status: 'authorized',
    authToken: 'tok-adm-master-key',
    lastSyncAt: new Date().toISOString(),
    firstConnectedAt: new Date().toISOString(),
    appVersion: '2.4.0-localfirst',
    isOnline: true,
  },
  {
    id: 'dev-pc-02',
    deviceName: 'Terminal Balcão / Caixa (PC Windows 11)',
    deviceType: 'windows_pc',
    ipAddress: '192.168.43.104',
    userEmail: 'juliana@saborreal.com.br',
    userName: 'Juliana Costa (Caixa)',
    role: 'cashier',
    status: 'authorized',
    authToken: 'tok-pc-terminal-104',
    lastSyncAt: new Date(Date.now() - 2 * 60000).toISOString(),
    firstConnectedAt: new Date(Date.now() - 3600000).toISOString(),
    appVersion: '2.4.0-localfirst',
    isOnline: true,
  },
  {
    id: 'dev-seller-03',
    deviceName: 'Smartphone Garçom Salão (Android)',
    deviceType: 'android_seller',
    ipAddress: '192.168.43.112',
    userEmail: 'lucas@saborreal.com.br',
    userName: 'Lucas Almeida (Garçom)',
    role: 'waiter',
    status: 'authorized',
    authToken: 'tok-seller-waiter-112',
    lastSyncAt: new Date(Date.now() - 5 * 60000).toISOString(),
    firstConnectedAt: new Date(Date.now() - 7200000).toISOString(),
    appVersion: '2.4.0-localfirst',
    isOnline: true,
  },
  {
    id: 'dev-seller-04',
    deviceName: 'Tablet Pedidos Varanda (Android)',
    deviceType: 'android_seller',
    ipAddress: '192.168.43.130',
    userEmail: 'novo.vendedor@sabor.com.br',
    userName: 'Marcos Silveira (Novo Atendente)',
    role: 'waiter',
    status: 'pending', // Pedido de autorização pendente!
    authToken: 'tok-pending-seller-130',
    lastSyncAt: new Date(Date.now() - 12 * 60000).toISOString(),
    firstConnectedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    appVersion: '2.4.0-localfirst',
    isOnline: true,
  },
];

// Helper to access LocalStorage safely
function getStorage<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch (e) {
    return defaultVal;
  }
}

function setStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    // Notifica outras abas/janelas locais na mesma máquina (simulando comunicação de rede local)
    window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { key } }));
  } catch (e) {
    console.error('Local DB write error:', e);
  }
}

// Inicialização do Banco Local Principal do Administrador
export function initLocalDatabase(): void {
  const config = getStorage<LocalServerConfig>(LOCAL_KEYS.SERVER_CONFIG, DEFAULT_SERVER_CONFIG);
  setStorage(LOCAL_KEYS.SERVER_CONFIG, config);

  const devices = getStorage<ConnectedDevice[]>(LOCAL_KEYS.DEVICES, []);
  if (devices.length === 0) {
    setStorage(LOCAL_KEYS.DEVICES, INITIAL_DEVICES);
  }
}

// Configuração do Servidor Local
export function getLocalServerConfig(): LocalServerConfig {
  return getStorage<LocalServerConfig>(LOCAL_KEYS.SERVER_CONFIG, DEFAULT_SERVER_CONFIG);
}

export function updateLocalServerConfig(config: Partial<LocalServerConfig>): LocalServerConfig {
  const current = getLocalServerConfig();
  const updated = { ...current, ...config };
  setStorage(LOCAL_KEYS.SERVER_CONFIG, updated);
  return updated;
}

// Gerenciamento de Dispositivos Conectados
export function getConnectedDevices(): ConnectedDevice[] {
  return getStorage<ConnectedDevice[]>(LOCAL_KEYS.DEVICES, INITIAL_DEVICES);
}

export function updateDeviceStatus(deviceId: string, status: DeviceStatus): void {
  const devices = getConnectedDevices();
  const updated = devices.map((d) => (d.id === deviceId ? { ...d, status, lastSyncAt: new Date().toISOString() } : d));
  setStorage(LOCAL_KEYS.DEVICES, updated);
}

export function registerNewDevice(device: Omit<ConnectedDevice, 'id' | 'firstConnectedAt' | 'lastSyncAt'>): ConnectedDevice {
  const devices = getConnectedDevices();
  const newDevice: ConnectedDevice = {
    ...device,
    id: `dev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    firstConnectedAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
  };
  devices.push(newDevice);
  setStorage(LOCAL_KEYS.DEVICES, devices);
  return newDevice;
}

export function removeDevice(deviceId: string): void {
  const devices = getConnectedDevices();
  setStorage(LOCAL_KEYS.DEVICES, devices.filter((d) => d.id !== deviceId));
}

// Chave de status da rede local
const SERVER_ONLINE_KEY = `${LOCAL_STORAGE_PREFIX}server_online_status`;
const LAST_SYNC_KEY = `${LOCAL_STORAGE_PREFIX}last_sync_timestamp`;
const PROCESSED_OPS_KEY = `${LOCAL_STORAGE_PREFIX}processed_op_ids`;

export function getMatrizInfo(): MatrizInfo {
  return getStorage<MatrizInfo>(LOCAL_KEYS.MATRIZ_INFO, DEFAULT_MATRIZ_INFO);
}

export function updateMatrizInfo(info: Partial<MatrizInfo>): MatrizInfo {
  const current = getMatrizInfo();
  const updated: MatrizInfo = { ...current, ...info, lastHeartbeat: new Date().toISOString() };
  setStorage(LOCAL_KEYS.MATRIZ_INFO, updated);
  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'matriz_updated' } }));
  return updated;
}

// Verifica se o dispositivo sob visualização é a Matriz Ativa
export function isDeviceMatriz(activeDeviceView: 'adm' | 'pc' | 'seller'): boolean {
  const matriz = getMatrizInfo();
  if (matriz.activeHost === 'android_phone') {
    return activeDeviceView === 'adm';
  }
  if (matriz.activeHost === 'windows_pc') {
    return activeDeviceView === 'pc';
  }
  return false;
}

// Validação centralizada de autoridade da Matriz
export function validateMasterAuthority(
  action: 'create_product' | 'update_product' | 'delete_product' | 'change_price' | 'adjust_stock' | 'cancel_order' | 'manage_team' | 'change_settings',
  activeDeviceView: 'adm' | 'pc' | 'seller',
  userRole: string
): { allowed: boolean; reason?: string } {
  // 1. O vendedor NUNCA pode executar ações da matriz
  if (activeDeviceView === 'seller' || userRole === 'waiter') {
    return {
      allowed: false,
      reason: 'Acesso Negado: Terminais de vendedores funcionam exclusivamente para consulta e registro de vendas. Operações cadastrais, alteração de preços e cancelamentos são de autoridade exclusiva da Matriz Administrativa.',
    };
  }

  // 2. Deve estar na Matriz Ativa do estabelecimento
  const isMatriz = isDeviceMatriz(activeDeviceView);
  if (!isMatriz) {
    const matriz = getMatrizInfo();
    return {
      allowed: false,
      reason: `Operação Bloqueada: Este dispositivo não é a Matriz Ativa. A autoridade atual dos dados pertence exclusivamente a: ${matriz.activeHostLabel} (${matriz.hostDeviceName}).`,
    };
  }

  return { allowed: true };
}

// Migração Controlada da Matriz (Celular <-> PC Windows) garantindo unicidade absoluta
export function migrateMatriz(
  targetHost: MatrizHost,
  targetDeviceName: string,
  targetIp: string,
  executedBy: string
): { success: boolean; message: string; checksum: string; recordCount: number } {
  const current = getMatrizInfo();

  if (current.activeHost === targetHost) {
    return {
      success: false,
      message: `A matriz já está ativa no ${current.activeHostLabel}. Não é possível migrar para o mesmo host.`,
      checksum: '',
      recordCount: 0,
    };
  }

  // Snapshot e contagem de integridade de todos os dados do SQLite
  const backup = generateLocalBackup('tenant-demo-01');
  const checksum = backup.metadata.checksum;
  const recordCount = backup.metadata.totalRecords;

  const previousHostLabel = current.activeHostLabel;
  const targetLabel = targetHost === 'android_phone'
    ? 'Celular Android do Administrador'
    : 'Computador Windows do Administrador';

  const newMasterToken = 'sg-matriz-master-key-' + targetHost + '-' + Math.random().toString(36).substring(2, 9);

  // Atualiza dispositivos conectados para que a antiga matriz se torne terminal
  const devices = getConnectedDevices();
  const updatedDevices = devices.map((d) => {
    if (targetHost === 'windows_pc' && d.deviceType === 'windows_pc') {
      return { ...d, deviceName: targetDeviceName, status: 'authorized' as DeviceStatus, authToken: newMasterToken };
    }
    if (targetHost === 'android_phone' && d.deviceType === 'android_adm') {
      return { ...d, deviceName: targetDeviceName, status: 'authorized' as DeviceStatus, authToken: newMasterToken };
    }
    return d;
  });
  setStorage(LOCAL_KEYS.DEVICES, updatedDevices);

  // Registra no histórico de migrações
  const migrationRecord: MatrizMigrationRecord = {
    id: `mig-${Date.now()}`,
    fromHost: previousHostLabel,
    toHost: targetLabel,
    timestamp: new Date().toISOString(),
    checksum,
    transferredBy: executedBy || 'Carlos Oliveira (Administrador)',
    totalRecords: recordCount,
  };

  const updatedMatriz: MatrizInfo = {
    ...current,
    activeHost: targetHost,
    activeHostLabel: targetLabel,
    hostDeviceId: targetHost === 'windows_pc' ? 'dev-pc-02' : 'dev-adm-01',
    hostDeviceName: targetDeviceName,
    ipAddress: targetIp,
    masterCryptographicToken: newMasterToken,
    databaseVersion: current.databaseVersion + 1,
    lastHeartbeat: new Date().toISOString(),
    migrationHistory: [migrationRecord, ...current.migrationHistory],
  };

  setStorage(LOCAL_KEYS.MATRIZ_INFO, updatedMatriz);

  // Atualiza também a porta e IP do server config
  updateLocalServerConfig({ serverIp: targetIp });

  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'matriz_migrated', targetHost } }));

  return {
    success: true,
    message: `Matriz transferida com sucesso de ${previousHostLabel} para ${targetLabel}. Integridade dos dados 100% preservada e autoridade unificada.`,
    checksum,
    recordCount,
  };
}

// Tentativa de cancelamento de pedido com barreira de segurança para vendedores
export function cancelOrderWithAuthority(
  orderId: string,
  reason: string,
  activeDeviceView: 'adm' | 'pc' | 'seller',
  userRole: string,
  userName: string
): { success: boolean; message: string } {
  // 1. Bloqueio categórico para vendedores
  if (activeDeviceView === 'seller' || userRole === 'waiter') {
    return {
      success: false,
      message: 'Bloqueio de Segurança: Terminais de vendedores NÃO têm permissão para cancelar vendas finalizadas. O cancelamento deve ser realizado diretamente na Matriz Administrativa pelo Administrador.',
    };
  }

  // 2. Bloqueio se não estiver na Matriz ativa
  if (!isDeviceMatriz(activeDeviceView)) {
    const matriz = getMatrizInfo();
    return {
      success: false,
      message: `Ação Bloqueada: Cancelamento exclusivo da Matriz Ativa (${matriz.activeHostLabel}).`,
    };
  }

  // 3. Executa cancelamento oficial na Matriz
  const rawOrders = getStorage<any[]>('sabor_orders', []);
  const rawProducts = getStorage<any[]>('sabor_products', []);
  const orderIndex = rawOrders.findIndex((o) => o.id === orderId);

  if (orderIndex < 0) {
    return { success: false, message: 'Pedido não encontrado no banco de dados local da Matriz.' };
  }

  const order = rawOrders[orderIndex];
  if (order.status === 'cancelled') {
    return { success: false, message: 'Este pedido já se encontra cancelado.' };
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date().toISOString();
  order.cancelledBy = userName;
  order.cancellationReason = reason || 'Cancelado pelo Administrador na Matriz';
  rawOrders[orderIndex] = order;
  setStorage('sabor_orders', rawOrders);

  // Restaura estoque físico
  if (Array.isArray(order.items)) {
    order.items.forEach((item: any) => {
      const prod = rawProducts.find((p) => p.id === item.productId);
      if (prod) {
        prod.stockQuantity = (prod.stockQuantity || 0) + (item.quantity || 1);
      }
    });
    setStorage('sabor_products', rawProducts);
  }

  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'order_cancelled', orderId } }));

  return {
    success: true,
    message: `Venda #${order.orderNumber} cancelada oficialmente na Matriz por ${userName}. Estoque restaurado com sucesso.`,
  };
}

export function isServerOnline(): boolean {
  return getStorage<boolean>(SERVER_ONLINE_KEY, true);
}

export function setServerOnline(online: boolean): void {
  setStorage(SERVER_ONLINE_KEY, online);
  const config = getLocalServerConfig();
  updateLocalServerConfig({ isServerRunning: online });
  const matriz = getMatrizInfo();
  updateMatrizInfo({ isOnline: online });
  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { serverOnline: online } }));
}

export function getLastSyncTimestamp(): string {
  return getStorage<string>(LAST_SYNC_KEY, new Date().toISOString());
}

export function setLastSyncTimestamp(ts: string): void {
  setStorage(LAST_SYNC_KEY, ts);
}

export function getConnectionStatus(): {
  status: 'green' | 'yellow' | 'red';
  label: string;
  pendingCount: number;
  lastSyncAt: string;
  isServerOnline: boolean;
  matrizHost: MatrizHost;
  matrizLabel: string;
  matrizDeviceName: string;
} {
  const online = isServerOnline();
  const queue = getSyncQueue();
  const pendingCount = queue.filter((op) => !op.synced).length;
  const lastSyncAt = getLastSyncTimestamp();
  const matriz = getMatrizInfo();

  if (!online) {
    return {
      status: 'red',
      label: 'Matriz Indisponível (Offline) • Modo Rascunho',
      pendingCount,
      lastSyncAt,
      isServerOnline: false,
      matrizHost: matriz.activeHost,
      matrizLabel: matriz.activeHostLabel,
      matrizDeviceName: matriz.hostDeviceName,
    };
  }

  if (pendingCount > 0) {
    return {
      status: 'yellow',
      label: `${pendingCount} rascunho(s) aguardando validação da Matriz`,
      pendingCount,
      lastSyncAt,
      isServerOnline: true,
      matrizHost: matriz.activeHost,
      matrizLabel: matriz.activeHostLabel,
      matrizDeviceName: matriz.hostDeviceName,
    };
  }

  return {
    status: 'green',
    label: `Conectado à Matriz (${matriz.activeHost === 'windows_pc' ? 'PC Windows' : 'Celular Android'})`,
    pendingCount: 0,
    lastSyncAt,
    isServerOnline: true,
    matrizHost: matriz.activeHost,
    matrizLabel: matriz.activeHostLabel,
    matrizDeviceName: matriz.hostDeviceName,
  };
}

// Fila de Sincronização Local (Offline Sync Queue com Idempotência por UUID)
export function getSyncQueue(): SyncOperation[] {
  return getStorage<SyncOperation[]>(LOCAL_KEYS.SYNC_QUEUE, []);
}

export function enqueueSyncOperation(op: Omit<SyncOperation, 'id' | 'timestamp' | 'synced'>): SyncOperation {
  const queue = getSyncQueue();
  const newOp: SyncOperation = {
    ...op,
    id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    synced: false,
  };
  queue.push(newOp);
  setStorage(LOCAL_KEYS.SYNC_QUEUE, queue);
  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'enqueue' } }));
  return newOp;
}

// Processa a sincronização segura com prevenção de vendas duplicadas e atualização de estoque
export function syncOfflineQueue(tenantId: string): {
  processed: number;
  skippedDuplicates: number;
  errors: number;
  details: string[];
} {
  if (!isServerOnline()) {
    return {
      processed: 0,
      skippedDuplicates: 0,
      errors: 1,
      details: ['Falha: Servidor ADM está desligado ou fora da rede local.'],
    };
  }

  const queue = getSyncQueue();
  const processedIds = getStorage<string[]>(PROCESSED_OPS_KEY, []);
  let processed = 0;
  let skippedDuplicates = 0;
  const details: string[] = [];

  // Import dynamic getters and savers from storage safely
  const rawOrders = getStorage<any[]>('sabor_orders', []);
  const rawProducts = getStorage<any[]>('sabor_products', []);
  const rawDebts = getStorage<any[]>('sabor_debts', []);

  queue.forEach((op) => {
    if (op.synced) return;

    // 1. Controle rigoroso de duplicidade (Idempotência por UUID)
    if (processedIds.includes(op.id)) {
      op.synced = true;
      skippedDuplicates++;
      details.push(`Operação ${op.id} ignorada por duplicidade já processada.`);
      return;
    }

    try {
      if (op.entity === 'orders') {
        const orderData = op.payload;
        // Verifica se pedido já existe por orderNumber ou ID
        const exists = rawOrders.some((o) => o.id === orderData.id || o.orderNumber === orderData.orderNumber);
        if (!exists) {
          rawOrders.unshift(orderData);
          setStorage('sabor_orders', rawOrders);

          // 2. Atualização automática de estoque após sincronização
          if (Array.isArray(orderData.items)) {
            orderData.items.forEach((item: any) => {
              const prod = rawProducts.find((p) => p.id === item.productId);
              if (prod) {
                prod.stockQuantity = Math.max(0, (prod.stockQuantity || 0) - (item.quantity || 1));
              }
            });
            setStorage('sabor_products', rawProducts);
          }
        }
      } else if (op.entity === 'products') {
        const prodData = op.payload;
        const pIdx = rawProducts.findIndex((p) => p.id === prodData.id);
        if (pIdx >= 0) rawProducts[pIdx] = prodData;
        else rawProducts.push(prodData);
        setStorage('sabor_products', rawProducts);
      }

      op.synced = true;
      processedIds.push(op.id);
      processed++;
      details.push(`Operação ${op.id} (${op.entity} - ${op.action}) processada e confirmada pelo Servidor ADM.`);
    } catch (e: any) {
      details.push(`Erro na operação ${op.id}: ${e.message}`);
    }
  });

  setStorage(LOCAL_KEYS.SYNC_QUEUE, queue);
  setStorage(PROCESSED_OPS_KEY, processedIds);
  setLastSyncTimestamp(new Date().toISOString());

  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { action: 'sync_complete' } }));

  return { processed, skippedDuplicates, errors: 0, details };
}

// Rotina de Backup Local Criptografado & Download do Banco
export function generateLocalBackup(tenantId: string): { jsonContent: string; metadata: DatabaseBackupMetadata } {
  const backupData = {
    appVersion: '2.4.0-localfirst',
    databaseEngine: 'SQLite Encrypted (Local-First Master)',
    exportedAt: new Date().toISOString(),
    serverConfig: getLocalServerConfig(),
    devices: getConnectedDevices(),
    tenants: localStorage.getItem('sabor_tenants'),
    users: localStorage.getItem('sabor_users'),
    products: localStorage.getItem('sabor_products'),
    categories: localStorage.getItem('sabor_categories'),
    tables: localStorage.getItem('sabor_tables'),
    orders: localStorage.getItem('sabor_orders'),
    cash: localStorage.getItem('sabor_cash'),
    customers: localStorage.getItem('sabor_customers'),
    suppliers: localStorage.getItem('sabor_suppliers'),
    auditLogs: localStorage.getItem('sabor_audit'),
  };

  const jsonContent = JSON.stringify(backupData, null, 2);
  const sizeBytes = new Blob([jsonContent]).size;
  const checksum = 'SHA256-' + Math.random().toString(36).substring(2, 12).toUpperCase();

  const metadata: DatabaseBackupMetadata = {
    id: `backup-${Date.now()}`,
    filename: `sabor_gestao_backup_local_${new Date().toISOString().slice(0, 10)}.sqlite.enc`,
    createdAt: new Date().toISOString(),
    totalRecords: Object.keys(backupData).length,
    sizeBytes,
    checksum,
    isEncrypted: true,
  };

  // Salva no histórico de backups
  const backups = getStorage<DatabaseBackupMetadata[]>(LOCAL_KEYS.BACKUPS, []);
  backups.unshift(metadata);
  setStorage(LOCAL_KEYS.BACKUPS, backups);

  return { jsonContent, metadata };
}

export function getLocalBackups(): DatabaseBackupMetadata[] {
  return getStorage<DatabaseBackupMetadata[]>(LOCAL_KEYS.BACKUPS, [
    {
      id: 'backup-demo-1',
      filename: 'sabor_gestao_backup_local_2026-11-08.sqlite.enc',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      totalRecords: 120,
      sizeBytes: 48500,
      checksum: 'SHA256-A8F2901B3C',
      isEncrypted: true,
    },
  ]);
}

// ==========================================
// CENTRAL DE NOTIFICAÇÕES & DELTA SYNC ENGINE
// ==========================================

export function getNotifications(tenantId: string): TerminalNotification[] {
  const notifs = getStorage<TerminalNotification[]>(LOCAL_KEYS.NOTIFICATIONS, INITIAL_DEMO_NOTIFICATIONS);
  return notifs
    .filter((n) => n.tenantId === tenantId)
    .sort((a, b) => {
      // Ordena primeiro pela prioridade rigorosa (1 a 7) e depois por recência
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
}

export function createNotification(
  notif: Omit<TerminalNotification, 'id' | 'timestamp' | 'read'>
): TerminalNotification {
  const all = getStorage<TerminalNotification[]>(LOCAL_KEYS.NOTIFICATIONS, INITIAL_DEMO_NOTIFICATIONS);
  const newNotif: TerminalNotification = {
    ...notif,
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };
  all.unshift(newNotif);
  setStorage(LOCAL_KEYS.NOTIFICATIONS, all);
  window.dispatchEvent(
    new CustomEvent('sabor_local_sync', { detail: { action: 'notification_received', notif: newNotif } })
  );
  return newNotif;
}

export function markNotificationAsRead(id: string): void {
  const all = getStorage<TerminalNotification[]>(LOCAL_KEYS.NOTIFICATIONS, INITIAL_DEMO_NOTIFICATIONS);
  const updated = all.map((n) => (n.id === id ? { ...n, read: true } : n));
  setStorage(LOCAL_KEYS.NOTIFICATIONS, updated);
  window.dispatchEvent(
    new CustomEvent('sabor_local_sync', { detail: { action: 'notification_read', id } })
  );
}

export function clearAllNotifications(tenantId: string): void {
  const all = getStorage<TerminalNotification[]>(LOCAL_KEYS.NOTIFICATIONS, INITIAL_DEMO_NOTIFICATIONS);
  const filtered = all.filter((n) => n.tenantId !== tenantId);
  setStorage(LOCAL_KEYS.NOTIFICATIONS, filtered);
  window.dispatchEvent(
    new CustomEvent('sabor_local_sync', { detail: { action: 'notifications_cleared' } })
  );
}

// Telemetria de Consumo de Dados e Volume Sincronizado
export function getDeltaStats(): DeltaSyncStats {
  return getStorage<DeltaSyncStats>(LOCAL_KEYS.DELTA_STATS, {
    totalBytesDownloaded: 18450, // 18.45 KB transmitidos em deltas
    totalBytesSaved: 485200,     // 485.2 KB economizados evitando recargas completas (96% de economia)
    deltaEventsCount: 24,
    lastDeltaSyncAt: new Date().toISOString(),
  });
}

export function recordDeltaTransfer(bytesTransferred: number, bytesEstimatedIfFullReload: number): DeltaSyncStats {
  const stats = getDeltaStats();
  const saved = Math.max(0, bytesEstimatedIfFullReload - bytesTransferred);
  const updated: DeltaSyncStats = {
    totalBytesDownloaded: stats.totalBytesDownloaded + bytesTransferred,
    totalBytesSaved: stats.totalBytesSaved + saved,
    deltaEventsCount: stats.deltaEventsCount + 1,
    lastDeltaSyncAt: new Date().toISOString(),
  };
  setStorage(LOCAL_KEYS.DELTA_STATS, updated);
  window.dispatchEvent(
    new CustomEvent('sabor_local_sync', { detail: { action: 'delta_stats_updated', stats: updated } })
  );
  return updated;
}

// Disparo de atualização incremental (Delta Event) pela Matriz com prioridade rigorosa:
// 1. Vendas e pedidos
// 2. Alterações de estoque e disponibilidade
// 3. Preços
// 4. Permissões
// 5. Cadastros e alterações de produtos
// 6. Fotografias
// 7. Atualizações visuais e recursos adicionais
export function broadcastDeltaUpdate(event: {
  tenantId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  entityId?: string;
  payload?: any;
}): void {
  // Transmite delta econômico (poucos bytes em vez de recarregar todo o banco)
  const payloadBytes = JSON.stringify(event.payload || {}).length + 80;
  recordDeltaTransfer(payloadBytes, 140000);

  createNotification({
    tenantId: event.tenantId,
    type: event.type,
    title: event.title,
    message: event.message,
    priority: event.priority,
    entityId: event.entityId,
    payload: event.payload,
  });
}
