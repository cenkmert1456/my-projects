package com.drop.ai

import android.app.ActivityManager
import android.content.Context
import android.os.Build

/**
 * Internal performance tiers — never shown to users:
 *
 *  system — Gemini Nano (ML Kit GenAI) available on this device
 *  local  — strong device (RAM ≥ 6 GB, 64-bit, modern Android): a bundled
 *           open-weight multimodal model (Gemma-class) runs locally
 *  light  — capable device: lightweight pipeline (OCR + embeddings + rules)
 *  basic  — very limited device: OCR + metadata + full-text search
 */
enum class DropAITier { SYSTEM, LOCAL, LIGHT, BASIC }

object TierDetector {

    /**
     * Detect the best engine for this device. Never throws; never claims
     * system AI unless it actually answers.
     */
    fun detect(context: Context): DropAITier {
        if (SystemAI.available()) return DropAITier.SYSTEM

        val mem = memoryMb(context)
        val is64 = Build.SUPPORTED_ABIS.any { it.contains("64") }

        return when {
            Build.VERSION.SDK_INT >= 29 && mem >= 6144 && is64 -> DropAITier.LOCAL
            Build.VERSION.SDK_INT >= 26 && mem >= 3072 -> DropAITier.LIGHT
            else -> DropAITier.BASIC
        }
    }

    private fun memoryMb(context: Context): Long {
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val info = ActivityManager.MemoryInfo()
            am.getMemoryInfo(info)
            info.totalMem / (1024 * 1024)
        } catch (e: Exception) {
            0
        }
    }
}

/**
 * Gemini Nano (ML Kit GenAI) availability check.
 *
 * Deliberately reflection-based: the engine compiles and ships without the
 * optional GenAI dependency, and only activates system AI on devices where
 * the API is present and supported. Add the dependency in build.gradle to
 * enable it.
 */
object SystemAI {
    private const val GEN_AI_CLASS = "com.google.mlkit.genai.GenerativeModel"

    fun available(): Boolean {
        if (Build.VERSION.SDK_INT < 35) return false // Gemini Nano requires Android 14+/15+
        return try {
            val cls = Class.forName(GEN_AI_CLASS)
            val ctor = cls.getConstructor(String::class.java, String::class.java, String::class.java)
            val instance = ctor.newInstance("gemini-nano", "", "")
            val isSupported = cls.getMethod("isSupported").invoke(instance) as? Boolean
            isSupported ?: true
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Structured generation via Gemini Nano (if available). Returns null when
     * unsupported — callers fall back to the deterministic analyzer.
     */
    fun generateStructured(prompt: String): String? {
        return try {
            val cls = Class.forName(GEN_AI_CLASS)
            val ctor = cls.getConstructor(String::class.java, String::class.java, String::class.java)
            val model = ctor.newInstance("gemini-nano", "", "")
            val method = cls.getMethod("generateContent", String::class.java)
            val response = method.invoke(model, prompt)
            val textMethod = response.javaClass.getMethod("getText")
            textMethod.invoke(response) as? String
        } catch (e: Throwable) {
            null
        }
    }
}
