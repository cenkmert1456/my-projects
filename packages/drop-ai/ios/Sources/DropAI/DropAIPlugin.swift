import Capacitor

/// DropAI — Capacitor bridge between the React app and the native engine.
/// Clean surface: prepare, getStatus, ocr, analyzeImage, getEmbedding,
/// generateText, answerQuestion, policy + model management, and the
/// `status` / `downloadProgress` events.
@objc(DropAIPlugin)
public class DropAIPlugin: CAPPlugin {

    public override func load() {
        DropAIEngine.shared.onStatus = { [weak self] status in
            self?.notifyListeners("status", data: ["status": status])
        }
        DropAIEngine.shared.onProgress = { [weak self] progress, label in
            self?.notifyListeners("downloadProgress", data: ["progress": progress, "label": label])
        }
    }

    @objc func prepare(_ call: CAPPluginCall) {
        DropAIEngine.shared.prepare { ok in
            call.resolve(["ok": ok])
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(["status": DropAIEngine.shared.statusMap()])
    }

    @objc func getEmbedding(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("Missing text")
            return
        }
        call.resolve(["embedding": DropAIEngine.shared.embed(text)])
    }

    @objc func ocr(_ call: CAPPluginCall) {
        guard let image = call.getString("image") else {
            call.resolve()
            return
        }
        Task {
            let result = await DropAIEngine.shared.ocr(image)
            await MainActor.run {
                if let result {
                    call.resolve(["text": result.text, "language": result.language as Any])
                } else {
                    call.resolve()
                }
            }
        }
    }

    @objc func analyzeImage(_ call: CAPPluginCall) {
        guard let image = call.getString("image") else {
            call.resolve()
            return
        }
        Task {
            let result = await DropAIEngine.shared.analyzeImage(image)
            await MainActor.run {
                if let result {
                    call.resolve(result)
                } else {
                    call.resolve(["analysis": NSNull()])
                }
            }
        }
    }

    @objc func generateText(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt") else {
            call.resolve()
            return
        }
        let contextText = call.getString("context")
        Task {
            let text = await DropAIEngine.shared.generateText(prompt: prompt, contextText: contextText)
            await MainActor.run { call.resolve(["text": text as Any]) }
        }
    }

    @objc func answerQuestion(_ call: CAPPluginCall) {
        guard let question = call.getString("question") else {
            call.resolve()
            return
        }
        let contextText = call.getString("context") ?? ""
        Task {
            let answer = await DropAIEngine.shared.answerQuestion(question: question, contextText: contextText)
            await MainActor.run { call.resolve(["answer": answer as Any]) }
        }
    }

    @objc func setPolicy(_ call: CAPPluginCall) {
        DropAIEngine.shared.wifiOnly = call.getBool("wifiOnly", true)
        call.resolve(["ok": true])
    }

    @objc func getPolicy(_ call: CAPPluginCall) {
        call.resolve(["wifiOnly": DropAIEngine.shared.wifiOnly])
    }

    @objc func removeModel(_ call: CAPPluginCall) {
        call.resolve(["ok": DropAIEngine.shared.removeModel()])
    }

    @objc func getStorageInfo(_ call: CAPPluginCall) {
        let bytes = DropAIEngine.shared.storageBytes
        if bytes <= 0 {
            call.resolve()
            return
        }
        call.resolve(["sizeBytes": bytes])
    }
}
