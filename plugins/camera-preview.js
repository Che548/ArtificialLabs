const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function replaceOnce(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error('Expo camera preview patch: upstream source changed.');
  }
  return source.replace(before, after);
}

function patchSampler(source) {
  const startMarker = '// Sfera preview sampler: begin';
  const endMarker = '// Sfera preview sampler: end';
  const generated = `${startMarker}\n${fs.readFileSync(path.join(__dirname, 'camera-preview.swift'), 'utf8').trim()}\n${endMarker}`;
  const start = source.indexOf(startMarker);
  if (start >= 0) {
    const end = source.indexOf(endMarker, start);
    if (end < 0 || source.lastIndexOf(startMarker) !== start || source.lastIndexOf(endMarker) !== end) {
      throw new Error('Expo camera preview patch: invalid sampler boundaries.');
    }
    return source.slice(0, start) + generated + source.slice(end + endMarker.length);
  }
  // Migrate only the exact original append-only sampler. Refuse unknown edits.
  const legacy = source.indexOf('// Sfera: encode only requested video frames');
  if (legacy >= 0) {
    const digest = createHash('sha256').update(source.slice(legacy).trim()).digest('hex');
    if (digest !== 'f209b6fdfc2ddb6046d2758b22c3d9ba490ea55c461bc3b5f01f1a97275f7a4d') {
      throw new Error('Expo camera preview patch: modified legacy sampler.');
    }
    return source.slice(0, legacy) + generated + '\n';
  }
  if (source.includes('private final class SferaPreviewSampler')) {
    throw new Error('Expo camera preview patch: unrecognized sampler.');
  }
  return source + '\n' + generated + '\n';
}

const methods = `  private func configurePreviewOutput() {
    guard previewOutput == nil else { return }
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.automaticallyConfiguresOutputBufferDimensions = false
    output.deliversPreviewSizedOutputBuffers = true
    let format = output.availableVideoPixelFormatTypes.contains(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
      ? kCVPixelFormatType_420YpCbCr8BiPlanarFullRange : kCVPixelFormatType_32BGRA
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: format]
    output.setSampleBufferDelegate(previewSampler, queue: previewSampler.queue)
    if session.canAddOutput(output) {
      session.addOutput(output)
      previewOutput = output
    }
  }

  func capturePreviewFrame(orientation: AVCaptureVideoOrientation,
                           completion: @escaping ([String: Any]?) -> Void) {
    guard session.isRunning, let delegate, let connection = previewOutput?.connection(with: .video) else {
      completion(nil)
      return
    }
    if connection.videoOrientation != orientation { connection.videoOrientation = orientation }
    let path = FileSystemUtilities.generatePathInCache(delegate.appContext, in: "Camera", extension: ".jpg")
    previewSampler.request(path: path, portrait: orientation == .portrait || orientation == .portraitUpsideDown,
                           completion: completion)
  }

`;

function patchPreviewSession(source) {
  source = replaceOnce(source, 'import UIKit\n', 'import UIKit\nimport CoreImage\nimport ImageIO\n');
  source = replaceOnce(source, '  private var photoOutput: AVCapturePhotoOutput?',
    '  private var photoOutput: AVCapturePhotoOutput?\n  private var previewOutput: AVCaptureVideoDataOutput?\n  private let previewSampler = SferaPreviewSampler()');
  source = replaceOnce(source, '      delegate?.mode == .picture, delegate?.pictureSize == .photo else { return }',
    '      delegate?.mode == .picture, delegate?.pictureSize == .photo else { return }\n    configurePreviewOutput()');
  if (!source.includes('  private func configurePreviewOutput()')) {
    source = replaceOnce(source, '  private func configurePhotoResolution()', methods + '  private func configurePhotoResolution()');
  }
  return patchSampler(source);
}

function patchPreviewView(source) {
  if (source.includes('  func capturePreviewFrame(')) return source;
  return replaceOnce(source, '  func waitForMetering(', `  func capturePreviewFrame(_ completion: @escaping ([String: Any]?) -> Void) {
    let orientation = ExpoCameraUtils.videoOrientation(for: deviceOrientation)
    sessionQueue.async { self.sessionManager.capturePreviewFrame(orientation: orientation, completion: completion) }
  }

  func waitForMetering(`);
}

function patchPreviewModule(source) {
  if (source.includes('AsyncFunction("capturePreviewFrame")')) return source;
  return replaceOnce(source, '      AsyncFunction("waitForMetering")',
    `      AsyncFunction("capturePreviewFrame") { (view, promise: Promise) in
        view.capturePreviewFrame { photo in promise.resolve(photo) }
      }

      AsyncFunction("waitForMetering")`);
}

function applyCameraPreview(cameraRoot) {
  const patches = {
    'ios/Current/CameraSessionManager.swift': patchPreviewSession,
    'ios/Current/CameraView.swift': patchPreviewView,
    'ios/CameraViewModule.swift': patchPreviewModule,
  };
  const changes = Object.entries(patches).map(([file, patch]) => {
    const target = path.join(cameraRoot, file), source = fs.readFileSync(target, 'utf8');
    return { target, source, patched: patch(source) };
  });
  for (const { target, source, patched } of changes) if (source !== patched) fs.writeFileSync(target, patched);
}

module.exports = { applyCameraPreview, patchPreviewSession, patchPreviewView, patchPreviewModule };
