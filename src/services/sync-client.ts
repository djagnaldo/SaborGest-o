/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ArchivedPeriodPdf,
  Category,
  Customer,
  Product,
  RestaurantTable,
  SelectiveResetOptions,
  SelectiveResetResult,
  Supplier,
  UserProfile,
  WebAccessMode,
  WebAccessStatusResponse,
  WebAccessKeySummary,
  WebSessionInfo,
} from '../types';
import {
  isAndroidNativeHost,
  getNativeServerStatus,
  startNativeServer,
  stopNativeServer,
  subscribeNativeServerStatus,
  type NativeServerStatus,
} from './native-server';

export interface WebPortalAuthState {
  token: string;
  session: WebSessionInfo;
  user: UserProfile;
}

interface QueuedRequest {
  id: string;
  path: string;
  method: 'POST';
  body: any;
  createdAt: string;
}

const WEB_AUTH_STORAGE_KEY = 'sabor_web_portal_auth';
const OFFLINE_QUEUE_KEY = 'sabor_offline_mutation_queue';
const NATIVE_PORT_STORAGE_KEY = 'sabor_native_server_port';

let matrizSecret: string | null = null;
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let applyingRemoteState = false;
let currentRevision = 0;
let wsConnected = false;

// Estado real do servidor nativo no APK Android
let nativeServerRunning = false;
let activeNativePort: number | null = null;
let lastNativeStatus: NativeServerStatus | null = null;
let nativeListenerAttached = false;

type SnapshotApplier = (data: Record<string, any>) => void;
let snapshotApplier: SnapshotApplier | null = null;

export function registerSnapshotApplier(fn: SnapshotApplier): void {
  snapshotApplier = fn;
}

export function isApplyingRemoteState(): boolean {
  return applyingRemoteState;
}

export function isWebPortalUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('portal') === 'web' || Boolean(getWebPortalAuth());
}

export function getSavedNativeServerPort(): number {
  if (typeof window === 'undefined') return 3000;
  try {
    const raw = localStorage.getItem(NATIVE_PORT_STORAGE_KEY);
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1024 && num <= 65535) return num;
  } catch {
    // noop
  }
  return 3000;
}

export function saveNativeServerPort(port: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      localStorage.setItem(NATIVE_PORT_STORAGE_KEY, String(port));
    }
  } catch {
    // noop
  }
}

function resolveApiUrl(path: string): string {
  if (isAndroidNativeHost() && activeNativePort) {
    return `http://127.0.0.1:${activeNativePort}${path}`;
  }
  return path;
}

function resolveWsUrl(queryString: string): string {
  if (isAndroidNativeHost() && activeNativePort) {
    return `ws://127.0.0.1:${activeNativePort}/ws?${queryString}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws?${queryString}`;
}

export function getHostServerState(): {
  isAndroidHost: boolean;
  running: boolean;
  port: number;
  nativeStatus: NativeServerStatus | null;
} {
  return {
    isAndroidHost: isAndroidNativeHost(),
    running: isAndroidNativeHost() ? nativeServerRunning : true,
    port: activeNativePort || getSavedNativeServerPort(),
    nativeStatus: lastNativeStatus,
  };
}

export function getWebPortalAuth(): WebPortalAuthState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(WEB_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WebPortalAuthState;
  } catch {
    return null;
  }
}

export function setWebPortalAuth(auth: WebPortalAuthState | null): void {
  if (typeof window === 'undefined') return;
  if (!auth) {
    sessionStorage.removeItem(WEB_AUTH_STORAGE_KEY);
  } else {
    sessionStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(auth));
  }
  window.dispatchEvent(new CustomEvent('sabor_web_auth_changed', { detail: auth }));
}

export function getWsConnectionStatus(): { connected: boolean; revision: number } {
  return { connected: wsConnected, revision: currentRevision };
}

function getAuthHeaders(activeUserId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const webAuth = getWebPortalAuth();
  if (webAuth?.token) {
    headers.Authorization = `Bearer ${webAuth.token}`;
    return headers;
  }
  if (matrizSecret) {
    headers['X-Sabor-Matriz-Secret'] = matrizSecret;
    if (activeUserId) {
      headers['X-Sabor-User-Id'] = activeUserId;
    }
  }
  return headers;
}

function getOfflineQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setOfflineQueue(queue: QueuedRequest[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // noop
  }
}

export function enqueueOfflineMutation(path: string, body: any): void {
  const queue = getOfflineQueue();
  queue.push({
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    path,
    method: 'POST',
    body,
    createdAt: new Date().toISOString(),
  });
  setOfflineQueue(queue);
}

export async function flushOfflineQueue(activeUserId?: string): Promise<number> {
  if (isAndroidNativeHost() && (!nativeServerRunning || !activeNativePort)) {
    return 0;
  }
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedRequest[] = [];

  for (let i = 0; i < queue.length; i++) {
    const reqItem = queue[i];
    try {
      const res = await fetch(resolveApiUrl(reqItem.path), {
        method: reqItem.method,
        headers: getAuthHeaders(activeUserId),
        body: JSON.stringify(reqItem.body),
      });
      if (res.ok || res.status === 409) {
        flushed++;
      } else if (res.status >= 400 && res.status < 500) {
        flushed++;
      } else {
        remaining.push(...queue.slice(i));
        break;
      }
    } catch {
      remaining.push(...queue.slice(i));
      break;
    }
  }

  setOfflineQueue(remaining);
  return flushed;
}

export function getOfflineQueueCount(): number {
  return getOfflineQueue().length;
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    activeUserId?: string;
    queueOnOffline?: boolean;
  } = {}
): Promise<T> {
  const method = options.method || 'GET';

  // Em APK Android, quando o servidor nativo está desligado, não tenta requisitar http://localhost/api
  if (isAndroidNativeHost() && (!nativeServerRunning || !activeNativePort)) {
    if (options.queueOnOffline && method === 'POST') {
      enqueueOfflineMutation(path, options.body);
      throw new Error('OFFLINE_QUEUED:Operação salva localmente para sincronização automática ao iniciar o servidor.');
    }
    throw new Error('NATIVE_SERVER_STOPPED:O servidor web nativo está parado neste aparelho Android.');
  }

  try {
    const res = await fetch(resolveApiUrl(path), {
      method,
      headers: getAuthHeaders(options.activeUserId),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && getWebPortalAuth()) {
        const reason = json?.error || 'Sessão expirada ou encerrada pelo Administrador.';
        setWebPortalAuth(null);
        window.dispatchEvent(new CustomEvent('sabor_web_revoked', { detail: { reason } }));
      }
      throw new Error(json?.error || `Erro HTTP ${res.status}`);
    }
    return json as T;
  } catch (err: any) {
    const isNetworkError =
      err?.name === 'TypeError' ||
      String(err?.message || '').toLowerCase().includes('fetch') ||
      String(err?.message || '').toLowerCase().includes('network');
    if (options.queueOnOffline && isNetworkError && method === 'POST') {
      enqueueOfflineMutation(path, options.body);
      throw new Error('OFFLINE_QUEUED:Operação salva localmente para sincronização automática ao reconectar.');
    }
    throw err;
  }
}

function attachNativeStatusListener(tenantId: string, userId?: string): void {
  if (nativeListenerAttached || !isAndroidNativeHost()) return;
  nativeListenerAttached = true;
  subscribeNativeServerStatus((status) => {
    lastNativeStatus = status;
    nativeServerRunning = Boolean(status.running);
    activeNativePort = status.running ? status.port : null;

    if (!status.running) {
      matrizSecret = null;
      disconnectWebSocket();
    } else if (!wsConnected) {
      initRealtimeSync({ tenantId, userId }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('sabor_native_server_status', { detail: status }));
  }).catch(() => {});
}

export async function startAndroidHostServer(params: {
  port: number;
  tenantId: string;
  userId?: string;
  seedSnapshot?: Record<string, any>;
}): Promise<NativeServerStatus> {
  saveNativeServerPort(params.port);
  const status = await startNativeServer(params.port, params.seedSnapshot);
  lastNativeStatus = status;
  nativeServerRunning = Boolean(status.running);
  activeNativePort = status.running ? status.port : null;

  // Se acabou de criar o banco unificado a partir do localStorage atual, evita duplicar fila offline anterior
  if (status.newlySeeded) {
    setOfflineQueue([]);
  }

  window.dispatchEvent(new CustomEvent('sabor_native_server_status', { detail: status }));

  if (status.running) {
    await initRealtimeSync({ tenantId: params.tenantId, userId: params.userId });
  }
  return status;
}

export async function stopAndroidHostServer(): Promise<NativeServerStatus> {
  const status = await stopNativeServer();
  lastNativeStatus = status;
  nativeServerRunning = false;
  activeNativePort = null;
  matrizSecret = null;
  disconnectWebSocket();
  window.dispatchEvent(new CustomEvent('sabor_native_server_status', { detail: status }));
  return status;
}

export async function refreshNativeServerStatus(): Promise<NativeServerStatus | null> {
  if (!isAndroidNativeHost()) return null;
  const status = await getNativeServerStatus();
  lastNativeStatus = status;
  nativeServerRunning = Boolean(status?.running);
  activeNativePort = status?.running ? status.port : null;
  if (!nativeServerRunning) {
    matrizSecret = null;
    disconnectWebSocket();
  }
  return status;
}

export async function initRealtimeSync(params: {
  tenantId: string;
  userId?: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  const webAuth = getWebPortalAuth();
  const isPortal = isWebPortalUrl();

  if (isPortal && !webAuth) {
    disconnectWebSocket();
    return;
  }

  if (isAndroidNativeHost() && !isPortal) {
    attachNativeStatusListener(params.tenantId, params.userId);
    const nativeStatus = await refreshNativeServerStatus();
    if (!nativeStatus?.running) {
      // Servidor nativo no celular está desligado -> mantém app local offline sem simular servidor ativo
      disconnectWebSocket();
      window.dispatchEvent(new CustomEvent('sabor_native_server_status', { detail: nativeStatus }));
      return;
    }
  }

  if (!isPortal) {
    try {
      const handshake = await fetch(resolveApiUrl('/api/auth/matriz-handshake'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isWebPortal: false,
          tenantId: params.tenantId,
          userId: params.userId,
        }),
      });
      if (handshake.ok) {
        const json = await handshake.json();
        matrizSecret = json.matrizSecret;
        if (json.snapshot?.data && snapshotApplier) {
          applySnapshotSafely(json.snapshot.data, json.snapshot.revision);
        }
      }
    } catch {
      // Modo offline local preservado
    }
  }

  connectWebSocket(params.tenantId, params.userId);
}

function applySnapshotSafely(data: Record<string, any>, revision?: number): void {
  if (!snapshotApplier) return;
  if (revision && revision > currentRevision) {
    currentRevision = revision;
  }
  applyingRemoteState = true;
  try {
    snapshotApplier(data);
  } finally {
    applyingRemoteState = false;
  }
  window.dispatchEvent(new CustomEvent('sabor_local_sync', { detail: { source: 'ws_sync', revision } }));
}

export async function refreshSnapshotFromServer(tenantId: string, activeUserId?: string): Promise<void> {
  try {
    const snap = await apiRequest<{
      data?: Record<string, any>;
      revision?: number;
    }>(
      `/api/state/snapshot?tenantId=${encodeURIComponent(tenantId)}`,
      { activeUserId }
    );
    if (snap?.data) {
      applySnapshotSafely(snap.data, snap.revision);
    }
  } catch {
    // noop when offline
  }
}

export function connectWebSocket(tenantId: string, userId?: string): void {
  if (typeof window === 'undefined') return;
  if (isAndroidNativeHost() && (!nativeServerRunning || !activeNativePort)) {
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const webAuth = getWebPortalAuth();
  if (!webAuth && !matrizSecret) return;

  const query = new URLSearchParams();
  if (webAuth?.token) {
    query.set('token', webAuth.token);
  } else if (matrizSecret) {
    query.set('matrizSecret', matrizSecret);
    query.set('tenantId', tenantId);
    if (userId) query.set('userId', userId);
  }

  const url = resolveWsUrl(query.toString());
  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = async () => {
    wsConnected = true;
    window.dispatchEvent(new CustomEvent('sabor_ws_status', { detail: { connected: true, revision: currentRevision } }));
    const flushed = await flushOfflineQueue(userId);
    if (flushed > 0) {
      socket.send(JSON.stringify({ type: 'request:sync' }));
    }
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'state:sync' && msg.data) {
        applySnapshotSafely(msg.data, msg.revision);
        window.dispatchEvent(
          new CustomEvent('sabor_ws_status', {
            detail: { connected: true, revision: msg.revision || currentRevision },
          })
        );
      } else if (msg.type === 'session:revoked') {
        setWebPortalAuth(null);
        disconnectWebSocket();
        window.dispatchEvent(
          new CustomEvent('sabor_web_revoked', {
            detail: { reason: msg.reason || 'Sessão desconectada pelo Administrador.' },
          })
        );
      }
    } catch {
      // noop
    }
  };

  socket.onclose = () => {
    wsConnected = false;
    ws = null;
    window.dispatchEvent(new CustomEvent('sabor_ws_status', { detail: { connected: false, revision: currentRevision } }));

    // Reconexão automática somente se o servidor estiver ativo e não tiver sido revogado
    const canReconnect =
      (!isAndroidNativeHost() || nativeServerRunning) &&
      (Boolean(getWebPortalAuth()) || (!isWebPortalUrl() && Boolean(matrizSecret)));

    if (canReconnect) {
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(() => {
        connectWebSocket(tenantId, userId);
      }, 2500);
    }
  };
}

export function disconnectWebSocket(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    try {
      ws.close();
    } catch {
      // noop
    }
    ws = null;
  }
  wsConnected = false;
}

export function scheduleStatePushToServer(
  collectLocalState: () => Record<string, any>,
  tenantId: string,
  activeUserId?: string
): void {
  if (applyingRemoteState) return;
  if (typeof window === 'undefined') return;
  if (isAndroidNativeHost() && (!nativeServerRunning || !activeNativePort)) return;
  const webAuth = getWebPortalAuth();
  if (!webAuth && !matrizSecret) return;
  if (webAuth?.session.mode === 'seller') return;

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    try {
      await apiRequest('/api/state/sync', {
        method: 'POST',
        activeUserId,
        body: {
          tenantId,
          data: collectLocalState(),
        },
      });
    } catch {
      // Em falha transitória de rede, próximo ciclo ou reconexão sincroniza
    }
  }, 180);
}

// ==================================================
// CLIENT API HELPERS (Acesso Web, Mesas, Balcão)
// ==================================================

export async function loginWithWebKey(accessKey: string, deviceLabel?: string): Promise<WebPortalAuthState> {
  const res = await fetch(resolveApiUrl('/api/auth/key-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey, deviceLabel }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || 'Chave de acesso inválida.');
  }
  const authState: WebPortalAuthState = {
    token: json.token,
    session: json.session,
    user: json.user,
  };
  setWebPortalAuth(authState);
  if (json.snapshot?.data && snapshotApplier) {
    applySnapshotSafely(json.snapshot.data, json.snapshot.revision);
  }
  connectWebSocket(authState.session.tenantId, authState.user.id);
  return authState;
}

export async function logoutWebPortal(): Promise<void> {
  const auth = getWebPortalAuth();
  if (auth?.token) {
    try {
      await fetch(resolveApiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
    } catch {
      // noop
    }
  }
  setWebPortalAuth(null);
  disconnectWebSocket();
}

export async function fetchWebAccessStatus(tenantId: string, activeUserId?: string): Promise<WebAccessStatusResponse> {
  return apiRequest<WebAccessStatusResponse>(
    `/api/web-access/status?tenantId=${encodeURIComponent(tenantId)}`,
    { activeUserId }
  );
}

export async function toggleWebAccessServer(
  enabled: boolean,
  tenantId: string,
  activeUserId?: string
): Promise<{ webAccessEnabled: boolean; revokedSessionIds: string[] }> {
  return apiRequest('/api/web-access/toggle', {
    method: 'POST',
    activeUserId,
    body: { enabled, tenantId },
  });
}

export async function generateWebAccessKey(params: {
  tenantId: string;
  mode: WebAccessMode;
  userId?: string;
  expiresInHours?: number;
  activeUserId?: string;
}): Promise<{ keySummary: WebAccessKeySummary; plainKey: string }> {
  return apiRequest('/api/web-access/keys', {
    method: 'POST',
    activeUserId: params.activeUserId,
    body: {
      tenantId: params.tenantId,
      mode: params.mode,
      userId: params.userId,
      expiresInHours: params.expiresInHours || 24,
    },
  });
}

export async function renewWebAccessKey(
  keyId: string,
  expiresInHours = 24,
  activeUserId?: string
): Promise<{ keySummary: WebAccessKeySummary; plainKey: string }> {
  return apiRequest(`/api/web-access/keys/${encodeURIComponent(keyId)}/renew`, {
    method: 'POST',
    activeUserId,
    body: { expiresInHours },
  });
}

export async function revokeWebAccessKey(keyId: string, activeUserId?: string): Promise<void> {
  await apiRequest(`/api/web-access/keys/${encodeURIComponent(keyId)}/revoke`, {
    method: 'POST',
    activeUserId,
  });
}

export async function disconnectWebSession(sessionId: string, activeUserId?: string): Promise<void> {
  await apiRequest(`/api/web-access/sessions/${encodeURIComponent(sessionId)}/disconnect`, {
    method: 'POST',
    activeUserId,
  });
}

export async function fetchQrDataUrl(targetUrl: string, activeUserId?: string): Promise<string> {
  const res = await apiRequest<{ qrDataUrl: string }>(
    `/api/web-access/qr?url=${encodeURIComponent(targetUrl)}`,
    { activeUserId }
  );
  return res.qrDataUrl;
}

// ==================================================
// MÍDIA, MESAS, CATÁLOGO, CONTATOS E ARQUIVOS PDF
// ==================================================

export async function uploadMediaFile(
  dataUrl: string,
  prefix = 'prod',
  activeUserId?: string
): Promise<{ fileName: string; url: string }> {
  return apiRequest('/api/media/upload', {
    method: 'POST',
    activeUserId,
    body: { dataUrl, prefix },
  });
}

export async function updateTableStatusApi(
  tenantId: string,
  tableId: string,
  status: 'available' | 'occupied' | 'closing',
  activeUserId?: string
): Promise<{ table: RestaurantTable; revision: number }> {
  return apiRequest(`/api/tables/${encodeURIComponent(tableId)}/status`, {
    method: 'POST',
    activeUserId,
    body: { tenantId, status },
  });
}

export async function upsertCategoryApi(
  tenantId: string,
  category: Partial<Category> & { name: string },
  activeUserId?: string
): Promise<{ category: Category }> {
  if (category.id) {
    return apiRequest(`/api/catalog/categories/${encodeURIComponent(category.id)}`, {
      method: 'PUT',
      activeUserId,
      body: { ...category, tenantId },
    });
  }
  return apiRequest('/api/catalog/categories', {
    method: 'POST',
    activeUserId,
    body: { ...category, tenantId },
  });
}

export async function deleteCategoryApi(
  tenantId: string,
  categoryId: string,
  strategy: 'transfer' | 'uncategorized',
  targetCategoryId?: string,
  activeUserId?: string
): Promise<{ movedProductsCount: number }> {
  const qs = new URLSearchParams({ tenantId, strategy });
  if (targetCategoryId) qs.set('targetCategoryId', targetCategoryId);
  return apiRequest(`/api/catalog/categories/${encodeURIComponent(categoryId)}?${qs.toString()}`, {
    method: 'DELETE',
    activeUserId,
    body: { tenantId, strategy, targetCategoryId },
  });
}

export async function upsertProductApi(
  tenantId: string,
  product: Partial<Product> & { name: string },
  activeUserId?: string
): Promise<{ product: Product }> {
  if (product.id) {
    return apiRequest(`/api/catalog/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      activeUserId,
      body: { ...product, tenantId },
    });
  }
  return apiRequest('/api/catalog/products', {
    method: 'POST',
    activeUserId,
    body: { ...product, tenantId },
  });
}

export async function deleteProductApi(
  tenantId: string,
  productId: string,
  activeUserId?: string
): Promise<{ actionTaken: 'deleted' | 'deactivated'; message: string }> {
  return apiRequest(
    `/api/catalog/products/${encodeURIComponent(productId)}?tenantId=${encodeURIComponent(tenantId)}`,
    {
      method: 'DELETE',
      activeUserId,
    }
  );
}

export async function upsertCustomerApi(
  tenantId: string,
  customer: Partial<Customer> & { name: string },
  activeUserId?: string
): Promise<{ customer: Customer }> {
  if (customer.id) {
    return apiRequest(`/api/contacts/customers/${encodeURIComponent(customer.id)}`, {
      method: 'PUT',
      activeUserId,
      body: { ...customer, tenantId },
    });
  }
  return apiRequest('/api/contacts/customers', {
    method: 'POST',
    activeUserId,
    body: { ...customer, tenantId },
  });
}

export async function deleteCustomerApi(
  tenantId: string,
  customerId: string,
  activeUserId?: string
): Promise<void> {
  await apiRequest(
    `/api/contacts/customers/${encodeURIComponent(customerId)}?tenantId=${encodeURIComponent(tenantId)}`,
    {
      method: 'DELETE',
      activeUserId,
    }
  );
}

export async function upsertSupplierApi(
  tenantId: string,
  supplier: Partial<Supplier> & { name: string },
  activeUserId?: string
): Promise<{ supplier: Supplier }> {
  if (supplier.id) {
    return apiRequest(`/api/contacts/suppliers/${encodeURIComponent(supplier.id)}`, {
      method: 'PUT',
      activeUserId,
      body: { ...supplier, tenantId },
    });
  }
  return apiRequest('/api/contacts/suppliers', {
    method: 'POST',
    activeUserId,
    body: { ...supplier, tenantId },
  });
}

export async function deleteSupplierApi(
  tenantId: string,
  supplierId: string,
  activeUserId?: string
): Promise<void> {
  await apiRequest(
    `/api/contacts/suppliers/${encodeURIComponent(supplierId)}?tenantId=${encodeURIComponent(tenantId)}`,
    {
      method: 'DELETE',
      activeUserId,
    }
  );
}

export async function fetchArchivedPdfsApi(
  tenantId: string,
  activeUserId?: string
): Promise<ArchivedPeriodPdf[]> {
  const res = await apiRequest<{ archivePdfs: ArchivedPeriodPdf[] }>(
    `/api/admin/archive-pdfs?tenantId=${encodeURIComponent(tenantId)}`,
    { activeUserId }
  );
  return res.archivePdfs || [];
}

export async function saveArchivedPdfApi(
  pdf: ArchivedPeriodPdf,
  activeUserId?: string
): Promise<ArchivedPeriodPdf> {
  const res = await apiRequest<{ archivePdf: ArchivedPeriodPdf }>('/api/admin/archive-pdfs', {
    method: 'POST',
    activeUserId,
    body: pdf,
  });
  return res.archivePdf;
}

export async function executeResetPeriodApi(
  tenantId: string,
  payload: SelectiveResetOptions,
  activeUserId?: string
): Promise<SelectiveResetResult> {
  return apiRequest('/api/admin/reset-period', {
    method: 'POST',
    activeUserId,
    body: { ...payload, tenantId },
  });
}
