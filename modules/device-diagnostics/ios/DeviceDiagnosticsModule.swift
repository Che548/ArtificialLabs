import Darwin
import ExpoModulesCore
import Foundation

public final class DeviceDiagnosticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceDiagnostics")

    AsyncFunction("getSnapshotAsync") { () -> [String: Double] in
      var usage = rusage()
      getrusage(RUSAGE_SELF, &usage)
      let userMs = Double(usage.ru_utime.tv_sec) * 1000 + Double(usage.ru_utime.tv_usec) / 1000
      let systemMs = Double(usage.ru_stime.tv_sec) * 1000 + Double(usage.ru_stime.tv_usec) / 1000

      var taskInfo = mach_task_basic_info()
      var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
      let memoryResult = withUnsafeMutablePointer(to: &taskInfo) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
          task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
        }
      }
      let rss = memoryResult == KERN_SUCCESS ? Double(taskInfo.resident_size) : 0
      let values = try? URL(fileURLWithPath: NSHomeDirectory()).resourceValues(
        forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey]
      )

      return [
        "cpuCount": Double(ProcessInfo.processInfo.processorCount),
        "processCpuTimeMs": userMs + systemMs,
        "processRssBytes": rss,
        "totalMemoryBytes": Double(ProcessInfo.processInfo.physicalMemory),
        "availableMemoryBytes": Double(os_proc_available_memory()),
        "totalDiskBytes": Double(values?.volumeTotalCapacity ?? 0),
        "freeDiskBytes": Double(values?.volumeAvailableCapacityForImportantUsage ?? 0),
      ]
    }
  }
}
