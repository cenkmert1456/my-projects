import Foundation

/// Deterministic structured analyzer — same rule family as the server's
/// DemoProvider. Instant, offline, no model.
public enum DeterministicAnalyzer {

    public struct Entity {
        public let type: String
        public let value: String
        public let confidence: Float
    }

    public struct Result {
        public let title: String
        public let summary: String
        public let category: String
        public let subcategory: String?
        public let keywords: [String]
        public let entities: [Entity]
        public let confidence: Float
        public let suggestedAction: String?
    }

    public static func analyze(text: String, fileName: String?, kind: String, url: String?) -> Result {
        let haystack = [text, fileName ?? "", url ?? ""].joined(separator: " ")
        var entities: [Entity] = []

        if let m = haystack.range(of: #"\b(nike|adidas|apple|sony|samsung|lg|lenovo|dell|hp|asus|ikea|zara|h&m|amazon|spotify|netflix|airbnb|booking)\b"#, options: [.regularExpression, .caseInsensitive]) {
            entities.append(Entity(type: "brand", value: String(haystack[m]), confidence: 0.8))
        }
        if let m = haystack.range(of: #"([€£$¥₺])\s?(\d{1,3}(?:[.,]\d{2,3})*)"#, options: .regularExpression) {
            entities.append(Entity(type: "price", value: String(haystack[m]), confidence: 0.75))
        }
        if let m = haystack.range(of: #"\b(january|february|march|april|may|june|july|august|september|october|november|december)\b"#, options: [.regularExpression, .caseInsensitive]) {
            entities.append(Entity(type: "date", value: String(haystack[m]), confidence: 0.7))
        }
        if let m = haystack.range(of: #"https?://\S+"#, options: .regularExpression) {
            entities.append(Entity(type: "url", value: String(haystack[m]), confidence: 0.9))
        }

        func has(_ pattern: String) -> Bool {
            haystack.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
        }

        let category: String
        let subcategory: String?
        switch true {
        case has(#"\b(flight|airline|boarding|departure|terminal|gate|booking ref|pnr|e-ticket)\b"#):
            category = "Travel"; subcategory = "Flights"
        case has(#"\b(receipt|bill|invoice|order no|total|payment|refund|warranty|due)\b"#):
            category = "Receipts"; subcategory = "Utilities"
        case has(#"\b(ticket|concert|festival|show|match|gig|event|reservation|booked)\b"#):
            category = "Events"; subcategory = "Concerts"
        case has(#"\b(book|read|goodreads|author|novel|reading)\b"#):
            category = "Entertainment"; subcategory = "Books"
        case has(#"\b(series|netflix|film|movie|show|episode|season|documentary|album|podcast)\b"#):
            category = "Entertainment"; subcategory = "TV Shows"
        case has(#"\b(hotel|restaurant|trattoria|pizzeria|café|cafe|bar|hostel|museum|airbnb|booking|ristorante)\b"#):
            category = "Places"
            subcategory = has(#"hotel|hostel|airbnb|booking"#) ? "Hotels" : "Restaurants"
        case has(#"\b(idea|inspiration|moodboard|concept|wish|plan|apartment|decor|interior)\b"#):
            category = "Ideas"; subcategory = "Home"
        case has(#"\b(price|€|£|\$|¥|₺|deal|offer|discount|shop|store)\b"#):
            category = "Products"; subcategory = "Shopping"
        case kind == "document":
            category = "Documents"; subcategory = "PDF"
        case kind == "link":
            category = "Inspiration"; subcategory = "Web"
        default:
            category = "Other"; subcategory = nil
        }

        let stopWords: Set<String> = ["the", "and", "for", "with", "from", "this", "that", "https", "http"]
        let keywords = Array(
            haystack
                .lowercased()
                .matches(of: #"[a-zà-ÿ0-9]{3,}"#)
                .map { String(haystack[$0.range]) }
                .filter { !stopWords.contains($0) }
                .prefix(12)
        )

        let action: String?
        switch category {
        case "Products": action = "Track price"
        case "Places": action = "Open in Maps"
        case "Travel", "Events": action = "Add to calendar"
        case "Receipts": action = "Set reminder"
        case "Entertainment": action = kind == "link" ? "Add to Watchlist" : nil
        default: action = nil
        }

        let title = guessTitle(text: text, fileName: fileName, kind: kind, url: url)

        return Result(
            title: title,
            summary: String(text.prefix(300)),
            category: category,
            subcategory: subcategory,
            keywords: keywords,
            entities: entities,
            confidence: 0.6,
            suggestedAction: action
        )
    }

    private static func guessTitle(text: String, fileName: String?, kind: String, url: String?) -> String {
        if let fileName, !fileName.isEmpty {
            let cleaned = fileName
                .replacingOccurrences(of: #"\.[a-z0-9]+$"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: "[_-]+", with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            if !cleaned.isEmpty { return String(cleaned.prefix(60)) }
        }
        if let url, !url.isEmpty {
            if let host = URL(string: url)?.host?.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression) {
                return "Saved link — \(host)"
            }
            return "Saved link"
        }
        let firstLine = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
        let trimmed = firstLine.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "New drop" : String(trimmed.prefix(48))
    }
}
