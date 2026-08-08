package com.drop.ai

/**
 * Deterministic structured analyzer — the same rule family as the server's
 * DemoProvider (src/convex/ai/demo.ts). Runs instantly on any device with no
 * model, no network and no keys: OCR text in → structured understanding out.
 */
object DeterministicAnalyzer {

    private val FLIGHT_RE = Regex("""\b(flight|airline|boarding|departure|terminal|gate|booking ref|pnr|e-ticket)\b""", RegexOption.IGNORE_CASE)
    private val RECEIPT_RE = Regex("""\b(receipt|bill|invoice|order no|total|payment|refund|warranty|due)\b""", RegexOption.IGNORE_CASE)
    private val EVENT_RE = Regex("""\b(ticket|concert|festival|show|match|gig|event|reservation|booked)\b""", RegexOption.IGNORE_CASE)
    private val BOOK_RE = Regex("""\b(book|read|goodreads|author|novel|reading)\b""", RegexOption.IGNORE_CASE)
    private val ENTERTAIN_RE = Regex("""\b(series|netflix|film|movie|show|episode|season|documentary|album|podcast)\b""", RegexOption.IGNORE_CASE)
    private val PLACE_RE = Regex("""\b(hotel|restaurant|trattoria|pizzeria|café|cafe|bar|hostel|museum|airbnb|booking|ristorante)\b""", RegexOption.IGNORE_CASE)
    private val IDEA_RE = Regex("""\b(idea|inspiration|moodboard|concept|wish|plan|apartment|decor|interior)\b""", RegexOption.IGNORE_CASE)
    private val SHOP_RE = Regex("""\b(price|€|£|\$|¥|₺|deal|offer|discount|shop|store)\b""", RegexOption.IGNORE_CASE)
    private val PRICE_RE = Regex("""([€£$¥₺])\s?(\d{1,3}(?:[.,]\d{2,3})*)""")
    private val DATE_RE = Regex(
        """\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{1,2}))?[.,]?\s*(\d{4})?""",
        RegexOption.IGNORE_CASE,
    )
    private val URL_RE = Regex("""https?://\S+""")
    private val BRAND_RE = Regex(
        """\b(nike|adidas|apple|sony|samsung|lg|lenovo|dell|hp|asus|media ?markt|ikea|zara|h&m|amazon|spotify|netflix|prime video|disney\+|airbnb|booking|turkish airlines|ryanair|lufthansa)\b""",
        RegexOption.IGNORE_CASE,
    )

    data class Entity(val type: String, val value: String, val confidence: Float)

    data class Result(
        val title: String,
        val summary: String,
        val category: String,
        val subcategory: String?,
        val keywords: List<String>,
        val entities: List<Entity>,
        val language: String?,
        val confidence: Float,
        val suggestedAction: String?,
    )

    fun analyze(text: String, fileName: String?, kind: String, url: String?): Result {
        val haystack = "$text $fileName ${url ?: ""}"
        val entities = mutableListOf<Entity>()
        val push = { type: String, value: String, confidence: Float ->
            entities.add(Entity(type, value.take(120), confidence))
        }

        BRAND_RE.find(haystack)?.let { push("brand", it.value, 0.8f) }
        PRICE_RE.find(haystack)?.let { push("price", it.value, 0.75f) }
        DATE_RE.find(haystack)?.let { push("date", it.value, 0.7f) }
        URL_RE.find(haystack)?.let { push("url", it.value, 0.9f) }

        val category: String
        val subcategory: String?
        when {
            FLIGHT_RE.containsMatchIn(haystack) -> { category = "Travel"; subcategory = "Flights" }
            RECEIPT_RE.containsMatchIn(haystack) -> { category = "Receipts"; subcategory = "Utilities" }
            EVENT_RE.containsMatchIn(haystack) -> { category = "Events"; subcategory = "Concerts" }
            BOOK_RE.containsMatchIn(haystack) -> { category = "Entertainment"; subcategory = "Books" }
            ENTERTAIN_RE.containsMatchIn(haystack) -> { category = "Entertainment"; subcategory = "TV Shows" }
            PLACE_RE.containsMatchIn(haystack) -> {
                category = "Places"
                subcategory = if (Regex("""hotel|hostel|airbnb|booking""", RegexOption.IGNORE_CASE).containsMatchIn(haystack)) "Hotels" else "Restaurants"
            }
            IDEA_RE.containsMatchIn(haystack) -> { category = "Ideas"; subcategory = "Home" }
            SHOP_RE.containsMatchIn(haystack) -> { category = "Products"; subcategory = "Shopping" }
            kind == "document" -> { category = "Documents"; subcategory = "PDF" }
            kind == "link" -> { category = "Inspiration"; subcategory = "Web" }
            else -> { category = "Other"; subcategory = null }
        }

        val title = guessTitle(text, fileName, kind, url)
        val keywords = Regex("""[a-zà-ÿ0-9]{3,}""", RegexOption.IGNORE_CASE)
            .findAll(haystack)
            .map { it.value.lowercase() }
            .filter { it !in STOP_WORDS }
            .distinct()
            .take(12)
            .toList()

        val action = when (category) {
            "Products" -> "Track price"
            "Places" -> "Open in Maps"
            "Travel", "Events" -> "Add to calendar"
            "Receipts" -> "Set reminder"
            "Entertainment" -> if (kind == "link") "Add to Watchlist" else null
            else -> null
        }

        return Result(
            title = title,
            summary = text.take(300),
            category = category,
            subcategory = subcategory,
            keywords = keywords,
            entities = entities,
            language = null,
            confidence = 0.6f,
            suggestedAction = action,
        )
    }

    private fun guessTitle(text: String, fileName: String?, kind: String, url: String?): String {
        if (!fileName.isNullOrBlank()) {
            return fileName.replace(Regex("""\.[a-z0-9]+$""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""[_-]+"""), " ").trim().take(60)
                .ifEmpty { "New drop" }
        }
        if (!url.isNullOrBlank()) {
            return try {
                val host = URL_UTIL_HOST(url) ?: url
                "Saved link — $host"
            } catch (e: Exception) {
                "Saved link"
            }
        }
        val first = text.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
        return first.take(48).ifEmpty { "New drop" }
    }

    private fun URL_UTIL_HOST(url: String): String? = try {
        java.net.URI(url).host?.removePrefix("www.")
    } catch (e: Exception) {
        null
    }

    private val STOP_WORDS = setOf(
        "the", "and", "for", "with", "from", "this", "that", "https", "http",
    )
}
