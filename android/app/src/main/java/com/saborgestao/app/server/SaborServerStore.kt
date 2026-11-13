package com.saborgestao.app.server

import android.content.Context
import android.graphics.Bitmap
import android.net.wifi.WifiManager
import android.util.Base64
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import org.bouncycastle.crypto.generators.SCrypt
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

data class StoreChangeEvent(
    val type: String,
    val tenantId: String? = null,
    val revokedUserIds: List<String> = emptyList(),
    val revokedSessionIds: List<String> = emptyList()
)

data class NetworkInfoResult(
    val port: Int,
    val primaryIp: String,
    val lanIps: List<String>,
    val urls: List<String>
)

data class TokenValidationResult(
    val valid: Boolean,
    val reason: String? = null,
    val session: JSONObject? = null,
    val user: JSONObject? = null
)

class SaborServerStore(
    private val context: Context,
    private val onAfterChange: ((StoreChangeEvent) -> Unit)? = null
) {
    private val lock = Any()
    private val random = SecureRandom()
    private val dbFile = File(context.filesDir, "saborgestao-db.json")
    private var db: JSONObject = loadFromDisk()

    private fun nowIso(): String = formatIso(System.currentTimeMillis())

    private fun formatIso(epochMs: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(epochMs))
    }

    private fun parseIsoMs(iso: String): Long {
        if (iso.isBlank()) return 0L
        val formats = arrayOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
        )
        for (pattern in formats) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.US)
                sdf.timeZone = TimeZone.getTimeZone("UTC")
                val parsed = sdf.parse(iso)
                if (parsed != null) return parsed.time
            } catch (_: Exception) {
                // tenta próximo formato
            }
        }
        return 0L
    }

    private fun formatPtBr(epochMs: Long): String {
        val sdf = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale("pt", "BR"))
        return sdf.format(Date(epochMs))
    }

    private fun randomHex(bytesCount: Int): String {
        val bytes = ByteArray(bytesCount)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun round2(value: Double): Double = (value * 100.0).roundToLong() / 100.0
    private fun round3(value: Double): Double = (value * 1000.0).roundToLong() / 1000.0

    private fun createEmptyDataObject(): JSONObject {
        return JSONObject().apply {
            put("tenants", JSONArray())
            put("users", JSONArray())
            put("categories", JSONArray())
            put("products", JSONArray())
            put("tables", JSONArray())
            put("orders", JSONArray())
            put("cashSessions", JSONArray())
            put("financial", JSONArray())
            put("inventoryTransactions", JSONArray())
            put("auditLogs", JSONArray())
            put("savedReports", JSONArray())
            put("archivedPeriods", JSONArray())
            put("backups", JSONArray())
            put("tableArchives", JSONArray())
            put("themeConfig", JSONObject().apply {
                put("posColor", "#d97706")
                put("inventoryColor", "#059669")
                put("productsColor", "#2563eb")
                put("tablesColor", "#7c3aed")
                put("cashColor", "#0d9488")
                put("expensesColor", "#e11d48")
                put("reportsColor", "#4f46e5")
                put("primaryButtonColor", "#1c1917")
                put("statusColor", "#16a34a")
                put("updatedAt", nowIso())
                put("updatedById", "system")
            })
        }
    }

    private fun createInitialDatabase(): JSONObject {
        return JSONObject().apply {
            put("revision", 1)
            put("webAccessEnabled", true)
            put("data", createEmptyDataObject())
            put("accessKeys", JSONArray())
            put("sessions", JSONArray())
            put("connectionLogs", JSONArray())
            put("processedMutationIds", JSONArray())
        }
    }

    fun hasPersistedDatabase(): Boolean = synchronized(lock) {
        if (!dbFile.exists()) return false
        val data = db.optJSONObject("data") ?: return false
        val tenants = data.optJSONArray("tenants") ?: return false
        tenants.length() > 0
    }

    fun initializeFromSeedIfEmpty(seedData: JSONObject?) = synchronized(lock) {
        if (seedData == null) return@synchronized
        val currentTenants = db.optJSONObject("data")?.optJSONArray("tenants")
        val hasExisting = dbFile.exists() && currentTenants != null && currentTenants.length() > 0
        if (!hasExisting) {
            val baseData = createEmptyDataObject()
            val keys = seedData.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                baseData.put(k, seedData.get(k))
            }
            // Limpa qualquer resquício de comanda/fiado caso exista
            cleanSeedOrders(baseData)
            db.put("data", baseData)
            db.put("revision", max(1, db.optInt("revision", 1)))
            writeAtomic(db)
        }
    }

    private fun cleanSeedOrders(data: JSONObject) {
        val orders = data.optJSONArray("orders") ?: return
        val cleaned = JSONArray()
        for (i in 0 until orders.length()) {
            val o = orders.optJSONObject(i) ?: continue
            val payments = o.optJSONArray("payments")
            var hasDevendo = false
            if (payments != null) {
                for (p in 0 until payments.length()) {
                    if (payments.optJSONObject(p)?.optString("method") == "devendo") {
                        hasDevendo = true
                        break
                    }
                }
            }
            if (hasDevendo) continue
            if (o.optString("type") == "comanda") {
                o.put("type", "counter")
                o.remove("comandaNumber")
            }
            cleaned.put(o)
        }
        data.put("orders", cleaned)
    }

    private fun loadFromDisk(): JSONObject {
        try {
            if (dbFile.exists()) {
                val raw = dbFile.readText(Charsets.UTF_8)
                val parsed = JSONObject(raw)
                val parsedData = parsed.optJSONObject("data")
                if (parsedData != null) {
                    val base = createInitialDatabase()
                    val mergedData = base.getJSONObject("data")
                    val dKeys = parsedData.keys()
                    while (dKeys.hasNext()) {
                        val k = dKeys.next()
                        mergedData.put(k, parsedData.get(k))
                    }
                    base.put("revision", parsed.optInt("revision", 1))
                    base.put("webAccessEnabled", parsed.optBoolean("webAccessEnabled", true))
                    base.put("data", mergedData)
                    base.put("accessKeys", parsed.optJSONArray("accessKeys") ?: JSONArray())
                    base.put("sessions", parsed.optJSONArray("sessions") ?: JSONArray())
                    base.put("connectionLogs", parsed.optJSONArray("connectionLogs") ?: JSONArray())
                    base.put("processedMutationIds", parsed.optJSONArray("processedMutationIds") ?: JSONArray())
                    return base
                }
            }
        } catch (_: Exception) {
            // Inicializa novo banco caso o arquivo esteja corrompido
        }
        return createInitialDatabase()
    }

    private fun writeAtomic(snapshot: JSONObject = db) {
        try {
            val parent = dbFile.parentFile
            if (parent != null && !parent.exists()) {
                parent.mkdirs()
            }
            val tmp = File(context.filesDir, "saborgestao-db.tmp-${System.currentTimeMillis()}")
            tmp.writeText(snapshot.toString(), Charsets.UTF_8)
            if (!tmp.renameTo(dbFile)) {
                tmp.copyTo(dbFile, overwrite = true)
                tmp.delete()
            }
        } catch (_: Exception) {
            // Fallback em caso de erro de I/O
        }
    }

    private fun commit(
        eventType: String,
        tenantId: String? = null,
        revokedUserIds: List<String> = emptyList(),
        revokedSessionIds: List<String> = emptyList()
    ) {
        db.put("revision", db.optInt("revision", 1) + 1)
        writeAtomic(db)
        onAfterChange?.invoke(
            StoreChangeEvent(
                type = eventType,
                tenantId = tenantId,
                revokedUserIds = revokedUserIds,
                revokedSessionIds = revokedSessionIds
            )
        )
    }

    private fun hashSecret(secret: String, existingSalt: String? = null): Pair<String, String> {
        val salt = existingSalt ?: randomHex(16)
        val derived = SCrypt.generate(
            secret.toByteArray(Charsets.UTF_8),
            salt.toByteArray(Charsets.UTF_8),
            16384,
            8,
            1,
            64
        )
        val hexHash = derived.joinToString("") { "%02x".format(it) }
        return Pair(salt, hexHash)
    }

    private fun verifySecret(secret: String, salt: String, expectedHexHash: String): Boolean {
        return try {
            val derived = SCrypt.generate(
                secret.toByteArray(Charsets.UTF_8),
                salt.toByteArray(Charsets.UTF_8),
                16384,
                8,
                1,
                64
            )
            val expected = expectedHexHash.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            derived.size == expected.size && MessageDigest.isEqual(derived, expected)
        } catch (_: Exception) {
            false
        }
    }

    private fun hashToken(token: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun generateReadableKey(mode: String): String {
        val prefix = if (mode == "admin") "SG-ADM" else "SG-VND"
        val partA = randomHex(2).uppercase(Locale.US)
        val partB = randomHex(2).uppercase(Locale.US)
        return "$prefix-$partA-$partB"
    }

    private fun maskKey(plainKey: String): String {
        val parts = plainKey.split("-")
        return if (parts.size >= 4) {
            "${parts[0]}-${parts[1]}-****-${parts[3]}"
        } else {
            "${plainKey.take(6)}****${plainKey.takeLast(3)}"
        }
    }

    private fun prependJsonArray(arr: JSONArray, item: JSONObject, maxSize: Int): JSONArray {
        val next = JSONArray()
        next.put(item)
        val limit = min(arr.length(), maxSize - 1)
        for (i in 0 until limit) {
            next.put(arr.get(i))
        }
        return next
    }

    private fun recordMutationId(mutationId: String?): Boolean {
        if (mutationId.isNullOrBlank()) return false
        val arr = db.optJSONArray("processedMutationIds") ?: JSONArray()
        for (i in 0 until arr.length()) {
            if (arr.optString(i) == mutationId) {
                return true
            }
        }
        val next = JSONArray()
        next.put(mutationId)
        val limit = min(arr.length(), 1999)
        for (i in 0 until limit) {
            next.put(arr.get(i))
        }
        db.put("processedMutationIds", next)
        return false
    }

    private fun addAuditLog(
        tenantId: String,
        userId: String,
        userName: String,
        action: String,
        details: String
    ) {
        val entry = JSONObject().apply {
            put("id", "log-${System.currentTimeMillis()}-${randomHex(2)}")
            put("tenantId", tenantId)
            put("userId", userId)
            put("userName", userName)
            put("action", action)
            put("details", details)
            put("timestamp", nowIso())
        }
        val data = db.getJSONObject("data")
        val existing = data.optJSONArray("auditLogs") ?: JSONArray()
        data.put("auditLogs", prependJsonArray(existing, entry, 800))
    }

    private fun addConnectionLog(
        tenantId: String,
        event: String,
        userName: String,
        deviceLabel: String,
        ipAddress: String,
        details: String,
        mode: String? = null,
        userId: String? = null
    ) {
        val entry = JSONObject().apply {
            put("id", "clog-${System.currentTimeMillis()}-${randomHex(2)}")
            put("tenantId", tenantId)
            put("timestamp", nowIso())
            put("event", event)
            if (mode != null) put("mode", mode)
            if (userId != null) put("userId", userId)
            put("userName", userName)
            put("deviceLabel", deviceLabel)
            put("ipAddress", ipAddress)
            put("details", details)
        }
        val existing = db.optJSONArray("connectionLogs") ?: JSONArray()
        db.put("connectionLogs", prependJsonArray(existing, entry, 400))
    }

    fun getNetworkInfo(port: Int): NetworkInfoResult {
        val prioritized = mutableListOf<String>()
        val secondary = mutableListOf<String>()

        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            if (interfaces != null) {
                while (interfaces.hasMoreElements()) {
                    val nif = interfaces.nextElement()
                    if (!nif.isUp || nif.isLoopback) continue
                    val ifName = (nif.name ?: "").lowercase(Locale.US)
                    val addrs = nif.inetAddresses
                    while (addrs.hasMoreElements()) {
                        val addr = addrs.nextElement()
                        if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                            val ip = addr.hostAddress ?: continue
                            if (ifName.startsWith("wlan") || ifName.startsWith("ap") || ifName.startsWith("eth")) {
                                if (!prioritized.contains(ip)) prioritized.add(ip)
                            } else {
                                if (!secondary.contains(ip)) secondary.add(ip)
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // Fallback via WifiManager abaixo
        }

        val lanIps = mutableListOf<String>()
        lanIps.addAll(prioritized)
        for (ip in secondary) {
            if (!lanIps.contains(ip)) lanIps.add(ip)
        }

        // Fallback via WifiManager caso NetworkInterface não retorne wlan0
        if (lanIps.isEmpty()) {
            try {
                val wifiMgr = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                @Suppress("DEPRECATION")
                val ipInt = wifiMgr?.connectionInfo?.ipAddress ?: 0
                if (ipInt != 0) {
                    val ipStr = String.format(
                        Locale.US,
                        "%d.%d.%d.%d",
                        ipInt and 0xff,
                        ipInt shr 8 and 0xff,
                        ipInt shr 16 and 0xff,
                        ipInt shr 24 and 0xff
                    )
                    if (ipStr != "0.0.0.0" && !lanIps.contains(ipStr)) {
                        lanIps.add(ipStr)
                    }
                }
            } catch (_: Exception) {
                // noop
            }
        }

        val primaryIp = lanIps.firstOrNull() ?: "127.0.0.1"
        val urls = if (lanIps.isNotEmpty()) {
            lanIps.map { "http://$it:$port/?portal=web" }
        } else {
            listOf("http://127.0.0.1:$port/?portal=web")
        }

        return NetworkInfoResult(
            port = port,
            primaryIp = primaryIp,
            lanIps = lanIps,
            urls = urls
        )
    }

    fun getRevision(): Int = synchronized(lock) { db.optInt("revision", 1) }

    fun isWebAccessEnabled(): Boolean = synchronized(lock) { db.optBoolean("webAccessEnabled", true) }

    fun getDefaultTenantId(): String = synchronized(lock) {
        val tenants = db.getJSONObject("data").optJSONArray("tenants")
        tenants?.optJSONObject(0)?.optString("id")?.takeIf { it.isNotBlank() } ?: "tenant-demo-01"
    }

    fun findMatrizUser(tenantId: String?, requestedUserId: String?): JSONObject? = synchronized(lock) {
        val users = db.getJSONObject("data").optJSONArray("users") ?: return@synchronized null
        if (!requestedUserId.isNullOrBlank()) {
            for (i in 0 until users.length()) {
                val u = users.optJSONObject(i) ?: continue
                if (u.optString("id") == requestedUserId) {
                    return@synchronized JSONObject(u.toString())
                }
            }
        }
        for (i in 0 until users.length()) {
            val u = users.optJSONObject(i) ?: continue
            if ((tenantId == null || u.optString("tenantId") == tenantId) && u.optString("role") == "admin") {
                return@synchronized JSONObject(u.toString())
            }
        }
        users.optJSONObject(0)?.let { JSONObject(it.toString()) }
    }

    fun getSnapshot(tenantId: String? = null, roleMode: String = "admin", userId: String? = null): JSONObject = synchronized(lock) {
        val data = db.getJSONObject("data")
        val tenants = data.optJSONArray("tenants") ?: JSONArray()
        val activeTenantId = tenantId?.takeIf { it.isNotBlank() }
            ?: tenants.optJSONObject(0)?.optString("id")?.takeIf { it.isNotBlank() }
            ?: "tenant-demo-01"

        if (roleMode == "seller") {
            val usersArr = data.optJSONArray("users") ?: JSONArray()
            val filteredUsers = JSONArray()
            for (i in 0 until usersArr.length()) {
                val u = usersArr.optJSONObject(i) ?: continue
                val copy = JSONObject(u.toString())
                if (copy.optString("id") != userId) {
                    copy.remove("accessCode")
                }
                filteredUsers.put(copy)
            }

            val cashArr = data.optJSONArray("cashSessions") ?: JSONArray()
            val openCash = JSONArray()
            for (i in 0 until cashArr.length()) {
                val c = cashArr.optJSONObject(i) ?: continue
                if (c.optString("status") == "open") {
                    openCash.put(JSONObject(c.toString()))
                }
            }

            val sellerData = JSONObject().apply {
                put("tenants", JSONArray(tenants.toString()))
                put("users", filteredUsers)
                put("categories", JSONArray((data.optJSONArray("categories") ?: JSONArray()).toString()))
                put("products", JSONArray((data.optJSONArray("products") ?: JSONArray()).toString()))
                put("tables", JSONArray((data.optJSONArray("tables") ?: JSONArray()).toString()))
                put("orders", JSONArray((data.optJSONArray("orders") ?: JSONArray()).toString()))
                put("cashSessions", openCash)
                put("financial", JSONArray())
                put("inventoryTransactions", JSONArray())
                put("auditLogs", JSONArray())
                put("savedReports", JSONArray())
                put("archivedPeriods", JSONArray())
                put("backups", JSONArray())
                put("tableArchives", JSONArray())
                put("themeConfig", JSONObject((data.optJSONObject("themeConfig") ?: JSONObject()).toString()))
            }
            return@synchronized JSONObject().apply {
                put("revision", db.optInt("revision", 1))
                put("webAccessEnabled", db.optBoolean("webAccessEnabled", true))
                put("tenantId", activeTenantId)
                put("data", sellerData)
            }
        }

        return@synchronized JSONObject().apply {
            put("revision", db.optInt("revision", 1))
            put("webAccessEnabled", db.optBoolean("webAccessEnabled", true))
            put("tenantId", activeTenantId)
            put("data", JSONObject(data.toString()))
        }
    }

    fun getWebAccessStatus(tenantId: String, port: Int): JSONObject = synchronized(lock) {
        val net = getNetworkInfo(port)
        val keysArr = db.optJSONArray("accessKeys") ?: JSONArray()
        val publicKeys = JSONArray()
        for (i in 0 until keysArr.length()) {
            val k = keysArr.optJSONObject(i) ?: continue
            if (k.optString("tenantId") == tenantId) {
                val summary = JSONObject(k.toString())
                summary.remove("salt")
                summary.remove("keyHash")
                publicKeys.put(summary)
            }
        }

        val sessionsArr = db.optJSONArray("sessions") ?: JSONArray()
        val publicSessions = JSONArray()
        for (i in 0 until sessionsArr.length()) {
            val s = sessionsArr.optJSONObject(i) ?: continue
            if (s.optString("tenantId") == tenantId) {
                val pub = JSONObject(s.toString())
                pub.remove("tokenHash")
                pub.remove("keyId")
                publicSessions.put(pub)
            }
        }

        val logsArr = db.optJSONArray("connectionLogs") ?: JSONArray()
        val filteredLogs = JSONArray()
        for (i in 0 until logsArr.length()) {
            val l = logsArr.optJSONObject(i) ?: continue
            if (l.optString("tenantId") == tenantId) {
                filteredLogs.put(l)
                if (filteredLogs.length() >= 80) break
            }
        }

        JSONObject().apply {
            put("webAccessEnabled", db.optBoolean("webAccessEnabled", true))
            put("port", net.port)
            put("primaryIp", net.primaryIp)
            put("lanIps", JSONArray(net.lanIps))
            put("urls", JSONArray(net.urls))
            put("activeSessionsCount", publicSessions.length())
            put("sessions", publicSessions)
            put("keys", publicKeys)
            put("logs", filteredLogs)
            put("revision", db.optInt("revision", 1))
            put("nativeAndroidServer", true)
        }
    }

    fun getActiveSessionsCount(): Int = synchronized(lock) {
        (db.optJSONArray("sessions") ?: JSONArray()).length()
    }

    fun toggleWebAccess(enabled: Boolean, tenantId: String, actorName: String, ipAddress: String): JSONObject = synchronized(lock) {
        db.put("webAccessEnabled", enabled)
        val revokedSessionIds = mutableListOf<String>()
        if (!enabled) {
            val sessions = db.optJSONArray("sessions") ?: JSONArray()
            for (i in 0 until sessions.length()) {
                val id = sessions.optJSONObject(i)?.optString("id")
                if (!id.isNullOrBlank()) revokedSessionIds.add(id)
            }
            db.put("sessions", JSONArray())
        }

        addConnectionLog(
            tenantId = tenantId,
            event = "access_toggled",
            userName = actorName,
            deviceLabel = "Painel Administrativo (Android)",
            ipAddress = ipAddress,
            details = if (enabled) {
                "Acesso pelo navegador ATIVADO na rede local."
            } else {
                "Acesso pelo navegador DESATIVADO. ${revokedSessionIds.size} sessão(ões) desconectada(s)."
            }
        )

        commit("web_access_toggled", tenantId = tenantId, revokedSessionIds = revokedSessionIds)
        JSONObject().apply {
            put("webAccessEnabled", enabled)
            put("revokedSessionIds", JSONArray(revokedSessionIds))
        }
    }

    fun disconnectAllSessionsForServerStop(actorName: String = "Administrador (Servidor Parado)") = synchronized(lock) {
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        val revokedIds = mutableListOf<String>()
        for (i in 0 until sessions.length()) {
            val id = sessions.optJSONObject(i)?.optString("id")
            if (!id.isNullOrBlank()) revokedIds.add(id)
        }
        if (revokedIds.isNotEmpty()) {
            db.put("sessions", JSONArray())
            addConnectionLog(
                tenantId = getDefaultTenantId(),
                event = "access_toggled",
                userName = actorName,
                deviceLabel = "Serviço Nativo Android",
                ipAddress = "127.0.0.1",
                details = "Servidor nativo parado no aparelho ADM. ${revokedIds.size} sessão(ões) encerrada(s)."
            )
            commit("server_stopped", revokedSessionIds = revokedIds)
        }
        revokedIds
    }

    fun createAccessKey(
        tenantId: String,
        mode: String,
        userId: String?,
        expiresInHours: Int,
        actorName: String,
        ipAddress: String
    ): JSONObject = synchronized(lock) {
        val users = db.getJSONObject("data").optJSONArray("users") ?: JSONArray()
        var targetUser: JSONObject? = null

        if (mode == "admin") {
            if (!userId.isNullOrBlank()) {
                for (i in 0 until users.length()) {
                    val u = users.optJSONObject(i) ?: continue
                    if (u.optString("tenantId") == tenantId && u.optString("id") == userId && u.optString("role") == "admin") {
                        targetUser = u
                        break
                    }
                }
            }
            if (targetUser == null) {
                for (i in 0 until users.length()) {
                    val u = users.optJSONObject(i) ?: continue
                    if (u.optString("tenantId") == tenantId && u.optString("role") == "admin") {
                        targetUser = u
                        break
                    }
                }
            }
        } else {
            for (i in 0 until users.length()) {
                val u = users.optJSONObject(i) ?: continue
                if (u.optString("tenantId") == tenantId && u.optString("id") == userId && u.optString("role") != "admin") {
                    targetUser = u
                    break
                }
            }
            if (targetUser == null) {
                throw IllegalArgumentException("Selecione um vendedor válido para gerar a chave individual.")
            }
            val canSell = targetUser.optBoolean("canSell", true)
            val status = targetUser.optString("status", "")
            if (!canSell || status == "bloqueado") {
                throw IllegalArgumentException("O vendedor \"${targetUser.optString("name")}\" está bloqueado. Autorize-o antes de gerar a chave.")
            }
        }

        val plainKey = generateReadableKey(mode)
        val (salt, keyHash) = hashSecret(plainKey)
        val nowMs = System.currentTimeMillis()
        val hours = max(1, min(720, expiresInHours))
        val expiresMs = nowMs + hours.toLong() * 3600L * 1000L
        val expiresAt = formatIso(expiresMs)
        val targetName = targetUser?.optString("name")?.takeIf { it.isNotBlank() }
            ?: if (mode == "admin") "Administrador" else "Vendedor"
        val targetId = targetUser?.optString("id")?.takeIf { it.isNotBlank() }

        val record = JSONObject().apply {
            put("id", "wkey-${System.currentTimeMillis()}-${randomHex(2)}")
            put("tenantId", tenantId)
            put("mode", mode)
            if (targetId != null) put("userId", targetId)
            put("userName", targetName)
            put("keyPreview", maskKey(plainKey))
            put("salt", salt)
            put("keyHash", keyHash)
            put("createdAt", formatIso(nowMs))
            put("expiresAt", expiresAt)
            put("revoked", false)
        }

        val keys = db.optJSONArray("accessKeys") ?: JSONArray()
        db.put("accessKeys", prependJsonArray(keys, record, 500))

        addConnectionLog(
            tenantId = tenantId,
            event = "key_created",
            mode = mode,
            userId = targetId,
            userName = targetName,
            deviceLabel = actorName,
            ipAddress = ipAddress,
            details = "Nova chave ${if (mode == "admin") "MODO ADMINISTRADOR" else "MODO VENDEDOR"} gerada (${record.optString("keyPreview")}), válida até ${formatPtBr(expiresMs)}."
        )

        commit("key_created", tenantId = tenantId)

        val summary = JSONObject(record.toString()).apply {
            remove("salt")
            remove("keyHash")
        }
        JSONObject().apply {
            put("keySummary", summary)
            put("plainKey", plainKey)
        }
    }

    fun renewAccessKey(keyId: String, expiresInHours: Int, actorName: String, ipAddress: String): JSONObject = synchronized(lock) {
        val keys = db.optJSONArray("accessKeys") ?: JSONArray()
        var targetIdx = -1
        var existing: JSONObject? = null
        for (i in 0 until keys.length()) {
            val k = keys.optJSONObject(i) ?: continue
            if (k.optString("id") == keyId) {
                targetIdx = i
                existing = k
                break
            }
        }
        if (existing == null || targetIdx < 0) {
            throw NoSuchElementException("Chave não encontrada.")
        }

        val mode = existing.optString("mode", "seller")
        val plainKey = generateReadableKey(mode)
        val (salt, keyHash) = hashSecret(plainKey)
        val hours = max(1, min(720, expiresInHours))
        val expiresMs = System.currentTimeMillis() + hours.toLong() * 3600L * 1000L
        val expiresAt = formatIso(expiresMs)

        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        val remainingSessions = JSONArray()
        val revokedSessionIds = mutableListOf<String>()
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("keyId") == keyId) {
                revokedSessionIds.add(s.optString("id"))
            } else {
                remainingSessions.put(s)
            }
        }
        db.put("sessions", remainingSessions)

        existing.put("keyPreview", maskKey(plainKey))
        existing.put("salt", salt)
        existing.put("keyHash", keyHash)
        existing.put("expiresAt", expiresAt)
        existing.put("revoked", false)
        existing.remove("revokedAt")
        keys.put(targetIdx, existing)

        val tenantId = existing.optString("tenantId", getDefaultTenantId())
        addConnectionLog(
            tenantId = tenantId,
            event = "key_renewed",
            mode = mode,
            userId = existing.optString("userId").takeIf { it.isNotBlank() },
            userName = existing.optString("userName"),
            deviceLabel = actorName,
            ipAddress = ipAddress,
            details = "Chave renovada (${existing.optString("keyPreview")}) com nova validade até ${formatPtBr(expiresMs)}."
        )

        commit("key_renewed", tenantId = tenantId, revokedSessionIds = revokedSessionIds)

        val summary = JSONObject(existing.toString()).apply {
            remove("salt")
            remove("keyHash")
        }
        JSONObject().apply {
            put("keySummary", summary)
            put("plainKey", plainKey)
        }
    }

    fun revokeAccessKey(keyId: String, actorName: String, ipAddress: String): JSONObject = synchronized(lock) {
        val keys = db.optJSONArray("accessKeys") ?: JSONArray()
        var existing: JSONObject? = null
        for (i in 0 until keys.length()) {
            val k = keys.optJSONObject(i) ?: continue
            if (k.optString("id") == keyId) {
                existing = k
                k.put("revoked", true)
                k.put("revokedAt", nowIso())
                break
            }
        }
        if (existing == null) {
            throw NoSuchElementException("Chave não encontrada.")
        }

        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        val remaining = JSONArray()
        val revokedSessionIds = mutableListOf<String>()
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("keyId") == keyId) {
                revokedSessionIds.add(s.optString("id"))
            } else {
                remaining.put(s)
            }
        }
        db.put("sessions", remaining)

        val tenantId = existing.optString("tenantId", getDefaultTenantId())
        addConnectionLog(
            tenantId = tenantId,
            event = "revoked",
            mode = existing.optString("mode"),
            userId = existing.optString("userId").takeIf { it.isNotBlank() },
            userName = existing.optString("userName"),
            deviceLabel = actorName,
            ipAddress = ipAddress,
            details = "Chave ${existing.optString("keyPreview")} revogada. ${revokedSessionIds.size} sessão(ões) encerrada(s)."
        )

        commit("key_revoked", tenantId = tenantId, revokedSessionIds = revokedSessionIds)

        JSONObject().apply {
            put("ok", true)
            put("revokedSessionIds", JSONArray(revokedSessionIds))
        }
    }

    fun authenticateWithKey(
        plainKey: String,
        deviceLabel: String?,
        ipAddress: String,
        userAgent: String
    ): JSONObject = synchronized(lock) {
        if (!db.optBoolean("webAccessEnabled", true)) {
            throw IllegalStateException("ACCESS_DISABLED:O acesso pelo navegador está desativado pelo Administrador.")
        }

        val cleaned = plainKey.trim().uppercase(Locale.US)
        if (cleaned.isEmpty()) {
            throw IllegalArgumentException("INVALID_KEY:Informe uma chave de acesso válida.")
        }

        val keys = db.optJSONArray("accessKeys") ?: JSONArray()
        var matched: JSONObject? = null
        for (i in 0 until keys.length()) {
            val k = keys.optJSONObject(i) ?: continue
            if (!k.optBoolean("revoked", false)) {
                val salt = k.optString("salt", "")
                val keyHash = k.optString("keyHash", "")
                if (salt.isNotEmpty() && keyHash.isNotEmpty() && verifySecret(cleaned, salt, keyHash)) {
                    matched = k
                    break
                }
            }
        }

        if (matched == null) {
            addConnectionLog(
                tenantId = getDefaultTenantId(),
                event = "blocked",
                userName = "Tentativa não autorizada",
                deviceLabel = deviceLabel?.takeIf { it.isNotBlank() } ?: "Navegador Desconhecido",
                ipAddress = ipAddress,
                details = "Tentativa de acesso com chave inválida ou já revogada."
            )
            writeAtomic(db)
            throw IllegalArgumentException("INVALID_KEY:Chave de acesso inválida ou revogada.")
        }

        val expiresMs = parseIsoMs(matched.optString("expiresAt"))
        if (expiresMs < System.currentTimeMillis()) {
            throw IllegalArgumentException("EXPIRED_KEY:Esta chave de acesso expirou. Solicite uma nova ao Administrador.")
        }

        val matchedTenantId = matched.optString("tenantId", getDefaultTenantId())
        val matchedMode = matched.optString("mode", "seller")
        val matchedUserId = matched.optString("userId")
        val users = db.getJSONObject("data").optJSONArray("users") ?: JSONArray()

        var user: JSONObject? = null
        for (i in 0 until users.length()) {
            val u = users.optJSONObject(i) ?: continue
            if (matchedUserId.isNotBlank() && u.optString("id") == matchedUserId) {
                user = u
                break
            }
        }
        if (user == null && matchedMode == "admin") {
            for (i in 0 until users.length()) {
                val u = users.optJSONObject(i) ?: continue
                if (u.optString("tenantId") == matchedTenantId && u.optString("role") == "admin") {
                    user = u
                    break
                }
            }
        }
        if (user == null) {
            throw IllegalArgumentException("USER_NOT_FOUND:Perfil vinculado à chave não foi encontrado.")
        }

        if (matchedMode == "seller" && (!user.optBoolean("canSell", true) || user.optString("status") == "bloqueado")) {
            addConnectionLog(
                tenantId = matchedTenantId,
                event = "blocked",
                mode = "seller",
                userId = user.optString("id"),
                userName = user.optString("name"),
                deviceLabel = deviceLabel?.takeIf { it.isNotBlank() } ?: "Navegador Web",
                ipAddress = ipAddress,
                details = "Login negado: vendedor \"${user.optString("name")}\" está bloqueado pelo Administrador."
            )
            writeAtomic(db)
            throw SecurityException("SELLER_BLOCKED:Sua permissão de venda está bloqueada pelo Administrador.")
        }

        val token = "sgw_${randomHex(28)}"
        val tokenHash = hashToken(token)
        val now = nowIso()
        val label = deviceLabel?.trim()?.takeIf { it.isNotEmpty() }
            ?: if (matchedMode == "admin") "Navegador Web (ADM)" else "Navegador Web (${user.optString("name")})"

        val sessionRecord = JSONObject().apply {
            put("id", "wsess-${System.currentTimeMillis()}-${randomHex(3)}")
            put("tenantId", matchedTenantId)
            put("mode", matchedMode)
            put("userId", user.optString("id"))
            put("userName", user.optString("name"))
            put("deviceLabel", label)
            put("ipAddress", ipAddress)
            put("userAgent", userAgent.take(120))
            put("connectedAt", now)
            put("lastActivityAt", now)
            put("wsConnected", false)
            put("tokenHash", tokenHash)
            put("keyId", matched.optString("id"))
        }

        matched.put("lastUsedAt", now)
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        db.put("sessions", prependJsonArray(sessions, sessionRecord, 200))

        addConnectionLog(
            tenantId = matchedTenantId,
            event = "login",
            mode = matchedMode,
            userId = user.optString("id"),
            userName = user.optString("name"),
            deviceLabel = label,
            ipAddress = ipAddress,
            details = "Sessão autenticada em ${if (matchedMode == "admin") "MODO ADMINISTRADOR" else "MODO VENDEDOR"} via chave ${matched.optString("keyPreview")}."
        )

        commit("session_login", tenantId = matchedTenantId)

        val publicSession = JSONObject(sessionRecord.toString()).apply {
            remove("tokenHash")
            remove("keyId")
        }
        val snapshot = getSnapshot(matchedTenantId, matchedMode, user.optString("id"))

        JSONObject().apply {
            put("token", token)
            put("session", publicSession)
            put("user", JSONObject(user.toString()))
            put("snapshot", snapshot)
        }
    }

    fun validateBearerToken(token: String?): TokenValidationResult = synchronized(lock) {
        if (token.isNullOrBlank()) {
            return@synchronized TokenValidationResult(false, "Token ausente.")
        }
        if (!db.optBoolean("webAccessEnabled", true)) {
            return@synchronized TokenValidationResult(false, "Acesso pelo navegador desativado pelo Administrador.")
        }
        val th = hashToken(token)
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        var session: JSONObject? = null
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("tokenHash") == th) {
                session = s
                break
            }
        }
        if (session == null) {
            return@synchronized TokenValidationResult(false, "Sessão encerrada, desconectada ou expirada.")
        }

        val keyId = session.optString("keyId")
        val keys = db.optJSONArray("accessKeys") ?: JSONArray()
        var key: JSONObject? = null
        for (i in 0 until keys.length()) {
            val k = keys.optJSONObject(i) ?: continue
            if (k.optString("id") == keyId) {
                key = k
                break
            }
        }
        val keyExpMs = if (key != null) parseIsoMs(key.optString("expiresAt")) else 0L
        if (key == null || key.optBoolean("revoked", false) || keyExpMs < System.currentTimeMillis()) {
            removeSessionById(session.optString("id"))
            writeAtomic(db)
            return@synchronized TokenValidationResult(false, "Chave de acesso revogada ou expirada.")
        }

        val users = db.getJSONObject("data").optJSONArray("users") ?: JSONArray()
        var user: JSONObject? = null
        val sessUserId = session.optString("userId")
        for (i in 0 until users.length()) {
            val u = users.optJSONObject(i) ?: continue
            if (u.optString("id") == sessUserId) {
                user = u
                break
            }
        }
        if (user == null) {
            return@synchronized TokenValidationResult(false, "Usuário não encontrado.")
        }

        if (session.optString("mode") == "seller" && (!user.optBoolean("canSell", true) || user.optString("status") == "bloqueado")) {
            removeSessionById(session.optString("id"))
            writeAtomic(db)
            return@synchronized TokenValidationResult(false, "Permissão de vendedor bloqueada pelo Administrador.")
        }

        session.put("lastActivityAt", nowIso())
        return@synchronized TokenValidationResult(
            valid = true,
            session = JSONObject(session.toString()),
            user = JSONObject(user.toString())
        )
    }

    private fun removeSessionById(sessionId: String) {
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        val next = JSONArray()
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("id") != sessionId) next.put(s)
        }
        db.put("sessions", next)
    }

    fun setSessionWsConnected(sessionId: String, connected: Boolean) = synchronized(lock) {
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("id") == sessionId) {
                s.put("wsConnected", connected)
                s.put("lastActivityAt", nowIso())
                writeAtomic(db)
                break
            }
        }
    }

    fun disconnectSession(sessionId: String, actorName: String, ipAddress: String): Boolean = synchronized(lock) {
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        var target: JSONObject? = null
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("id") == sessionId) {
                target = s
                break
            }
        }
        if (target == null) return@synchronized false

        removeSessionById(sessionId)
        val tenantId = target.optString("tenantId", getDefaultTenantId())
        addConnectionLog(
            tenantId = tenantId,
            event = "disconnect",
            mode = target.optString("mode"),
            userId = target.optString("userId"),
            userName = target.optString("userName"),
            deviceLabel = target.optString("deviceLabel"),
            ipAddress = ipAddress,
            details = "Sessão desconectada por $actorName."
        )
        commit("session_disconnected", tenantId = tenantId, revokedSessionIds = listOf(sessionId))
        return@synchronized true
    }

    fun logoutSessionByToken(token: String, ipAddress: String) = synchronized(lock) {
        val th = hashToken(token)
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        var target: JSONObject? = null
        for (i in 0 until sessions.length()) {
            val s = sessions.optJSONObject(i) ?: continue
            if (s.optString("tokenHash") == th) {
                target = s
                break
            }
        }
        if (target == null) return@synchronized

        val sessionId = target.optString("id")
        removeSessionById(sessionId)
        val tenantId = target.optString("tenantId", getDefaultTenantId())
        addConnectionLog(
            tenantId = tenantId,
            event = "logout",
            mode = target.optString("mode"),
            userId = target.optString("userId"),
            userName = target.optString("userName"),
            deviceLabel = target.optString("deviceLabel"),
            ipAddress = ipAddress,
            details = "Sessão encerrada pelo próprio usuário."
        )
        commit("session_logout", tenantId = tenantId, revokedSessionIds = listOf(sessionId))
    }

    fun toggleSellerPermission(userId: String, canSell: Boolean, adminName: String, ipAddress: String): JSONObject = synchronized(lock) {
        val users = db.getJSONObject("data").optJSONArray("users") ?: JSONArray()
        var target: JSONObject? = null
        for (i in 0 until users.length()) {
            val u = users.optJSONObject(i) ?: continue
            if (u.optString("id") == userId) {
                u.put("canSell", canSell)
                u.put("active", canSell)
                u.put("status", if (canSell) "autorizado" else "bloqueado")
                u.put("updatedAt", nowIso())
                target = u
                break
            }
        }
        if (target == null) {
            throw NoSuchElementException("Vendedor não encontrado.")
        }

        val tenantId = target.optString("tenantId", getDefaultTenantId())
        val revokedSessionIds = mutableListOf<String>()
        if (!canSell) {
            val sessions = db.optJSONArray("sessions") ?: JSONArray()
            val remaining = JSONArray()
            for (i in 0 until sessions.length()) {
                val s = sessions.optJSONObject(i) ?: continue
                if (s.optString("userId") == userId && s.optString("mode") == "seller") {
                    revokedSessionIds.add(s.optString("id"))
                } else {
                    remaining.put(s)
                }
            }
            db.put("sessions", remaining)
            if (revokedSessionIds.isNotEmpty()) {
                addConnectionLog(
                    tenantId = tenantId,
                    event = "blocked",
                    mode = "seller",
                    userId = userId,
                    userName = target.optString("name"),
                    deviceLabel = "Sessões Web Ativas",
                    ipAddress = ipAddress,
                    details = "Vendedor bloqueado pelo ADM. ${revokedSessionIds.size} sessão(ões) web encerrada(s) imediatamente."
                )
            }
        }

        addAuditLog(
            tenantId = tenantId,
            userId = "adm",
            userName = adminName,
            action = if (canSell) "AUTORIZOU_VENDEDOR" else "BLOQUEOU_VENDEDOR",
            details = "${if (canSell) "Permissão de venda LIGADA (AUTORIZADO)" else "Permissão de venda DESLIGADA (BLOQUEADO)"} para ${target.optString("name")}."
        )

        commit(
            "seller_permission_changed",
            tenantId = tenantId,
            revokedUserIds = if (canSell) emptyList() else listOf(userId),
            revokedSessionIds = revokedSessionIds
        )

        JSONObject().apply {
            put("ok", true)
            put("user", JSONObject(target.toString()))
            put("revokedSessionIds", JSONArray(revokedSessionIds))
            put("revision", db.optInt("revision", 1))
        }
    }

    fun addOrAccumulateTableItems(
        tenantId: String,
        tableId: String,
        items: JSONArray?,
        operatorId: String,
        operatorName: String,
        mutationId: String?
    ): JSONObject = synchronized(lock) {
        val data = db.getJSONObject("data")
        val tables = data.optJSONArray("tables") ?: JSONArray()
        val orders = data.optJSONArray("orders") ?: JSONArray()
        val products = data.optJSONArray("products") ?: JSONArray()
        val tenants = data.optJSONArray("tenants") ?: JSONArray()

        if (recordMutationId(mutationId)) {
            var foundTable: JSONObject? = null
            for (i in 0 until tables.length()) {
                val t = tables.optJSONObject(i) ?: continue
                if (t.optString("id") == tableId) {
                    foundTable = t
                    break
                }
            }
            var foundOrder: JSONObject? = null
            val currentOrderId = foundTable?.optString("currentOrderId")
            for (i in 0 until orders.length()) {
                val o = orders.optJSONObject(i) ?: continue
                if ((!currentOrderId.isNullOrBlank() && o.optString("id") == currentOrderId) ||
                    (o.optString("tenantId") == tenantId && o.optString("type") == "table" && o.optString("tableId") == tableId && o.optString("status") != "cancelled" && !o.optBoolean("paid", false))
                ) {
                    foundOrder = o
                    break
                }
            }
            return@synchronized JSONObject().apply {
                put("ok", true)
                put("alreadyProcessed", true)
                if (foundTable != null) put("table", JSONObject(foundTable.toString()))
                if (foundOrder != null) put("order", JSONObject(foundOrder.toString()))
                put("revision", db.optInt("revision", 1))
            }
        }

        var tableIdx = -1
        var table: JSONObject? = null
        for (i in 0 until tables.length()) {
            val t = tables.optJSONObject(i) ?: continue
            if (t.optString("id") == tableId && t.optString("tenantId") == tenantId) {
                tableIdx = i
                table = t
                break
            }
        }
        if (table == null || tableIdx < 0) throw IllegalArgumentException("Mesa não encontrada.")

        var allowNegativeStock = false
        for (i in 0 until tenants.length()) {
            val t = tenants.optJSONObject(i) ?: continue
            if (t.optString("id") == tenantId) {
                allowNegativeStock = t.optJSONObject("settings")?.optBoolean("allowNegativeStock", false) ?: false
                break
            }
        }

        if (items == null || items.length() == 0) {
            throw IllegalArgumentException("Selecione ao menos um produto para adicionar à mesa.")
        }

        // 1. Valida estoque dos deltas adicionados
        for (i in 0 until items.length()) {
            val reqItem = items.optJSONObject(i) ?: throw IllegalArgumentException("Item inválido.")
            val qty = reqItem.optDouble("quantity", 0.0)
            if (qty <= 0.0) throw IllegalArgumentException("Quantidade inválida para item do pedido.")
            val prodId = reqItem.optString("productId")
            var prod: JSONObject? = null
            for (j in 0 until products.length()) {
                val p = products.optJSONObject(j) ?: continue
                if (p.optString("id") == prodId && p.optString("tenantId") == tenantId) {
                    prod = p
                    break
                }
            }
            if (prod == null) throw IllegalArgumentException("Produto não encontrado no cardápio.")
            if (!prod.optBoolean("active", true)) throw IllegalArgumentException("O produto \"${prod.optString("name")}\" está inativo.")
            val stockQty = prod.optDouble("stockQuantity", 0.0)
            if (!allowNegativeStock && stockQty < qty) {
                throw IllegalArgumentException("Estoque insuficiente para \"${prod.optString("name")}\". Disponível: $stockQty ${prod.optString("unit", "un")}, solicitado: $qty.")
            }
        }

        // 2. Localiza pedido aberto existente da mesa ou cria um novo
        val tableNumber = table.optInt("number")
        var orderIdx = -1
        var order: JSONObject? = null
        for (i in 0 until orders.length()) {
            val o = orders.optJSONObject(i) ?: continue
            if (o.optString("tenantId") == tenantId &&
                o.optString("type") == "table" &&
                (o.optString("tableId") == tableId || o.optInt("tableNumber") == tableNumber) &&
                o.optString("status") != "cancelled" &&
                !o.optBoolean("paid", false) &&
                o.optString("status") != "closed"
            ) {
                orderIdx = i
                order = JSONObject(o.toString())
                break
            }
        }

        val now = nowIso()
        val tableLabel = table.optString("label").takeIf { it.isNotBlank() } ?: "Mesa $tableNumber"
        if (order == null) {
            var maxOrderNum = 100
            for (i in 0 until orders.length()) {
                val num = orders.optJSONObject(i)?.optInt("orderNumber", 0) ?: 0
                if (num > maxOrderNum) maxOrderNum = num
            }
            order = JSONObject().apply {
                put("id", "ord-tbl-${System.currentTimeMillis()}-${randomHex(2)}")
                put("tenantId", tenantId)
                put("orderNumber", maxOrderNum + 1)
                put("type", "table")
                put("status", "preparing")
                put("tableId", tableId)
                put("tableNumber", tableNumber)
                put("tableName", tableLabel)
                val cName = table.optString("customerName")
                if (cName.isNotBlank()) put("customerName", cName)
                put("waiterId", operatorId)
                put("waiterName", operatorName)
                put("items", JSONArray())
                put("subtotal", 0.0)
                put("discount", 0.0)
                put("serviceFee", 0.0)
                put("extraTotal", table.optDouble("extraTotal", 0.0))
                put("extraCharges", table.optJSONArray("extraCharges") ?: JSONArray())
                put("total", table.optDouble("extraTotal", 0.0))
                put("payments", JSONArray())
                put("paid", false)
                put("createdAt", now)
            }
        }

        val orderItems = order.optJSONArray("items") ?: JSONArray()
        var invTxs = data.optJSONArray("inventoryTransactions") ?: JSONArray()

        // 3. Baixa estoque delta e acumula itens equivalentes
        for (i in 0 until items.length()) {
            val reqItem = items.getJSONObject(i)
            val prodId = reqItem.optString("productId")
            val qty = reqItem.optDouble("quantity")
            var prod: JSONObject? = null
            for (j in 0 until products.length()) {
                val p = products.optJSONObject(j) ?: continue
                if (p.optString("id") == prodId && p.optString("tenantId") == tenantId) {
                    prod = p
                    break
                }
            }
            if (prod == null) continue

            val prevStock = prod.optDouble("stockQuantity", 0.0)
            val newStock = if (allowNegativeStock) round3(prevStock - qty) else max(0.0, round3(prevStock - qty))
            prod.put("stockQuantity", newStock)
            prod.put("updatedAt", now)

            val invTx = JSONObject().apply {
                put("id", "inv-${System.currentTimeMillis()}-${randomHex(2)}")
                put("tenantId", tenantId)
                put("productId", prod.optString("id"))
                put("productName", prod.optString("name"))
                put("type", "sale")
                put("quantity", qty)
                put("previousStock", prevStock)
                put("newStock", newStock)
                put("reason", "Consumo adicionado à $tableLabel")
                put("userId", operatorId)
                put("userName", operatorName)
                put("createdAt", now)
            }
            invTxs = prependJsonArray(invTxs, invTx, 1500)

            val varName = reqItem.optString("variationName", "")
            var basePrice = prod.optDouble("sellingPrice", 0.0)
            val variations = prod.optJSONArray("variations")
            if (varName.isNotEmpty() && variations != null) {
                for (v in 0 until variations.length()) {
                    val vObj = variations.optJSONObject(v) ?: continue
                    if (vObj.optString("name") == varName) {
                        basePrice = vObj.optDouble("price", basePrice)
                        break
                    }
                }
            }
            val selectedAddons = reqItem.optJSONArray("selectedAddons") ?: JSONArray()
            var addonsTotal = 0.0
            for (a in 0 until selectedAddons.length()) {
                addonsTotal += selectedAddons.optJSONObject(a)?.optDouble("price", 0.0) ?: 0.0
            }
            val unitPrice = round2(basePrice + addonsTotal)
            val cleanNotes = reqItem.optString("notes", "").trim()
            val addonsKey = selectedAddons.toString()

            var matchedIdx = -1
            for (e in 0 until orderItems.length()) {
                val existing = orderItems.optJSONObject(e) ?: continue
                val existingAddons = (existing.optJSONArray("selectedAddons") ?: JSONArray()).toString()
                if (existing.optString("productId") == prodId &&
                    existing.optString("variationName", "") == varName &&
                    existing.optString("notes", "").trim() == cleanNotes &&
                    existingAddons == addonsKey
                ) {
                    matchedIdx = e
                    break
                }
            }

            if (matchedIdx >= 0) {
                val existing = orderItems.getJSONObject(matchedIdx)
                val accQty = round3(existing.optDouble("quantity", 0.0) + qty)
                val lockedUnitPrice = existing.optDouble("unitPrice", unitPrice)
                existing.put("quantity", accQty)
                existing.put("total", round2(accQty * lockedUnitPrice))
            } else {
                val newOrderItem = JSONObject().apply {
                    put("productId", prodId)
                    put("productName", prod.optString("name"))
                    put("quantity", qty)
                    put("unitPrice", unitPrice)
                    if (varName.isNotEmpty()) put("variationName", varName)
                    if (selectedAddons.length() > 0) put("selectedAddons", selectedAddons)
                    if (cleanNotes.isNotEmpty()) put("notes", cleanNotes)
                    put("total", round2(qty * unitPrice))
                }
                orderItems.put(newOrderItem)
            }
        }

        data.put("inventoryTransactions", invTxs)
        order.put("items", orderItems)

        var itemsSubtotal = 0.0
        for (i in 0 until orderItems.length()) {
            itemsSubtotal += orderItems.optJSONObject(i)?.optDouble("total", 0.0) ?: 0.0
        }
        itemsSubtotal = round2(itemsSubtotal)

        val tableExtras = table.optJSONArray("extraCharges") ?: JSONArray()
        var extraTotal = 0.0
        for (i in 0 until tableExtras.length()) {
            val c = tableExtras.optJSONObject(i) ?: continue
            if (c.optString("status") == "active") {
                extraTotal += c.optDouble("amount", 0.0)
            }
        }
        extraTotal = round2(extraTotal)

        order.put("subtotal", itemsSubtotal)
        order.put("extraTotal", extraTotal)
        order.put("extraCharges", tableExtras)
        order.put("total", round2(itemsSubtotal + extraTotal))

        if (orderIdx >= 0) {
            orders.put(orderIdx, order)
        } else {
            data.put("orders", prependJsonArray(orders, order, 2000))
        }

        val currentOrders = data.getJSONArray("orders")
        var productsTotal = 0.0
        var activeCount = 0
        for (i in 0 until currentOrders.length()) {
            val o = currentOrders.optJSONObject(i) ?: continue
            if (o.optString("tenantId") == tenantId &&
                o.optString("type") == "table" &&
                (o.optString("tableId") == tableId || o.optInt("tableNumber") == tableNumber) &&
                o.optString("status") != "cancelled" &&
                !o.optBoolean("paid", false) &&
                o.optString("status") != "closed"
            ) {
                productsTotal += o.optDouble("subtotal", 0.0)
                activeCount++
            }
        }
        productsTotal = round2(productsTotal)
        val grandTotal = round2(productsTotal + extraTotal)

        if (table.optString("status") != "closing") {
            table.put("status", "occupied")
        }
        if (table.optString("openedAt").isBlank()) table.put("openedAt", now)
        if (table.optString("waiterId").isBlank()) table.put("waiterId", operatorId)
        if (table.optString("waiterName").isBlank()) table.put("waiterName", operatorName)
        table.put("currentOrderId", order.optString("id"))
        table.put("productsTotal", productsTotal)
        table.put("extraTotal", extraTotal)
        table.put("currentTotal", grandTotal)
        table.put("activeOrdersCount", activeCount)
        tables.put(tableIdx, table)

        addAuditLog(
            tenantId = tenantId,
            userId = operatorId,
            userName = operatorName,
            action = "ADICIONOU_ITENS_MESA",
            details = "Lançou ${items.length()} item(ns) na $tableLabel. Subtotal produtos: R$ ${"%.2f".format(Locale.US, productsTotal)}."
        )

        commit("table_items_added", tenantId = tenantId)

        JSONObject().apply {
            put("ok", true)
            put("table", JSONObject(table.toString()))
            put("order", JSONObject(order.toString()))
            put("revision", db.optInt("revision", 1))
        }
    }

    fun settleTableAccount(
        tenantId: String,
        tableId: String,
        method: String,
        amount: Double,
        receivedAmount: Double?,
        notes: String?,
        operatorId: String,
        operatorName: String,
        mutationId: String?
    ): JSONObject = synchronized(lock) {
        val data = db.getJSONObject("data")
        val tables = data.optJSONArray("tables") ?: JSONArray()

        if (recordMutationId(mutationId)) {
            var existingTable: JSONObject? = null
            for (i in 0 until tables.length()) {
                val t = tables.optJSONObject(i) ?: continue
                if (t.optString("id") == tableId) {
                    existingTable = t
                    break
                }
            }
            val rem = if (existingTable != null) {
                max(0.0, existingTable.optDouble("currentTotal", 0.0) - existingTable.optDouble("paidAmount", 0.0))
            } else 0.0
            return@synchronized JSONObject().apply {
                put("ok", true)
                put("alreadyProcessed", true)
                put("settled", existingTable?.optString("status") == "available")
                put("remainingBalance", rem)
                if (existingTable != null) put("table", JSONObject(existingTable.toString()))
                put("revision", db.optInt("revision", 1))
            }
        }

        var tableIdx = -1
        var table: JSONObject? = null
        for (i in 0 until tables.length()) {
            val t = tables.optJSONObject(i) ?: continue
            if (t.optString("id") == tableId && t.optString("tenantId") == tenantId) {
                tableIdx = i
                table = t
                break
            }
        }
        if (table == null || tableIdx < 0) throw IllegalArgumentException("Mesa não encontrada.")

        if (table.optString("status") == "available" && table.optDouble("currentTotal", 0.0) <= 0.009) {
            throw IllegalStateException("TABLE_ALREADY_SETTLED:Esta mesa já está quitada e disponível.")
        }

        val tableNumber = table.optInt("number")
        val tableLabel = table.optString("label").takeIf { it.isNotBlank() } ?: "Mesa $tableNumber"
        val extraTotal = round2(table.optDouble("extraTotal", 0.0))
        val currentTotal = table.optDouble("currentTotal", 0.0)
        val productsTotal = if (table.has("productsTotal")) {
            round2(table.optDouble("productsTotal", 0.0))
        } else {
            round2(max(0.0, currentTotal - extraTotal))
        }
        val grandTotal = round2(productsTotal + extraTotal)
        val previousPaid = round2(table.optDouble("paidAmount", 0.0))
        val currentRemaining = round2(max(0.0, grandTotal - previousPaid))

        if (currentRemaining > 0.009 && (amount.isNaN() || amount <= 0.0)) {
            throw IllegalArgumentException("Informe um valor positivo para registrar o pagamento.")
        }

        val paidNow = if (currentRemaining <= 0.009) 0.0 else min(currentRemaining, round2(amount))
        val payments = JSONArray((table.optJSONArray("payments") ?: JSONArray()).toString())
        val now = nowIso()

        if (paidNow > 0.0) {
            val recAmt = if (method == "dinheiro") (receivedAmount ?: paidNow) else paidNow
            val change = if (method == "dinheiro") max(0.0, round2(recAmt - paidNow)) else 0.0
            val newPay = JSONObject().apply {
                put("id", "tpay-${System.currentTimeMillis()}-${randomHex(2)}")
                put("method", method)
                put("amount", paidNow)
                put("receivedAmount", recAmt)
                put("change", change)
                put("paidAt", now)
                put("receivedById", operatorId)
                put("receivedByName", operatorName)
                if (!notes.isNullOrBlank()) put("notes", notes)
            }
            payments.put(newPay)

            val cashSessions = data.optJSONArray("cashSessions") ?: JSONArray()
            var openCashId: String? = null
            for (i in 0 until cashSessions.length()) {
                val cash = cashSessions.optJSONObject(i) ?: continue
                if (cash.optString("tenantId") == tenantId && cash.optString("status") == "open") {
                    openCashId = cash.optString("id")
                    if (method == "dinheiro") {
                        cash.put("totalCash", round2(cash.optDouble("totalCash", 0.0) + paidNow))
                        cash.put("expectedAmount", round2(cash.optDouble("expectedAmount", 0.0) + paidNow))
                    } else {
                        cash.put("totalPix", round2(cash.optDouble("totalPix", 0.0) + paidNow))
                    }
                    break
                }
            }

            val tx = JSONObject().apply {
                put("id", "tx-tpay-${newPay.optString("id")}")
                put("tenantId", tenantId)
                put("type", "revenue")
                put("category", "Fechamento de Mesa")
                put("description", "Recebimento $tableLabel (${method.uppercase(Locale.US)})")
                put("amount", paidNow)
                put("date", now)
                put("paid", true)
                put("paymentMethod", method)
                if (openCashId != null) put("cashRegisterId", openCashId)
                put("userId", operatorId)
                put("userName", operatorName)
                put("notes", "Produtos: R$ ${"%.2f".format(Locale.US, productsTotal)} | Extras: R$ ${"%.2f".format(Locale.US, extraTotal)}")
                put("createdAt", now)
            }
            val fin = data.optJSONArray("financial") ?: JSONArray()
            data.put("financial", prependJsonArray(fin, tx, 2000))
        }

        val newPaidTotal = round2(previousPaid + paidNow)
        val remainingBalance = round2(max(0.0, grandTotal - newPaidTotal))

        if (remainingBalance > 0.009) {
            table.put("status", "closing")
            table.put("paidAmount", newPaidTotal)
            table.put("payments", payments)
            tables.put(tableIdx, table)

            addAuditLog(
                tenantId = tenantId,
                userId = operatorId,
                userName = operatorName,
                action = "PAGAMENTO_PARCIAL_MESA",
                details = "Pagamento parcial de R$ ${"%.2f".format(Locale.US, paidNow)} (${method.uppercase(Locale.US)}) na $tableLabel. Restante: R$ ${"%.2f".format(Locale.US, remainingBalance)}."
            )
            commit("table_partial_payment", tenantId = tenantId)
            return@synchronized JSONObject().apply {
                put("ok", true)
                put("settled", false)
                put("remainingBalance", remainingBalance)
                put("table", JSONObject(table.toString()))
                put("revision", db.optInt("revision", 1))
            }
        }

        // Quitação integral
        val linkedOrderIds = JSONArray()
        val orderPaymentsSummary = JSONArray()
        for (i in 0 until payments.length()) {
            val p = payments.optJSONObject(i) ?: continue
            orderPaymentsSummary.put(JSONObject().apply {
                put("method", p.optString("method"))
                put("amount", p.optDouble("amount"))
                put("receivedAmount", p.optDouble("receivedAmount"))
                put("change", p.optDouble("change"))
            })
        }

        val orders = data.optJSONArray("orders") ?: JSONArray()
        for (i in 0 until orders.length()) {
            val o = orders.optJSONObject(i) ?: continue
            if (o.optString("tenantId") == tenantId &&
                o.optString("type") == "table" &&
                (o.optString("tableId") == tableId || o.optInt("tableNumber") == tableNumber) &&
                o.optString("status") != "cancelled" &&
                (!o.optBoolean("paid", false) || o.optString("status") != "closed")
            ) {
                linkedOrderIds.put(o.optString("id"))
                o.put("status", "closed")
                o.put("paid", true)
                if (orderPaymentsSummary.length() > 0) {
                    o.put("payments", orderPaymentsSummary)
                } else {
                    o.put("payments", JSONArray().put(JSONObject().apply {
                        put("method", method)
                        put("amount", o.optDouble("total", 0.0))
                    }))
                }
                if (o.optString("closedAt").isBlank()) o.put("closedAt", now)
            }
        }

        val archive = JSONObject().apply {
            put("id", "tarch-$tableId-${System.currentTimeMillis()}")
            put("tenantId", tenantId)
            put("tableId", tableId)
            put("tableNumber", tableNumber)
            put("tableName", table.optString("customerName").takeIf { it.isNotBlank() } ?: tableLabel)
            put("openedAt", table.optString("openedAt").takeIf { it.isNotBlank() } ?: now)
            put("closedAt", now)
            put("closedById", operatorId)
            put("closedByName", operatorName)
            put("productsTotal", productsTotal)
            put("extraTotal", extraTotal)
            put("grandTotal", grandTotal)
            put("paidTotal", newPaidTotal)
            put("orderIds", linkedOrderIds)
            put("extraCharges", table.optJSONArray("extraCharges") ?: JSONArray())
            put("payments", payments)
        }
        val archives = data.optJSONArray("tableArchives") ?: JSONArray()
        data.put("tableArchives", prependJsonArray(archives, archive, 1500))

        table.put("status", "available")
        table.remove("openedAt")
        table.remove("waiterId")
        table.remove("waiterName")
        table.remove("currentOrderId")
        table.put("currentTotal", 0.0)
        table.put("productsTotal", 0.0)
        table.put("extraTotal", 0.0)
        table.put("paidAmount", 0.0)
        table.put("payments", JSONArray())
        table.put("extraCharges", JSONArray())
        table.put("activeOrdersCount", 0)
        table.remove("timer")
        tables.put(tableIdx, table)

        addAuditLog(
            tenantId = tenantId,
            userId = operatorId,
            userName = operatorName,
            action = "QUITACAO_E_LIBERACAO_MESA",
            details = "Quitou e liberou $tableLabel (Total: R$ ${"%.2f".format(Locale.US, grandTotal)})."
        )
        commit("table_settled", tenantId = tenantId)

        JSONObject().apply {
            put("ok", true)
            put("settled", true)
            put("remainingBalance", 0.0)
            put("table", JSONObject(table.toString()))
            put("archive", archive)
            put("revision", db.optInt("revision", 1))
        }
    }

    fun createCounterSale(
        tenantId: String,
        items: JSONArray?,
        paymentMethod: String,
        receivedAmount: Double?,
        customerName: String?,
        notes: String?,
        receiptImageUrl: String?,
        operatorId: String,
        operatorName: String,
        mutationId: String?
    ): JSONObject = synchronized(lock) {
        val data = db.getJSONObject("data")
        val orders = data.optJSONArray("orders") ?: JSONArray()

        if (recordMutationId(mutationId)) {
            val latest = orders.optJSONObject(0)?.let { JSONObject(it.toString()) } ?: JSONObject()
            return@synchronized JSONObject().apply {
                put("ok", true)
                put("alreadyProcessed", true)
                put("order", latest)
                put("revision", db.optInt("revision", 1))
            }
        }

        if (items == null || items.length() == 0) {
            throw IllegalArgumentException("Adicione ao menos um item para finalizar a venda no balcão.")
        }

        val products = data.optJSONArray("products") ?: JSONArray()
        val tenants = data.optJSONArray("tenants") ?: JSONArray()
        var allowNegativeStock = false
        for (i in 0 until tenants.length()) {
            val t = tenants.optJSONObject(i) ?: continue
            if (t.optString("id") == tenantId) {
                allowNegativeStock = t.optJSONObject("settings")?.optBoolean("allowNegativeStock", false) ?: false
                break
            }
        }

        // 1. Valida estoque
        for (i in 0 until items.length()) {
            val reqItem = items.optJSONObject(i) ?: throw IllegalArgumentException("Item inválido.")
            val qty = reqItem.optDouble("quantity", 0.0)
            if (qty <= 0.0) throw IllegalArgumentException("Quantidade inválida.")
            val prodId = reqItem.optString("productId")
            var prod: JSONObject? = null
            for (j in 0 until products.length()) {
                val p = products.optJSONObject(j) ?: continue
                if (p.optString("id") == prodId && p.optString("tenantId") == tenantId) {
                    prod = p
                    break
                }
            }
            if (prod == null) throw IllegalArgumentException("Produto não encontrado.")
            val stockQty = prod.optDouble("stockQuantity", 0.0)
            if (!allowNegativeStock && stockQty < qty) {
                throw IllegalArgumentException("Estoque insuficiente para \"${prod.optString("name")}\".")
            }
        }

        val now = nowIso()
        val orderItems = JSONArray()
        var subtotal = 0.0
        var invTxs = data.optJSONArray("inventoryTransactions") ?: JSONArray()

        for (i in 0 until items.length()) {
            val reqItem = items.getJSONObject(i)
            val prodId = reqItem.optString("productId")
            val qty = reqItem.optDouble("quantity")
            var prod: JSONObject? = null
            for (j in 0 until products.length()) {
                val p = products.optJSONObject(j) ?: continue
                if (p.optString("id") == prodId && p.optString("tenantId") == tenantId) {
                    prod = p
                    break
                }
            }
            if (prod == null) continue

            val prevStock = prod.optDouble("stockQuantity", 0.0)
            val newStock = if (allowNegativeStock) round3(prevStock - qty) else max(0.0, round3(prevStock - qty))
            prod.put("stockQuantity", newStock)
            prod.put("updatedAt", now)

            invTxs = prependJsonArray(
                invTxs,
                JSONObject().apply {
                    put("id", "inv-${System.currentTimeMillis()}-${randomHex(2)}")
                    put("tenantId", tenantId)
                    put("productId", prod.optString("id"))
                    put("productName", prod.optString("name"))
                    put("type", "sale")
                    put("quantity", qty)
                    put("previousStock", prevStock)
                    put("newStock", newStock)
                    put("reason", "Venda direta no Balcão")
                    put("userId", operatorId)
                    put("userName", operatorName)
                    put("createdAt", now)
                },
                1500
            )

            val varName = reqItem.optString("variationName", "")
            var basePrice = prod.optDouble("sellingPrice", 0.0)
            val variations = prod.optJSONArray("variations")
            if (varName.isNotEmpty() && variations != null) {
                for (v in 0 until variations.length()) {
                    val vObj = variations.optJSONObject(v) ?: continue
                    if (vObj.optString("name") == varName) {
                        basePrice = vObj.optDouble("price", basePrice)
                        break
                    }
                }
            }
            val selectedAddons = reqItem.optJSONArray("selectedAddons") ?: JSONArray()
            var addonsTotal = 0.0
            for (a in 0 until selectedAddons.length()) {
                addonsTotal += selectedAddons.optJSONObject(a)?.optDouble("price", 0.0) ?: 0.0
            }
            val unitPrice = round2(basePrice + addonsTotal)
            val itemTotal = round2(qty * unitPrice)
            subtotal += itemTotal

            orderItems.put(JSONObject().apply {
                put("productId", prodId)
                put("productName", prod.optString("name"))
                put("quantity", qty)
                put("unitPrice", unitPrice)
                if (varName.isNotEmpty()) put("variationName", varName)
                if (selectedAddons.length() > 0) put("selectedAddons", selectedAddons)
                val itemNotes = reqItem.optString("notes", "").trim()
                if (itemNotes.isNotEmpty()) put("notes", itemNotes)
                put("total", itemTotal)
            })
        }

        data.put("inventoryTransactions", invTxs)
        subtotal = round2(subtotal)

        var maxOrderNum = 100
        for (i in 0 until orders.length()) {
            val num = orders.optJSONObject(i)?.optInt("orderNumber", 0) ?: 0
            if (num > maxOrderNum) maxOrderNum = num
        }
        val nextNum = maxOrderNum + 1

        val recAmt = if (paymentMethod == "dinheiro") (receivedAmount ?: subtotal) else subtotal
        val change = if (paymentMethod == "dinheiro") max(0.0, round2(recAmt - subtotal)) else 0.0

        val paymentObj = JSONObject().apply {
            put("method", paymentMethod)
            put("amount", subtotal)
            put("receivedAmount", recAmt)
            put("change", change)
            if (!receiptImageUrl.isNullOrBlank()) {
                put("receiptImageUrl", receiptImageUrl)
                put("receiptType", if (paymentMethod == "pix") "pix" else "cash")
                put("receiptCapturedAt", now)
                put("receiptSellerName", operatorName)
            }
        }

        val order = JSONObject().apply {
            put("id", "ord-bal-${System.currentTimeMillis()}-${randomHex(2)}")
            put("tenantId", tenantId)
            put("orderNumber", nextNum)
            put("type", "counter")
            put("status", "closed")
            if (!customerName.isNullOrBlank()) put("customerName", customerName.trim())
            put("waiterId", operatorId)
            put("waiterName", operatorName)
            put("items", orderItems)
            put("subtotal", subtotal)
            put("discount", 0.0)
            put("serviceFee", 0.0)
            put("total", subtotal)
            put("payments", JSONArray().put(paymentObj))
            put("paid", true)
            if (!notes.isNullOrBlank()) put("notes", notes)
            if (!receiptImageUrl.isNullOrBlank()) {
                put("receiptImageUrl", receiptImageUrl)
                put("receiptCapturedAt", now)
                put("receiptSellerName", operatorName)
            }
            put("createdAt", now)
            put("closedAt", now)
        }
        data.put("orders", prependJsonArray(orders, order, 2000))

        val cashSessions = data.optJSONArray("cashSessions") ?: JSONArray()
        var openCashId: String? = null
        for (i in 0 until cashSessions.length()) {
            val cash = cashSessions.optJSONObject(i) ?: continue
            if (cash.optString("tenantId") == tenantId && cash.optString("status") == "open") {
                openCashId = cash.optString("id")
                if (paymentMethod == "dinheiro") {
                    cash.put("totalCash", round2(cash.optDouble("totalCash", 0.0) + subtotal))
                    cash.put("expectedAmount", round2(cash.optDouble("expectedAmount", 0.0) + subtotal))
                } else {
                    cash.put("totalPix", round2(cash.optDouble("totalPix", 0.0) + subtotal))
                }
                break
            }
        }

        val finTx = JSONObject().apply {
            put("id", "tx-bal-${order.optString("id")}")
            put("tenantId", tenantId)
            put("type", "revenue")
            put("category", "Venda Balcão")
            put("description", "Venda Balcão #$nextNum (${paymentMethod.uppercase(Locale.US)})")
            put("amount", subtotal)
            put("date", now)
            put("paid", true)
            put("paymentMethod", paymentMethod)
            if (openCashId != null) put("cashRegisterId", openCashId)
            put("userId", operatorId)
            put("userName", operatorName)
            put("createdAt", now)
        }
        val fin = data.optJSONArray("financial") ?: JSONArray()
        data.put("financial", prependJsonArray(fin, finTx, 2000))

        addAuditLog(
            tenantId = tenantId,
            userId = operatorId,
            userName = operatorName,
            action = "VENDA_BALCAO",
            details = "Venda Balcão #$nextNum finalizada em ${paymentMethod.uppercase(Locale.US)} no valor de R$ ${"%.2f".format(Locale.US, subtotal)}."
        )

        commit("counter_sale_created", tenantId = tenantId)

        JSONObject().apply {
            put("ok", true)
            put("order", order)
            put("revision", db.optInt("revision", 1))
        }
    }

    fun cancelOrder(orderId: String, adminId: String, adminName: String, reason: String?): JSONObject = synchronized(lock) {
        val data = db.getJSONObject("data")
        val orders = data.optJSONArray("orders") ?: JSONArray()
        var orderIdx = -1
        var order: JSONObject? = null
        for (i in 0 until orders.length()) {
            val o = orders.optJSONObject(i) ?: continue
            if (o.optString("id") == orderId) {
                orderIdx = i
                order = o
                break
            }
        }
        if (order == null || orderIdx < 0) throw IllegalArgumentException("Pedido não encontrado.")
        if (order.optString("status") == "cancelled") throw IllegalArgumentException("Este pedido já foi cancelado.")

        val now = nowIso()
        val tenantId = order.optString("tenantId", getDefaultTenantId())
        val orderNum = order.optInt("orderNumber")
        val products = data.optJSONArray("products") ?: JSONArray()
        var invTxs = data.optJSONArray("inventoryTransactions") ?: JSONArray()
        val items = order.optJSONArray("items") ?: JSONArray()

        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val prodId = item.optString("productId")
            val qty = item.optDouble("quantity", 0.0)
            for (j in 0 until products.length()) {
                val p = products.optJSONObject(j) ?: continue
                if (p.optString("id") == prodId && p.optString("tenantId") == tenantId) {
                    val prev = p.optDouble("stockQuantity", 0.0)
                    val next = round3(prev + qty)
                    p.put("stockQuantity", next)
                    p.put("updatedAt", now)
                    invTxs = prependJsonArray(
                        invTxs,
                        JSONObject().apply {
                            put("id", "inv-est-${System.currentTimeMillis()}-${randomHex(2)}")
                            put("tenantId", tenantId)
                            put("productId", p.optString("id"))
                            put("productName", p.optString("name"))
                            put("type", "adjustment")
                            put("quantity", qty)
                            put("previousStock", prev)
                            put("newStock", next)
                            put("reason", "Estorno por cancelamento do Pedido #$orderNum")
                            put("userId", adminId)
                            put("userName", adminName)
                            put("createdAt", now)
                        },
                        1500
                    )
                    break
                }
            }
        }
        data.put("inventoryTransactions", invTxs)

        order.put("status", "cancelled")
        order.put("paid", false)
        if (!reason.isNullOrBlank()) {
            val prevNotes = order.optString("notes", "")
            order.put("notes", "$prevNotes [CANCELADO: $reason]".trim())
        }
        orders.put(orderIdx, order)

        if (order.optString("type") == "table" && order.optString("tableId").isNotBlank()) {
            val tblId = order.optString("tableId")
            val tables = data.optJSONArray("tables") ?: JSONArray()
            for (i in 0 until tables.length()) {
                val t = tables.optJSONObject(i) ?: continue
                if (t.optString("id") == tblId) {
                    var productsTotal = 0.0
                    var activeCount = 0
                    for (k in 0 until orders.length()) {
                        val o = orders.optJSONObject(k) ?: continue
                        if (o.optString("tenantId") == tenantId &&
                            o.optString("type") == "table" &&
                            o.optString("tableId") == tblId &&
                            o.optString("status") != "cancelled" &&
                            !o.optBoolean("paid", false) &&
                            o.optString("status") != "closed"
                        ) {
                            productsTotal += o.optDouble("subtotal", 0.0)
                            activeCount++
                        }
                    }
                    productsTotal = round2(productsTotal)
                    val extraTotal = round2(t.optDouble("extraTotal", 0.0))
                    val grandTotal = round2(productsTotal + extraTotal)
                    t.put("productsTotal", productsTotal)
                    t.put("currentTotal", grandTotal)
                    t.put("activeOrdersCount", activeCount)
                    if (grandTotal <= 0.009) {
                        t.put("status", "available")
                    }
                    tables.put(i, t)
                    break
                }
            }
        }

        addAuditLog(
            tenantId = tenantId,
            userId = adminId,
            userName = adminName,
            action = "CANCELOU_VENDA",
            details = "Cancelou Pedido #$orderNum (R$ ${"%.2f".format(Locale.US, order.optDouble("total", 0.0))}) com estorno de estoque."
        )

        commit("order_cancelled", tenantId = tenantId)

        JSONObject().apply {
            put("ok", true)
            put("order", JSONObject(order.toString()))
            put("revision", db.optInt("revision", 1))
        }
    }

    fun syncStateFromClient(
        partial: JSONObject,
        tenantId: String,
        actorName: String,
        sellerOnly: Boolean = false
    ): JSONObject = synchronized(lock) {
        val data = db.getJSONObject("data")
        val prevBlockedMap = mutableMapOf<String, Boolean>()
        val prevUsers = data.optJSONArray("users") ?: JSONArray()
        for (i in 0 until prevUsers.length()) {
            val u = prevUsers.optJSONObject(i) ?: continue
            prevBlockedMap[u.optString("id")] =
                !u.optBoolean("canSell", true) || u.optString("status") == "bloqueado"
        }

        val allowedKeys = if (sellerOnly) {
            listOf("tables", "orders")
        } else {
            listOf(
                "tenants", "users", "categories", "products", "tables", "orders",
                "cashSessions", "financial", "inventoryTransactions", "auditLogs",
                "savedReports", "archivedPeriods", "backups", "tableArchives", "themeConfig"
            )
        }

        for (key in allowedKeys) {
            if (partial.has(key) && !partial.isNull(key)) {
                data.put(key, partial.get(key))
            }
        }

        val blockedUserIds = mutableListOf<String>()
        val sessions = db.optJSONArray("sessions") ?: JSONArray()
        val currentUsers = data.optJSONArray("users") ?: JSONArray()
        for (i in 0 until currentUsers.length()) {
            val u = currentUsers.optJSONObject(i) ?: continue
            val uid = u.optString("id")
            if (u.optString("role") != "admin" && (!u.optBoolean("canSell", true) || u.optString("status") == "bloqueado")) {
                var hasActiveSession = false
                for (sIdx in 0 until sessions.length()) {
                    if (sessions.optJSONObject(sIdx)?.optString("userId") == uid) {
                        hasActiveSession = true
                        break
                    }
                }
                if (prevBlockedMap[uid] != true || hasActiveSession) {
                    blockedUserIds.add(uid)
                }
            }
        }

        val revokedSessionIds = mutableListOf<String>()
        if (blockedUserIds.isNotEmpty()) {
            val remaining = JSONArray()
            for (i in 0 until sessions.length()) {
                val s = sessions.optJSONObject(i) ?: continue
                if (s.optString("mode") == "seller" && blockedUserIds.contains(s.optString("userId"))) {
                    revokedSessionIds.add(s.optString("id"))
                } else {
                    remaining.put(s)
                }
            }
            db.put("sessions", remaining)
        }

        commit(
            "state_synced:$actorName",
            tenantId = tenantId,
            revokedUserIds = blockedUserIds,
            revokedSessionIds = revokedSessionIds
        )

        JSONObject().apply {
            put("ok", true)
            put("revision", db.optInt("revision", 1))
            put("revokedUserIds", JSONArray(blockedUserIds))
            put("revokedSessionIds", JSONArray(revokedSessionIds))
        }
    }

    fun generateQrDataUrl(targetUrl: String): String {
        val size = 280
        val matrix = MultiFormatWriter().encode(targetUrl, BarcodeFormat.QR_CODE, size, size)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (matrix[x, y]) 0xFF1C1917.toInt() else 0xFFFFFFFF.toInt())
            }
        }
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
        val base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        return "data:image/png;base64,$base64"
    }
}
