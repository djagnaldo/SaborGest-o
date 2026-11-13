import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type {
  Tenant,
  UserProfile,
  Category,
  Product,
  RestaurantTable,
  TableStatus,
  TableOperationLog,
  Order,
  OrderItem,
  CashRegisterSession,
  FinancialTransaction,
  InventoryTransaction,
  AuditLog,
  SavedReport,
  ArchivedPeriod,
  ArchivedPeriodPdf,
  SystemBackup,
  SystemThemeConfig,
  TableAccountArchive,
  TablePaymentRecord,
  Customer,
  Supplier,
  SelectiveResetOptions,
  SelectiveResetResult,
  RegeneratedSellerKeyInfo,
  WebAccessMode,
  WebAccessKeySummary,
  WebSessionInfo,
  ConnectionAuditLog,
} from '../src/types';
import {
  INITIAL_DEMO_TENANT,
  INITIAL_DEMO_USERS,
  INITIAL_DEMO_CATEGORIES,
  INITIAL_DEMO_PRODUCTS,
  INITIAL_DEMO_TABLES,
  INITIAL_DEMO_ORDERS,
  INITIAL_DEMO_CASH_SESSION,
  INITIAL_DEMO_EXPENSES,
  INITIAL_DEMO_INVENTORY_TRANSACTIONS,
  INITIAL_DEMO_SAVED_REPORTS,
  INITIAL_DEMO_ARCHIVED_PERIODS,
  INITIAL_DEMO_BACKUPS,
  INITIAL_DEMO_CUSTOMERS,
  INITIAL_DEMO_SUPPLIERS,
  DEFAULT_THEME_CONFIG,
} from '../src/services/mock-data';

export interface StoredAccessKey {
  id: string;
  tenantId: string;
  mode: WebAccessMode;
  userId?: string;
  userName: string;
  keyPreview: string;
  salt: string;
  keyHash: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  lastUsedAt?: string;
}

export interface StoredWebSession extends WebSessionInfo {
  tokenHash: string;
  keyId: string;
}

export interface PersistedTenantData {
  tenants: Tenant[];
  users: UserProfile[];
  categories: Category[];
  products: Product[];
  tables: RestaurantTable[];
  orders: Order[];
  cashSessions: CashRegisterSession[];
  financial: FinancialTransaction[];
  inventoryTransactions: InventoryTransaction[];
  auditLogs: AuditLog[];
  savedReports: SavedReport[];
  archivedPeriods: ArchivedPeriod[];
  archivedPdfs: ArchivedPeriodPdf[];
  backups: SystemBackup[];
  tableArchives: TableAccountArchive[];
  customers: Customer[];
  suppliers: Supplier[];
  themeConfig: SystemThemeConfig;
}

export interface ServerDatabase {
  revision: number;
  webAccessEnabled: boolean;
  data: PersistedTenantData;
  accessKeys: StoredAccessKey[];
  sessions: StoredWebSession[];
  connectionLogs: ConnectionAuditLog[];
  processedMutationIds: string[];
}

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), '.data');

function ensureCleanSeedOrders(): Order[] {
  return INITIAL_DEMO_ORDERS.map((o) =>
    o.type === 'comanda'
      ? { ...o, type: 'counter' as const, comandaNumber: undefined }
      : o
  ).filter((o) => !o.payments?.some((p) => p.method === 'devendo'));
}

function createInitialDatabase(): ServerDatabase {
  return {
    revision: 1,
    webAccessEnabled: true,
    data: {
      tenants: [INITIAL_DEMO_TENANT],
      users: INITIAL_DEMO_USERS,
      categories: INITIAL_DEMO_CATEGORIES,
      products: INITIAL_DEMO_PRODUCTS,
      tables: INITIAL_DEMO_TABLES,
      orders: ensureCleanSeedOrders(),
      cashSessions: [INITIAL_DEMO_CASH_SESSION],
      financial: INITIAL_DEMO_EXPENSES,
      inventoryTransactions: INITIAL_DEMO_INVENTORY_TRANSACTIONS,
      auditLogs: [],
      savedReports: INITIAL_DEMO_SAVED_REPORTS,
      archivedPeriods: INITIAL_DEMO_ARCHIVED_PERIODS,
      archivedPdfs: [],
      backups: INITIAL_DEMO_BACKUPS,
      tableArchives: [],
      customers: INITIAL_DEMO_CUSTOMERS,
      suppliers: INITIAL_DEMO_SUPPLIERS,
      themeConfig: DEFAULT_THEME_CONFIG,
    },
    accessKeys: [],
    sessions: [],
    connectionLogs: [],
    processedMutationIds: [],
  };
}

function hashSecret(secret: string, salt?: string): { salt: string; hash: string } {
  const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, effectiveSalt, 64).toString('hex');
  return { salt: effectiveSalt, hash: derived };
}

function verifySecret(secret: string, salt: string, expectedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(secret, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateReadableKey(mode: WebAccessMode): string {
  const prefix = mode === 'admin' ? 'SG-ADM' : 'SG-VND';
  const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
  const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${partA}-${partB}`;
}

function maskKey(plainKey: string): string {
  const parts = plainKey.split('-');
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1]}-****-${parts[3]}`;
  }
  return `${plainKey.slice(0, 6)}****${plainKey.slice(-3)}`;
}

export class AuthoritativeStore {
  private readonly dataDir: string;
  private readonly dbFile: string;
  private readonly mediaDir: string;
  private readonly archivesDir: string;
  private db: ServerDatabase;
  private onAfterChange?: (event: {
    type: string;
    tenantId?: string;
    revokedUserIds?: string[];
    revokedSessionIds?: string[];
  }) => void;

  constructor(
    onAfterChange?: (event: {
      type: string;
      tenantId?: string;
      revokedUserIds?: string[];
      revokedSessionIds?: string[];
    }) => void,
    customDataDir?: string
  ) {
    this.onAfterChange = onAfterChange;
    this.dataDir = customDataDir || DEFAULT_DATA_DIR;
    this.dbFile = path.join(this.dataDir, 'saborgestao-db.json');
    this.mediaDir = path.join(this.dataDir, 'media');
    this.archivesDir = path.join(this.dataDir, 'archives');
    this.db = this.loadFromDisk();
  }

  private ensureDirectories(): void {
    for (const dir of [this.dataDir, this.mediaDir, this.archivesDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private loadFromDisk(): ServerDatabase {
    try {
      this.ensureDirectories();
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ServerDatabase>;
        if (parsed && parsed.data && Array.isArray(parsed.data.tenants)) {
          const initial = createInitialDatabase();
          const loaded: ServerDatabase = {
            revision: parsed.revision || 1,
            webAccessEnabled: parsed.webAccessEnabled ?? true,
            data: {
              ...initial.data,
              ...parsed.data,
              customers: Array.isArray(parsed.data.customers)
                ? parsed.data.customers
                : initial.data.customers,
              suppliers: Array.isArray(parsed.data.suppliers)
                ? parsed.data.suppliers
                : initial.data.suppliers,
              archivedPdfs: Array.isArray(parsed.data.archivedPdfs)
                ? parsed.data.archivedPdfs
                : [],
            },
            accessKeys: parsed.accessKeys || [],
            sessions: parsed.sessions || [],
            connectionLogs: parsed.connectionLogs || [],
            processedMutationIds: parsed.processedMutationIds || [],
          };
          this.writeAtomic(loaded);
          return loaded;
        }
      }
    } catch (err) {
      console.error('Erro ao ler banco persistido, inicializando padrão:', err);
    }
    const fresh = createInitialDatabase();
    this.writeAtomic(fresh);
    return fresh;
  }

  private writeAtomic(dbSnapshot: ServerDatabase = this.db): void {
    try {
      this.ensureDirectories();
      const tmp = `${this.dbFile}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(dbSnapshot, null, 2), 'utf-8');
      fs.renameSync(tmp, this.dbFile);
    } catch (err) {
      console.error('Erro ao gravar banco em disco:', err);
    }
  }

  private commit(
    eventType: string,
    opts?: { tenantId?: string; revokedUserIds?: string[]; revokedSessionIds?: string[] }
  ): void {
    this.db.revision += 1;
    this.writeAtomic();
    this.onAfterChange?.({
      type: eventType,
      tenantId: opts?.tenantId,
      revokedUserIds: opts?.revokedUserIds,
      revokedSessionIds: opts?.revokedSessionIds,
    });
  }

  private recordMutationId(mutationId?: string): boolean {
    if (!mutationId) return false;
    if (this.db.processedMutationIds.includes(mutationId)) {
      return true;
    }
    this.db.processedMutationIds.unshift(mutationId);
    if (this.db.processedMutationIds.length > 2000) {
      this.db.processedMutationIds.length = 2000;
    }
    return false;
  }

  private addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const entry: AuditLog = {
      ...log,
      id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      timestamp: new Date().toISOString(),
    };
    this.db.data.auditLogs.unshift(entry);
    if (this.db.data.auditLogs.length > 800) {
      this.db.data.auditLogs.length = 800;
    }
  }

  private addConnectionLog(log: Omit<ConnectionAuditLog, 'id' | 'timestamp'>): void {
    const entry: ConnectionAuditLog = {
      ...log,
      id: `clog-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      timestamp: new Date().toISOString(),
    };
    this.db.connectionLogs.unshift(entry);
    if (this.db.connectionLogs.length > 400) {
      this.db.connectionLogs.length = 400;
    }
  }

  private appendTableLog(table: RestaurantTable, log: Omit<TableOperationLog, 'id'>): TableOperationLog[] {
    const current = Array.isArray(table.operationLogs) ? [...table.operationLogs] : [];
    current.push({
      ...log,
      id: `tlog-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    });
    if (current.length > 200) {
      return current.slice(current.length - 200);
    }
    return current;
  }

  // ==================== REDE E SNAPSHOTS ====================

  public getNetworkInfo(port: number) {
    const interfaces = os.networkInterfaces();
    const lanIps: string[] = [];
    for (const name of Object.keys(interfaces)) {
      const list = interfaces[name] || [];
      for (const iface of list) {
        if (iface.family === 'IPv4' && !iface.internal) {
          if (!lanIps.includes(iface.address)) {
            lanIps.push(iface.address);
          }
        }
      }
    }
    const primaryIp = lanIps[0] || '127.0.0.1';
    const urls =
      lanIps.length > 0
        ? lanIps.map((ip) => `http://${ip}:${port}/?portal=web`)
        : [`http://localhost:${port}/?portal=web`];

    return {
      port,
      primaryIp,
      lanIps,
      urls,
    };
  }

  public getRevision(): number {
    return this.db.revision;
  }

  public isWebAccessEnabled(): boolean {
    return this.db.webAccessEnabled;
  }

  public getSnapshot(tenantId?: string, roleMode: WebAccessMode = 'admin', userId?: string) {
    const activeTenantId = tenantId || this.db.data.tenants[0]?.id || 'tenant-demo-01';
    const data = this.db.data;

    if (roleMode === 'seller') {
      // RBAC ESTRITO: vendedor vê apenas pedidos próprios e mesas em andamento; ZERO finanças globais, caixa, clientes/fornecedores ou arquivos
      const sellerOrders = data.orders.filter((o) => {
        if (o.tenantId !== activeTenantId) return false;
        const isOwner =
          o.waiterId === userId ||
          o.createdById === userId ||
          Boolean(o.contributors?.some((c) => c.id === userId));
        if (isOwner) return true;
        // Permite colaborar em pedidos de mesa ainda em aberto (não pagos e não encerrados/cancelados)
        return o.type === 'table' && o.status !== 'closed' && o.status !== 'cancelled' && !o.paid;
      });

      const maskedOpenCash = data.cashSessions
        .filter((c) => c.tenantId === activeTenantId && c.status === 'open')
        .map((c) => ({
          id: c.id,
          tenantId: c.tenantId,
          openedBy: c.openedBy,
          openedByName: c.openedByName,
          openedAt: c.openedAt,
          status: 'open' as const,
          initialAmount: 0,
          totalCash: 0,
          totalPix: 0,
          totalDevendo: 0,
          totalWithdrawals: 0,
          totalDeposits: 0,
          expectedAmount: 0,
        }));

      return {
        revision: this.db.revision,
        webAccessEnabled: this.db.webAccessEnabled,
        tenantId: activeTenantId,
        data: {
          tenants: data.tenants.filter((t) => t.id === activeTenantId),
          users: data.users
            .filter((u) => u.tenantId === activeTenantId)
            .map((u) => ({
              ...u,
              accessCode: u.id === userId ? u.accessCode : undefined,
              commissionRate: 0,
              salesTargetMonthly: undefined,
            })),
          categories: data.categories.filter((c) => c.tenantId === activeTenantId),
          products: data.products.filter((p) => p.tenantId === activeTenantId),
          tables: data.tables.filter((t) => t.tenantId === activeTenantId),
          orders: sellerOrders,
          cashSessions: maskedOpenCash,
          financial: [],
          inventoryTransactions: [],
          auditLogs: [],
          savedReports: [],
          archivedPeriods: [],
          archivedPdfs: [],
          backups: [],
          tableArchives: [],
          customers: [],
          suppliers: [],
          themeConfig: data.themeConfig,
        },
      };
    }

    return {
      revision: this.db.revision,
      webAccessEnabled: this.db.webAccessEnabled,
      tenantId: activeTenantId,
      data,
    };
  }

  // ==================== ACESSO WEB E CHAVES ====================

  public getWebAccessStatus(tenantId: string, port: number) {
    const net = this.getNetworkInfo(port);
    const keys: WebAccessKeySummary[] = this.db.accessKeys
      .filter((k) => k.tenantId === tenantId)
      .map((k) => ({
        id: k.id,
        tenantId: k.tenantId,
        mode: k.mode,
        userId: k.userId,
        userName: k.userName,
        keyPreview: k.keyPreview,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        revoked: k.revoked,
        revokedAt: k.revokedAt,
        lastUsedAt: k.lastUsedAt,
      }));

    const sessions: WebSessionInfo[] = this.db.sessions
      .filter((s) => s.tenantId === tenantId)
      .map(({ tokenHash: _th, keyId: _ki, ...rest }) => rest);

    const logs = this.db.connectionLogs.filter((l) => l.tenantId === tenantId).slice(0, 80);

    return {
      webAccessEnabled: this.db.webAccessEnabled,
      ...net,
      activeSessionsCount: sessions.length,
      sessions,
      keys,
      logs,
      revision: this.db.revision,
    };
  }

  public toggleWebAccess(
    enabled: boolean,
    tenantId: string,
    actorName: string,
    ipAddress: string
  ) {
    this.db.webAccessEnabled = enabled;
    let revokedSessionIds: string[] = [];

    if (!enabled) {
      revokedSessionIds = this.db.sessions.map((s) => s.id);
      this.db.sessions = [];
    }

    this.addConnectionLog({
      tenantId,
      event: 'access_toggled',
      userName: actorName,
      deviceLabel: 'Painel Administrativo',
      ipAddress,
      details: enabled
        ? 'Acesso pelo navegador ATIVADO na rede local.'
        : `Acesso pelo navegador DESATIVADO. ${revokedSessionIds.length} sessão(ões) desconectada(s).`,
    });

    this.commit('web_access_toggled', { tenantId, revokedSessionIds });
    return { webAccessEnabled: this.db.webAccessEnabled, revokedSessionIds };
  }

  public createAccessKey(params: {
    tenantId: string;
    mode: WebAccessMode;
    userId?: string;
    expiresInHours?: number;
    actorName: string;
    ipAddress: string;
  }): { keySummary: WebAccessKeySummary; plainKey: string } {
    const users = this.db.data.users.filter((u) => u.tenantId === params.tenantId);
    let targetUser: UserProfile | undefined;

    if (params.mode === 'admin') {
      targetUser = users.find((u) => u.id === params.userId && u.role === 'admin') || users.find((u) => u.role === 'admin');
    } else {
      targetUser = users.find((u) => u.id === params.userId && u.role !== 'admin');
      if (!targetUser) {
        throw new Error('Selecione um vendedor válido para gerar a chave individual.');
      }
      if (targetUser.canSell === false || targetUser.status === 'bloqueado') {
        throw new Error(`O vendedor "${targetUser.name}" está bloqueado. Autorize-o antes de gerar a chave.`);
      }
    }

    const plainKey = generateReadableKey(params.mode);
    const { salt, hash } = hashSecret(plainKey);
    const now = new Date();
    const hours = Math.max(1, Math.min(720, params.expiresInHours || 24));
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();

    const record: StoredAccessKey = {
      id: `wkey-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      tenantId: params.tenantId,
      mode: params.mode,
      userId: targetUser?.id,
      userName: targetUser?.name || (params.mode === 'admin' ? 'Administrador' : 'Vendedor'),
      keyPreview: maskKey(plainKey),
      salt,
      keyHash: hash,
      createdAt: now.toISOString(),
      expiresAt,
      revoked: false,
    };

    this.db.accessKeys.unshift(record);

    this.addConnectionLog({
      tenantId: params.tenantId,
      event: 'key_created',
      mode: params.mode,
      userId: record.userId,
      userName: record.userName,
      deviceLabel: params.actorName,
      ipAddress: params.ipAddress,
      details: `Nova chave ${params.mode === 'admin' ? 'MODO ADMINISTRADOR' : 'MODO VENDEDOR'} gerada (${record.keyPreview}), válida até ${new Date(expiresAt).toLocaleString('pt-BR')}.`,
    });

    this.commit('key_created', { tenantId: params.tenantId });

    const { salt: _s, keyHash: _h, ...keySummary } = record;
    return { keySummary, plainKey };
  }

  public renewAccessKey(params: {
    keyId: string;
    expiresInHours?: number;
    actorName: string;
    ipAddress: string;
  }): { keySummary: WebAccessKeySummary; plainKey: string } {
    const idx = this.db.accessKeys.findIndex((k) => k.id === params.keyId);
    if (idx < 0) throw new Error('Chave não encontrada.');

    const existing = this.db.accessKeys[idx];
    const plainKey = generateReadableKey(existing.mode);
    const { salt, hash } = hashSecret(plainKey);
    const hours = Math.max(1, Math.min(720, params.expiresInHours || 24));
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    const revokedSessionIds = this.db.sessions
      .filter((s) => s.keyId === existing.id)
      .map((s) => s.id);
    this.db.sessions = this.db.sessions.filter((s) => s.keyId !== existing.id);

    const updated: StoredAccessKey = {
      ...existing,
      keyPreview: maskKey(plainKey),
      salt,
      keyHash: hash,
      expiresAt,
      revoked: false,
      revokedAt: undefined,
    };
    this.db.accessKeys[idx] = updated;

    this.addConnectionLog({
      tenantId: existing.tenantId,
      event: 'key_renewed',
      mode: existing.mode,
      userId: existing.userId,
      userName: existing.userName,
      deviceLabel: params.actorName,
      ipAddress: params.ipAddress,
      details: `Chave renovada (${updated.keyPreview}) com nova validade até ${new Date(expiresAt).toLocaleString('pt-BR')}.`,
    });

    this.commit('key_renewed', { tenantId: existing.tenantId, revokedSessionIds });

    const { salt: _s, keyHash: _h, ...keySummary } = updated;
    return { keySummary, plainKey };
  }

  public revokeAccessKey(keyId: string, actorName: string, ipAddress: string): { revokedSessionIds: string[] } {
    const idx = this.db.accessKeys.findIndex((k) => k.id === keyId);
    if (idx < 0) throw new Error('Chave não encontrada.');

    const existing = this.db.accessKeys[idx];
    this.db.accessKeys[idx] = {
      ...existing,
      revoked: true,
      revokedAt: new Date().toISOString(),
    };

    const revokedSessionIds = this.db.sessions
      .filter((s) => s.keyId === keyId)
      .map((s) => s.id);
    this.db.sessions = this.db.sessions.filter((s) => s.keyId !== keyId);

    this.addConnectionLog({
      tenantId: existing.tenantId,
      event: 'revoked',
      mode: existing.mode,
      userId: existing.userId,
      userName: existing.userName,
      deviceLabel: actorName,
      ipAddress,
      details: `Chave ${existing.keyPreview} revogada. ${revokedSessionIds.length} sessão(ões) encerrada(s).`,
    });

    this.commit('key_revoked', { tenantId: existing.tenantId, revokedSessionIds });
    return { revokedSessionIds };
  }

  public authenticateWithKey(params: {
    plainKey: string;
    deviceLabel?: string;
    ipAddress: string;
    userAgent: string;
  }): { token: string; session: WebSessionInfo; user: UserProfile } {
    if (!this.db.webAccessEnabled) {
      throw new Error('ACCESS_DISABLED:O acesso pelo navegador está desativado pelo Administrador.');
    }

    const cleaned = params.plainKey.trim().toUpperCase();
    if (!cleaned) {
      throw new Error('INVALID_KEY:Informe uma chave de acesso válida.');
    }

    const now = Date.now();
    const matched = this.db.accessKeys.find(
      (k) => !k.revoked && verifySecret(cleaned, k.salt, k.keyHash)
    );

    if (!matched) {
      this.addConnectionLog({
        tenantId: this.db.data.tenants[0]?.id || 'tenant-demo-01',
        event: 'blocked',
        userName: 'Tentativa não autorizada',
        deviceLabel: params.deviceLabel || 'Navegador Desconhecido',
        ipAddress: params.ipAddress,
        details: 'Tentativa de acesso com chave inválida ou já revogada.',
      });
      this.writeAtomic();
      throw new Error('INVALID_KEY:Chave de acesso inválida ou revogada.');
    }

    if (new Date(matched.expiresAt).getTime() < now) {
      throw new Error('EXPIRED_KEY:Esta chave de acesso expirou. Solicite uma nova ao Administrador.');
    }

    const user =
      this.db.data.users.find((u) => u.id === matched.userId) ||
      (matched.mode === 'admin'
        ? this.db.data.users.find((u) => u.tenantId === matched.tenantId && u.role === 'admin')
        : undefined);

    if (!user) {
      throw new Error('USER_NOT_FOUND:Perfil vinculado à chave não foi encontrado.');
    }

    if (matched.mode === 'seller' && (user.canSell === false || user.status === 'bloqueado')) {
      this.addConnectionLog({
        tenantId: matched.tenantId,
        event: 'blocked',
        mode: 'seller',
        userId: user.id,
        userName: user.name,
        deviceLabel: params.deviceLabel || 'Navegador Web',
        ipAddress: params.ipAddress,
        details: `Login negado: vendedor "${user.name}" está bloqueado pelo Administrador.`,
      });
      this.writeAtomic();
      throw new Error('SELLER_BLOCKED:Sua permissão de venda está bloqueada pelo Administrador.');
    }

    const token = `sgw_${crypto.randomBytes(28).toString('hex')}`;
    const tokenHash = hashToken(token);
    const nowIso = new Date().toISOString();

    const sessionRecord: StoredWebSession = {
      id: `wsess-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      tenantId: matched.tenantId,
      mode: matched.mode,
      userId: user.id,
      userName: user.name,
      deviceLabel:
        params.deviceLabel?.trim() ||
        (matched.mode === 'admin' ? 'Navegador Web (ADM)' : `Navegador Web (${user.name})`),
      ipAddress: params.ipAddress,
      userAgent: params.userAgent.slice(0, 120),
      connectedAt: nowIso,
      lastActivityAt: nowIso,
      wsConnected: false,
      tokenHash,
      keyId: matched.id,
    };

    matched.lastUsedAt = nowIso;
    this.db.sessions.unshift(sessionRecord);

    this.addConnectionLog({
      tenantId: matched.tenantId,
      event: 'login',
      mode: matched.mode,
      userId: user.id,
      userName: user.name,
      deviceLabel: sessionRecord.deviceLabel,
      ipAddress: params.ipAddress,
      details: `Sessão autenticada em ${matched.mode === 'admin' ? 'MODO ADMINISTRADOR' : 'MODO VENDEDOR'} via chave ${matched.keyPreview}.`,
    });

    this.commit('session_login', { tenantId: matched.tenantId });

    const { tokenHash: _th, keyId: _ki, ...publicSession } = sessionRecord;
    return { token, session: publicSession, user };
  }

  public validateBearerToken(token?: string): {
    valid: boolean;
    reason?: string;
    session?: StoredWebSession;
    user?: UserProfile;
  } {
    if (!token) return { valid: false, reason: 'Token ausente.' };
    if (!this.db.webAccessEnabled) {
      return { valid: false, reason: 'Acesso pelo navegador desativado pelo Administrador.' };
    }
    const th = hashToken(token);
    const session = this.db.sessions.find((s) => s.tokenHash === th);
    if (!session) {
      return { valid: false, reason: 'Sessão encerrada, desconectada ou expirada.' };
    }
    const key = this.db.accessKeys.find((k) => k.id === session.keyId);
    if (!key || key.revoked || new Date(key.expiresAt).getTime() < Date.now()) {
      this.db.sessions = this.db.sessions.filter((s) => s.id !== session.id);
      this.writeAtomic();
      return { valid: false, reason: 'Chave de acesso revogada ou expirada.' };
    }
    const user = this.db.data.users.find((u) => u.id === session.userId);
    if (!user) {
      return { valid: false, reason: 'Usuário não encontrado.' };
    }
    if (session.mode === 'seller' && (user.canSell === false || user.status === 'bloqueado')) {
      this.db.sessions = this.db.sessions.filter((s) => s.id !== session.id);
      this.writeAtomic();
      return { valid: false, reason: 'Permissão de vendedor bloqueada pelo Administrador.' };
    }
    session.lastActivityAt = new Date().toISOString();
    return { valid: true, session, user };
  }

  public setSessionWsConnected(sessionId: string, connected: boolean): void {
    const s = this.db.sessions.find((item) => item.id === sessionId);
    if (s) {
      s.wsConnected = connected;
      s.lastActivityAt = new Date().toISOString();
      this.writeAtomic();
    }
  }

  public disconnectSession(sessionId: string, actorName: string, ipAddress: string): boolean {
    const target = this.db.sessions.find((s) => s.id === sessionId);
    if (!target) return false;
    this.db.sessions = this.db.sessions.filter((s) => s.id !== sessionId);
    this.addConnectionLog({
      tenantId: target.tenantId,
      event: 'disconnect',
      mode: target.mode,
      userId: target.userId,
      userName: target.userName,
      deviceLabel: target.deviceLabel,
      ipAddress,
      details: `Sessão desconectada por ${actorName}.`,
    });
    this.commit('session_disconnected', {
      tenantId: target.tenantId,
      revokedSessionIds: [sessionId],
    });
    return true;
  }

  public logoutSessionByToken(token: string, ipAddress: string): void {
    const th = hashToken(token);
    const target = this.db.sessions.find((s) => s.tokenHash === th);
    if (!target) return;
    this.db.sessions = this.db.sessions.filter((s) => s.id !== target.id);
    this.addConnectionLog({
      tenantId: target.tenantId,
      event: 'logout',
      mode: target.mode,
      userId: target.userId,
      userName: target.userName,
      deviceLabel: target.deviceLabel,
      ipAddress,
      details: `Sessão encerrada pelo próprio usuário.`,
    });
    this.commit('session_logout', {
      tenantId: target.tenantId,
      revokedSessionIds: [target.id],
    });
  }

  public toggleSellerPermission(params: {
    userId: string;
    canSell: boolean;
    adminName: string;
    ipAddress: string;
  }): { user: UserProfile; revokedSessionIds: string[] } {
    const idx = this.db.data.users.findIndex((u) => u.id === params.userId);
    if (idx < 0) throw new Error('Vendedor não encontrado.');

    const target = this.db.data.users[idx];
    const updated: UserProfile = {
      ...target,
      canSell: params.canSell,
      active: params.canSell,
      status: params.canSell ? 'autorizado' : 'bloqueado',
      updatedAt: new Date().toISOString(),
    };
    this.db.data.users[idx] = updated;

    let revokedSessionIds: string[] = [];
    if (!params.canSell) {
      revokedSessionIds = this.db.sessions
        .filter((s) => s.userId === target.id && s.mode === 'seller')
        .map((s) => s.id);
      this.db.sessions = this.db.sessions.filter(
        (s) => !(s.userId === target.id && s.mode === 'seller')
      );
      if (revokedSessionIds.length > 0) {
        this.addConnectionLog({
          tenantId: target.tenantId,
          event: 'blocked',
          mode: 'seller',
          userId: target.id,
          userName: target.name,
          deviceLabel: 'Sessões Web Ativas',
          ipAddress: params.ipAddress,
          details: `Vendedor bloqueado pelo ADM. ${revokedSessionIds.length} sessão(ões) web encerrada(s) imediatamente.`,
        });
      }
    }

    this.addAuditLog({
      tenantId: target.tenantId,
      userId: 'adm',
      userName: params.adminName,
      action: params.canSell ? 'AUTORIZOU_VENDEDOR' : 'BLOQUEOU_VENDEDOR',
      details: `${params.canSell ? 'Permissão de venda LIGADA (AUTORIZADO)' : 'Permissão de venda DESLIGADA (BLOQUEADO)'} para ${target.name}.`,
    });

    this.commit('seller_permission_changed', {
      tenantId: target.tenantId,
      revokedUserIds: params.canSell ? [] : [target.id],
      revokedSessionIds,
    });

    return { user: updated, revokedSessionIds };
  }

  // ==================== MÍDIA, CARDÁPIO E CATEGORIAS (MATRIZ CENTRAL) ====================

  public saveMediaFile(params: {
    dataUrl: string;
    prefix?: string;
  }): { url: string; fileName: string; sizeBytes: number } {
    this.ensureDirectories();
    const raw = (params.dataUrl || '').trim();
    const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(raw);
    if (!match) {
      throw new Error('Imagem inválida. Envie PNG, JPG, WEBP ou GIF em Base64.');
    }
    const mime = match[1].toLowerCase();
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0 || bytes.length > 6 * 1024 * 1024) {
      throw new Error('Tamanho de imagem excede o limite de 6 MB.');
    }

    const safePrefix = (params.prefix || 'media').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'media';
    const fileName = `${safePrefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const fullPath = path.join(this.mediaDir, fileName);
    fs.writeFileSync(fullPath, bytes);
    return { url: `/api/media/${fileName}`, fileName, sizeBytes: bytes.length };
  }

  public readMediaFile(fileName: string): { buffer: Buffer; mimeType: string } | null {
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return null;
    const fullPath = path.join(this.mediaDir, fileName);
    if (!fs.existsSync(fullPath)) return null;
    const lower = fileName.toLowerCase();
    const mimeType = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
      ? 'image/webp'
      : lower.endsWith('.gif')
      ? 'image/gif'
      : 'image/jpeg';
    return { buffer: fs.readFileSync(fullPath), mimeType };
  }

  public upsertCategory(
    tenantId: string,
    payload: Partial<Category> & { name: string },
    actor: { id: string; name: string }
  ): Category {
    const cleanName = (payload.name || '').trim();
    if (!cleanName) throw new Error('Informe o nome da categoria.');

    const existingIdx = payload.id
      ? this.db.data.categories.findIndex((c) => c.id === payload.id && c.tenantId === tenantId)
      : -1;
    const nowIso = new Date().toISOString();

    let saved: Category;
    if (existingIdx >= 0) {
      const prev = this.db.data.categories[existingIdx];
      saved = {
        ...prev,
        name: cleanName,
        icon: payload.icon ?? prev.icon,
        color: payload.color ?? prev.color,
        order: typeof payload.order === 'number' ? payload.order : prev.order,
        active: typeof payload.active === 'boolean' ? payload.active : prev.active,
      };
      this.db.data.categories[existingIdx] = saved;
    } else {
      const maxOrder = this.db.data.categories
        .filter((c) => c.tenantId === tenantId)
        .reduce((max, c) => Math.max(max, c.order || 0), 0);
      saved = {
        id: payload.id || `cat-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId,
        name: cleanName,
        icon: payload.icon,
        color: payload.color || '#d97706',
        order: typeof payload.order === 'number' ? payload.order : maxOrder + 1,
        active: payload.active ?? true,
        createdAt: nowIso,
      };
      this.db.data.categories.push(saved);
    }

    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: existingIdx >= 0 ? 'EDITOU_CATEGORIA' : 'CRIOU_CATEGORIA',
      details: `${existingIdx >= 0 ? 'Atualizou' : 'Cadastrou'} a categoria "${saved.name}".`,
    });
    this.commit('category_upserted', { tenantId });
    return saved;
  }

  public deleteCategory(
    tenantId: string,
    categoryId: string,
    opts: { strategy?: 'transfer' | 'uncategorized'; targetCategoryId?: string },
    actor: { id: string; name: string }
  ): { deletedId: string; affectedProductsCount: number } {
    const idx = this.db.data.categories.findIndex(
      (c) => c.id === categoryId && c.tenantId === tenantId
    );
    if (idx < 0) throw new Error('Categoria não encontrada.');
    const cat = this.db.data.categories[idx];

    const linkedProducts = this.db.data.products.filter(
      (p) => p.tenantId === tenantId && p.categoryId === categoryId
    );

    if (linkedProducts.length > 0) {
      if (opts.strategy === 'transfer') {
        const targetExists = this.db.data.categories.some(
          (c) => c.tenantId === tenantId && c.id === opts.targetCategoryId && c.id !== categoryId
        );
        if (!targetExists) {
          throw new Error('Selecione uma categoria de destino válida para transferir os produtos.');
        }
        this.db.data.products = this.db.data.products.map((p) =>
          p.tenantId === tenantId && p.categoryId === categoryId
            ? { ...p, categoryId: opts.targetCategoryId!, updatedAt: new Date().toISOString() }
            : p
        );
      } else if (opts.strategy === 'uncategorized') {
        this.db.data.products = this.db.data.products.map((p) =>
          p.tenantId === tenantId && p.categoryId === categoryId
            ? { ...p, categoryId: '', updatedAt: new Date().toISOString() }
            : p
        );
      } else {
        throw new Error(
          `Esta categoria possui ${linkedProducts.length} produto(s). Escolha transferir os produtos ou deixá-los sem categoria antes de excluir.`
        );
      }
    }

    this.db.data.categories.splice(idx, 1);
    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: 'EXCLUIU_CATEGORIA',
      details: `Excluiu a categoria "${cat.name}" (${linkedProducts.length} produto(s) ${
        opts.strategy === 'transfer' ? 'transferido(s)' : 'movido(s) para sem categoria'
      }).`,
    });
    this.commit('category_deleted', { tenantId });
    return { deletedId: categoryId, affectedProductsCount: linkedProducts.length };
  }

  public upsertProduct(
    tenantId: string,
    payload: Partial<Product> & { name: string },
    actor: { id: string; name: string }
  ): Product {
    const cleanName = (payload.name || '').trim();
    if (!cleanName) throw new Error('Informe o nome do produto.');

    let resolvedImageUrl = payload.imageUrl;
    if (resolvedImageUrl && resolvedImageUrl.startsWith('data:image/')) {
      const savedMedia = this.saveMediaFile({ dataUrl: resolvedImageUrl, prefix: 'prod' });
      resolvedImageUrl = savedMedia.url;
    }

    const sellingPrice = Number(payload.sellingPrice ?? 0);
    const costPrice = Number(payload.costPrice ?? 0);
    const profitMargin =
      sellingPrice > 0
        ? Number((((sellingPrice - costPrice) / sellingPrice) * 100).toFixed(2))
        : 0;
    const nowIso = new Date().toISOString();

    const existingIdx = payload.id
      ? this.db.data.products.findIndex((p) => p.id === payload.id && p.tenantId === tenantId)
      : -1;

    let saved: Product;
    if (existingIdx >= 0) {
      const prev = this.db.data.products[existingIdx];
      saved = {
        ...prev,
        ...payload,
        id: prev.id,
        tenantId,
        name: cleanName,
        imageUrl: resolvedImageUrl !== undefined ? resolvedImageUrl : prev.imageUrl,
        costPrice,
        sellingPrice,
        profitMargin,
        allowWeight: false,
        updatedAt: nowIso,
      };
      this.db.data.products[existingIdx] = saved;
    } else {
      saved = {
        id: payload.id || `prod-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId,
        name: cleanName,
        internalCode:
          payload.internalCode?.trim() ||
          `P-${Math.floor(100 + Math.random() * 900)}`,
        barcode: payload.barcode,
        categoryId: payload.categoryId ?? '',
        description: payload.description || '',
        imageUrl: resolvedImageUrl,
        costPrice,
        sellingPrice,
        profitMargin,
        unit: payload.unit || 'un',
        allowWeight: false,
        stockQuantity: Number(payload.stockQuantity ?? 0),
        minStock: Number(payload.minStock ?? 0),
        supplierId: payload.supplierId,
        active: payload.active ?? true,
        isComposite: Boolean(payload.isComposite),
        recipe: payload.recipe,
        variations: payload.variations,
        addons: payload.addons,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.db.data.products.push(saved);
    }

    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: existingIdx >= 0 ? 'EDITOU_PRODUTO' : 'CRIOU_PRODUTO',
      details: `${existingIdx >= 0 ? 'Atualizou' : 'Cadastrou'} o produto "${saved.name}" (R$ ${saved.sellingPrice.toFixed(2)}).`,
    });
    this.commit('product_upserted', { tenantId });
    return saved;
  }

  public deleteProductSafely(
    tenantId: string,
    productId: string,
    actor: { id: string; name: string }
  ): { deletedId: string } {
    const idx = this.db.data.products.findIndex(
      (p) => p.id === productId && p.tenantId === tenantId
    );
    if (idx < 0) throw new Error('Produto não encontrado.');
    const prod = this.db.data.products[idx];

    const hasOpenOrder = this.db.data.orders.some(
      (o) =>
        o.tenantId === tenantId &&
        o.status !== 'cancelled' &&
        o.status !== 'closed' &&
        !o.paid &&
        o.items.some((it) => it.productId === productId)
    );
    if (hasOpenOrder) {
      throw new Error(
        `Não é possível excluir "${prod.name}" porque ele está lançado em uma mesa ainda aberta.`
      );
    }

    this.db.data.products.splice(idx, 1);
    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: 'EXCLUIU_PRODUTO',
      details: `Excluiu o produto "${prod.name}" do cardápio.`,
    });
    this.commit('product_deleted', { tenantId });
    return { deletedId: productId };
  }

  // ==================== CLIENTES E FORNECEDORES ====================

  public upsertCustomer(
    tenantId: string,
    payload: Partial<Customer> & { name: string },
    actor: { id: string; name: string }
  ): Customer {
    const cleanName = (payload.name || '').trim();
    if (!cleanName) throw new Error('Informe o nome do cliente.');
    const existingIdx = payload.id
      ? this.db.data.customers.findIndex((c) => c.id === payload.id && c.tenantId === tenantId)
      : -1;
    const nowIso = new Date().toISOString();

    let saved: Customer;
    if (existingIdx >= 0) {
      const prev = this.db.data.customers[existingIdx];
      saved = {
        ...prev,
        ...payload,
        id: prev.id,
        tenantId,
        name: cleanName,
        pendingCredit: 0,
      };
      this.db.data.customers[existingIdx] = saved;
    } else {
      saved = {
        id: payload.id || `cust-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId,
        name: cleanName,
        phone: payload.phone?.trim() || '',
        email: payload.email?.trim() || '',
        address: payload.address?.trim() || '',
        notes: payload.notes?.trim() || '',
        totalSpent: Number(payload.totalSpent ?? 0),
        pendingCredit: 0,
        ordersCount: Number(payload.ordersCount ?? 0),
        createdAt: nowIso,
      };
      this.db.data.customers.unshift(saved);
    }

    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: existingIdx >= 0 ? 'EDITOU_CLIENTE' : 'CRIOU_CLIENTE',
      details: `${existingIdx >= 0 ? 'Atualizou' : 'Cadastrou'} cliente "${saved.name}".`,
    });
    this.commit('customer_upserted', { tenantId });
    return saved;
  }

  public deleteCustomer(
    tenantId: string,
    customerId: string,
    actor: { id: string; name: string }
  ): { deletedId: string } {
    const idx = this.db.data.customers.findIndex(
      (c) => c.id === customerId && c.tenantId === tenantId
    );
    if (idx < 0) throw new Error('Cliente não encontrado.');
    const cust = this.db.data.customers[idx];
    this.db.data.customers.splice(idx, 1);
    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: 'EXCLUIU_CLIENTE',
      details: `Excluiu o cliente "${cust.name}".`,
    });
    this.commit('customer_deleted', { tenantId });
    return { deletedId: customerId };
  }

  public upsertSupplier(
    tenantId: string,
    payload: Partial<Supplier> & { name: string },
    actor: { id: string; name: string }
  ): Supplier {
    const cleanName = (payload.name || '').trim();
    if (!cleanName) throw new Error('Informe o nome do fornecedor.');
    const existingIdx = payload.id
      ? this.db.data.suppliers.findIndex((s) => s.id === payload.id && s.tenantId === tenantId)
      : -1;
    const nowIso = new Date().toISOString();

    let saved: Supplier;
    if (existingIdx >= 0) {
      const prev = this.db.data.suppliers[existingIdx];
      saved = {
        ...prev,
        ...payload,
        id: prev.id,
        tenantId,
        name: cleanName,
        pendingBalance: 0,
      };
      this.db.data.suppliers[existingIdx] = saved;
    } else {
      saved = {
        id: payload.id || `sup-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId,
        name: cleanName,
        document: payload.document?.trim() || '',
        phone: payload.phone?.trim() || '',
        email: payload.email?.trim() || '',
        address: payload.address?.trim() || '',
        category: payload.category?.trim() || 'Geral',
        pendingBalance: 0,
        createdAt: nowIso,
      };
      this.db.data.suppliers.unshift(saved);
    }

    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: existingIdx >= 0 ? 'EDITOU_FORNECEDOR' : 'CRIOU_FORNECEDOR',
      details: `${existingIdx >= 0 ? 'Atualizou' : 'Cadastrou'} fornecedor "${saved.name}".`,
    });
    this.commit('supplier_upserted', { tenantId });
    return saved;
  }

  public deleteSupplier(
    tenantId: string,
    supplierId: string,
    actor: { id: string; name: string }
  ): { deletedId: string } {
    const idx = this.db.data.suppliers.findIndex(
      (s) => s.id === supplierId && s.tenantId === tenantId
    );
    if (idx < 0) throw new Error('Fornecedor não encontrado.');
    const sup = this.db.data.suppliers[idx];
    this.db.data.suppliers.splice(idx, 1);
    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: 'EXCLUIU_FORNECEDOR',
      details: `Excluiu o fornecedor "${sup.name}".`,
    });
    this.commit('supplier_deleted', { tenantId });
    return { deletedId: supplierId };
  }

  // ==================== MESAS E VENDAS COM AUTORIA COLABORATIVA ====================

  public setTableStatus(params: {
    tenantId: string;
    tableId: string;
    status: TableStatus;
    operator: { id: string; name: string };
  }): RestaurantTable {
    const tableIdx = this.db.data.tables.findIndex(
      (t) => t.id === params.tableId && t.tenantId === params.tenantId
    );
    if (tableIdx < 0) throw new Error('Mesa não encontrada.');
    const table = this.db.data.tables[tableIdx];
    const nowIso = new Date().toISOString();

    const updated: RestaurantTable = {
      ...table,
      status: params.status,
      operationLogs: this.appendTableLog(table, {
        type: 'status_changed',
        notes: `Status alterado de "${table.status}" para "${params.status}"`,
        operatorId: params.operator.id,
        operatorName: params.operator.name,
        timestamp: nowIso,
      }),
    };
    this.db.data.tables[tableIdx] = updated;

    this.addAuditLog({
      tenantId: params.tenantId,
      userId: params.operator.id,
      userName: params.operator.name,
      action: 'ALTEROU_STATUS_MESA',
      details: `Alterou status da ${table.label || `Mesa ${table.number}`} para "${params.status}".`,
    });
    this.commit('table_status_changed', { tenantId: params.tenantId });
    return updated;
  }

  public addOrAccumulateTableItems(params: {
    tenantId: string;
    tableId: string;
    items: Array<{
      productId: string;
      quantity: number;
      variationName?: string;
      selectedAddons?: { name: string; price: number }[];
      notes?: string;
    }>;
    operator: { id: string; name: string };
    mutationId?: string;
  }): {
    alreadyProcessed?: boolean;
    table: RestaurantTable;
    order: Order;
  } {
    if (this.recordMutationId(params.mutationId)) {
      const table = this.db.data.tables.find((t) => t.id === params.tableId)!;
      const order =
        this.db.data.orders.find((o) => o.id === table?.currentOrderId) ||
        this.db.data.orders.find(
          (o) =>
            o.tenantId === params.tenantId &&
            o.type === 'table' &&
            o.tableId === params.tableId &&
            o.status !== 'cancelled' &&
            !o.paid
        )!;
      return { alreadyProcessed: true, table, order };
    }

    const tableIdx = this.db.data.tables.findIndex(
      (t) => t.id === params.tableId && t.tenantId === params.tenantId
    );
    if (tableIdx < 0) throw new Error('Mesa não encontrada.');
    const table = this.db.data.tables[tableIdx];
    const tenant = this.db.data.tenants.find((t) => t.id === params.tenantId);
    const allowNegativeStock = Boolean(tenant?.settings?.allowNegativeStock);

    if (!params.items || params.items.length === 0) {
      throw new Error('Selecione ao menos um produto para adicionar à mesa.');
    }

    for (const reqItem of params.items) {
      if (!reqItem.quantity || reqItem.quantity <= 0) {
        throw new Error('Quantidade inválida para item do pedido.');
      }
      const prod = this.db.data.products.find(
        (p) => p.id === reqItem.productId && p.tenantId === params.tenantId
      );
      if (!prod) throw new Error('Produto não encontrado no cardápio.');
      if (!prod.active) throw new Error(`O produto "${prod.name}" está inativo.`);
      if (!allowNegativeStock && (prod.stockQuantity ?? 0) < reqItem.quantity) {
        throw new Error(
          `Estoque insuficiente para "${prod.name}". Disponível: ${prod.stockQuantity ?? 0} ${prod.unit}, solicitado: ${reqItem.quantity}.`
        );
      }
    }

    let orderIdx = this.db.data.orders.findIndex(
      (o) =>
        o.tenantId === params.tenantId &&
        o.type === 'table' &&
        (o.tableId === table.id || o.tableNumber === table.number) &&
        o.status !== 'cancelled' &&
        !o.paid &&
        o.status !== 'closed'
    );

    const nowIso = new Date().toISOString();
    const isOpeningTable = !table.openedById || table.status === 'available';
    let order: Order;

    if (orderIdx >= 0) {
      const existingOrder = this.db.data.orders[orderIdx];
      const existingContributors = Array.isArray(existingOrder.contributors)
        ? [...existingOrder.contributors]
        : [];
      if (
        existingOrder.waiterId &&
        existingOrder.waiterName &&
        !existingContributors.some((c) => c.id === existingOrder.waiterId)
      ) {
        existingContributors.push({ id: existingOrder.waiterId, name: existingOrder.waiterName });
      }
      if (!existingContributors.some((c) => c.id === params.operator.id)) {
        existingContributors.push({ id: params.operator.id, name: params.operator.name });
      }
      order = {
        ...existingOrder,
        createdById: existingOrder.createdById || existingOrder.waiterId || table.openedById || params.operator.id,
        createdByName: existingOrder.createdByName || existingOrder.waiterName || table.openedByName || params.operator.name,
        contributors: existingContributors,
        items: existingOrder.items.map((i) => ({ ...i })),
      };
    } else {
      const nextNum =
        this.db.data.orders.reduce((max, o) => Math.max(max, o.orderNumber || 0), 100) + 1;
      order = {
        id: `ord-tbl-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId: params.tenantId,
        orderNumber: nextNum,
        type: 'table',
        status: 'preparing',
        tableId: table.id,
        tableNumber: table.number,
        tableName: table.label || `Mesa ${table.number}`,
        customerName: table.customerName,
        waiterId: table.openedById || params.operator.id,
        waiterName: table.openedByName || params.operator.name,
        createdById: table.openedById || params.operator.id,
        createdByName: table.openedByName || params.operator.name,
        contributors: [{ id: params.operator.id, name: params.operator.name }],
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

    let nextLogs = Array.isArray(table.operationLogs) ? [...table.operationLogs] : [];
    if (isOpeningTable) {
      nextLogs = this.appendTableLog({ ...table, operationLogs: nextLogs }, {
        type: 'table_opened',
        notes: `Mesa aberta por ${params.operator.name}`,
        operatorId: params.operator.id,
        operatorName: params.operator.name,
        timestamp: nowIso,
      });
    }

    for (const reqItem of params.items) {
      const prodIdx = this.db.data.products.findIndex(
        (p) => p.id === reqItem.productId && p.tenantId === params.tenantId
      );
      const prod = this.db.data.products[prodIdx];
      const prevStock = prod.stockQuantity ?? 0;
      const newStock = allowNegativeStock
        ? Number((prevStock - reqItem.quantity).toFixed(3))
        : Math.max(0, Number((prevStock - reqItem.quantity).toFixed(3)));

      this.db.data.products[prodIdx] = {
        ...prod,
        stockQuantity: newStock,
        updatedAt: nowIso,
      };

      this.db.data.inventoryTransactions.unshift({
        id: `inv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId: params.tenantId,
        productId: prod.id,
        productName: prod.name,
        type: 'sale',
        quantity: reqItem.quantity,
        previousStock: prevStock,
        newStock,
        reason: `Consumo adicionado à ${table.label || `Mesa ${table.number}`}`,
        userId: params.operator.id,
        userName: params.operator.name,
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
          JSON.stringify(existing.selectedAddons || []) === addonsKey
      );

      if (existingItemIdx >= 0) {
        const existingItem = order.items[existingItemIdx];
        const accumulatedQty = Number((existingItem.quantity + reqItem.quantity).toFixed(3));
        const existingAuthors = (existingItem.addedByName || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!existingAuthors.includes(params.operator.name)) {
          existingAuthors.push(params.operator.name);
        }
        order.items[existingItemIdx] = {
          ...existingItem,
          quantity: accumulatedQty,
          addedById: existingItem.addedById || params.operator.id,
          addedByName: existingAuthors.join(', ') || params.operator.name,
          addedAt: existingItem.addedAt || nowIso,
          total: Number((accumulatedQty * existingItem.unitPrice).toFixed(2)),
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
          addedById: params.operator.id,
          addedByName: params.operator.name,
          addedAt: nowIso,
          total: Number((reqItem.quantity * unitPrice).toFixed(2)),
        });
      }

      nextLogs = this.appendTableLog({ ...table, operationLogs: nextLogs }, {
        type: 'item_added',
        productId: prod.id,
        productName: prod.name,
        quantity: reqItem.quantity,
        notes: reqItem.variationName ? `Variação: ${reqItem.variationName}` : undefined,
        operatorId: params.operator.id,
        operatorName: params.operator.name,
        timestamp: nowIso,
      });
    }

    const itemsSubtotal = Number(
      order.items.reduce((sum, i) => sum + i.total, 0).toFixed(2)
    );
    const activeExtras = (table.extraCharges || []).filter((c) => c.status === 'active');
    const extraTotal = Number(activeExtras.reduce((sum, c) => sum + c.amount, 0).toFixed(2));

    order.subtotal = itemsSubtotal;
    order.extraTotal = extraTotal;
    order.extraCharges = table.extraCharges || [];
    order.total = Number((itemsSubtotal + extraTotal).toFixed(2));

    if (orderIdx >= 0) {
      this.db.data.orders[orderIdx] = order;
    } else {
      this.db.data.orders.unshift(order);
    }

    const allOpenTableOrders = this.db.data.orders.filter(
      (o) =>
        o.tenantId === params.tenantId &&
        o.type === 'table' &&
        (o.tableId === table.id || o.tableNumber === table.number) &&
        o.status !== 'cancelled' &&
        !o.paid &&
        o.status !== 'closed'
    );
    const productsTotal = Number(
      allOpenTableOrders.reduce((acc, o) => acc + (o.subtotal || 0), 0).toFixed(2)
    );
    const grandTotal = Number((productsTotal + extraTotal).toFixed(2));

    const updatedTable: RestaurantTable = {
      ...table,
      status: table.status === 'closing' ? 'closing' : 'occupied',
      openedAt: table.openedAt || nowIso,
      openedById: table.openedById || params.operator.id,
      openedByName: table.openedByName || params.operator.name,
      waiterId: table.waiterId || params.operator.id,
      waiterName: table.waiterName || params.operator.name,
      currentOrderId: order.id,
      productsTotal,
      extraTotal,
      currentTotal: grandTotal,
      activeOrdersCount: allOpenTableOrders.length,
      operationLogs: nextLogs,
    };
    this.db.data.tables[tableIdx] = updatedTable;

    this.addAuditLog({
      tenantId: params.tenantId,
      userId: params.operator.id,
      userName: params.operator.name,
      action: 'ADICIONOU_ITENS_MESA',
      details: `Lançou ${params.items.length} item(ns) na ${table.label || `Mesa ${table.number}`}. Subtotal produtos: R$ ${productsTotal.toFixed(2)}.`,
    });

    this.commit('table_items_added', { tenantId: params.tenantId });
    return { table: updatedTable, order };
  }

  public settleTableAccount(params: {
    tenantId: string;
    tableId: string;
    method: 'dinheiro' | 'pix';
    amount: number;
    receivedAmount?: number;
    notes?: string;
    allowEmptyRelease?: boolean;
    operator: { id: string; name: string };
    mutationId?: string;
  }): {
    alreadyProcessed?: boolean;
    settled: boolean;
    remainingBalance: number;
    table: RestaurantTable;
    archive?: TableAccountArchive;
  } {
    if (this.recordMutationId(params.mutationId)) {
      const table = this.db.data.tables.find((t) => t.id === params.tableId)!;
      return {
        alreadyProcessed: true,
        settled: table.status === 'available',
        remainingBalance: Math.max(0, (table.currentTotal || 0) - (table.paidAmount || 0)),
        table,
      };
    }

    const tableIdx = this.db.data.tables.findIndex(
      (t) => t.id === params.tableId && t.tenantId === params.tenantId
    );
    if (tableIdx < 0) throw new Error('Mesa não encontrada.');
    const table = this.db.data.tables[tableIdx];

    if (table.status === 'available' && (table.currentTotal || 0) <= 0.009) {
      throw new Error('TABLE_ALREADY_SETTLED:Esta mesa já está quitada e disponível.');
    }

    const productsTotal =
      table.productsTotal ?? Math.max(0, (table.currentTotal || 0) - (table.extraTotal || 0));
    const extraTotal = table.extraTotal || 0;
    const grandTotal = Number((productsTotal + extraTotal).toFixed(2));
    const previousPaid = Number((table.paidAmount || 0).toFixed(2));
    const currentRemaining = Number(Math.max(0, grandTotal - previousPaid).toFixed(2));

    if (currentRemaining > 0.009 && (!params.amount || params.amount <= 0)) {
      throw new Error('Informe um valor positivo para registrar o pagamento.');
    }

    const paidNow =
      currentRemaining <= 0.009
        ? 0
        : Math.min(currentRemaining, Number(params.amount.toFixed(2)));
    const updatedPayments: TablePaymentRecord[] = [...(table.payments || [])];
    const nowIso = new Date().toISOString();

    if (paidNow > 0) {
      const newPay: TablePaymentRecord = {
        id: `tpay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        method: params.method,
        amount: paidNow,
        receivedAmount: params.method === 'dinheiro' ? params.receivedAmount || paidNow : paidNow,
        change:
          params.method === 'dinheiro'
            ? Math.max(0, Number(((params.receivedAmount || paidNow) - paidNow).toFixed(2)))
            : 0,
        paidAt: nowIso,
        receivedById: params.operator.id,
        receivedByName: params.operator.name,
        notes: params.notes,
      };
      updatedPayments.push(newPay);

      const cashIdx = this.db.data.cashSessions.findIndex(
        (c) => c.tenantId === params.tenantId && c.status === 'open'
      );
      if (cashIdx >= 0) {
        const cash = this.db.data.cashSessions[cashIdx];
        if (params.method === 'dinheiro') {
          cash.totalCash = Number(((cash.totalCash || 0) + paidNow).toFixed(2));
          cash.expectedAmount = Number(((cash.expectedAmount || 0) + paidNow).toFixed(2));
        } else {
          cash.totalPix = Number(((cash.totalPix || 0) + paidNow).toFixed(2));
        }
      }

      this.db.data.financial.unshift({
        id: `tx-tpay-${newPay.id}`,
        tenantId: params.tenantId,
        type: 'revenue',
        category: 'Fechamento de Mesa',
        description: `Recebimento ${table.label || `Mesa ${table.number}`} (${params.method.toUpperCase()})`,
        amount: paidNow,
        date: nowIso,
        paid: true,
        paymentMethod: params.method,
        cashRegisterId: this.db.data.cashSessions.find(
          (c) => c.tenantId === params.tenantId && c.status === 'open'
        )?.id,
        userId: params.operator.id,
        userName: params.operator.name,
        notes: `Produtos: R$ ${productsTotal.toFixed(2)} | Extras: R$ ${extraTotal.toFixed(2)}`,
        createdAt: nowIso,
      });
    }

    const newPaidTotal = Number((previousPaid + paidNow).toFixed(2));
    const remainingBalance = Number(Math.max(0, grandTotal - newPaidTotal).toFixed(2));

    if (remainingBalance > 0.009) {
      const partialTable: RestaurantTable = {
        ...table,
        status: 'closing',
        paidAmount: newPaidTotal,
        payments: updatedPayments,
        operationLogs: this.appendTableLog(table, {
          type: 'payment_partial',
          amount: paidNow,
          notes: `Pagamento parcial (${params.method.toUpperCase()}) — restante R$ ${remainingBalance.toFixed(2)}`,
          operatorId: params.operator.id,
          operatorName: params.operator.name,
          timestamp: nowIso,
        }),
      };
      this.db.data.tables[tableIdx] = partialTable;
      this.addAuditLog({
        tenantId: params.tenantId,
        userId: params.operator.id,
        userName: params.operator.name,
        action: 'PAGAMENTO_PARCIAL_MESA',
        details: `Pagamento parcial de R$ ${paidNow.toFixed(2)} (${params.method.toUpperCase()}) na ${table.label || `Mesa ${table.number}`}. Restante: R$ ${remainingBalance.toFixed(2)}.`,
      });
      this.commit('table_partial_payment', { tenantId: params.tenantId });
      return { settled: false, remainingBalance, table: partialTable };
    }

    const linkedOrderIds: string[] = [];
    const orderPaymentsSummary = updatedPayments.map((p) => ({
      method: p.method,
      amount: p.amount,
      receivedAmount: p.receivedAmount,
      change: p.change,
    }));

    this.db.data.orders = this.db.data.orders.map((o) => {
      if (
        o.tenantId === params.tenantId &&
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
          payments:
            orderPaymentsSummary.length > 0
              ? orderPaymentsSummary
              : [{ method: params.method, amount: o.total }],
          closedAt: o.closedAt || nowIso,
        };
      }
      return o;
    });

    const archive: TableAccountArchive = {
      id: `tarch-${table.id}-${Date.now()}`,
      tenantId: params.tenantId,
      tableId: table.id,
      tableNumber: table.number,
      tableName: table.customerName || table.label || `Mesa ${table.number}`,
      openedAt: table.openedAt || nowIso,
      closedAt: nowIso,
      closedById: params.operator.id,
      closedByName: params.operator.name,
      productsTotal,
      extraTotal,
      grandTotal,
      paidTotal: newPaidTotal,
      orderIds: linkedOrderIds,
      extraCharges: table.extraCharges || [],
      payments: updatedPayments,
    };
    this.db.data.tableArchives.unshift(archive);

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
      operationLogs: [],
      timer: undefined,
    };
    this.db.data.tables[tableIdx] = freedTable;

    this.addAuditLog({
      tenantId: params.tenantId,
      userId: params.operator.id,
      userName: params.operator.name,
      action: 'QUITACAO_E_LIBERACAO_MESA',
      details: `Quitou e liberou "${table.label || `Mesa ${table.number}`}". Total pago: R$ ${newPaidTotal.toFixed(2)}.`,
    });

    this.commit('table_settled', { tenantId: params.tenantId });
    return { settled: true, remainingBalance: 0, table: freedTable, archive };
  }

  public createCounterSale(params: {
    tenantId: string;
    items: Array<{
      productId: string;
      quantity: number;
      variationName?: string;
      selectedAddons?: { name: string; price: number }[];
      notes?: string;
    }>;
    paymentMethod: 'dinheiro' | 'pix';
    receivedAmount?: number;
    customerName?: string;
    notes?: string;
    receiptImageUrl?: string;
    operator: { id: string; name: string };
    mutationId?: string;
  }): { alreadyProcessed?: boolean; order: Order } {
    if (this.recordMutationId(params.mutationId)) {
      const latest = this.db.data.orders.find((o) => o.tenantId === params.tenantId && o.type === 'counter')!;
      return { alreadyProcessed: true, order: latest };
    }

    if (!params.items || params.items.length === 0) {
      throw new Error('O carrinho do balcão está vazio.');
    }

    const tenant = this.db.data.tenants.find((t) => t.id === params.tenantId);
    const allowNegativeStock = Boolean(tenant?.settings?.allowNegativeStock);
    const nowIso = new Date().toISOString();
    const orderItems: OrderItem[] = [];

    for (const reqItem of params.items) {
      const prodIdx = this.db.data.products.findIndex(
        (p) => p.id === reqItem.productId && p.tenantId === params.tenantId
      );
      if (prodIdx < 0) throw new Error('Produto não encontrado no cardápio.');
      const prod = this.db.data.products[prodIdx];
      if (!allowNegativeStock && (prod.stockQuantity ?? 0) < reqItem.quantity) {
        throw new Error(
          `Estoque insuficiente para "${prod.name}". Disponível: ${prod.stockQuantity ?? 0}, solicitado: ${reqItem.quantity}.`
        );
      }

      const prevStock = prod.stockQuantity ?? 0;
      const newStock = allowNegativeStock
        ? Number((prevStock - reqItem.quantity).toFixed(3))
        : Math.max(0, Number((prevStock - reqItem.quantity).toFixed(3)));
      this.db.data.products[prodIdx] = {
        ...prod,
        stockQuantity: newStock,
        updatedAt: nowIso,
      };

      this.db.data.inventoryTransactions.unshift({
        id: `inv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        tenantId: params.tenantId,
        productId: prod.id,
        productName: prod.name,
        type: 'sale',
        quantity: reqItem.quantity,
        previousStock: prevStock,
        newStock,
        reason: 'Venda direta no Balcão',
        userId: params.operator.id,
        userName: params.operator.name,
        createdAt: nowIso,
      });

      const variationPrice =
        reqItem.variationName && prod.variations?.length
          ? prod.variations.find((v) => v.name === reqItem.variationName)?.price ?? prod.sellingPrice
          : prod.sellingPrice;
      const addonsTotal = (reqItem.selectedAddons || []).reduce((acc, a) => acc + a.price, 0);
      const unitPrice = Number((variationPrice + addonsTotal).toFixed(2));

      orderItems.push({
        productId: prod.id,
        productName: prod.name,
        quantity: reqItem.quantity,
        unitPrice,
        variationName: reqItem.variationName,
        selectedAddons: reqItem.selectedAddons,
        notes: reqItem.notes,
        addedById: params.operator.id,
        addedByName: params.operator.name,
        addedAt: nowIso,
        total: Number((reqItem.quantity * unitPrice).toFixed(2)),
      });
    }

    const subtotal = Number(orderItems.reduce((sum, i) => sum + i.total, 0).toFixed(2));
    const nextNum =
      this.db.data.orders.reduce((max, o) => Math.max(max, o.orderNumber || 0), 100) + 1;

    const order: Order = {
      id: `ord-bal-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      tenantId: params.tenantId,
      orderNumber: nextNum,
      type: 'counter',
      status: 'closed',
      customerName: params.customerName?.trim() || undefined,
      waiterId: params.operator.id,
      waiterName: params.operator.name,
      createdById: params.operator.id,
      createdByName: params.operator.name,
      contributors: [{ id: params.operator.id, name: params.operator.name }],
      items: orderItems,
      subtotal,
      discount: 0,
      serviceFee: 0,
      total: subtotal,
      payments: [
        {
          method: params.paymentMethod,
          amount: subtotal,
          receivedAmount:
            params.paymentMethod === 'dinheiro' ? params.receivedAmount || subtotal : subtotal,
          change:
            params.paymentMethod === 'dinheiro'
              ? Math.max(0, Number(((params.receivedAmount || subtotal) - subtotal).toFixed(2)))
              : 0,
          receiptImageUrl: params.receiptImageUrl,
          receiptType: params.receiptImageUrl
            ? params.paymentMethod === 'pix'
              ? 'pix'
              : 'cash'
            : undefined,
          receiptCapturedAt: params.receiptImageUrl ? nowIso : undefined,
          receiptSellerName: params.receiptImageUrl ? params.operator.name : undefined,
        },
      ],
      paid: true,
      notes: params.notes,
      receiptImageUrl: params.receiptImageUrl,
      receiptCapturedAt: params.receiptImageUrl ? nowIso : undefined,
      receiptSellerName: params.receiptImageUrl ? params.operator.name : undefined,
      createdAt: nowIso,
      closedAt: nowIso,
    };

    this.db.data.orders.unshift(order);

    const cashIdx = this.db.data.cashSessions.findIndex(
      (c) => c.tenantId === params.tenantId && c.status === 'open'
    );
    if (cashIdx >= 0) {
      const cash = this.db.data.cashSessions[cashIdx];
      if (params.paymentMethod === 'dinheiro') {
        cash.totalCash = Number(((cash.totalCash || 0) + subtotal).toFixed(2));
        cash.expectedAmount = Number(((cash.expectedAmount || 0) + subtotal).toFixed(2));
      } else {
        cash.totalPix = Number(((cash.totalPix || 0) + subtotal).toFixed(2));
      }
    }

    this.db.data.financial.unshift({
      id: `tx-bal-${order.id}`,
      tenantId: params.tenantId,
      type: 'revenue',
      category: 'Venda Balcão',
      description: `Venda Balcão #${order.orderNumber} (${params.paymentMethod.toUpperCase()})`,
      amount: subtotal,
      date: nowIso,
      paid: true,
      paymentMethod: params.paymentMethod,
      cashRegisterId: this.db.data.cashSessions.find(
        (c) => c.tenantId === params.tenantId && c.status === 'open'
      )?.id,
      userId: params.operator.id,
      userName: params.operator.name,
      createdAt: nowIso,
    });

    this.addAuditLog({
      tenantId: params.tenantId,
      userId: params.operator.id,
      userName: params.operator.name,
      action: 'VENDA_BALCAO',
      details: `Venda Balcão #${order.orderNumber} finalizada em ${params.paymentMethod.toUpperCase()} no valor de R$ ${subtotal.toFixed(2)}.`,
    });

    this.commit('counter_sale_created', { tenantId: params.tenantId });
    return { order };
  }

  public cancelOrder(orderId: string, adminUser: { id: string; name: string }, reason?: string): Order {
    const idx = this.db.data.orders.findIndex((o) => o.id === orderId);
    if (idx < 0) throw new Error('Pedido não encontrado.');
    const order = this.db.data.orders[idx];
    if (order.status === 'cancelled') throw new Error('Este pedido já foi cancelado.');

    const nowIso = new Date().toISOString();

    for (const item of order.items) {
      const pIdx = this.db.data.products.findIndex(
        (p) => p.id === item.productId && p.tenantId === order.tenantId
      );
      if (pIdx >= 0) {
        const prod = this.db.data.products[pIdx];
        const prev = prod.stockQuantity ?? 0;
        const next = Number((prev + item.quantity).toFixed(3));
        this.db.data.products[pIdx] = { ...prod, stockQuantity: next, updatedAt: nowIso };
        this.db.data.inventoryTransactions.unshift({
          id: `inv-est-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          tenantId: order.tenantId,
          productId: prod.id,
          productName: prod.name,
          type: 'adjustment',
          quantity: item.quantity,
          previousStock: prev,
          newStock: next,
          reason: `Estorno por cancelamento do Pedido #${order.orderNumber}`,
          userId: adminUser.id,
          userName: adminUser.name,
          createdAt: nowIso,
        });
      }
    }

    const updatedOrder: Order = {
      ...order,
      status: 'cancelled',
      paid: false,
      notes: reason ? `${order.notes || ''} [CANCELADO: ${reason}]`.trim() : order.notes,
    };
    this.db.data.orders[idx] = updatedOrder;

    if (order.type === 'table' && order.tableId) {
      const tIdx = this.db.data.tables.findIndex((t) => t.id === order.tableId);
      if (tIdx >= 0) {
        const table = this.db.data.tables[tIdx];
        const remainingOrders = this.db.data.orders.filter(
          (o) =>
            o.tenantId === order.tenantId &&
            o.type === 'table' &&
            o.tableId === table.id &&
            o.status !== 'cancelled' &&
            !o.paid &&
            o.status !== 'closed'
        );
        const productsTotal = Number(
          remainingOrders.reduce((acc, o) => acc + (o.subtotal || 0), 0).toFixed(2)
        );
        const extraTotal = table.extraTotal || 0;
        const grandTotal = Number((productsTotal + extraTotal).toFixed(2));
        this.db.data.tables[tIdx] = {
          ...table,
          productsTotal,
          currentTotal: grandTotal,
          activeOrdersCount: remainingOrders.length,
          status: grandTotal <= 0.009 ? 'available' : table.status,
        };
      }
    }

    this.addAuditLog({
      tenantId: order.tenantId,
      userId: adminUser.id,
      userName: adminUser.name,
      action: 'CANCELOU_VENDA',
      details: `Cancelou Pedido #${order.orderNumber} (R$ ${order.total.toFixed(2)}) com estorno de estoque.`,
    });

    this.commit('order_cancelled', { tenantId: order.tenantId });
    return updatedOrder;
  }

  // ==================== ARQUIVAMENTO DE PDF E LIMPEZA DE PERÍODO ====================

  public getArchivedPdfs(tenantId: string): ArchivedPeriodPdf[] {
    return (this.db.data.archivedPdfs || []).filter((p) => p.tenantId === tenantId);
  }

  public getArchivedPdfById(id: string): ArchivedPeriodPdf | undefined {
    return (this.db.data.archivedPdfs || []).find((p) => p.id === id);
  }

  public saveArchivedPdf(
    pdf: ArchivedPeriodPdf,
    actor: { id: string; name: string }
  ): ArchivedPeriodPdf {
    const startMs = new Date(`${pdf.periodStart}T00:00:00`).getTime();
    const endMs = new Date(`${pdf.periodEnd}T23:59:59`).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
      throw new Error('Período inválido para geração do arquivo PDF.');
    }
    if (!pdf.pdfBase64 || pdf.pdfBase64.length < 30) {
      throw new Error('Conteúdo binário do PDF ausente.');
    }

    const pdfBytes = Buffer.from(pdf.pdfBase64, 'base64');
    if (pdfBytes.slice(0, 4).toString('utf-8') !== '%PDF') {
      throw new Error('Arquivo gerado não possui cabeçalho PDF válido.');
    }

    this.ensureDirectories();
    const safeFileName = (pdf.fileName || `${pdf.id}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(this.archivesDir, safeFileName), pdfBytes);

    const record: ArchivedPeriodPdf = {
      ...pdf,
      restorable: false,
      fileName: safeFileName,
      sizeBytes: pdfBytes.length,
    };

    const existing = this.db.data.archivedPdfs || [];
    this.db.data.archivedPdfs = [record, ...existing.filter((p) => p.id !== record.id)];

    this.addAuditLog({
      tenantId: record.tenantId,
      userId: actor.id,
      userName: actor.name,
      action: 'ARQUIVOU_PERIODO_PDF',
      details: `Gerou arquivo histórico PDF (${record.fileName}) referente a ${record.periodStart} até ${record.periodEnd}. Documento somente para consulta/arquivamento.`,
    });

    this.commit('pdf_archived', { tenantId: record.tenantId });
    return record;
  }

  public executeCleanPeriodReset(
    tenantId: string,
    params: Partial<SelectiveResetOptions> & { confirmationText?: string; archivePdfId?: string },
    actor: { id: string; name: string },
    ipAddress = '127.0.0.1'
  ): SelectiveResetResult {
    if ((params.confirmationText || '').trim() !== 'CONFIRMAR LIMPEZA') {
      throw new Error('Digite exatamente "CONFIRMAR LIMPEZA" para executar a limpeza do sistema.');
    }

    const archivedPdf = (this.db.data.archivedPdfs || []).find(
      (p) => p.id === params.archivePdfId && p.tenantId === tenantId
    );
    if (!archivedPdf) {
      throw new Error(
        'É obrigatório gerar e salvar o arquivo histórico em PDF antes de limpar o sistema.'
      );
    }

    const keepProducts = params.keepProducts !== false;
    const keepProductPhotos = params.keepProductPhotos !== false;
    const keepProductDescriptions = params.keepProductDescriptions !== false;
    const keepCategories = params.keepCategories !== false;
    const zeroProductPrices = Boolean(params.zeroProductPrices);
    const zeroProductStock = Boolean(params.zeroProductStock);

    const keepCustomers = params.keepCustomers !== false;
    const keepSuppliers = params.keepSuppliers !== false;
    const keepSellers = params.keepSellers !== false;
    const rotateSellerKeys = Boolean(params.rotateSellerKeys);

    const clearOrders = params.clearOrders !== false;
    const clearTables = params.clearTables !== false;
    const clearCashRegisters = params.clearCashRegisters !== false;
    const clearExpenses = params.clearExpenses !== false;
    const clearReceipts = params.clearReceipts !== false;
    const clearStockMovements = params.clearStockMovements !== false;
    const clearSavedReports = Boolean(params.clearSavedReports);
    const clearOperationalLogs = Boolean(params.clearOperationalLogs);

    const clearedSummary: string[] = [];
    const preservedSummary: string[] = [];
    const revokedUserIds: string[] = [];
    const revokedSessionIds: string[] = [];
    const regeneratedSellerKeys: RegeneratedSellerKeyInfo[] = [];

    // 1. NUNCA deixar mesas ou comandas abertas após limpeza de período
    this.db.data.tables = this.db.data.tables.map((t) =>
      t.tenantId === tenantId
        ? {
            ...t,
            status: 'available',
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
            operationLogs: [],
            timer: undefined,
          }
        : t
    );
    clearedSummary.push('Mesas e comandas abertas encerradas automaticamente');

    if (clearTables) {
      this.db.data.tableArchives = this.db.data.tableArchives.filter((a) => a.tenantId !== tenantId);
      clearedSummary.push('Históricos operacionais de mesas');
    } else {
      preservedSummary.push('Histórico arquivado de mesas');
    }

    // 2. Categorias
    if (!keepCategories) {
      this.db.data.categories = this.db.data.categories.filter((c) => c.tenantId !== tenantId);
      clearedSummary.push('Categorias do cardápio');
    } else {
      preservedSummary.push('Categorias do cardápio');
    }

    // 3. Produtos (preservação granular de fotos, descrições, códigos, preços e estoque)
    if (!keepProducts) {
      this.db.data.products = this.db.data.products.filter((p) => p.tenantId !== tenantId);
      clearedSummary.push('Catálogo completo de produtos');
    } else {
      const nowIso = new Date().toISOString();
      this.db.data.products = this.db.data.products.map((p) => {
        if (p.tenantId !== tenantId) return p;
        return {
          ...p,
          categoryId: keepCategories ? p.categoryId : '',
          imageUrl: keepProductPhotos ? p.imageUrl : undefined,
          description: keepProductDescriptions ? p.description : '',
          sellingPrice: zeroProductPrices ? 0 : p.sellingPrice,
          costPrice: zeroProductPrices ? 0 : p.costPrice,
          profitMargin: zeroProductPrices ? 0 : p.profitMargin,
          stockQuantity: zeroProductStock ? 0 : p.stockQuantity,
          updatedAt: nowIso,
        };
      });
      const keptParts = ['Produtos e códigos'];
      if (keepProductPhotos) keptParts.push('fotos');
      else clearedSummary.push('Fotografias dos produtos');
      if (keepProductDescriptions) keptParts.push('descrições');
      else clearedSummary.push('Descrições dos produtos');
      if (!zeroProductPrices) keptParts.push('preços');
      else clearedSummary.push('Preços de venda zerados');
      if (!zeroProductStock) keptParts.push('estoque');
      else clearedSummary.push('Saldos de estoque zerados');
      preservedSummary.push(keptParts.join(', '));
    }

    // 4. Clientes & Fornecedores
    if (!keepCustomers) {
      this.db.data.customers = this.db.data.customers.filter((c) => c.tenantId !== tenantId);
      clearedSummary.push('Cadastro de clientes');
    } else {
      preservedSummary.push('Clientes cadastrados');
    }

    if (!keepSuppliers) {
      this.db.data.suppliers = this.db.data.suppliers.filter((s) => s.tenantId !== tenantId);
      clearedSummary.push('Cadastro de fornecedores');
    } else {
      preservedSummary.push('Fornecedores cadastrados');
    }

    // 5. Vendedores e Chaves Individuais
    if (!keepSellers) {
      const removedIds = this.db.data.users
        .filter((u) => u.tenantId === tenantId && u.role !== 'admin')
        .map((u) => u.id);
      revokedUserIds.push(...removedIds);

      this.db.data.users = this.db.data.users.filter(
        (u) => u.tenantId !== tenantId || u.role === 'admin'
      );

      // Revoga chaves e encerra sessões de vendedores removidos
      const nowIso = new Date().toISOString();
      this.db.accessKeys = this.db.accessKeys.map((k) =>
        k.tenantId === tenantId && k.mode === 'seller' && !k.revoked
          ? { ...k, revoked: true, revokedAt: nowIso }
          : k
      );
      for (const s of this.db.sessions) {
        if (s.tenantId === tenantId && s.mode === 'seller') {
          revokedSessionIds.push(s.id);
        }
      }
      this.db.sessions = this.db.sessions.filter(
        (s) => !(s.tenantId === tenantId && s.mode === 'seller')
      );
      clearedSummary.push('Vendedores cadastrados e suas chaves de acesso');
    } else {
      if (rotateSellerKeys) {
        const now = new Date();
        const nowIso = now.toISOString();
        const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

        // Revoga chaves e sessões anteriores dos vendedores deste estabelecimento
        this.db.accessKeys = this.db.accessKeys.map((k) =>
          k.tenantId === tenantId && k.mode === 'seller' && !k.revoked
            ? { ...k, revoked: true, revokedAt: nowIso }
            : k
        );
        for (const s of this.db.sessions) {
          if (s.tenantId === tenantId && s.mode === 'seller') {
            revokedSessionIds.push(s.id);
          }
        }
        this.db.sessions = this.db.sessions.filter(
          (s) => !(s.tenantId === tenantId && s.mode === 'seller')
        );

        const activeSellers = this.db.data.users.filter(
          (u) => u.tenantId === tenantId && u.role !== 'admin' && u.canSell !== false && u.status !== 'bloqueado'
        );
        for (const seller of activeSellers) {
          const plainKey = generateReadableKey('seller');
          const { salt, hash } = hashSecret(plainKey);
          const keyPreview = maskKey(plainKey);
          const rec: StoredAccessKey = {
            id: `wkey-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            tenantId,
            mode: 'seller',
            userId: seller.id,
            userName: seller.name,
            keyPreview,
            salt,
            keyHash: hash,
            createdAt: nowIso,
            expiresAt,
            revoked: false,
          };
          this.db.accessKeys.unshift(rec);
          regeneratedSellerKeys.push({
            userId: seller.id,
            userName: seller.name,
            plainKey,
            keyPreview,
            expiresAt,
          });
        }
        this.addConnectionLog({
          tenantId,
          event: 'key_renewed',
          mode: 'seller',
          userName: actor.name,
          deviceLabel: 'Limpeza e Novo Período',
          ipAddress,
          details: `${regeneratedSellerKeys.length} chave(s) de vendedor(es) redefinida(s) na virada de período.`,
        });
        preservedSummary.push(
          `Vendedores cadastrados (${regeneratedSellerKeys.length} nova(s) chave(s) gerada(s))`
        );
      } else {
        preservedSummary.push('Vendedores cadastrados e chaves atuais');
      }
    }

    // 6. Vendas e Pedidos
    if (clearOrders) {
      this.db.data.orders = this.db.data.orders.filter((o) => o.tenantId !== tenantId);
      clearedSummary.push('Vendas e históricos de pedidos');
    } else {
      const nowIso = new Date().toISOString();
      this.db.data.orders = this.db.data.orders.map((o) =>
        o.tenantId === tenantId && o.status !== 'closed' && o.status !== 'cancelled'
          ? { ...o, status: 'cancelled', closedAt: o.closedAt || nowIso }
          : o
      );
      preservedSummary.push('Histórico de vendas concluídas');
    }

    // 7. Caixa e Movimentações
    if (clearCashRegisters) {
      this.db.data.cashSessions = this.db.data.cashSessions.filter((c) => c.tenantId !== tenantId);
      clearedSummary.push('Caixa e movimentações de caixa');
    } else {
      preservedSummary.push('Sessões de caixa');
    }

    // 8. Gastos e Recebimentos (filtragem granular)
    if (clearExpenses || clearReceipts) {
      this.db.data.financial = this.db.data.financial.filter((f) => {
        if (f.tenantId !== tenantId) return true;
        const isReceipt = f.type === 'revenue' || f.type === 'deposit';
        if (isReceipt && clearReceipts) return false;
        if (!isReceipt && clearExpenses) return false;
        return true;
      });
      if (clearExpenses) clearedSummary.push('Gastos e despesas');
      else preservedSummary.push('Gastos e despesas');
      if (clearReceipts) clearedSummary.push('Recebimentos financeiros');
      else preservedSummary.push('Recebimentos financeiros');
    } else {
      preservedSummary.push('Gastos e recebimentos');
    }

    // 9. Movimentações de Estoque
    if (clearStockMovements) {
      this.db.data.inventoryTransactions = this.db.data.inventoryTransactions.filter(
        (m) => m.tenantId !== tenantId
      );
      clearedSummary.push('Movimentações de estoque');
    } else {
      preservedSummary.push('Movimentações de estoque');
    }

    // 10. Relatórios Operacionais Salvos
    if (clearSavedReports) {
      this.db.data.savedReports = this.db.data.savedReports.filter((r) => r.tenantId !== tenantId);
      clearedSummary.push('Relatórios operacionais salvos');
    } else {
      preservedSummary.push('Relatórios operacionais salvos');
    }

    // 11. Outros Registros Operacionais (PDFs históricos são SEMPRE mantidos)
    if (clearOperationalLogs) {
      this.db.data.archivedPeriods = this.db.data.archivedPeriods.filter((a) => a.tenantId !== tenantId);
      this.db.data.auditLogs = this.db.data.auditLogs.filter((l) => l.tenantId !== tenantId);
      clearedSummary.push('Logs e arquivos operacionais auxiliares');
    }

    preservedSummary.push('PDFs históricos arquivados e configurações do estabelecimento');

    this.addAuditLog({
      tenantId,
      userId: actor.id,
      userName: actor.name,
      action: 'LIMPEZA_NOVO_PERIODO',
      details: `Limpeza seletiva pós-PDF (${archivedPdf.fileName}). Zerados: ${clearedSummary.join('; ')}. Preservados: ${preservedSummary.join('; ')}.${params.reason ? ` Motivo: ${params.reason}` : ''}`,
    });

    this.commit('period_cleaned', {
      tenantId,
      revokedUserIds,
      revokedSessionIds,
    });

    return {
      archivePdfId: archivedPdf.id,
      clearedSummary,
      preservedSummary,
      regeneratedSellerKeys: regeneratedSellerKeys.length > 0 ? regeneratedSellerKeys : undefined,
      revision: this.db.revision,
    };
  }

  // ==================== SINCRONIZAÇÃO ADMINISTRATIVA ====================

  public syncStateFromClient(
    partial: Partial<PersistedTenantData>,
    tenantId: string,
    actorName: string
  ): { revision: number; revokedUserIds: string[]; revokedSessionIds: string[] } {
    const prevUsers = this.db.data.users;
    if (partial.tenants) this.db.data.tenants = partial.tenants;
    if (partial.users) this.db.data.users = partial.users;
    if (partial.categories) this.db.data.categories = partial.categories;
    if (partial.products) this.db.data.products = partial.products;
    if (partial.tables) this.db.data.tables = partial.tables;
    if (partial.orders) this.db.data.orders = partial.orders;
    if (partial.cashSessions) this.db.data.cashSessions = partial.cashSessions;
    if (partial.financial) this.db.data.financial = partial.financial;
    if (partial.inventoryTransactions) this.db.data.inventoryTransactions = partial.inventoryTransactions;
    if (partial.auditLogs) this.db.data.auditLogs = partial.auditLogs;
    if (partial.savedReports) this.db.data.savedReports = partial.savedReports;
    if (partial.archivedPeriods) this.db.data.archivedPeriods = partial.archivedPeriods;
    if (partial.archivedPdfs) {
      // Preserva os PDFs existentes na Matriz e anexa quaisquer novos enviados
      const map = new Map<string, ArchivedPeriodPdf>();
      for (const pdf of this.db.data.archivedPdfs || []) map.set(pdf.id, pdf);
      for (const pdf of partial.archivedPdfs) map.set(pdf.id, pdf);
      this.db.data.archivedPdfs = Array.from(map.values());
    }
    if (partial.backups) this.db.data.backups = partial.backups;
    if (partial.tableArchives) this.db.data.tableArchives = partial.tableArchives;
    if (partial.customers) this.db.data.customers = partial.customers;
    if (partial.suppliers) this.db.data.suppliers = partial.suppliers;
    if (partial.themeConfig) this.db.data.themeConfig = partial.themeConfig;

    const blockedUserIds: string[] = [];
    for (const u of this.db.data.users) {
      const wasBlocked = prevUsers.find((pu) => pu.id === u.id);
      if (u.role !== 'admin' && (u.canSell === false || u.status === 'bloqueado')) {
        if (!wasBlocked || wasBlocked.canSell !== false || this.db.sessions.some((s) => s.userId === u.id)) {
          blockedUserIds.push(u.id);
        }
      }
    }

    const revokedSessionIds = this.db.sessions
      .filter((s) => s.mode === 'seller' && blockedUserIds.includes(s.userId))
      .map((s) => s.id);
    if (revokedSessionIds.length > 0) {
      this.db.sessions = this.db.sessions.filter((s) => !revokedSessionIds.includes(s.id));
    }

    this.commit(`state_synced:${actorName}`, {
      tenantId,
      revokedUserIds: blockedUserIds,
      revokedSessionIds,
    });

    return {
      revision: this.db.revision,
      revokedUserIds: blockedUserIds,
      revokedSessionIds,
    };
  }
}
