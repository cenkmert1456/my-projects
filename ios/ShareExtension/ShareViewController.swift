import UIKit
import UniformTypeIdentifiers

/// DROP — Share Extension.
///
/// Receives content from the iOS share sheet (Safari, Chrome, Photos, Files,
/// Instagram, TikTok…) and hands it to the DROP app:
///
///   1. Extracts URL / text / images from the share context.
///   2. Writes the payload into the shared App Group container
///      (`group.com.drop.memory/share/<key>/`).
///   3. Opens `drop://share?key=<key>` to wake the main app, which reads the
///      container and opens the DROP capture preview (see SceneDelegate.swift).
///
/// If the App Group isn't configured yet, text/URL payloads are passed
/// inline through the deep link instead, so the extension still works.
class ShareViewController: UIViewController {
    private let appGroup = "group.com.drop.memory"
    private let key = UUID().uuidString
    private var urls: [String] = []
    private var textParts: [String] = []
    private var imageNames: [String] = []
    private var container: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 21/255, green: 19/255, blue: 15/255, alpha: 1)

        let label = UILabel(frame: .zero)
        label.text = "Sending to DROP…"
        label.textColor = .white
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("share/\(key)", isDirectory: true)
        if let container = container {
            try? FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        }

        extractAndHandoff()
    }

    // MARK: - Extraction

    private func extractAndHandoff() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            cancel()
            return
        }
        let group = DispatchGroup()
        for item in items {
            guard let providers = item.attachments else { continue }
            for provider in providers {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { result, _ in
                        defer { group.leave() }
                        if let url = result as? URL { self.urls.append(url.absoluteString) }
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { result, _ in
                        defer { group.leave() }
                        if let text = result as? String { self.textParts.append(text) }
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { result, _ in
                        defer { group.leave() }
                        if let url = result as? URL {
                            if let name = self.storeImage(from: url) { self.imageNames.append(name) }
                        } else if let image = result as? UIImage, let temp = image.saveToTemp() {
                            if let name = self.storeImage(from: temp) { self.imageNames.append(name) }
                        }
                    }
                }
            }
        }
        group.notify(queue: .main) { [weak self] in
            self?.finish()
        }
    }

    private func storeImage(from url: URL) -> String? {
        guard let data = try? Data(contentsOf: url), let container = container else { return nil }
        let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
        let name = "img-\(UUID().uuidString).\(ext)"
        let dest = container.appendingPathComponent(name)
        guard (try? data.write(to: dest)) != nil else { return nil }
        return name
    }

    // MARK: - Handoff

    private func finish() {
        // Safari shares both the URL and the page text — prefer the URL.
        let text: String?
        if !urls.isEmpty {
            text = urls.joined(separator: "\n")
        } else {
            let joined = textParts.joined(separator: "\n")
            text = joined.isEmpty ? nil : joined
        }
        if text == nil && imageNames.isEmpty {
            cancel()
            return
        }

        // Persist the full payload for the main app.
        var payload: [String: Any] = [:]
        if let text = text { payload["text"] = text }
        if !imageNames.isEmpty { payload["images"] = imageNames }
        if let container = container,
           let data = try? JSONSerialization.data(withJSONObject: payload) {
            try? data.write(to: container.appendingPathComponent("payload.json"))
        }

        // Wake the main app. Include an inline text copy so the handoff works
        // even before the App Group entitlement is configured.
        var comps = URLComponents()
        comps.scheme = "drop"
        comps.host = "share"
        var query = [URLQueryItem(name: "key", value: key)]
        if let text = text {
            query.append(URLQueryItem(name: "text", value: String(text.prefix(1500))))
        }
        comps.queryItems = query

        guard let url = comps.url else {
            cancel()
            return
        }
        extensionContext?.open(url) { success in
            DispatchQueue.main.async {
                if success {
                    self.extensionContext?.completeRequest(returningItems: nil)
                } else {
                    self.cancel(with: "DROP couldn't be opened. Make sure it's installed.")
                }
            }
        }
    }

    private func cancel(with message: String? = nil) {
        let alert = UIAlertController(
            title: "Couldn't send to DROP",
            message: message ?? "The item couldn't be read.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            self.extensionContext?.completeRequest(returningItems: nil)
        })
        present(alert, animated: true, completion: nil)
    }
}

private extension UIImage {
    /// Writes the image to a temp file so it can be copied into the App Group.
    func saveToTemp() -> URL? {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("drop-share-\(UUID().uuidString).jpg")
        guard let data = jpegData(compressionQuality: 0.9),
              (try? data.write(to: url)) != nil else { return nil }
        return url
    }
}
