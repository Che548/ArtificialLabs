const assert = require('node:assert/strict');
const test = require('node:test');
const { patchLensSelection } = require('./with-camera-controls');
const { patchSession, patchPhotoCapture, patchView, patchModule } = require('./camera-quality');
const { patchPreviewSession, patchPreviewView, patchPreviewModule } = require('./camera-preview');

test('physical 1x lens selection survives localization, repeated prebuilds, and rejects drift', () => {
  const source = 'let selectedDevice = lenses.first {\n      $0.localizedName == delegate.selectedLens\n    }';
  const patched = patchLensSelection(source);
  assert.match(patched, /deviceType == \.builtInWideAngleCamera/);
  assert.match(patched, /return \$0.localizedName == delegate.selectedLens/);
  assert.equal(patchLensSelection(patched), patched);
  assert.throws(() => patchLensSelection('changed upstream camera code'));
});

test('still-photo patch configures quality before session start and waits for actual metering', () => {
  const source = `        if device.isFocusModeSupported(.locked) {
          device.focusMode = .locked
        }
        if device.isFocusModeSupported(.autoFocus) {
          device.focusMode = .autoFocus
        }
        session.sessionPreset = preset
        updateZoom()
  private func startSession() {
    session.commitConfiguration()
    addErrorNotification()
    session.startRunning()
  }`;
  const patched = patchSession(source);
  assert.equal(patchSession(patched), patched);
  assert.match(patched, /supportedMaxPhotoDimensions\.max/);
  assert.match(patched, /continuousAutoFocus/);
  assert.doesNotMatch(patched, /device.focusMode = \.locked/);
  assert.ok(patched.lastIndexOf('configurePhotoResolution()') < patched.indexOf('session.startRunning()'));
  assert.match(patched, /isAdjustingFocus \|\| device.isAdjustingExposure \|\| device.isAdjustingWhiteBalance/);
  assert.match(patched, /guard self.session.isRunning/);
  assert.match(patched, /now >= deadline \{ completion\(false\)/);
  assert.match(patched, /sessionQueue.asyncAfter/);
  assert.throws(() => patchSession('upstream drift'));
});

test('full-photo JPEG is written before decode; other output modes retain normal processing', () => {
  const source = `import UIKit
import AVFoundation
  var flashMode: FlashMode { get }
      if photoOutput.availablePhotoCodecTypes.contains(AVVideoCodecType.hevc) {
      photoSettings.photoQualityPrioritization = .balanced
    guard let imageData, var takenImage = UIImage(data: imageData) else {
    takenImage = ExpoCameraUtils.crop(image: takenImage, to: croppedSize)`;
  const patched = patchPhotoCapture(source);
  assert.equal(patchPhotoCapture(patched), patched);
  assert.match(patched, /AVVideoCodecType.jpeg/);
  assert.match(patched, /options.imageType == \.jpg/);
  assert.match(patched, /!options.pictureRef, !options.fastMode, options.additionalExif == nil/);
  assert.ok(patched.indexOf('write(data: imageData') < patched.indexOf('UIImage(data: imageData)'));
  assert.match(patched, /\[5, 6, 7, 8\].contains\(orientation\)/);
  assert.match(patched, /if captureDelegate.pictureSize != \.photo/);
  assert.throws(() => patchPhotoCapture('upstream drift'));
});

test('native readiness bridge is idempotent and runs on the camera queue', () => {
  const view = patchView('  func takePicturePromise(options: TakePictureOptions)');
  assert.match(view, /sessionQueue.async/);
  assert.equal(patchView(view), view);
  const module = patchModule('      AsyncFunction("focusAt")');
  assert.match(module, /promise.resolve\(ready\)/);
  assert.equal(patchModule(module), module);
  assert.throws(() => patchView('upstream drift'));
  assert.throws(() => patchModule('upstream drift'));
});

test('on-demand video sampler drops late frames, limits work and releases timed-out requests', () => {
  const session = patchPreviewSession(`import UIKit
  private var photoOutput: AVCapturePhotoOutput?
  private func configurePhotoResolution() {
      delegate?.mode == .picture, delegate?.pictureSize == .photo else { return }
  }`);
  assert.equal(patchPreviewSession(session), session);
  for (const pattern of [/alwaysDiscardsLateVideoFrames = true/, /deliversPreviewSizedOutputBuffers = true/,
    /qos: \.utility/, /guard self.pending == nil/, /request.id == id/, /guard let request = pending/, /1920\.0/]) {
    assert.match(session, pattern);
  }
  assert.doesNotMatch(session, /capturePhoto\(/);
  assert.match(session, /guard self.pending == nil, !self.encoding/);
  assert.match(session, /encodingQueue.async/);
  assert.match(session, /copyFrame\(buffer\)/);
  assert.match(session, /kCVPixelBufferPoolAllocationThresholdKey as String: 1/);
  assert.match(session, /CVBufferPropagateAttachments/);
  assert.match(session, /priorityRequestLow: true/);
  // A later prebuild must refresh generated native code, preserving surrounding source.
  const older = session.replace('priorityRequestLow: true', 'priorityRequestLow: false');
  assert.equal(patchPreviewSession(older + '\n// unrelated native code'), session + '\n// unrelated native code');
  assert.throws(() => patchPreviewSession(session.replace('// Sfera preview sampler: end', '')));
  const view = patchPreviewView('  func waitForMetering(');
  assert.equal(patchPreviewView(view), view);
  assert.match(view, /videoOrientation\(for: deviceOrientation\)/);
  const module = patchPreviewModule('      AsyncFunction("waitForMetering")');
  assert.equal(patchPreviewModule(module), module);
  assert.throws(() => patchPreviewSession('drift'));
});
