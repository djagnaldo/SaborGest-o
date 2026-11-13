package com.saborgestao.app.server

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

@CapacitorPlugin(
    name = "SaborLocalServer",
    permissions = [
        Permission(
            alias = "notifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS]
        )
    ]
)
class SaborLocalServerPlugin : Plugin() {

    private val statusListener: () -> Unit = {
        val statusObj = buildStatusJSObject()
        notifyListeners("serverStatusChanged", statusObj)
    }

    override fun load() {
        super.load()
        SaborWebServerService.addStatusListener(statusListener)
    }

    override fun handleOnDestroy() {
        SaborWebServerService.removeStatusListener(statusListener)
        super.handleOnDestroy()
    }

    @PluginMethod
    fun startServer(call: PluginCall) {
        val requestedPort = call.getInt("port", 3000) ?: 3000
        if (requestedPort !in 1024..65535) {
            call.reject("Informe uma porta válida entre 1024 e 65535.")
            return
        }

        // Inicializa banco unificado a partir do snapshot local atual do ADM apenas se ainda não existir
        var newlySeeded = false
        val seedObj = call.getObject("seedSnapshot")
        if (seedObj != null) {
            try {
                val store = SaborServerStore(context.applicationContext)
                val existedBefore = store.hasPersistedDatabase()
                store.initializeFromSeedIfEmpty(JSONObject(seedObj.toString()))
                newlySeeded = !existedBefore
            } catch (_: Exception) {
                // noop
            }
        }

        // Em Android 13+, solicita permissão de notificação sem bloquear o Foreground Service
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                try {
                    androidx.core.app.ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        9001
                    )
                } catch (_: Exception) {
                    // Continua inicializando o serviço
                }
            }
        }

        val latch = SaborWebServerService.prepareStartLatch()
        val intent = Intent(context, SaborWebServerService::class.java).apply {
            action = SaborWebServerService.ACTION_START
            putExtra(SaborWebServerService.EXTRA_PORT, requestedPort)
        }

        try {
            ContextCompat.startForegroundService(context, intent)
        } catch (err: Exception) {
            call.reject("Não foi possível iniciar o serviço em primeiro plano: ${err.message}")
            return
        }

        // Aguarda bind da porta em thread de I/O para não travar a Main Thread do Capacitor
        Thread {
            SaborWebServerService.awaitStart(latch, 5000L)
            val err = SaborWebServerService.lastError
            if (!SaborWebServerService.isRunning.get() || err != null) {
                call.reject(err ?: "Falha ao abrir porta $requestedPort no dispositivo Android.")
            } else {
                val status = buildStatusJSObject()
                status.put("newlySeeded", newlySeeded)
                call.resolve(status)
            }
        }.start()
    }

    @PluginMethod
    fun stopServer(call: PluginCall) {
        val intent = Intent(context, SaborWebServerService::class.java).apply {
            action = SaborWebServerService.ACTION_STOP
        }
        try {
            context.startService(intent)
        } catch (_: Exception) {
            context.stopService(Intent(context, SaborWebServerService::class.java))
        }

        Thread {
            var attempts = 0
            while (SaborWebServerService.isRunning.get() && attempts < 25) {
                Thread.sleep(100)
                attempts++
            }
            call.resolve(buildStatusJSObject())
        }.start()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(buildStatusJSObject())
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        val granted = getPermissionState("notifications") == PermissionState.GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun requestBatteryOptimizationExemption(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(JSObject().put("ignoring", true))
            return
        }
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val pkg = context.packageName
        if (pm?.isIgnoringBatteryOptimizations(pkg) == true) {
            call.resolve(JSObject().put("ignoring", true))
            return
        }
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$pkg")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().put("ignoring", false).put("promptOpened", true))
        } catch (err: Exception) {
            call.reject("Não foi possível abrir configurações de bateria: ${err.message}")
        }
    }

    private fun buildStatusJSObject(): JSObject {
        val raw = SaborWebServerService.getStatusPayload(context.applicationContext)
        val obj = JSObject(raw.toString())
        val ignoringBattery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isIgnoringBatteryOptimizations(context.packageName) ?: true
        } else {
            true
        }
        obj.put("batteryOptimizationIgnored", ignoringBattery)
        obj.put("isNativeAndroid", true)
        return obj
    }
}
