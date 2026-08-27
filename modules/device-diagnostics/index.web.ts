import type { DeviceDiagnosticsSnapshot } from './index';

export async function getDeviceDiagnosticsSnapshot(): Promise<DeviceDiagnosticsSnapshot> {
  return {
    cpuCount: navigator.hardwareConcurrency || 0,
    processCpuTimeMs: 0,
    processRssBytes: 0,
    totalMemoryBytes: 0,
    availableMemoryBytes: 0,
    totalDiskBytes: 0,
    freeDiskBytes: 0,
  };
}
