import { requireNativeModule } from 'expo-modules-core';

export type DeviceDiagnosticsSnapshot = {
  cpuCount: number;
  processCpuTimeMs: number;
  processRssBytes: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  totalDiskBytes: number;
  freeDiskBytes: number;
};

const module = requireNativeModule<{
  getSnapshotAsync(): Promise<DeviceDiagnosticsSnapshot>;
}>('DeviceDiagnostics');

export const getDeviceDiagnosticsSnapshot = () => module.getSnapshotAsync();
