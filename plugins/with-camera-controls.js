const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

function patchFile(filePath, marker, insertBefore, addition) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(marker)) {
    return;
  }

  const position = source.indexOf(insertBefore);
  if (position === -1) {
    throw new Error(
      `Could not patch expo-camera: expected source was not found in ${filePath}.`,
    );
  }

  const nextSource =
    source.slice(0, position) + addition + source.slice(position);
  fs.writeFileSync(filePath, nextSource);
}

function appendFile(filePath, marker, addition) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(marker)) {
    return;
  }
  fs.writeFileSync(filePath, `${source}${addition}`);
}

function withCameraControls(config) {
  return withDangerousMod(config, [
    'ios',
    async (iosConfig) => {
      const cameraRoot = path.join(
        iosConfig.modRequest.projectRoot,
        'node_modules',
        'expo-camera',
      );

      appendFile(
        path.join(cameraRoot, 'ios/Current/CameraEnums.swift'),
        'struct FocusPoint: Record',
        `
struct FocusPoint: Record {
  @Field var x: Double = 0.5
  @Field var y: Double = 0.5

  var cgPoint: CGPoint {
    CGPoint(x: x, y: y)
  }
}

`,
      );

      patchFile(
        path.join(cameraRoot, 'ios/Current/CameraSessionManager.swift'),
        'func setFocusAndExposurePoint(_ point: CGPoint)',
        '  func updateZoom() {',
        `  func setFocusAndExposurePoint(_ point: CGPoint) {
    guard let device = captureDeviceInput?.device else {
      return
    }

    do {
      try device.lockForConfiguration()

      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = point
        if device.isFocusModeSupported(.locked) {
          device.focusMode = .locked
        }
        if device.isFocusModeSupported(.autoFocus) {
          device.focusMode = .autoFocus
        }
      }

      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = point
        if device.isExposureModeSupported(.continuousAutoExposure) {
          device.exposureMode = .continuousAutoExposure
        }
      }
    } catch {
      log.info("\\(#function): \\(error.localizedDescription)")
      return
    }
    device.unlockForConfiguration()
  }

  func setExposureCompensation(_ value: Double) {
    guard let device = captureDeviceInput?.device else {
      return
    }

    do {
      try device.lockForConfiguration()
      if device.isExposureModeSupported(.continuousAutoExposure) {
        device.exposureMode = .continuousAutoExposure
      }
      let normalized = max(-1, min(1, value))
      let maximumMagnitude = max(
        abs(device.minExposureTargetBias),
        abs(device.maxExposureTargetBias)
      )
      device.setExposureTargetBias(Float(normalized) * maximumMagnitude, completionHandler: nil)
    } catch {
      log.info("\\(#function): \\(error.localizedDescription)")
      return
    }
    device.unlockForConfiguration()
  }

`,
      );

      patchFile(
        path.join(cameraRoot, 'ios/Current/CameraView.swift'),
        'var focusPoint: CGPoint?',
        '  var pictureSize = PictureSize.high {',
        `  var focusPoint: CGPoint? {
    didSet {
      guard let focusPoint else {
        return
      }

      let normalizedPoint = CGPoint(
        x: min(max(focusPoint.x, 0), 1),
        y: min(max(focusPoint.y, 0), 1)
      )
      let layerPoint = CGPoint(
        x: previewLayer.bounds.width * normalizedPoint.x,
        y: previewLayer.bounds.height * normalizedPoint.y
      )
      let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)
      sessionQueue.async {
        self.sessionManager.setFocusAndExposurePoint(devicePoint)
        self.sessionManager.setExposureCompensation(self.exposureCompensation)
      }
    }
  }

  var exposureCompensation: Double = 0 {
    didSet {
      sessionQueue.async {
        self.sessionManager.setExposureCompensation(self.exposureCompensation)
      }
    }
  }

`,
      );

      patchFile(
        path.join(cameraRoot, 'ios/CameraViewModule.swift'),
        'Prop("focusPoint")',
        '      Prop("responsiveOrientationWhenOrientationLocked")',
        `      Prop("focusPoint") { (view, focusPoint: FocusPoint?) in
        view.focusPoint = focusPoint?.cgPoint
      }

      Prop("exposureCompensation") { (view, value: Double?) in
        view.exposureCompensation = value ?? 0
      }

`,
      );

      patchFile(
        path.join(cameraRoot, 'ios/CameraViewModule.swift'),
        'AsyncFunction("focusAt")',
        '      AsyncFunction("getAvailablePictureSizes")',
        `      AsyncFunction("focusAt") { (view, focusPoint: FocusPoint) in
        view.focusPoint = focusPoint.cgPoint
      }

      AsyncFunction("setExposureCompensation") { (view, value: Double) in
        view.exposureCompensation = value
      }

`,
      );

      return iosConfig;
    },
  ]);
}

module.exports = withCameraControls;
