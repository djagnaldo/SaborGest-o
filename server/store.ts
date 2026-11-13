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
  Order,
  OrderItem,
  CashRegisterSession,
  FinancialTransaction,
  InventoryTransaction,
  AuditLog,
  SavedReport,
  ArchivedPeriod,
  SystemBackup,
  SystemThemeConfig,
  TableAccountArchive,
  TablePaymentRecord,
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
  backups: SystemBackup[];
  tableArchives: TableAccountArchive[];
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

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'saborgestao-db.json');

function ensureCleanSeedOrders(): Order[] {
  // Garante que nenhuma comanda ativa seja gerada no seed inicial (comanda foi removida)
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
      backups: INITIAL_DEMO_BACKUPS,
      tableArchives: [],
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
    }) => void
  ) {
    this.onAfterChange = onAfterChange;
    this.db = this.loadFromDisk();
  }

  private loadFromDisk(): ServerDatabase {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ServerDatabase>;
        if (parsed && parsed.data && Array.isArray(parsed.data.tenants)) {
          return {
            revision: parsed.revision || 1,
            webAccessEnabled: parsed.webAccessEnabled ?? true,
            data: {
              ...createInitialDatabase().data,
              ...parsed.data,
            },
            accessKeys: parsed.accessKeys || [],
            sessions: parsed.sessions || [],
            connectionLogs: parsed.connectionLogs || [],
            processedMutationIds: parsed.processedMutationIds || [],
          };
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
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmp = `${DB_FILE}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(dbSnapshot, null, 2), 'utf-8');
      fs.renameSync(tmp, DB_FILE);
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
      // RBAC estrito: vendedor não recebe relatórios financeiros globais, backups ou arquivos administrativos sensíveis
      return {
        revision: this.db.revision,
        webAccessEnabled: this.db.webAccessEnabled,
        tenantId: activeTenantId,
        data: {
          tenants: data.tenants,
          users: data.users.map((u) => ({
            ...u,
            accessCode: u.id === userId ? u.accessCode : undefined,
          })),
          categories: data.categories,
          products: data.products,
          tables: data.tables,
          orders: data.orders,
          cashSessions: data.cashSessions.filter((c) => c.status === 'open'),
          financial: [],
          inventoryTransactions: [],
          auditLogs: [],
          savedReports: [],
          archivedPeriods: [],
          backups: [],
          tableArchives: [],
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

    // Desconecta sessões antigas associadas a essa chave antes de rotacionar
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

    // 1. Valida estoque dos deltas adicionados
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

    // 2. Localiza pedido aberto existente da mesa ou cria um novo
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
    let order: Order;

    if (orderIdx >= 0) {
      order = {
        ...this.db.data.orders[orderIdx],
        items: this.db.data.orders[orderIdx].items.map((i) => ({ ...i })),
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
        waiterId: params.operator.id,
        waiterName: params.operator.name,
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

    // 3. Baixa estoque delta e acumula itens equivalentes no pedido aberto
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
        // Preserva o unitPrice original travado no item já lançado na mesa
        order.items[existingItemIdx] = {
          ...existingItem,
          quantity: accumulatedQty,
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
          total: Number((reqItem.quantity * unitPrice).toFixed(2)),
        });
      }
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

    // Soma de todos os pedidos em aberto desta mesa para consistência absoluta
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
      waiterId: table.waiterId || params.operator.id,
      waiterName: table.waiterName || params.operator.name,
      currentOrderId: order.id,
      productsTotal,
      extraTotal,
      currentTotal: grandTotal,
      activeOrdersCount: allOpenTableOrders.length,
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

      // Atualiza sessão aberta de caixa
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

    // Quitação integral: encerra pedidos vinculados da mesa, arquiva conta, libera mesa
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
          payments: orderPaymentsSummary.length > 0 ? orderPaymentsSummary : [{ method: params.method, amount: o.total }],
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

    // Estorna itens para o estoque
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

    // Se era pedido em aberto de uma mesa, recalcula os totais da mesa
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

  public syncStateFromClient(
    partial: Partial<PersistedTenantData>,
    tenantId: string,
    actorName: string
  ): { revision: number; revokedUserIds: string[]; revokedSessionIds: string[] } {
    // Atualiza coleções mantendo integridade de sessões/chaves
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
    if (partial.backups) this.db.data.backups = partial.backups;
    if (partial.tableArchives) this.db.data.tableArchives = partial.tableArchives;
    if (partial.themeConfig) this.db.data.themeConfig = partial.themeConfig;

    // Se algum vendedor foi bloqueado na sincronização, derruba sessões dele imediatamente
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
