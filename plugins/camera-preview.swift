
// Sfera: encode only requested video frames, never run the still-photo ISP for the ring buffer.
private final class SferaPreviewSampler: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let queue = DispatchQueue(label: "sfera.camera.preview", qos: .utility)
  private let encodingQueue = DispatchQueue(label: "sfera.camera.preview.encode", qos: .utility)
  private lazy var context = CIContext(options: [.cacheIntermediates: false, .priorityRequestLow: true])
  private var encoding = false
  private var copyPool: CVPixelBufferPool?
  private var copyDimensions = CGSize.zero
  private var copyFormat: OSType = 0
  private struct Request {
    let id: UUID
    let path: String
    let portrait: Bool
    let completion: ([String: Any]?) -> Void
  }
  private var pending: Request?

  func request(path: String, portrait: Bool, completion: @escaping ([String: Any]?) -> Void) {
    queue.async {
      guard self.pending == nil, !self.encoding else { completion(nil); return }
      let id = UUID()
      self.pending = Request(id: id, path: path, portrait: portrait, completion: completion)
      self.queue.asyncAfter(deadline: .now() + 1) { [weak self] in
        guard let self, let request = self.pending, request.id == id else { return }
        self.pending = nil
        request.completion(nil)
      }
    }
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                     from connection: AVCaptureConnection) {
    guard let request = pending, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    // Skip an old-orientation frame still in transit after rotating the output.
    let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    guard (height >= width) == request.portrait else { return }
    pending = nil
    // Release the camera-owned surface as soon as this delegate returns. Keeping
    // it alive through JPEG/GPU work can exhaust AVFoundation's preview buffers.
    guard let ownedBuffer = copyFrame(buffer) else { request.completion(nil); return }
    encoding = true
    encodingQueue.async {
      let photo = autoreleasepool { self.encode(ownedBuffer, path: request.path) }
      self.queue.async {
        self.encoding = false
        request.completion(photo)
      }
    }
  }

  // One reusable private surface; no queue of retained camera frames.
  private func copyFrame(_ source: CVPixelBuffer) -> CVPixelBuffer? {
    let width = CVPixelBufferGetWidth(source), height = CVPixelBufferGetHeight(source)
    let format = CVPixelBufferGetPixelFormatType(source)
    let dimensions = CGSize(width: width, height: height)
    if copyPool == nil || copyDimensions != dimensions || copyFormat != format {
      copyPool = nil
      let attributes: [String: Any] = [
        kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferPixelFormatTypeKey as String: format,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        kCVPixelBufferMetalCompatibilityKey as String: true,
      ]
      guard CVPixelBufferPoolCreate(nil, nil, attributes as CFDictionary, &copyPool) == kCVReturnSuccess else { return nil }
      copyDimensions = dimensions
      copyFormat = format
    }
    guard let copyPool else { return nil }
    var destination: CVPixelBuffer?
    // At most one encode is in flight; do not allocate more surfaces under load.
    let limits = [kCVPixelBufferPoolAllocationThresholdKey as String: 1] as CFDictionary
    guard CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(nil, copyPool, limits, &destination) == kCVReturnSuccess,
          let destination,
          CVPixelBufferLockBaseAddress(source, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(source, .readOnly) }
    guard CVPixelBufferLockBaseAddress(destination, []) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(destination, []) }
    let planes = CVPixelBufferGetPlaneCount(source)
    guard planes == CVPixelBufferGetPlaneCount(destination) else { return nil }
    for plane in 0..<max(1, planes) {
      let src = planes == 0 ? CVPixelBufferGetBaseAddress(source) : CVPixelBufferGetBaseAddressOfPlane(source, plane)
      let dst = planes == 0 ? CVPixelBufferGetBaseAddress(destination) : CVPixelBufferGetBaseAddressOfPlane(destination, plane)
      guard let src, let dst else { return nil }
      let srcStride = planes == 0 ? CVPixelBufferGetBytesPerRow(source) : CVPixelBufferGetBytesPerRowOfPlane(source, plane)
      let dstStride = planes == 0 ? CVPixelBufferGetBytesPerRow(destination) : CVPixelBufferGetBytesPerRowOfPlane(destination, plane)
      let rows = planes == 0 ? height : CVPixelBufferGetHeightOfPlane(source, plane)
      for row in 0..<rows { memcpy(dst.advanced(by: row * dstStride), src.advanced(by: row * srcStride), min(srcStride, dstStride)) }
    }
    CVBufferPropagateAttachments(source, destination)
    return destination
  }

  private func encode(_ buffer: CVPixelBuffer, path: String) -> [String: Any]? {
      let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
      let scale = min(1.0, 1920.0 / Double(max(width, height)))
      let image = CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
      let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
      guard let data = context.jpegRepresentation(of: image, colorSpace: colorSpace, options: [quality: 0.92]),
            let uri = ExpoCameraUtils.write(data: data, to: path) else { return nil }
      return ["uri": uri, "format": "jpg",
        "width": Int(image.extent.width), "height": Int(image.extent.height),
        "exif": ["Orientation": 1]]
  }
}
