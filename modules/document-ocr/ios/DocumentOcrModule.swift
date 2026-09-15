import ExpoModulesCore
import Foundation
import PDFKit
import ImageIO
import UIKit

public final class DocumentOcrModule: Module {
  private let worker = DispatchQueue(label: "engineering.brainwaves.document-ocr", qos: .userInitiated)
  private var previews: [URL] = []

  public func definition() -> ModuleDefinition {
    Name("DocumentOcr")
    Function("begin") { () -> Bool in DocumentOcrBridge.begin() }
    Function("cancel") { DocumentOcrBridge.cancel() }
    AsyncFunction("inspectAsync") { (uri: String) throws -> [String: Any] in
      let url = try self.localURL(uri)
      return try self.inspect(url)
    }.runOnQueue(worker)
    AsyncFunction("recognizePageAsync") { (uri: String, page: Int, rotation: Int) throws -> [String: Any] in
      try autoreleasepool {
        let image = try self.orient(self.render(self.localURL(uri), page: page), rotation: rotation)
        guard let resource = Bundle.main.url(forResource: "DocumentOcrModels", withExtension: "bundle")
          ?? Bundle(for: DocumentOcrModule.self).url(forResource: "DocumentOcrModels", withExtension: "bundle"),
          let bundle = Bundle(url: resource),
          let models = bundle.url(forResource: "tessdata", withExtension: nil) else {
          throw DocumentOcrException("DOCUMENT_ENGINE_UNAVAILABLE")
        }
        return try DocumentOcrBridge.recognize(image, models: models.path) as? [String: Any] ?? [:]
      }
    }.runOnQueue(worker)
    AsyncFunction("exportPageAsync") { (uri: String, page: Int, rotation: Int) throws -> String in
      try autoreleasepool {
        let image = try self.orient(self.render(self.localURL(uri), page: page), rotation: rotation)
        guard let bytes = image.jpegData(compressionQuality: 0.95), bytes.count <= 6 * 1024 * 1024 else {
          throw DocumentOcrException("OCR_IMAGE_SIZE")
        }
        return bytes.base64EncodedString()
      }
    }.runOnQueue(worker)
    AsyncFunction("previewPageAsync") { (uri: String, page: Int, rotation: Int) throws -> String in
      try autoreleasepool {
        let image = try self.orient(self.render(self.localURL(uri), page: page), rotation: rotation)
        guard let bytes = image.pngData() else { throw DocumentOcrException("DOCUMENT_CORRUPT") }
        let target = FileManager.default.temporaryDirectory.appendingPathComponent("ocr-preview-\(UUID().uuidString).png")
        try bytes.write(to: target, options: [.atomic, .completeFileProtection])
        self.previews.append(target)
        return target.absoluteString
      }
    }.runOnQueue(worker)
    AsyncFunction("cleanupAsync") {
      defer { DocumentOcrBridge.end() }
      for url in self.previews { try? FileManager.default.removeItem(at: url) }
      self.previews.removeAll()
    }.runOnQueue(worker)
  }

  private func localURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL else { throw DocumentOcrException("DOCUMENT_LOCAL_FILE_REQUIRED") }
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    let directories = [FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0],
      FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]]
    guard directories.contains(where: { resolved.path.hasPrefix($0.resolvingSymlinksInPath().path + "/") }) else {
      throw DocumentOcrException("DOCUMENT_LOCAL_FILE_REQUIRED")
    }
    let size = try resolved.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size > 0 && size <= 20 * 1024 * 1024 else { throw DocumentOcrException("DOCUMENT_SIZE") }
    return resolved
  }

  private func orient(_ image: UIImage, rotation: Int) throws -> UIImage {
    guard [0, 90, 180, 270].contains(rotation) else { throw DocumentOcrException("DOCUMENT_ROTATION") }
    let factor = min(1, 2500 / max(image.size.width, image.size.height))
    let sourceSize = CGSize(width: image.size.width * factor, height: image.size.height * factor)
    let size = rotation % 180 == 0 ? sourceSize : CGSize(width: sourceSize.height, height: sourceSize.width)
    let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size))
      context.cgContext.translateBy(x: size.width / 2, y: size.height / 2)
      context.cgContext.rotate(by: CGFloat(rotation) * .pi / 180)
      image.draw(in: CGRect(x: -sourceSize.width / 2, y: -sourceSize.height / 2, width: sourceSize.width, height: sourceSize.height))
    }
  }

  private func pdf(_ url: URL) throws -> PDFDocument? {
    let file = try FileHandle(forReadingFrom: url)
    defer { try? file.close() }
    let prefix = try file.read(upToCount: 5)
    guard prefix == Data("%PDF-".utf8) else { return nil }
    guard let document = PDFDocument(url: url) else { throw DocumentOcrException("DOCUMENT_CORRUPT") }
    guard !document.isEncrypted else { throw DocumentOcrException("DOCUMENT_PASSWORD") }
    guard document.pageCount > 0 && document.pageCount <= 20 else { throw DocumentOcrException("DOCUMENT_PAGES") }
    return document
  }

  private func inspect(_ url: URL) throws -> [String: Any] {
    let bytes = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    if let document = try pdf(url) { return ["mime": "application/pdf", "bytes": bytes, "pages": document.pageCount] }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let kind = CGImageSourceGetType(source) as String?,
      kind == "public.jpeg" || kind == "public.png" else { throw DocumentOcrException("DOCUMENT_UNSUPPORTED") }
    guard CGImageSourceGetCount(source) == 1 else { throw DocumentOcrException("DOCUMENT_UNSUPPORTED") }
    return ["mime": kind == "public.jpeg" ? "image/jpeg" : "image/png", "bytes": bytes, "pages": 1]
  }

  private func render(_ url: URL, page index: Int) throws -> UIImage {
    _ = try inspect(url)
    if let document = try pdf(url) {
      guard index >= 1 && index <= document.pageCount, let page = document.page(at: index - 1) else {
        throw DocumentOcrException("DOCUMENT_PAGES")
      }
      let bounds = page.bounds(for: .mediaBox)
      guard bounds.width > 0 && bounds.height > 0 else { throw DocumentOcrException("DOCUMENT_CORRUPT") }
      let scale = 2500 / max(bounds.width, bounds.height)
      return page.thumbnail(of: CGSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
    }
    guard index == 1, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 2500,
      ] as CFDictionary) else { throw DocumentOcrException("DOCUMENT_CORRUPT") }
    return UIImage(cgImage: image)
  }
}

private final class DocumentOcrException: Exception {
  private let documentCode: String
  init(_ code: String) { self.documentCode = code; super.init() }
  override var reason: String { documentCode }
}
