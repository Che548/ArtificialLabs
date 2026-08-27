export type DeviceDiagnosticsSnapshot = {
  cpuCount: number;
  processCpuTimeMs: number;
  processRssBytes: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  totalDiskBytes: number;
  freeDiskBytes: number;
};

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
