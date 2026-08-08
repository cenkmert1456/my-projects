package com.drop.ai

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * DROP Intelligence engine — zero-configuration on-device AI.
 *
 * prepare() automatically detects the best engine for the device:
 *   SYSTEM → Gemini Nano (when present)              — ready immediately
 *   LOCAL  → downloads the bundled model once        — ready after provisioning
 *   LIGHT / BASIC → OCR + embeddings + rules          — ready immediately
 *
 * Every tier keeps the product fully functional. Models, tiers and providers
 * are internal; users only ever see "DROP Intelligence: Ready".
 */
class DropAIEngine private constructor(private val context: Context) {

    companion object {
        @Volatile private var instance: DropAIEngine? = null
        fun init(context: Context): DropAIEngine =
            instance ?: synchronized(this) {
                instance ?: DropAIEngine(context.applicationContext).also { instance = it }
            }
        fun get(): DropAIEngine? = instance
    }

    private val scope = CoroutineScope(Dispatchers.Default)
    private val model = ModelManager(context)

    @Volatile var tier: String = "light"
        private set
    @Volatile var phase: String = "idle"
        private set
    @Volatile var progress: Float = 0f
        private set
    @Volatile var label: String = ""
        private set

    /** Status callback (phase/tier/progress) — wired to plugin events. */
    var onStatus: ((status: Map<String, Any?>) -> Unit)? = null
    var onProgress: ((progress: Float, label: String) -> Unit)? = null

    fun statusMap(): Map<String, Any?> = mapOf(
        "phase" to phase,
        "tier" to (if (phase == "idle") null else tier),
        "onDevice" to true,
        "progress" to progress,
        "label" to label,
    )

    fun prepare(callback: (Boolean) -> Unit) {
        scope.launch {
            setPhase("detecting")
            val detected = TierDetector.detect(context)
            val ok = when (detected) {
                DropAITier.SYSTEM -> {
                    tier = "system"
                    true
                }
                DropAITier.LOCAL -> provisionLocalModel()
                else -> {
                    tier = if (detected == DropAITier.LIGHT) "light" else "basic"
                    true
                }
            }
            withContext(Dispatchers.Main) { callback(ok) }
        }
    }

    private suspend fun provisionLocalModel(): Boolean {
        tier = "local"
        return try {
            val ok = model.ensureModel { p ->
                progress = p
                setPhase("downloading")
                onProgress?.invoke(p, "Downloading AI model")
            }
            if (ok) {
                setPhase("ready")
            } else {
                // Download failed — degrade to the lightweight pipeline. The
                // app stays fully functional (OCR, embeddings, search).
                tier = "light"
                setPhase("ready")
            }
            ok
        } catch (e: NeedsConfirmationException) {
            phase = "error"
            label = "needs_confirmation"
            onStatus?.invoke(statusMap())
            false
        } catch (e: Exception) {
            tier = "light"
            setPhase("ready")
            false
        }
    }

    fun launchOn(block: suspend () -> Unit) {
        scope.launch { block() }
    }

    private fun setPhase(p: String) {
        phase = p
        if (p == "ready") progress = 1f
        onStatus?.invoke(statusMap())
    }

    // ------------------------------------------------------------------
    // Capabilities
    // ------------------------------------------------------------------

    suspend fun ocr(dataUrl: String): Map<String, Any?>? {
        val res = DropOCR.recognize(dataUrl) ?: return null
        return mapOf("text" to res.first, "language" to res.second)
    }

    suspend fun analyzeImage(dataUrl: String): Map<String, Any?>? {
        val ocrResult = DropOCR.recognize(dataUrl)
        val ocrText = ocrResult?.first.orEmpty()
        val fileName = null

        // Tier A: system AI with structured JSON output.
        if (tier == "system") {
            val json = SystemAI.generateStructured(buildVisionPrompt(ocrText))
            json?.let { parseAnalysis(it) }?.let { return it }
        }
        // Tier B: local multimodal model (LiteRT-LM runtime hook).
        if (tier == "local" && model.isInstalled()) {
            LocalRuntime.generate(buildVisionPrompt(ocrText))?.let { parseAnalysis(it) }?.let { return it }
        }

        // Tiers C/D + fallbacks: deterministic rules over OCR text.
        val result = DeterministicAnalyzer.analyze(
            text = ocrText,
            fileName = fileName,
            kind = "screenshot",
            url = null,
        )
        return mapOf(
            "analysis" to mapOf(
                "title" to result.title,
                "summary" to result.summary,
                "category" to result.category,
                "subcategory" to result.subcategory,
                "keywords" to result.keywords,
                "ocrSummary" to ocrText.take(500),
                "actions" to listOfNotNull(result.suggestedAction),
                "confidence" to result.confidence,
                "language" to result.language,
            ),
        )
    }

    suspend fun generateText(prompt: String, contextText: String?): String? {
        val full = if (contextText.isNullOrBlank()) prompt else "$contextText\n\n$prompt"
        if (tier == "system") {
            SystemAI.generateStructured(full)?.let { return it.trim() }
        }
        if (tier == "local" && model.isInstalled()) {
            LocalRuntime.generate(full)?.let { return it.trim() }
        }
        return null
    }

    suspend fun answerQuestion(question: String, contextText: String): String? {
        val prompt = """
            Answer the question using ONLY the saved content below. If the
            content doesn't contain the answer, say so. Be concise.

            Saved content:
            $contextText

            Question: $question
        """.trimIndent()
        return generateText(prompt, null)
    }

    fun embed(text: String): List<Float> = NativeEmbed.embed(text).toList()

    fun setWifiOnly(value: Boolean) = model.setWifiOnly(value)
    fun getWifiOnly(): Boolean = model.wifiOnly()
    fun storageBytes(): Long = model.storageSize()
    fun removeModel(): Boolean {
        val ok = model.removeModel()
        if (ok && tier == "local") {
            tier = "light"
            setPhase("ready")
        }
        return ok
    }

    // ------------------------------------------------------------------
    // Parsing
    // ------------------------------------------------------------------

    private fun buildVisionPrompt(ocrText: String): String = """
        You are the DROP intelligence engine. Analyze this screenshot and
        return STRICT JSON only, no prose, matching exactly:
        {"title":"...","summary":"...","category":"...","subcategory":"...",
         "keywords":[...],"products":[...],"brands":[...],"places":[...],
         "peopleMentioned":[...],"dates":[...],"prices":[...],"currency":"...",
         "events":[...],"actions":[...],"confidence":0.0,"language":"..."}
        Category must be one of: Products, Places, Travel, Food, Entertainment,
        Documents, Receipts, Events, Ideas, Work, Study, People, Shopping,
        Reservations, Tickets, Finance, Inspiration, Other.

        OCR text of the screenshot:
        $ocrText
    """.trimIndent()

    private fun parseAnalysis(json: String): Map<String, Any?>? {
        return try {
            val raw = json.substringAfter('{', json).let { "{$it" }
            val end = raw.lastIndexOf('}')
            val obj = JSONObject(raw.substring(0, end + 1))
            fun arr(key: String): List<String>? = obj.optJSONArray(key)?.let { arr ->
                (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotEmpty() } }
            }
            mapOf(
                "analysis" to mapOf(
                    "title" to obj.optString("title").takeIf { it.isNotEmpty() },
                    "summary" to obj.optString("summary").takeIf { it.isNotEmpty() },
                    "category" to obj.optString("category").takeIf { it.isNotEmpty() },
                    "subcategory" to obj.optString("subcategory").takeIf { it.isNotEmpty() },
                    "keywords" to arr("keywords"),
                    "products" to arr("products"),
                    "brands" to arr("brands"),
                    "places" to arr("places"),
                    "peopleMentioned" to arr("peopleMentioned"),
                    "dates" to arr("dates"),
                    "prices" to arr("prices"),
                    "currency" to obj.optString("currency").takeIf { it.isNotEmpty() },
                    "events" to arr("events"),
                    "actions" to arr("actions"),
                    "confidence" to obj.optDouble("confidence", 0.6),
                    "language" to obj.optString("language").takeIf { it.isNotEmpty() },
                    "ocrSummary" to (obj.optString("summary").takeIf { it.isNotEmpty() }),
                ),
            )
        } catch (e: Exception) {
            null
        }
    }
}

/** Optional on-device multimodal runtime (LiteRT-LM / Gemma 3n E2B) hook. */
object LocalRuntime {
    fun generate(prompt: String): String? {
        // Integrate the LiteRT-LM / Google AI Edge runtime here when you ship
        // with a bundled model (see build.gradle). Reflection keeps the module
        // compiling without the dependency; returns null → graceful fallback.
        return try {
            val cls = Class.forName("com.drop.ai.LocalModelRuntime")
            val method = cls.getMethod("generate", String::class.java)
            method.invoke(null, prompt) as? String
        } catch (e: Throwable) {
            null
        }
    }
}
