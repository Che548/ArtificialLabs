const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error('Expo camera quality patch: upstream source changed.');
  }
  return source.replace(before, after);
}

const setupPhoto = `    // Sfera: configure still-photo quality before starting the session.
    configurePhotoResolution()
    session.commitConfiguration()
    addErrorNotification()`;

const resolution = `  private func configurePhotoResolution() {
    guard let photoOutput, let device = captureDeviceInput?.device,
      delegate?.mode == .picture, delegate?.pictureSize == .photo else { return }
    if photoOutput.maxPhotoQualityPrioritization != .quality {
      photoOutput.maxPhotoQualityPrioritization = .quality
    }
    if #available(iOS 16.0, *) {
      if let dimensions = device.activeFormat.supportedMaxPhotoDimensions.max(by: {
        Int64($0.width) * Int64($0.height) < Int64($1.width) * Int64($1.height)
      }), photoOutput.maxPhotoDimensions.width != dimensions.width ||
          photoOutput.maxPhotoDimensions.height != dimensions.height {
        photoOutput.maxPhotoDimensions = dimensions
      }
    } else {
      photoOutput.isHighResolutionCaptureEnabled = true
    }
  }

  // Sfera: all metering state is read on the camera session queue.
  func waitForMetering(_ completion: @escaping (Bool) -> Void) {
    guard let delegate else { completion(false); return }
    let deadline = Date.timeIntervalSinceReferenceDate + 2.5
    var stableSince: TimeInterval?
    func poll() {
      guard self.session.isRunning, let device = self.captureDeviceInput?.device else {
        completion(false)
        return
      }
      let now = Date.timeIntervalSinceReferenceDate
      if device.isAdjustingFocus || device.isAdjustingExposure || device.isAdjustingWhiteBalance {
        stableSince = nil
      } else {
        if stableSince == nil { stableSince = now }
        if now - (stableSince ?? now) >= 0.12 {
          completion(true)
          return
        }
      }
      if now >= deadline { completion(false); return }
      delegate.sessionQueue.asyncAfter(deadline: .now() + 0.04) { poll() }
    }
    poll()
  }

`;

function patchSession(source) {
  source = replaceOnce(source,
    `        if device.isFocusModeSupported(.locked) {
          device.focusMode = .locked
        }
        if device.isFocusModeSupported(.autoFocus) {
          device.focusMode = .autoFocus
        }`,
    `        // Sfera: keep following distance changes at the selected test point.
        if device.isFocusModeSupported(.continuousAutoFocus) {
          device.focusMode = .continuousAutoFocus
        } else if device.isFocusModeSupported(.autoFocus) {
          device.focusMode = .autoFocus
        }`);
  source = replaceOnce(source, '    session.commitConfiguration()\n    addErrorNotification()', setupPhoto);
  // Reconfigure if a different lens/preset is explicitly selected later.
  source = replaceOnce(source, '        session.sessionPreset = preset',
    '        session.sessionPreset = preset\n        configurePhotoResolution()');
  source = replaceOnce(source, '        updateZoom()\n', '        updateZoom()\n        configurePhotoResolution()\n');
  if (!source.includes('  private func configurePhotoResolution()')) {
    source = replaceOnce(source, '  private func startSession() {', resolution + '  private func startSession() {');
  }
  return source;
}

const originalJpeg = `    // Sfera: preserve the full sensor JPEG and its metadata, without a preview crop
    // or a second lossy encode. Other Expo output modes retain their existing path.
    if captureDelegate.pictureSize == .photo, options.imageType == .jpg,
      !options.pictureRef, !options.fastMode, options.additionalExif == nil,
      let imageData, let source = CGImageSourceCreateWithData(imageData as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
      let pixelWidth = properties[kCGImagePropertyPixelWidth as String] as? NSNumber,
      let pixelHeight = properties[kCGImagePropertyPixelHeight as String] as? NSNumber {
      let orientation = (properties[kCGImagePropertyOrientation as String] as? NSNumber)?.intValue ?? 1
      let swapped = [5, 6, 7, 8].contains(orientation)
      let path = FileSystemUtilities.generatePathInCache(captureDelegate.appContext, in: "Camera", extension: ".jpg")
      guard let uri = ExpoCameraUtils.write(data: imageData, to: path) else {
        throw CameraSavingImageException("Unable to save full-resolution photo")
      }
      var response: [String: Any] = ["uri": uri, "format": "jpg",
        "width": swapped ? pixelHeight.intValue : pixelWidth.intValue,
        "height": swapped ? pixelWidth.intValue : pixelHeight.intValue]
      if options.exif {
        var exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
        exif["Orientation"] = orientation
        response["exif"] = exif
      }
      if options.base64 { response["base64"] = imageData.base64EncodedString() }
      return response
    }

`;

function patchPhotoCapture(source) {
  source = replaceOnce(source, 'import UIKit\nimport AVFoundation', 'import UIKit\nimport ImageIO\nimport AVFoundation');
  source = replaceOnce(source, '  var flashMode: FlashMode { get }',
    '  var flashMode: FlashMode { get }\n  var pictureSize: PictureSize { get }');
  source = replaceOnce(source,
    '      if photoOutput.availablePhotoCodecTypes.contains(AVVideoCodecType.hevc) {',
    `      if captureDelegate?.pictureSize == .photo {
        photoSettings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      } else if photoOutput.availablePhotoCodecTypes.contains(AVVideoCodecType.hevc) {`);
  source = replaceOnce(source, '      photoSettings.photoQualityPrioritization = .balanced',
    `      photoSettings.photoQualityPrioritization = photoOutput.maxPhotoQualityPrioritization == .quality ? .quality : .balanced`);
  const decode = '    guard let imageData, var takenImage = UIImage(data: imageData) else {';
  if (!source.includes('// Sfera: preserve the full sensor JPEG')) source = replaceOnce(source, decode, originalJpeg + decode);
  source = replaceOnce(source, '    takenImage = ExpoCameraUtils.crop(image: takenImage, to: croppedSize)',
    `    if captureDelegate.pictureSize != .photo {
      takenImage = ExpoCameraUtils.crop(image: takenImage, to: croppedSize)
    }`);
  return source;
}

function patchView(source) {
  if (source.includes('  func waitForMetering(')) return source;
  return replaceOnce(source, '  func takePicturePromise(options: TakePictureOptions)',
    `  func waitForMetering(_ completion: @escaping (Bool) -> Void) {
    sessionQueue.async { self.sessionManager.waitForMetering(completion) }
  }

  func takePicturePromise(options: TakePictureOptions)`);
}

function patchModule(source) {
  if (source.includes('AsyncFunction("waitForMetering")')) return source;
  return replaceOnce(source, '      AsyncFunction("focusAt")',
    `      AsyncFunction("waitForMetering") { (view, promise: Promise) in
        view.waitForMetering { ready in promise.resolve(ready) }
      }

      AsyncFunction("focusAt")`);
}

function applyCameraQuality(cameraRoot) {
  const patches = {
    'ios/Current/CameraSessionManager.swift': patchSession,
    'ios/Current/CameraPhotoCapture.swift': patchPhotoCapture,
    'ios/Current/CameraView.swift': patchView,
    'ios/CameraViewModule.swift': patchModule,
  };
  // Validate every transformation before writing, so upstream drift cannot leave a partial patch.
  const changes = Object.entries(patches).map(([file, patch]) => {
    const target = path.join(cameraRoot, file);
    const source = fs.readFileSync(target, 'utf8');
    return { target, source, patched: patch(source) };
  });
  for (const { target, source, patched } of changes) if (source !== patched) fs.writeFileSync(target, patched);
}

module.exports = { applyCameraQuality, patchSession, patchPhotoCapture, patchView, patchModule };
