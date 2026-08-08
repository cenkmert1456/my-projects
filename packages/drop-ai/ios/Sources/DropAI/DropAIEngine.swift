import Foundation
import UIKit
import NaturalLanguage
import Vision
import CryptoKit
import Network

#if canImport(FoundationModels)
import FoundationModels
#endif

/// DROP Intelligence engine (iOS).
///
/// Zero-configuration on-device AI:
///   SYSTEM — Apple Foundation Models when available (iOS 26+ devices)
///   LOCAL  — bundled open-weight model (Gemma-class) via the model manager
///   LIGHT / BASIC — Apple Vision OCR + embeddings + deterministic rules
///
/// Users only ever see "DROP Intelligence: Ready". Tiers are internal.
public final class DropAIEngine {

    public static let shared = DropAIEngine()

    // MARK: - Model manifest (bump version to publish an updated model)
    public static let modelVersion = "2026.08.1"
    private static let modelURL = URL(string: "https://cdn.drop.app/models/drop-ai-v\(modelVersion).safetensors")!
    private static let modelSHA256 = "replace-with-real-sha256-of-published-model"
    private static let modelSizeBytes: Int64 = 1_800_000_000

    // MARK: - Public state

    public private(set) var phase = "idle"
    public private(set) var tier = "light"
    public private(set) var progress: Float = 0

    public var onStatus: (([String: Any]) -> Void)?
    public var onProgress: ((Float, String) -> Void)?

    private let defaults = UserDefaults.standard
    private let fileManager = FileManager.default

    private var modelDir: URL {
        let dir = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("drop-ai", isDirectory: true)
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    private var installedURL: URL { modelDir.appendingPathComponent("model-v\(DropAIEngine.modelVersion).bin") }
    private var partURL: URL { modelDir.appendingPathComponent("model-v\(DropAIEngine.modelVersion).bin.part") }

    private init() {}

    public func statusMap() -> [String: Any] {
        [
            "phase": phase,
            "tier": phase == "idle" ? NSNull() : tier,
            "onDevice": true,
            "progress": progress,
            "label": NSNull(),
        ]
    }

    // MARK: - Prepare (automatic capability detection + provisioning)

    public func prepare(completion: @escaping (Bool) -> Void) {
        Task {
            setPhase("detecting")
            let detected = detectTier()
            let ok: Bool
            switch detected {
            case .system:
                tier = "system"
                ok = true
            case .local:
                tier = "local"
                ok = await provisionLocalModel()
            case .light:
                tier = "light"
                ok = true
            case .basic:
                tier = "basic"
                ok = true
            }
            await MainActor.run { completion(ok) }
        }
    }

    private enum Tier { case system, local, light, basic }

    private func detectTier() -> Tier {
        if systemAI() != nil { return .system }
        let memoryGB = ProcessInfo.processInfo.physicalMemory / 1_000_000_000
        if #available(iOS 16.0, *), memoryGB >= 6, ProcessInfo.processInfo.isiOSAppOnMac == false {
            return .local
        }
        return memoryGB >= 3 ? .light : .basic
    }

    private func provisionLocalModel() async -> Bool {
        do {
            let ok = try await ensureModel { p, label in
                self.progress = p
                self.setPhase("downloading")
                self.onProgress?(p, label)
            }
            if ok {
                setPhase("ready")
            } else {
                tier = "light"
                setPhase("ready")
            }
            return ok
        } catch ModelManagerError.needsConfirmation {
            phase = "error"
            onStatus?(statusMap())
            return false
        } catch {
            tier = "light"
            setPhase("ready")
            return false
        }
    }

    private func setPhase(_ p: String) {
        phase = p
        if p == "ready" { progress = 1 }
        onStatus?(statusMap())
    }

    // MARK: - OCR (Apple Vision, offline)

    public func ocr(_ imageDataURL: String) async -> (text: String, language: String?)? {
        guard let data = decodeDataURL(imageDataURL), let image = UIImage(data: data),
              let cgImage = image.cgImage else { return nil }
        return await withCheckedContinuation { cont in
            let request = VNRecognizeTextRequest { req, _ in
                guard let observations = req.results as? [VNRecognizedTextObservation] else {
                    cont.resume(returning: nil)
                    return
                }
                let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if text.isEmpty {
                    cont.resume(returning: nil)
                } else {
                    cont.resume(returning: (text, nil))
                }
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US", "tr-TR", "de-DE", "fr-FR", "es-ES", "it-IT", "ja-JP", "ko-KR", "ar-SA"]
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            try? handler.perform([request])
        }
    }

    // MARK: - Analysis

    public func analyzeImage(_ imageDataURL: String) async -> [String: Any]? {
        let ocrResult = await ocr(imageDataURL)
        let ocrText = ocrResult?.text ?? ""

        // Tier A: Apple Foundation Models with strict structured JSON.
        if tier == "system", let json = await systemAI()?(buildVisionPrompt(ocrText)) {
            if let analysis = parseAnalysis(json) { return ["analysis": analysis] }
        }
        // Tier B: local runtime hook (LiteRT / Metal implementation point).
        if tier == "local", isModelInstalled(), let json = LocalRuntime.generate(buildVisionPrompt(ocrText)) {
            if let analysis = parseAnalysis(json) { return ["analysis": analysis] }
        }

        // Tiers C/D: deterministic rules over OCR text.
        let result = DeterministicAnalyzer.analyze(text: ocrText, fileName: nil, kind: "screenshot", url: nil)
        return [
            "analysis": [
                "title": result.title,
                "summary": result.summary,
                "category": result.category,
                "subcategory": result.subcategory as Any,
                "keywords": result.keywords,
                "ocrSummary": String(ocrText.prefix(500)),
                "actions": result.suggestedAction.map { [$0] } ?? [],
                "confidence": result.confidence,
                "language": NSNull(),
            ],
        ]
    }

    public func generateText(prompt: String, contextText: String?) async -> String? {
        let full = contextText.map { "\($0)\n\n\(prompt)" } ?? prompt
        if tier == "system", let out = await systemAI()?(full) { return out.trimmingCharacters(in: .whitespacesAndNewlines) }
        if tier == "local", isModelInstalled(), let out = LocalRuntime.generate(full) { return out.trimmingCharacters(in: .whitespacesAndNewlines) }
        return nil
    }

    public func answerQuestion(question: String, contextText: String) async -> String? {
        let prompt = """
        Answer the question using ONLY the saved content below. If the content \
        doesn't contain the answer, say so. Be concise.

        Saved content:
        \(contextText)

        Question: \(question)
        """
        return await generateText(prompt: prompt, contextText: nil)
    }

    // MARK: - Embeddings

    /// Deterministic 128-dim FNV-1a n-gram embedding — the same algorithm as
    /// the server, so on-device vectors feed server-side semantic search.
    public func embed(_ text: String) -> [Float] {
        NativeEmbed.embed(text)
    }

    // MARK: - Policy / model management

    public var wifiOnly: Bool {
        get { defaults.object(forKey: "drop_ai.wifi_only") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "drop_ai.wifi_only") }
    }
    public var storageBytes: Int64 { (try? installedURL.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0 }
    public func isModelInstalled() -> Bool { fileManager.fileExists(atPath: installedURL.path) && storageBytes == DropAIEngine.modelSizeBytes }

    @discardableResult
    public func removeModel() -> Bool {
        let removed = (try? fileManager.removeItem(at: installedURL)) != nil || !fileManager.fileExists(atPath: installedURL.path)
        try? fileManager.removeItem(at: partURL)
        if removed, tier == "local" {
            tier = "light"
            setPhase("ready")
        }
        return removed
    }

    // MARK: - Model download (resumable, verified, atomic)

    private func ensureModel(onProgress: @escaping (Float, String) -> Void) async throws -> Bool {
        if isModelInstalled() { return true }

        // Wi-Fi policy.
        let onWifi = await currentIsWifi()
        if wifiOnly && !onWifi { throw ModelManagerError.needsConfirmation }

        let existing = (try? partURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        var request = URLRequest(url: DropAIEngine.modelURL)
        request.timeoutInterval = 60
        if existing > 0 {
            request.setValue("bytes=\(existing)-", forHTTPHeaderField: "Range")
        }
        let (downloadURL, response) = try await URLSession.shared.download(for: request)
        defer { try? fileManager.removeItem(at: downloadURL) }
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) || http.statusCode == 206 else {
            throw ModelManagerError.downloadFailed
        }

        // Merge partial + fresh chunk.
        let merged = partURL
        if existing > 0, let existingData = try? Data(contentsOf: partURL) {
            var data = existingData
            if let chunk = try? Data(contentsOf: downloadURL) { data.append(chunk) }
            try data.write(to: merged)
        } else {
            try fileManager.moveItem(at: downloadURL, to: merged)
        }
        onProgress(1.0, "Downloading AI model")

        // SHA-256 verification.
        let digest = try sha256(file: merged)
        guard digest == DropAIEngine.modelSHA256.lowercased() else {
            try? fileManager.removeItem(at: merged)
            throw ModelManagerError.checksumMismatch
        }
        // Atomic install.
        try fileManager.moveItem(at: merged, to: installedURL)
        return true
    }

    private func sha256(file: URL) throws -> String {
        let data = try Data(contentsOf: file)
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private func currentIsWifi() async -> Bool {
        return await withCheckedContinuation { cont in
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { path in
                let ok = path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet)
                monitor.cancel()
                cont.resume(returning: ok)
            }
            monitor.start(queue: DispatchQueue.global())
        }
    }

    // MARK: - System AI (Apple Foundation Models)

    private func systemAI() -> ((String) async -> String?)? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return { prompt in
                do {
                    let model = try FoundationModels.GenerativeModel(
                        name: "AppleFoundationModel_1.0_GeneralPurpose",
                        model: .small
                    )
                    let response = try await model.generateContent(prompt)
                    return response.text
                } catch {
                    return nil
                }
            }
        }
        #endif
        return nil
    }

    private func buildVisionPrompt(_ ocrText: String) -> String {
        """
        You are the DROP intelligence engine. Analyze this screenshot and return \
        STRICT JSON only, no prose: {"title":"...","summary":"...","category":"...",\
        "subcategory":"...","keywords":[...],"products":[...],"brands":[...],"places":[...],\
        "peopleMentioned":[...],"dates":[...],"prices":[...],"currency":"...","events":[...],\
        "actions":[...],"confidence":0.0,"language":"..."} \
        Category must be one of: Products, Places, Travel, Food, Entertainment, Documents, \
        Receipts, Events, Ideas, Work, Study, People, Shopping, Reservations, Tickets, \
        Finance, Inspiration, Other.

        OCR text of the screenshot:
        \(ocrText)
        """
    }

    private func parseAnalysis(_ json: String) -> [String: Any]? {
        guard let data = json.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }
        func arr(_ key: String) -> [String]? {
            (obj[key] as? [String])?.filter { !$0.isEmpty }
        }
        var out: [String: Any] = [:]
        for key in ["title", "summary", "category", "subcategory", "currency", "language"] {
            if let v = obj[key] as? String, !v.isEmpty { out[key] = v }
        }
        for key in ["keywords", "products", "brands", "places", "peopleMentioned", "dates", "prices", "events", "actions"] {
            if let v = arr(key), !v.isEmpty { out[key] = v }
        }
        if let c = obj["confidence"] as? Double { out["confidence"] = c }
        return out.isEmpty ? nil : out
    }

    private func decodeDataURL(_ dataURL: String) -> Data? {
        guard let comma = dataURL.firstIndex(of: ",") else { return nil }
        let base64 = String(dataURL[dataURL.index(after: comma)...])
        return Data(base64Encoded: base64)
    }
}

enum ModelManagerError: Error {
    case needsConfirmation
    case downloadFailed
    case checksumMismatch
}

/// Optional on-device multimodal runtime hook (LiteRT-LM / Gemma 3n via Metal).
private enum LocalRuntime {
    static func generate(_ prompt: String) -> String? {
        nil // integrate your LiteRT-LM / CoreML runtime here when shipping a bundled model
    }
}
