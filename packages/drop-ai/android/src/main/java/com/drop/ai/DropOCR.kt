package com.drop.ai

import android.graphics.BitmapFactory
import android.util.Base64
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Offline, on-device OCR via ML Kit Text Recognition. */
object DropOCR {
    private val recognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    /** Recognize text in a base64 data URL image. Returns (text, language). */
    suspend fun recognize(dataUrl: String): Pair<String, String?>? {
        val bytes = decodeDataUrl(dataUrl) ?: return null
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        val image = InputImage.fromBitmap(bitmap, 0)
        return withContext(Dispatchers.IO) {
            try {
                val result = recognizer.process(image).await()
                val text = result.text.trim()
                if (text.isEmpty()) null else text to null
            } catch (e: Exception) {
                null
            }
        }
    }

    fun decodeDataUrl(dataUrl: String): ByteArray? {
        return try {
            val comma = dataUrl.indexOf(',')
            val base64 = if (comma >= 0) dataUrl.substring(comma + 1) else dataUrl
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: Exception) {
            null
        }
    }
}

/** Await a Google Tasks Task from a suspend function. */
suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont: CancellableContinuation<T> ->
    addOnSuccessListener { result -> cont.resume(result) }
    addOnFailureListener { e -> cont.resumeWithException(e) }
    addOnCanceledListener { cont.cancel() }
}
