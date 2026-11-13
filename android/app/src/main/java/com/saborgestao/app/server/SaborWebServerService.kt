package com.saborgestao.app.server

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.saborgestao.app.MainActivity
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class SaborWebServerService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var embeddedServer: SaborEmbeddedServer? = null

    companion object {
        const val ACTION_START = "com.saborgestao.app.action.START_WEB_SERVER"
        const val ACTION_STOP = "com.saborgestao.app.action.STOP_WEB_SERVER"
        const val EXTRA_PORT = "port"

        private const val CHANNEL_ID = "saborgestao_local_server_channel"
        private const val NOTIFICATION_ID = 7001

        val isRunning = AtomicBoolean(false)
        val currentPort = AtomicInteger(3000)

        @Volatile
        var lastError: String? = null

        @Volatile
        private var startLatch: CountDownLatch? = null

        private val statusListeners = CopyOnWriteArraySet<() -> Unit>()

        fun addStatusListener(listener: () -> Unit) {
            statusListeners.add(listener)
        }

        fun removeStatusListener(listener: () -> Unit) {
            statusListeners.remove(listener)
        }

        private fun notifyListeners() {
            for (listener in statusListeners) {
                try {
                    listener()
                } catch (_: Exception) {
                    // noop
                }
            }
        }

        fun prepareStartLatch(): CountDownLatch {
            val latch = CountDownLatch(1)
            startLatch = latch
            lastError = null
            return latch
        }

        fun awaitStart(latch: CountDownLatch, timeoutMs: Long = 5000L): Boolean {
            return try {
                latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            } catch (_: InterruptedException) {
                false
            }
        }

        fun getStatusPayload(context: Context): JSONObject {
            val running = isRunning.get()
            val port = currentPort.get()
            val store = SaborServerStore(context)
            val net = store.getNetworkInfo(port)
            return JSONObject().apply {
                put("running", running)
                put("port", port)
                put("primaryIp", net.primaryIp)
                put("lanIps", org.json.JSONArray(net.lanIps))
                put("urls", org.json.JSONArray(net.urls))
                put("webAccessEnabled", running && store.isWebAccessEnabled())
                put("activeSessionsCount", if (running) store.getActiveSessionsCount() else 0)
                put("revision", store.getRevision())
                if (lastError != null) put("error", lastError)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        if (action == ACTION_STOP) {
            stopServerAndService()
            return START_NOT_STICKY
        }

        val requestedPort = intent?.getIntExtra(EXTRA_PORT, currentPort.get()) ?: 3000
        val validPort = if (requestedPort in 1024..65535) requestedPort else 3000

        // Entra em foreground imediatamente para cumprir o limite de 5s do Android
        val initNotification = buildNotification("Iniciando servidor na porta $validPort...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                initNotification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, initNotification)
        }

        if (isRunning.get() && currentPort.get() == validPort && embeddedServer != null) {
            startLatch?.countDown()
            notifyListeners()
            return START_STICKY
        }

        stopEmbeddedOnly()
        acquireLocks()

        try {
            var serverRef: SaborEmbeddedServer? = null
            val store = SaborServerStore(applicationContext) { event ->
                serverRef?.broadcastStateChange(event)
            }
            val server = SaborEmbeddedServer(applicationContext, validPort, store)
            serverRef = server
            server.start()

            embeddedServer = server
            currentPort.set(validPort)
            isRunning.set(true)
            lastError = null

            val net = store.getNetworkInfo(validPort)
            val mainUrl = net.urls.firstOrNull() ?: "http://${net.primaryIp}:$validPort/?portal=web"
            updateNotification("Ativo na rede Wi-Fi • $mainUrl")

            startLatch?.countDown()
            notifyListeners()
        } catch (err: Exception) {
            lastError = err.message ?: "Falha ao iniciar servidor na porta $validPort."
            isRunning.set(false)
            startLatch?.countDown()
            notifyListeners()
            stopSelf()
            return START_NOT_STICKY
        }

        return START_STICKY
    }

    override fun onDestroy() {
        stopEmbeddedOnly()
        releaseLocks()
        super.onDestroy()
    }

    private fun stopServerAndService() {
        stopEmbeddedOnly()
        releaseLocks()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun stopEmbeddedOnly() {
        val wasRunning = isRunning.getAndSet(false)
        try {
            if (wasRunning) {
                SaborServerStore(applicationContext).disconnectAllSessionsForServerStop()
            }
        } catch (_: Exception) {
            // noop
        }
        try {
            embeddedServer?.stop()
        } catch (_: Exception) {
            // noop
        }
        embeddedServer = null
        if (wasRunning) {
            notifyListeners()
        }
    }

    private fun acquireLocks() {
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SaborGestao::LocalServerWakeLock")?.apply {
                    setReferenceCounted(false)
                    acquire()
                }
            }
            if (wifiLock == null) {
                val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                @Suppress("DEPRECATION")
                val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                } else {
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF
                }
                wifiLock = wm?.createWifiLock(mode, "SaborGestao::LocalServerWifiLock")?.apply {
                    setReferenceCounted(false)
                    acquire()
                }
            }
        } catch (_: Exception) {
            // noop
        }
    }

    private fun releaseLocks() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
        } finally {
            wakeLock = null
        }
        try {
            if (wifiLock?.isHeld == true) wifiLock?.release()
        } catch (_: Exception) {
        } finally {
            wifiLock = null
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Servidor Local SaborGestão",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mantém o servidor HTTP e WebSocket local ativo para conexão na rede Wi-Fi."
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    private fun updateNotification(contentText: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        nm?.notify(NOTIFICATION_ID, buildNotification(contentText))
    }

    private fun buildNotification(contentText: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, SaborWebServerService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Servidor Web SaborGestão (ADM)")
            .setContentText(contentText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(contentText))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_media_pause, "Parar Servidor", stopPending)
            .build()
    }
}
