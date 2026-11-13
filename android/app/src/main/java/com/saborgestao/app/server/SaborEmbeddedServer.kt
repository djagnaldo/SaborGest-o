package com.saborgestao.app.server

import android.content.Context
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.cio.*
import io.ktor.server.engine.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.consumeEach
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.security.SecureRandom
import java.util.concurrent.CopyOnWriteArraySet

data class AuthContext(
    val source: String, // "matriz" | "web"
    val mode: String,   // "admin" | "seller"
    val user: JSONObject,
    val sessionId: String? = null,
    val ip: String
)

data class ConnectedWsClient(
    val session: DefaultWebSocketServerSession,
    val clientType: String, // "matriz" | "web"
    val sessionId: String? = null,
    val userId: String? = null,
    val mode: String,
    val tenantId: String
)

class SaborEmbeddedServer(
    private val context: Context,
    val port: Int,
    val store: SaborServerStore
) {
    private val serverScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val connectedClients = CopyOnWriteArraySet<ConnectedWsClient>()
    private val matrizHostSecret: String = ByteArray(24)
        .also { SecureRandom().nextBytes(it) }
        .joinToString("") { "%02x".format(it) }

    private var engine: ApplicationEngine? = null

    fun start() {
        if (engine != null) return

        val appEngine = embeddedServer(CIO, port = port, host = "0.0.0.0") {
            install(CORS) {
                anyHost()
                allowHeader(HttpHeaders.ContentType)
                allowHeader(HttpHeaders.Authorization)
                allowHeader("X-Sabor-Matriz-Secret")
                allowHeader("X-Sabor-User-Id")
                allowMethod(HttpMethod.Options)
                allowMethod(HttpMethod.Get)
                allowMethod(HttpMethod.Post)
                allowMethod(HttpMethod.Delete)
            }

            install(WebSockets) {
                pingPeriodMillis = 15_000L
                timeoutMillis = 30_000L
                maxFrameSize = Long.MAX_VALUE
                masking = false
            }

            routing {
                // Health & public info
                get("/api/health") {
                    val net = store.getNetworkInfo(port)
                    val res = JSONObject().apply {
                        put("ok", true)
                        put("service", "SaborGestao-AndroidNativeServer")
                        put("nativeAndroid", true)
                        put("port", port)
                        put("primaryIp", net.primaryIp)
                        put("lanIps", JSONArray(net.lanIps))
                        put("webAccessEnabled", store.isWebAccessEnabled())
                        put("revision", store.getRevision())
                    }
                    call.respondJson(HttpStatusCode.OK, res)
                }

                // Handshake exclusivo para o app Matriz no aparelho Android host
                post("/api/auth/matriz-handshake") {
                    val body = call.receiveJsonObject()
                    if (body.optBoolean("isWebPortal", false)) {
                        call.respondError(HttpStatusCode.Forbidden, "Portal web deve autenticar com Chave de Acesso.")
                        return@post
                    }
                    val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                        ?: store.getDefaultTenantId()
                    val userId = body.optString("userId").takeIf { it.isNotBlank() }
                    val user = store.findMatrizUser(tenantId, userId)
                    val effectiveMode = if (user?.optString("role") == "admin") "admin" else "seller"
                    val snapshot = store.getSnapshot(tenantId, effectiveMode, user?.optString("id"))

                    val res = JSONObject().apply {
                        put("matrizSecret", matrizHostSecret)
                        put("mode", effectiveMode)
                        put("snapshot", snapshot)
                    }
                    call.respondJson(HttpStatusCode.OK, res)
                }

                // Login pelo navegador via Chave de Acesso
                post("/api/auth/key-login") {
                    try {
                        val body = call.receiveJsonObject()
                        val accessKey = body.optString("accessKey", "")
                        val deviceLabel = body.optString("deviceLabel").takeIf { it.isNotBlank() }
                        val ua = call.request.header(HttpHeaders.UserAgent) ?: "Navegador"
                        val result = store.authenticateWithKey(
                            plainKey = accessKey,
                            deviceLabel = deviceLabel,
                            ipAddress = call.clientIp(),
                            userAgent = ua
                        )
                        call.respondJson(HttpStatusCode.OK, result)
                    } catch (err: Exception) {
                        val msg = err.message ?: "Erro de autenticação"
                        when {
                            msg.startsWith("ACCESS_DISABLED:") ->
                                call.respondError(HttpStatusCode.ServiceUnavailable, msg.removePrefix("ACCESS_DISABLED:"))
                            msg.startsWith("SELLER_BLOCKED:") ->
                                call.respondError(HttpStatusCode.Forbidden, msg.removePrefix("SELLER_BLOCKED:"))
                            else ->
                                call.respondError(HttpStatusCode.Unauthorized, msg.replace(Regex("^[A-Z_]+:"), ""))
                        }
                    }
                }

                post("/api/auth/logout") {
                    val authHeader = call.request.header(HttpHeaders.Authorization)
                    if (authHeader != null && authHeader.startsWith("Bearer ")) {
                        store.logoutSessionByToken(authHeader.removePrefix("Bearer ").trim(), call.clientIp())
                    }
                    call.respondJson(HttpStatusCode.OK, JSONObject().put("ok", true))
                }

                get("/api/state/snapshot") {
                    val auth = call.authenticate(listOf("admin", "seller")) ?: return@get
                    val tenantId = call.request.queryParameters["tenantId"]?.takeIf { it.isNotBlank() }
                        ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                    val snap = store.getSnapshot(tenantId, auth.mode, auth.user.optString("id"))
                    snap.put("mode", auth.mode)
                    snap.put("user", auth.user)
                    if (auth.sessionId != null) snap.put("sessionId", auth.sessionId)
                    call.respondJson(HttpStatusCode.OK, snap)
                }

                get("/api/web-access/status") {
                    val auth = call.authenticate(listOf("admin")) ?: return@get
                    val tenantId = call.request.queryParameters["tenantId"]?.takeIf { it.isNotBlank() }
                        ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                    call.respondJson(HttpStatusCode.OK, store.getWebAccessStatus(tenantId, port))
                }

                post("/api/web-access/toggle") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    val body = call.receiveJsonObject()
                    val enabled = body.optBoolean("enabled", false)
                    val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                        ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                    val result = store.toggleWebAccess(enabled, tenantId, auth.user.optString("name", "ADM"), auth.ip)
                    call.respondJson(HttpStatusCode.OK, result)
                }

                post("/api/web-access/keys") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    try {
                        val body = call.receiveJsonObject()
                        val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                            ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                        val mode = if (body.optString("mode") == "admin") "admin" else "seller"
                        val userId = body.optString("userId").takeIf { it.isNotBlank() }
                        val expiresInHours = body.optInt("expiresInHours", 24)
                        val res = store.createAccessKey(
                            tenantId = tenantId,
                            mode = mode,
                            userId = userId,
                            expiresInHours = expiresInHours,
                            actorName = auth.user.optString("name", "ADM"),
                            ipAddress = auth.ip
                        )
                        call.respondJson(HttpStatusCode.Created, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.BadRequest, err.message ?: "Erro ao gerar chave.")
                    }
                }

                post("/api/web-access/keys/{keyId}/renew") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    try {
                        val keyId = call.parameters["keyId"] ?: ""
                        val body = call.receiveJsonObject()
                        val hours = body.optInt("expiresInHours", 24)
                        val res = store.renewAccessKey(
                            keyId = keyId,
                            expiresInHours = hours,
                            actorName = auth.user.optString("name", "ADM"),
                            ipAddress = auth.ip
                        )
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.NotFound, err.message ?: "Chave não encontrada.")
                    }
                }

                post("/api/web-access/keys/{keyId}/revoke") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    try {
                        val keyId = call.parameters["keyId"] ?: ""
                        val res = store.revokeAccessKey(keyId, auth.user.optString("name", "ADM"), auth.ip)
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.NotFound, err.message ?: "Chave não encontrada.")
                    }
                }

                post("/api/web-access/sessions/{sessionId}/disconnect") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    val sessionId = call.parameters["sessionId"] ?: ""
                    val ok = store.disconnectSession(sessionId, auth.user.optString("name", "ADM"), auth.ip)
                    if (!ok) {
                        call.respondError(HttpStatusCode.NotFound, "Sessão não encontrada.")
                    } else {
                        call.respondJson(HttpStatusCode.OK, JSONObject().put("ok", true))
                    }
                }

                get("/api/web-access/qr") {
                    call.authenticate(listOf("admin")) ?: return@get
                    try {
                        val net = store.getNetworkInfo(port)
                        val targetUrl = call.request.queryParameters["url"]?.takeIf { it.isNotBlank() }
                            ?: net.urls.firstOrNull()
                            ?: "http://127.0.0.1:$port/?portal=web"
                        val qrDataUrl = store.generateQrDataUrl(targetUrl)
                        val res = JSONObject().apply {
                            put("url", targetUrl)
                            put("qrDataUrl", qrDataUrl)
                        }
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.InternalServerError, err.message ?: "Falha ao gerar QR Code.")
                    }
                }

                // Lançamento de itens na Mesa com acúmulo automático
                post("/api/tables/{tableId}/items") {
                    val auth = call.authenticate(listOf("admin", "seller")) ?: return@post
                    try {
                        val tableId = call.parameters["tableId"] ?: ""
                        val body = call.receiveJsonObject()
                        val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                            ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                        val res = store.addOrAccumulateTableItems(
                            tenantId = tenantId,
                            tableId = tableId,
                            items = body.optJSONArray("items"),
                            operatorId = auth.user.optString("id"),
                            operatorName = auth.user.optString("name", "Operador"),
                            mutationId = body.optString("mutationId").takeIf { it.isNotBlank() }
                        )
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.BadRequest, err.message ?: "Falha ao lançar itens na mesa.")
                    }
                }

                // Fechamento e quitação de conta de Mesa
                post("/api/tables/{tableId}/settle") {
                    val auth = call.authenticate(listOf("admin", "seller")) ?: return@post
                    try {
                        val tableId = call.parameters["tableId"] ?: ""
                        val body = call.receiveJsonObject()
                        val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                            ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                        val method = if (body.optString("method") == "pix") "pix" else "dinheiro"
                        val amount = body.optDouble("amount", 0.0)
                        val receivedAmount = if (body.has("receivedAmount") && !body.isNull("receivedAmount")) {
                            body.optDouble("receivedAmount")
                        } else null
                        val res = store.settleTableAccount(
                            tenantId = tenantId,
                            tableId = tableId,
                            method = method,
                            amount = amount,
                            receivedAmount = receivedAmount,
                            notes = body.optString("notes").takeIf { it.isNotBlank() },
                            operatorId = auth.user.optString("id"),
                            operatorName = auth.user.optString("name", "Operador"),
                            mutationId = body.optString("mutationId").takeIf { it.isNotBlank() }
                        )
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        val msg = err.message ?: "Falha ao quitar mesa."
                        if (msg.startsWith("TABLE_ALREADY_SETTLED:")) {
                            call.respondError(HttpStatusCode.Conflict, msg.removePrefix("TABLE_ALREADY_SETTLED:"))
                        } else {
                            call.respondError(HttpStatusCode.BadRequest, msg)
                        }
                    }
                }

                // Venda independente no Balcão
                post("/api/pos/counter-sale") {
                    val auth = call.authenticate(listOf("admin", "seller")) ?: return@post
                    try {
                        val body = call.receiveJsonObject()
                        val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                            ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                        val paymentMethod = if (body.optString("paymentMethod") == "pix") "pix" else "dinheiro"
                        val receivedAmount = if (body.has("receivedAmount") && !body.isNull("receivedAmount")) {
                            body.optDouble("receivedAmount")
                        } else null
                        val res = store.createCounterSale(
                            tenantId = tenantId,
                            items = body.optJSONArray("items"),
                            paymentMethod = paymentMethod,
                            receivedAmount = receivedAmount,
                            customerName = body.optString("customerName").takeIf { it.isNotBlank() },
                            notes = body.optString("notes").takeIf { it.isNotBlank() },
                            receiptImageUrl = body.optString("receiptImageUrl").takeIf { it.isNotBlank() },
                            operatorId = auth.user.optString("id"),
                            operatorName = auth.user.optString("name", "Operador"),
                            mutationId = body.optString("mutationId").takeIf { it.isNotBlank() }
                        )
                        call.respondJson(HttpStatusCode.Created, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.BadRequest, err.message ?: "Falha ao finalizar venda no balcão.")
                    }
                }

                // Cancelamento de pedido (SOMENTE ADM)
                post("/api/orders/{orderId}/cancel") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    try {
                        val orderId = call.parameters["orderId"] ?: ""
                        val body = call.receiveJsonObject()
                        val res = store.cancelOrder(
                            orderId = orderId,
                            adminId = auth.user.optString("id"),
                            adminName = auth.user.optString("name", "ADM"),
                            reason = body.optString("reason").takeIf { it.isNotBlank() }
                        )
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.BadRequest, err.message ?: "Falha ao cancelar venda.")
                    }
                }

                // Bloqueio/Autorização de vendedor (SOMENTE ADM)
                post("/api/users/{userId}/toggle-sell") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    try {
                        val userId = call.parameters["userId"] ?: ""
                        val body = call.receiveJsonObject()
                        val canSell = body.optBoolean("canSell", false)
                        val res = store.toggleSellerPermission(
                            userId = userId,
                            canSell = canSell,
                            adminName = auth.user.optString("name", "ADM"),
                            ipAddress = auth.ip
                        )
                        call.respondJson(HttpStatusCode.OK, res)
                    } catch (err: Exception) {
                        call.respondError(HttpStatusCode.NotFound, err.message ?: "Vendedor não encontrado.")
                    }
                }

                post("/api/admin/sync-state") {
                    val auth = call.authenticate(listOf("admin")) ?: return@post
                    val body = call.receiveJsonObject()
                    val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                        ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                    val partial = body.optJSONObject("data") ?: JSONObject()
                    val res = store.syncStateFromClient(partial, tenantId, auth.user.optString("name", "ADM"), sellerOnly = false)
                    call.respondJson(HttpStatusCode.OK, res)
                }

                post("/api/state/sync") {
                    val auth = call.authenticate(listOf("admin", "seller")) ?: return@post
                    val body = call.receiveJsonObject()
                    val tenantId = body.optString("tenantId").takeIf { it.isNotBlank() }
                        ?: auth.user.optString("tenantId", store.getDefaultTenantId())
                    val partial = body.optJSONObject("data") ?: JSONObject()
                    val res = store.syncStateFromClient(
                        partial = partial,
                        tenantId = tenantId,
                        actorName = auth.user.optString("name", "Operador"),
                        sellerOnly = auth.mode == "seller"
                    )
                    call.respondJson(HttpStatusCode.OK, res)
                }

                // WebSocket em /ws para sincronização em tempo real bidirecional
                webSocket("/ws") {
                    val token = call.request.queryParameters["token"] ?: ""
                    val secret = call.request.queryParameters["matrizSecret"] ?: ""
                    val tenantParam = call.request.queryParameters["tenantId"]?.takeIf { it.isNotBlank() }
                        ?: store.getDefaultTenantId()
                    val userParam = call.request.queryParameters["userId"]

                    val meta: ConnectedWsClient? = when {
                        token.isNotEmpty() -> {
                            val validation = store.validateBearerToken(token)
                            if (!validation.valid || validation.session == null || validation.user == null) {
                                send(Frame.Text(JSONObject().apply {
                                    put("type", "session:revoked")
                                    put("reason", validation.reason ?: "Sessão inválida.")
                                }.toString()))
                                close(CloseReason(4001.toShort(), "Unauthorized"))
                                return@webSocket
                            }
                            val sessId = validation.session.optString("id")
                            store.setSessionWsConnected(sessId, true)
                            ConnectedWsClient(
                                session = this,
                                clientType = "web",
                                sessionId = sessId,
                                userId = validation.user.optString("id"),
                                mode = validation.session.optString("mode", "seller"),
                                tenantId = validation.session.optString("tenantId", tenantParam)
                            )
                        }
                        secret.isNotEmpty() && secret == matrizHostSecret -> {
                            val user = store.findMatrizUser(tenantParam, userParam)
                            val mode = if (user?.optString("role") == "admin") "admin" else "seller"
                            ConnectedWsClient(
                                session = this,
                                clientType = "matriz",
                                userId = user?.optString("id"),
                                mode = mode,
                                tenantId = tenantParam
                            )
                        }
                        else -> {
                            send(Frame.Text(JSONObject().apply {
                                put("type", "error")
                                put("error", "Autenticação WebSocket obrigatória.")
                            }.toString()))
                            close(CloseReason(4001.toShort(), "Unauthorized"))
                            return@webSocket
                        }
                    }

                    if (meta == null) return@webSocket
                    connectedClients.add(meta)

                    try {
                        val initialSnap = store.getSnapshot(meta.tenantId, meta.mode, meta.userId)
                        send(Frame.Text(JSONObject().apply {
                            put("type", "state:sync")
                            put("event", "ws_connected")
                            put("revision", initialSnap.optInt("revision", 1))
                            put("webAccessEnabled", initialSnap.optBoolean("webAccessEnabled", true))
                            put("tenantId", initialSnap.optString("tenantId"))
                            put("data", initialSnap.optJSONObject("data"))
                        }.toString()))

                        incoming.consumeEach { frame ->
                            if (frame is Frame.Text) {
                                try {
                                    val msg = JSONObject(frame.readText())
                                    when (msg.optString("type")) {
                                        "ping" -> {
                                            send(Frame.Text(JSONObject().apply {
                                                put("type", "pong")
                                                put("revision", store.getRevision())
                                            }.toString()))
                                        }
                                        "request:sync" -> {
                                            val snap = store.getSnapshot(meta.tenantId, meta.mode, meta.userId)
                                            send(Frame.Text(JSONObject().apply {
                                                put("type", "state:sync")
                                                put("event", "manual_resync")
                                                put("revision", snap.optInt("revision", 1))
                                                put("webAccessEnabled", snap.optBoolean("webAccessEnabled", true))
                                                put("tenantId", snap.optString("tenantId"))
                                                put("data", snap.optJSONObject("data"))
                                            }.toString()))
                                        }
                                    }
                                } catch (_: Exception) {
                                    // Ignora payload malformado
                                }
                            }
                        }
                    } finally {
                        connectedClients.remove(meta)
                        if (meta.clientType == "web" && !meta.sessionId.isNullOrBlank()) {
                            store.setSessionWsConnected(meta.sessionId, false)
                        }
                    }
                }

                // Servir frontend compilado da pasta assets/public do APK para qualquer navegador na rede Wi-Fi
                get("{...}") {
                    val reqPath = call.request.path()
                    if (reqPath.startsWith("/api/")) {
                        call.respondError(HttpStatusCode.NotFound, "Rota não encontrada.")
                        return@get
                    }
                    serveSpaAsset(call, reqPath)
                }
            }
        }

        engine = appEngine
        appEngine.start(wait = false)
    }

    fun stop() {
        val currentEngine = engine
        engine = null

        try {
            runBlocking(Dispatchers.IO) {
                withTimeoutOrNull(450) {
                    for (client in connectedClients) {
                        try {
                            if (client.clientType == "web") {
                                client.session.send(Frame.Text(JSONObject().apply {
                                    put("type", "session:revoked")
                                    put("reason", "O servidor local no celular do Administrador foi desligado.")
                                }.toString()))
                            }
                            client.session.close(CloseReason(4003.toShort(), "Server stopped"))
                        } catch (_: Exception) {
                            // noop
                        }
                    }
                    connectedClients.clear()
                }
            }
        } catch (_: Exception) {
            // noop
        }

        try {
            currentEngine?.stop(200, 800)
        } catch (_: Exception) {
            // noop
        }
        serverScope.cancel()
    }

    fun broadcastStateChange(event: StoreChangeEvent) {
        val revokedSessions = event.revokedSessionIds.toSet()
        val revokedUsers = event.revokedUserIds.toSet()

        serverScope.launch {
            for (client in connectedClients) {
                try {
                    if (client.clientType == "web" &&
                        ((client.sessionId != null && revokedSessions.contains(client.sessionId)) ||
                            (client.userId != null && client.mode == "seller" && revokedUsers.contains(client.userId)))
                    ) {
                        val reason = if (client.userId != null && revokedUsers.contains(client.userId)) {
                            "Sua permissão de venda foi bloqueada pelo Administrador."
                        } else {
                            "Esta sessão foi encerrada pelo Administrador."
                        }
                        client.session.send(Frame.Text(JSONObject().apply {
                            put("type", "session:revoked")
                            put("reason", reason)
                        }.toString()))
                        client.session.close(CloseReason(4003.toShort(), "Session revoked"))
                        connectedClients.remove(client)
                        continue
                    }

                    val snap = store.getSnapshot(client.tenantId, client.mode, client.userId)
                    client.session.send(Frame.Text(JSONObject().apply {
                        put("type", "state:sync")
                        put("event", event.type)
                        put("revision", snap.optInt("revision", 1))
                        put("webAccessEnabled", snap.optBoolean("webAccessEnabled", true))
                        put("tenantId", snap.optString("tenantId"))
                        put("data", snap.optJSONObject("data"))
                    }.toString()))
                } catch (_: Exception) {
                    connectedClients.remove(client)
                }
            }
        }
    }

    private suspend fun serveSpaAsset(call: ApplicationCall, rawPath: String) {
        val clean = rawPath.trimStart('/')
            .replace("\\", "/")
            .split("/")
            .filter { it.isNotEmpty() && it != "." && it != ".." }
            .joinToString("/")

        val candidate = if (clean.isEmpty()) "index.html" else clean
        val bytesAndType = readAsset("public/$candidate") ?: readAsset("public/index.html")
        if (bytesAndType == null) {
            call.respondText("Frontend SaborGestão não encontrado no pacote APK (assets/public).", status = HttpStatusCode.NotFound)
            return
        }
        val (bytes, contentType) = bytesAndType
        call.respondBytes(bytes, contentType)
    }

    private fun readAsset(assetPath: String): Pair<ByteArray, ContentType>? {
        return try {
            context.assets.open(assetPath).use { input ->
                val bytes = input.readBytes()
                Pair(bytes, guessContentType(assetPath))
            }
        } catch (_: IOException) {
            null
        }
    }

    private fun guessContentType(path: String): ContentType {
        val lower = path.lowercase()
        return when {
            lower.endsWith(".html") -> ContentType.Text.Html.withCharset(Charsets.UTF_8)
            lower.endsWith(".js") || lower.endsWith(".mjs") -> ContentType.Application.JavaScript.withCharset(Charsets.UTF_8)
            lower.endsWith(".css") -> ContentType.Text.CSS.withCharset(Charsets.UTF_8)
            lower.endsWith(".json") || lower.endsWith(".webmanifest") -> ContentType.Application.Json.withCharset(Charsets.UTF_8)
            lower.endsWith(".svg") -> ContentType.Image.SVG
            lower.endsWith(".png") -> ContentType.Image.PNG
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> ContentType.Image.JPEG
            lower.endsWith(".webp") -> ContentType("image", "webp")
            lower.endsWith(".ico") -> ContentType("image", "x-icon")
            lower.endsWith(".woff2") -> ContentType("font", "woff2")
            lower.endsWith(".woff") -> ContentType("font", "woff")
            else -> ContentType.Application.OctetStream
        }
    }

    private fun ApplicationCall.clientIp(): String {
        val forwarded = request.header("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
        if (!forwarded.isNullOrEmpty()) return forwarded
        val remote = request.local.remoteHost
        return remote.removePrefix("::ffff:").ifBlank { "127.0.0.1" }
    }

    private suspend fun ApplicationCall.receiveJsonObject(): JSONObject {
        val text = try {
            receiveText()
        } catch (_: Exception) {
            ""
        }
        if (text.isBlank()) return JSONObject()
        return try {
            JSONObject(text)
        } catch (_: Exception) {
            JSONObject()
        }
    }

    private suspend fun ApplicationCall.respondJson(status: HttpStatusCode, obj: JSONObject) {
        respondText(obj.toString(), ContentType.Application.Json.withCharset(Charsets.UTF_8), status)
    }

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) {
        respondJson(status, JSONObject().put("error", message))
    }

    private suspend fun ApplicationCall.authenticate(allowedModes: List<String>): AuthContext? {
        val ip = clientIp()
        val authHeader = request.header(HttpHeaders.Authorization)
        val matrizSecretHeader = request.header("X-Sabor-Matriz-Secret")
        val matrizUserIdHeader = request.header("X-Sabor-User-Id")

        // 1. Bearer token -> estritamente Sessão Web
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            val token = authHeader.removePrefix("Bearer ").trim()
            val validation = store.validateBearerToken(token)
            if (!validation.valid || validation.session == null || validation.user == null) {
                respondError(HttpStatusCode.Unauthorized, validation.reason ?: "Sessão inválida.")
                return null
            }
            val mode = validation.session.optString("mode", "seller")
            if (!allowedModes.contains(mode)) {
                respondError(HttpStatusCode.Forbidden, "Acesso negado: esta operação é exclusiva do MODO ADMINISTRADOR.")
                return null
            }
            return AuthContext(
                source = "web",
                mode = mode,
                user = validation.user,
                sessionId = validation.session.optString("id"),
                ip = ip
            )
        }

        // 2. Host Matriz local Android
        if (!matrizSecretHeader.isNullOrBlank() && matrizSecretHeader == matrizHostSecret) {
            val user = store.findMatrizUser(null, matrizUserIdHeader)
            if (user == null) {
                respondError(HttpStatusCode.Unauthorized, "Perfil do operador não encontrado.")
                return null
            }
            val effectiveMode = if (user.optString("role") == "admin") "admin" else "seller"
            if (effectiveMode == "seller" && (!user.optBoolean("canSell", true) || user.optString("status") == "bloqueado")) {
                respondError(HttpStatusCode.Forbidden, "Vendedor bloqueado pelo Administrador.")
                return null
            }
            if (!allowedModes.contains(effectiveMode)) {
                respondError(HttpStatusCode.Forbidden, "Acesso negado: operação restrita ao perfil Administrador.")
                return null
            }
            return AuthContext(
                source = "matriz",
                mode = effectiveMode,
                user = user,
                ip = ip
            )
        }

        respondError(HttpStatusCode.Unauthorized, "Autenticação obrigatória para acessar esta rota.")
        return null
    }
}
