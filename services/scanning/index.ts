export { scanningService } from './scanning-service';
export type {
  ActiveCvConfiguration,
  ScanProductMetadata,
} from './scanning-service';
export { CV_PROFILE_QR_SCHEMA, parseCvProfileQr } from './profile-qr';
export { loadScanHistory, saveScanToHistory } from './history';
export type {
  PendingScanRecord,
  StoredScanRecord,
  StoredScanResult,
  StoredScanType,
} from './history';
