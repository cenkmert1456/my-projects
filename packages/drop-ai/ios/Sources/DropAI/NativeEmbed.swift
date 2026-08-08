import Foundation

/// Native mirror of `demoEmbedText` in src/convex/ai/demo.ts.
///
/// The same deterministic 128-dim FNV-1a character n-gram algorithm used by
/// the server, so on-device vectors are cosine-comparable with server-side
/// vectors — semantic search works with zero configuration.
public enum NativeEmbed {
    private static let dim = 128
    private static let invalidChars = CharacterSet.alphanumerics
        .union(CharacterSet(charactersIn: " \u{20ac}$\u{00a3}\u{00a5}"))
        .inverted

    public static func embed(_ text: String) -> [Float] {
        var vec = [Float](repeating: 0, count: dim)
        let clean = text.lowercased()
            .components(separatedBy: invalidChars)
            .joined(separator: " ")
        let tokens = clean.split(whereSeparator: \.isWhitespace).map(String.init)

        func add(_ key: String) {
            var h: UInt64 = 2_166_136_261
            for scalar in key.utf16 {
                h ^= UInt64(scalar)
                h &*= 16_777_619
            }
            // Reproduce JS 32-bit signed semantics: take low 32 bits as signed.
            let signed = Int32(truncatingIfNeeded: UInt32(truncatingIfNeeded: h))
            let idx = abs(signed) % Int32(dim)
            vec[Int(idx)] += 1
        }

        for t in tokens {
            add(t)
            if t.count > 2 { add("2:" + String(t.prefix(2))) }
            if t.count > 3 { add("3:" + String(t.prefix(3))) }
        }

        let mag = sqrt(vec.reduce(0) { $0 + $1 * $1 })
        guard mag > 1e-9 else { return vec }
        return vec.map { $0 / mag }
    }
}
