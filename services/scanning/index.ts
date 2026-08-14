export { scanningService } from './scanning-service';
export type {
  ActiveCvConfiguration,
  ConfigurationOptions,
  ScanProductMetadata,
} from './scanning-service';
export { CV_PROFILE_QR_SCHEMA, parseCvProfileQr } from './profile-qr';
export { getScanOverlayGeometry } from './scan-overlay-geometry';
export {
  deriveDetectedInterpretation,
  getAnalysisDecision,
  getAnalysisConfidence,
  isHighConfidenceAnalysis,
  REPORTABLE_CONFIDENCE_THRESHOLD,
} from './result-interpretation';
export { loadScanHistory, saveScanToHistory } from './history';
export type {
  PendingScanRecord,
  StoredScanRecord,
  StoredScanResult,
  StoredScanType,
} from './history';
