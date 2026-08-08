package com.drop.ai

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Native mirror of `demoEmbedText` in src/convex/ai/demo.ts.
 *
 * The exact same deterministic 128-dim FNV-1a character n-gram algorithm, so
 * vectors computed on-device are directly comparable (cosine) with vectors
 * computed by the server — semantic search works with zero configuration,
 * zero keys and zero downloaded models.
 */
object NativeEmbed {
    private const val DIM = 128
    private val CLEAN_RE = Regex("[^a-z0-9\\s\u20ac\$\u00a3\u00a5]")
    private val SPACE_RE = Regex("\\s+")

    fun embed(text: String): FloatArray {
        val vec = FloatArray(DIM)
        val clean = CLEAN_RE.replace(text.lowercase(), " ")
        val tokens = SPACE_RE.split(clean).filter { it.isNotEmpty() }

        fun add(key: String) {
            var h = 2166136261L
            for (i in key.indices) {
                h = (h xor key[i].code.toLong()) and 0xFFFFFFFFL
                h = (h * 16777619L) and 0xFFFFFFFFL
            }
            // h.toInt() reproduces JS 32-bit signed semantics of Math.imul.
            val idx = abs(h.toInt()) % DIM
            vec[idx] += 1f
        }

        for (t in tokens) {
            add(t)
            if (t.length > 2) add("2:" + t.substring(0, 2))
            if (t.length > 3) add("3:" + t.substring(0, 3))
        }

        var mag = 0.0
        for (v in vec) mag += v * v
        mag = sqrt(mag)
        if (mag < 1e-9) return vec
        for (i in vec.indices) vec[i] = (vec[i] / mag).toFloat()
        return vec
    }
}
