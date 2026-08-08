import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    /// Shared App Group container used by the Share Extension.
    private let appGroup = "group.com.drop.memory"

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Cold start via a share handoff (extension → drop://share?key=…).
        for context in connectionOptions.urlContexts {
            handleShareURL(context.url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            handleShareURL(context.url)
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: - Share extension handoff

    private func handleShareURL(_ url: URL) {
        guard url.scheme == "drop", url.host == "share",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let key = comps.queryItems?.first(where: { $0.name == "key" })?.value
        let inlineText = comps.queryItems?.first(where: { $0.name == "text" })?.value
        deliverSharePayload(key: key, inlineText: inlineText)
    }

    private func deliverSharePayload(key: String?, inlineText: String?) {
        var payload: [String: Any] = [:]
        if let inlineText = inlineText, !inlineText.isEmpty {
            payload["text"] = inlineText
        }

        // Read the full payload (text + images) from the App Group container.
        if let key = key,
           let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            let dir = container.appendingPathComponent("share/\(key)", isDirectory: true)
            let jsonURL = dir.appendingPathComponent("payload.json")
            if let data = try? Data(contentsOf: jsonURL),
               let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                if let text = json["text"] as? String, !text.isEmpty { payload["text"] = text }
                if let url = json["url"] as? String { payload["url"] = url }
                if let images = json["images"] as? [String], let first = images.first {
                    let imageURL = dir.appendingPathComponent(first)
                    if let data = try? Data(contentsOf: imageURL) {
                        let ext = (first as NSString).pathExtension.lowercased()
                        let mime = ext == "png" ? "image/png" : "image/jpeg"
                        payload["imageDataUrl"] = "data:\(mime);base64,\(data.base64EncodedString())"
                    }
                }
            }
            // Clean up the transferred payload.
            try? FileManager.default.removeItem(at: dir)
        }

        guard !payload.isEmpty else { return }
        injectSharePayload(payload)
    }

    /// Dispatches the payload into the WebView as a `drop:open-incoming-share`
    /// CustomEvent — the same event the Android share receiver uses, so the web
    /// capture preview opens identically on both platforms.
    private func injectSharePayload(_ payload: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: jsonData, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent('drop:open-incoming-share', { detail: \(json) }))"

        // Retry until the WebView bridge is ready (cold start).
        var attempts = 0
        func tryInject() {
            if let bridge = window?.rootViewController as? CAPBridgeViewController,
               let webView = bridge.webView {
                webView.evaluateJavaScript(script, completionHandler: nil)
            } else if attempts < 20 {
                attempts += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { tryInject() }
            }
        }
        tryInject()
    }
}
