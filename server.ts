import http from 'node:http';
import crypto from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { AuthoritativeStore } from './server/store';
import type { WebAccessMode, UserProfile } from './src/types';

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface ClientSocketMeta {
  ws: WebSocket;
  clientType: 'matriz' | 'web';
  sessionId?: string;
  userId?: string;
  mode: WebAccessMode;
  tenantId: string;
}

export interface AuthRequest extends Request {
  auth?: {
    source: 'matriz' | 'web';
    mode: WebAccessMode;
    user: UserProfile;
    sessionId?: string;
    ip: string;
  };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1';
}

export function createSaborServerInstance(options?: {
  port?: number;
  dataDir?: string;
}) {
  const port = options?.port ?? DEFAULT_PORT;
  // Token efêmero emitido apenas ao host local Matriz na inicialização do servidor
  const MATRIZ_HOST_SECRET = crypto.randomBytes(24).toString('hex');
  const connectedClients = new Set<ClientSocketMeta>();

  const store = new AuthoritativeStore((event) => {
    broadcastStateChange(event);
  }, options?.dataDir);

  function broadcastStateChange(event: {
    type: string;
    tenantId?: string;
    revokedUserIds?: string[];
    revokedSessionIds?: string[];
  }) {
    const revokedSessions = new Set(event.revokedSessionIds || []);
    const revokedUsers = new Set(event.revokedUserIds || []);

    for (const client of connectedClients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      // 1. Revogação imediata de sessões bloqueadas/desconectadas
      if (
        client.clientType === 'web' &&
        ((client.sessionId && revokedSessions.has(client.sessionId)) ||
          (client.userId && client.mode === 'seller' && revokedUsers.has(client.userId)))
      ) {
        client.ws.send(
          JSON.stringify({
            type: 'session:revoked',
            reason: revokedUsers.has(client.userId || '')
              ? 'Sua permissão de venda foi bloqueada pelo Administrador.'
              : 'Esta sessão foi encerrada pelo Administrador.',
          })
        );
        try {
          client.ws.close(4003, 'Session revoked');
        } catch {
          // noop
        }
        continue;
      }

      // 2. Push de atualização autorizada para clientes ativos (respeitando escopo do vendedor)
      const snapshot = store.getSnapshot(client.tenantId, client.mode, client.userId);
      client.ws.send(
        JSON.stringify({
          type: 'state:sync',
          event: event.type,
          revision: snapshot.revision,
          webAccessEnabled: snapshot.webAccessEnabled,
          tenantId: snapshot.tenantId,
          data: snapshot.data,
        })
      );
    }
  }

  function resolveAuthorizedTenantId(req: AuthRequest, requestedTenantId?: unknown): string {
    const userTenant = req.auth!.user.tenantId;
    const reqTid = typeof requestedTenantId === 'string' ? requestedTenantId.trim() : '';
    if (req.auth!.source === 'web') {
      if (reqTid && reqTid !== userTenant) {
        throw new Error('TENANT_MISMATCH:Acesso negado para estabelecimento diferente da sessão.');
      }
      return userTenant;
    }
    return reqTid || userTenant;
  }

  function requireAuth(allowedModes: WebAccessMode[] = ['admin', 'seller']) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      const ip = getClientIp(req);
      const authHeader = req.headers.authorization;
      const matrizSecretHeader = req.headers['x-sabor-matriz-secret'];
      const matrizUserIdHeader = req.headers['x-sabor-user-id'];

      // 1. Bearer token -> estritamente Sessão Web (nunca escalona via header Matriz)
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const validation = store.validateBearerToken(token);
        if (!validation.valid || !validation.session || !validation.user) {
          return res.status(401).json({ error: validation.reason || 'Sessão inválida.' });
        }
        if (!allowedModes.includes(validation.session.mode)) {
          return res.status(403).json({
            error: 'Acesso negado: esta operação é exclusiva do MODO ADMINISTRADOR.',
          });
        }
        req.auth = {
          source: 'web',
          mode: validation.session.mode,
          user: validation.user,
          sessionId: validation.session.id,
          ip,
        };
        return next();
      }

      // 2. Autenticação interna do terminal host Matriz
      if (typeof matrizSecretHeader === 'string' && matrizSecretHeader === MATRIZ_HOST_SECRET) {
        const snap = store.getSnapshot(undefined, 'admin');
        const requestedUserId =
          typeof matrizUserIdHeader === 'string' ? matrizUserIdHeader : undefined;
        const user =
          snap.data.users.find((u) => u.id === requestedUserId) ||
          snap.data.users.find((u) => u.role === 'admin');

        if (!user) {
          return res.status(401).json({ error: 'Perfil do operador não encontrado.' });
        }
        const effectiveMode: WebAccessMode = user.role === 'admin' ? 'admin' : 'seller';
        if (effectiveMode === 'seller' && (user.canSell === false || user.status === 'bloqueado')) {
          return res.status(403).json({ error: 'Vendedor bloqueado pelo Administrador.' });
        }
        if (!allowedModes.includes(effectiveMode)) {
          return res.status(403).json({
            error: 'Acesso negado: operação restrita ao perfil Administrador.',
          });
        }
        req.auth = {
          source: 'matriz',
          mode: effectiveMode,
          user,
          ip,
        };
        return next();
      }

      return res.status(401).json({ error: 'Autenticação obrigatória para acessar esta rota.' });
    };
  }

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Health & public info
  app.get('/api/health', (_req, res) => {
    const net = store.getNetworkInfo(port);
    res.json({
      ok: true,
      service: 'SaborGestao-LocalServer',
      port,
      primaryIp: net.primaryIp,
      lanIps: net.lanIps,
      webAccessEnabled: store.isWebAccessEnabled(),
      revision: store.getRevision(),
    });
  });

  // Handshake exclusivo para o app Matriz rodando no dispositivo/ambiente host
  app.post('/api/auth/matriz-handshake', (req, res) => {
    const isPortal = Boolean(req.body?.isWebPortal);
    if (isPortal) {
      return res.status(403).json({ error: 'Portal web deve autenticar com Chave de Acesso.' });
    }
    const tenantId = req.body?.tenantId || 'tenant-demo-01';
    const userId = req.body?.userId;
    const snap = store.getSnapshot(tenantId, 'admin');
    const user =
      snap.data.users.find((u) => u.id === userId) ||
      snap.data.users.find((u) => u.role === 'admin');
    const effectiveMode: WebAccessMode = user?.role === 'admin' ? 'admin' : 'seller';

    res.json({
      matrizSecret: MATRIZ_HOST_SECRET,
      mode: effectiveMode,
      snapshot: store.getSnapshot(tenantId, effectiveMode, user?.id),
    });
  });

  // Login pelo navegador via Chave de Acesso
  app.post('/api/auth/key-login', (req, res) => {
    try {
      const { accessKey, deviceLabel } = req.body || {};
      const result = store.authenticateWithKey({
        plainKey: String(accessKey || ''),
        deviceLabel: typeof deviceLabel === 'string' ? deviceLabel : undefined,
        ipAddress: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'Navegador'),
      });
      const snapshot = store.getSnapshot(
        result.session.tenantId,
        result.session.mode,
        result.user.id
      );
      res.json({
        token: result.token,
        session: result.session,
        user: result.user,
        snapshot,
      });
    } catch (err: any) {
      const msg = String(err?.message || 'Erro de autenticação');
      if (msg.startsWith('ACCESS_DISABLED:')) {
        return res.status(503).json({ error: msg.replace('ACCESS_DISABLED:', '') });
      }
      if (msg.startsWith('SELLER_BLOCKED:')) {
        return res.status(403).json({ error: msg.replace('SELLER_BLOCKED:', '') });
      }
      return res.status(401).json({ error: msg.replace(/^[A-Z_]+:/, '') });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      store.logoutSessionByToken(authHeader.slice(7).trim(), getClientIp(req));
    }
    res.json({ ok: true });
  });

  // Snapshot autenticado
  app.get('/api/state/snapshot', requireAuth(['admin', 'seller']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      const snap = store.getSnapshot(tenantId, req.auth!.mode, req.auth!.user.id);
      res.json({
        ...snap,
        mode: req.auth!.mode,
        user: req.auth!.user,
        sessionId: req.auth!.sessionId,
      });
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  // Painel "Acesso pelo Navegador" (somente ADM)
  app.get('/api/web-access/status', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      res.json(store.getWebAccessStatus(tenantId, port));
    } catch (err: any) {
      res.status(403).json({ error: String(err?.message || '').replace('TENANT_MISMATCH:', '') });
    }
  });

  app.post('/api/web-access/toggle', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const enabled = Boolean(req.body?.enabled);
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const result = store.toggleWebAccess(enabled, tenantId, req.auth!.user.name, req.auth!.ip);
      res.json(result);
    } catch (err: any) {
      res.status(403).json({ error: String(err?.message || '').replace('TENANT_MISMATCH:', '') });
    }
  });

  app.post('/api/web-access/keys', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const { tenantId, mode, userId, expiresInHours } = req.body || {};
      const resolvedTenant = resolveAuthorizedTenantId(req, tenantId);
      const result = store.createAccessKey({
        tenantId: resolvedTenant,
        mode: mode === 'admin' ? 'admin' : 'seller',
        userId,
        expiresInHours,
        actorName: req.auth!.user.name,
        ipAddress: req.auth!.ip,
      });
      res.status(201).json(result);
    } catch (err: any) {
      const msg = String(err?.message || 'Erro ao gerar chave.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/web-access/keys/:keyId/renew', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const result = store.renewAccessKey({
        keyId: req.params.keyId,
        expiresInHours: req.body?.expiresInHours,
        actorName: req.auth!.user.name,
        ipAddress: req.auth!.ip,
      });
      res.json(result);
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Chave não encontrada.' });
    }
  });

  app.post('/api/web-access/keys/:keyId/revoke', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const result = store.revokeAccessKey(req.params.keyId, req.auth!.user.name, req.auth!.ip);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Chave não encontrada.' });
    }
  });

  app.post('/api/web-access/sessions/:sessionId/disconnect', requireAuth(['admin']), (req: AuthRequest, res) => {
    const ok = store.disconnectSession(req.params.sessionId, req.auth!.user.name, req.auth!.ip);
    if (!ok) return res.status(404).json({ error: 'Sessão não encontrada.' });
    res.json({ ok: true });
  });

  app.get('/api/web-access/qr', requireAuth(['admin']), async (req: AuthRequest, res) => {
    try {
      const net = store.getNetworkInfo(port);
      const targetUrl =
        typeof req.query.url === 'string' && req.query.url.trim()
          ? req.query.url.trim()
          : net.urls[0];
      const dataUrl = await QRCode.toDataURL(targetUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#1c1917', light: '#ffffff' },
      });
      res.json({ url: targetUrl, qrDataUrl: dataUrl });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao gerar QR Code.' });
    }
  });

  // Mídia persistida na Matriz (fotos de produtos)
  app.get('/api/media/:filename', (req, res) => {
    const file = store.readMediaFile(req.params.filename);
    if (!file) return res.status(404).json({ error: 'Imagem não encontrada.' });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(file.buffer);
  });

  app.post('/api/media/upload', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const saved = store.saveMediaFile({
        dataUrl: String(req.body?.dataUrl || ''),
        prefix: typeof req.body?.prefix === 'string' ? req.body.prefix : 'prod',
      });
      res.status(201).json({ ok: true, ...saved });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao salvar imagem.' });
    }
  });

  // Mesas e Vendas (sujeitas à licença ativa)
  app.post('/api/tables/:tableId/status', requireAuth(['admin', 'seller']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const table = store.setTableStatus({
        tenantId,
        tableId: req.params.tableId,
        status: req.body?.status,
        operator: { id: req.auth!.user.id, name: req.auth!.user.name },
      });
      res.json({ ok: true, table, revision: store.getRevision() });
    } catch (err: any) {
      const msg = String(err?.message || 'Falha ao atualizar status da mesa.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/tables/:tableId/items', requireAuth(['admin', 'seller']), (req: AuthRequest, res) => {
    try {
      const { items, mutationId, tenantId } = req.body || {};
      const resolvedTenant = resolveAuthorizedTenantId(req, tenantId);
      const result = store.addOrAccumulateTableItems({
        tenantId: resolvedTenant,
        tableId: req.params.tableId,
        items,
        operator: { id: req.auth!.user.id, name: req.auth!.user.name },
        mutationId,
      });
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      const msg = String(err?.message || 'Falha ao lançar itens na mesa.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/tables/:tableId/settle', requireAuth(['admin', 'seller']), (req: AuthRequest, res) => {
    try {
      const { method, amount, receivedAmount, notes, allowEmptyRelease, mutationId, tenantId } =
        req.body || {};
      const resolvedTenant = resolveAuthorizedTenantId(req, tenantId);
      const result = store.settleTableAccount({
        tenantId: resolvedTenant,
        tableId: req.params.tableId,
        method: method === 'pix' ? 'pix' : 'dinheiro',
        amount: Number(amount),
        receivedAmount: receivedAmount !== undefined ? Number(receivedAmount) : undefined,
        notes,
        allowEmptyRelease,
        operator: { id: req.auth!.user.id, name: req.auth!.user.name },
        mutationId,
      });
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      const msg = String(err?.message || 'Falha ao quitar mesa.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      if (msg.startsWith('TABLE_ALREADY_SETTLED:')) {
        return res.status(409).json({ error: msg.replace('TABLE_ALREADY_SETTLED:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/pos/counter-sale', requireAuth(['admin', 'seller']), (req: AuthRequest, res) => {
    try {
      const { items, paymentMethod, receivedAmount, customerName, notes, receiptImageUrl, mutationId, tenantId } =
        req.body || {};
      const resolvedTenant = resolveAuthorizedTenantId(req, tenantId);
      const result = store.createCounterSale({
        tenantId: resolvedTenant,
        items,
        paymentMethod: paymentMethod === 'pix' ? 'pix' : 'dinheiro',
        receivedAmount: receivedAmount !== undefined ? Number(receivedAmount) : undefined,
        customerName,
        notes,
        receiptImageUrl,
        operator: { id: req.auth!.user.id, name: req.auth!.user.name },
        mutationId,
      });
      res.status(201).json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      const msg = String(err?.message || 'Falha ao finalizar venda no balcão.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/orders/:orderId/cancel', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const order = store.cancelOrder(
        req.params.orderId,
        { id: req.auth!.user.id, name: req.auth!.user.name },
        req.body?.reason
      );
      res.json({ ok: true, order, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao cancelar venda.' });
    }
  });

  // Catálogo e Categorias (SOMENTE ADM + licença ativa)
  app.post('/api/catalog/categories', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const category = store.upsertCategory(tenantId, req.body || {}, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.status(201).json({ ok: true, category, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao salvar categoria.' });
    }
  });

  app.put('/api/catalog/categories/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const category = store.upsertCategory(
        tenantId,
        { ...(req.body || {}), id: req.params.id },
        { id: req.auth!.user.id, name: req.auth!.user.name }
      );
      res.json({ ok: true, category, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao atualizar categoria.' });
    }
  });

  app.delete('/api/catalog/categories/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      const strategy = (req.query.strategy || req.body?.strategy) as 'transfer' | 'uncategorized' | undefined;
      const targetCategoryId = (req.query.targetCategoryId || req.body?.targetCategoryId) as string | undefined;
      const result = store.deleteCategory(
        tenantId,
        req.params.id,
        { strategy, targetCategoryId },
        { id: req.auth!.user.id, name: req.auth!.user.name }
      );
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao excluir categoria.' });
    }
  });

  app.post('/api/catalog/products', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const product = store.upsertProduct(tenantId, req.body || {}, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.status(201).json({ ok: true, product, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao salvar produto.' });
    }
  });

  app.put('/api/catalog/products/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const product = store.upsertProduct(
        tenantId,
        { ...(req.body || {}), id: req.params.id },
        { id: req.auth!.user.id, name: req.auth!.user.name }
      );
      res.json({ ok: true, product, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao atualizar produto.' });
    }
  });

  app.delete('/api/catalog/products/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      const result = store.deleteProductSafely(tenantId, req.params.id, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao excluir produto.' });
    }
  });

  // Clientes e Fornecedores (SOMENTE ADM + licença ativa)
  app.post('/api/contacts/customers', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const customer = store.upsertCustomer(tenantId, req.body || {}, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.status(201).json({ ok: true, customer, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao salvar cliente.' });
    }
  });

  app.put('/api/contacts/customers/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const customer = store.upsertCustomer(
        tenantId,
        { ...(req.body || {}), id: req.params.id },
        { id: req.auth!.user.id, name: req.auth!.user.name }
      );
      res.json({ ok: true, customer, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao atualizar cliente.' });
    }
  });

  app.delete('/api/contacts/customers/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      const result = store.deleteCustomer(tenantId, req.params.id, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao excluir cliente.' });
    }
  });

  app.post('/api/contacts/suppliers', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const supplier = store.upsertSupplier(tenantId, req.body || {}, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.status(201).json({ ok: true, supplier, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao salvar fornecedor.' });
    }
  });

  app.put('/api/contacts/suppliers/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const supplier = store.upsertSupplier(
        tenantId,
        { ...(req.body || {}), id: req.params.id },
        { id: req.auth!.user.id, name: req.auth!.user.name }
      );
      res.json({ ok: true, supplier, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao atualizar fornecedor.' });
    }
  });

  app.delete('/api/contacts/suppliers/:id', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      const result = store.deleteSupplier(tenantId, req.params.id, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao excluir fornecedor.' });
    }
  });

  // Arquivos Históricos em PDF e Limpeza de Período (SOMENTE ADM)
  app.get('/api/admin/archive-pdfs', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.query.tenantId);
      const list = store.getArchivedPdfs(tenantId);
      res.json({ ok: true, archivePdfs: list });
    } catch (err: any) {
      res.status(403).json({ error: String(err?.message || '').replace('TENANT_MISMATCH:', '') });
    }
  });

  app.post('/api/admin/archive-pdfs', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const saved = store.saveArchivedPdf(
        { ...(req.body || {}), tenantId },
        { id: req.auth!.user.id, name: req.auth!.user.name }
      );
      res.status(201).json({ ok: true, archivePdf: saved, revision: store.getRevision() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erro ao salvar arquivo PDF.' });
    }
  });

  app.get('/api/admin/archive-pdfs/:id/download', requireAuth(['admin']), (req: AuthRequest, res) => {
    const pdf = store.getArchivedPdfById(req.params.id);
    if (!pdf) return res.status(404).json({ error: 'Arquivo PDF não encontrado.' });
    if (req.auth!.source === 'web' && pdf.tenantId !== req.auth!.user.tenantId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const bytes = Buffer.from(pdf.pdfBase64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    res.send(bytes);
  });

  app.post('/api/admin/reset-period', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const result = store.executeCleanPeriodReset(
        tenantId,
        req.body || {},
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
        },
        req.auth!.ip
      );
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao executar limpeza do sistema.' });
    }
  });

  // Bloqueio/Autorização de vendedor pelo ADM (SOMENTE ADM — derruba WS na hora)
  app.post('/api/users/:userId/toggle-sell', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const result = store.toggleSellerPermission({
        userId: req.params.userId,
        canSell: Boolean(req.body?.canSell),
        adminName: req.auth!.user.name,
        ipAddress: req.auth!.ip,
      });
      res.json({ ok: true, ...result, revision: store.getRevision() });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Vendedor não encontrado.' });
    }
  });

  // Sincronização completa SOMENTE ADM
  app.post('/api/admin/sync-state', requireAuth(['admin']), (req: AuthRequest, res) => {
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const partial = req.body?.data || {};
      const result = store.syncStateFromClient(partial, tenantId, req.auth!.user.name);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      const msg = String(err?.message || 'Erro de sincronização.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      res.status(400).json({ error: msg });
    }
  });

  // Sincronização de estado: estritamente BLOQUEADA (403) para vendedor!
  // Vendedores operam exclusivamente pelos endpoints específicos (/api/tables/:id/*, /api/pos/counter-sale).
  app.post('/api/state/sync', requireAuth(['admin', 'seller']), (req: AuthRequest, res) => {
    if (req.auth!.mode === 'seller') {
      return res.status(403).json({
        error:
          'Acesso negado: vendedores não podem sobrescrever o estado global. Use as ações de atendimento autorizadas.',
      });
    }
    try {
      const tenantId = resolveAuthorizedTenantId(req, req.body?.tenantId);
      const partial = req.body?.data || {};
      const result = store.syncStateFromClient(partial, tenantId, req.auth!.user.name);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      const msg = String(err?.message || 'Erro de sincronização.');
      if (msg.startsWith('TENANT_MISMATCH:')) {
        return res.status(403).json({ error: msg.replace('TENANT_MISMATCH:', '') });
      }
      return res.status(400).json({ error: msg });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const urlObj = new URL(request.url || '/', `http://localhost:${port}`);
    if (urlObj.pathname !== '/ws') {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const urlObj = new URL(request.url || '/', `http://localhost:${port}`);
    const token = urlObj.searchParams.get('token') || '';
    const matrizSecret = urlObj.searchParams.get('matrizSecret') || '';
    const tenantIdParam = urlObj.searchParams.get('tenantId') || 'tenant-demo-01';
    const userIdParam = urlObj.searchParams.get('userId') || undefined;

    let meta: ClientSocketMeta | null = null;

    if (token) {
      const validation = store.validateBearerToken(token);
      if (!validation.valid || !validation.session || !validation.user) {
        ws.send(
          JSON.stringify({
            type: 'session:revoked',
            reason: validation.reason || 'Sessão inválida.',
          })
        );
        ws.close(4001, 'Unauthorized');
        return;
      }
      store.setSessionWsConnected(validation.session.id, true);
      meta = {
        ws,
        clientType: 'web',
        sessionId: validation.session.id,
        userId: validation.user.id,
        mode: validation.session.mode,
        tenantId: validation.session.tenantId,
      };
    } else if (matrizSecret && matrizSecret === MATRIZ_HOST_SECRET) {
      const snap = store.getSnapshot(tenantIdParam, 'admin');
      const user = snap.data.users.find((u) => u.id === userIdParam);
      meta = {
        ws,
        clientType: 'matriz',
        userId: user?.id,
        mode: user?.role === 'admin' ? 'admin' : 'seller',
        tenantId: tenantIdParam,
      };
    } else {
      ws.send(JSON.stringify({ type: 'error', error: 'Autenticação WebSocket obrigatória.' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    connectedClients.add(meta);

    const initialSnap = store.getSnapshot(meta.tenantId, meta.mode, meta.userId);
    ws.send(
      JSON.stringify({
        type: 'state:sync',
        event: 'ws_connected',
        revision: initialSnap.revision,
        webAccessEnabled: initialSnap.webAccessEnabled,
        tenantId: initialSnap.tenantId,
        data: initialSnap.data,
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', revision: store.getRevision() }));
        } else if (msg?.type === 'request:sync' && meta) {
          const snap = store.getSnapshot(meta.tenantId, meta.mode, meta.userId);
          ws.send(
            JSON.stringify({
              type: 'state:sync',
              event: 'manual_resync',
              revision: snap.revision,
              webAccessEnabled: snap.webAccessEnabled,
              tenantId: snap.tenantId,
              data: snap.data,
            })
          );
        }
      } catch {
        // Ignora payload malformado
      }
    });

    ws.on('close', () => {
      if (meta) {
        connectedClients.delete(meta);
        if (meta.clientType === 'web' && meta.sessionId) {
          store.setSessionWsConnected(meta.sessionId, false);
        }
      }
    });
  });

  return { app, server, wss, store, port };
}

async function startServer() {
  const { app, server, store, port } = createSaborServerInstance({ port: DEFAULT_PORT });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = new URL('./dist', import.meta.url).pathname;
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(`${distPath}/index.html`);
    });
  }

  server.listen(port, '0.0.0.0', () => {
    const net = store.getNetworkInfo(port);
    console.log(`SaborGestao servidor ativo em http://0.0.0.0:${port} (LAN: ${net.primaryIp})`);
  });
}

if (process.env.SABOR_LIBRARY_ONLY !== '1') {
  startServer().catch((err) => {
    console.error('Falha fatal ao iniciar servidor:', err);
    process.exit(1);
  });
}
