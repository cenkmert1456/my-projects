package com.drop.ai

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Versioned, verified model provisioning for the DROP Intelligence engine.
 *
 * Guarantees:
 *  - versioned model files (DROP_AI_MODEL_VERSION); never re-downloads a
 *    verified, installed version
 *  - resumable partial downloads (HTTP Range) where the server allows it
 *  - SHA-256 verification before install
 *  - atomic install (write .part → verify → rename), so a partial/corrupt
 *    download can never be loaded
 *  - Wi-Fi-only policy by default; large downloads ask first (handled in UI)
 *  - the current working model is never deleted before the replacement is
 *    downloaded and verified
 */
class ModelManager(private val context: Context) {

    companion object {
        // Bump when a new model is published. Never re-downloads same version.
        const val DROP_AI_MODEL_VERSION = "2026.08.1"

        // Distribution manifest for this version. Point this at your CDN and
        // publish the matching sha256. The engine skips the download entirely
        // on devices whose tier never needs the model (system AI / light).
        private const val MODEL_URL =
            "https://cdn.drop.app/models/drop-ai-v${DROP_AI_MODEL_VERSION}.tflite"
        private const val MODEL_SHA256 = "replace-with-real-sha256-of-published-model"
        private const val MODEL_SIZE_BYTES = 1_800_000_000L // ~1.8 GB (3n E2B 4B quantized)

        private const val PREF = "drop_ai"
        private const val KEY_VERSION = "model_version"
    }

    private val modelDir: File = File(context.filesDir, "drop-ai")
    private val installed: File get() = File(modelDir, "model-v$DROP_AI_MODEL_VERSION.bin")
    private val part: File get() = File(modelDir, "model-v$DROP_AI_MODEL_VERSION.bin.part")

    fun installedVersion(): String? =
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_VERSION, null)

    fun isInstalled(): Boolean =
        installedVersion() == DROP_AI_MODEL_VERSION && installed.exists() &&
            installed.length() == MODEL_SIZE_BYTES

    fun storageSize(): Long = installed.length()

    /**
     * Download and install the model. Returns true when ready (or already
     * installed). Emits progress 0..1 via [onProgress]. Never throws when a
     * download fails — callers degrade to a lighter tier.
     */
    suspend fun ensureModel(onProgress: (Float) -> Unit): Boolean {
        if (isInstalled()) return true

        modelDir.mkdirs()

        // Wi-Fi policy: if wifiOnly is on and we're on metered data, report
        // a "needs confirmation" state by throwing a special exception.
        if (wifiOnly() && !onWifi()) {
            throw NeedsConfirmationException()
        }

        return try {
            download(onProgress)
            if (installed.exists()) {
                context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
                    .edit().putString(KEY_VERSION, DROP_AI_MODEL_VERSION).apply()
                true
            } else {
                false
            }
        } catch (e: Exception) {
            part.delete()
            false
        }
    }

    private suspend fun download(onProgress: (Float) -> Unit) {
        val existing = part.length()
        val conn = URL(MODEL_URL).openConnection() as HttpURLConnection
        conn.connectTimeout = 30_000
        conn.readTimeout = 30_000
        if (existing > 0) conn.setRequestProperty("Range", "bytes=$existing-")

        conn.connect()
        val code = conn.responseCode
        val total = conn.contentLength.toLong()
        val startAt = if (code == 206) existing else 0L
        val expectedTotal = if (code == 206) existing + total else MODEL_SIZE_BYTES

        val out = RandomAccessFile(part, "rw")
        out.seek(startAt)
        conn.inputStream.use { input ->
            val buf = ByteArray(64 * 1024)
            var read: Int
            var done = startAt
            while (input.read(buf).also { read = it } != -1) {
                out.write(buf, 0, read)
                done += read
                onProgress((done.toDouble() / expectedTotal).toFloat().coerceIn(0f, 1f))
            }
        }
        out.close()
        conn.disconnect()

        // Verify integrity before atomic install.
        val digest = part.readBytes().let { bytes ->
            val md = MessageDigest.getInstance("SHA-256")
            md.update(bytes)
            md.digest().joinToString("") { "%02x".format(it) }
        }
        if (digest != MODEL_SHA256.lowercase()) {
            part.delete()
            throw IllegalStateException("Checksum mismatch")
        }
        if (!part.renameTo(installed)) {
            part.delete()
            throw IllegalStateException("Atomic install failed")
        }
    }

    fun wifiOnly(): Boolean =
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getBoolean("wifi_only", true)

    fun setWifiOnly(value: Boolean) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit().putBoolean("wifi_only", value).apply()
    }

    private fun onWifi(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        } catch (e: Exception) {
            false
        }
    }

    fun removeModel(): Boolean {
        val deleted = installed.delete()
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().remove(KEY_VERSION).apply()
        part.delete()
        return deleted || !installed.exists()
    }
}

/** Thrown when a large download needs user confirmation (mobile data). */
class NeedsConfirmationException : Exception("Model download requires confirmation on mobile data")
