package expo.modules.devicediagnostics

import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import android.os.Environment
import android.os.Process
import android.os.StatFs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceDiagnosticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceDiagnostics")

    AsyncFunction("getSnapshotAsync") {
      val context = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memory = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(memory)
      val disk = StatFs(Environment.getDataDirectory().absolutePath)
      mapOf(
        "cpuCount" to Runtime.getRuntime().availableProcessors().toDouble(),
        "processCpuTimeMs" to Process.getElapsedCpuTime().toDouble(),
        "processRssBytes" to Debug.getPss().toDouble() * 1024.0,
        "totalMemoryBytes" to memory.totalMem.toDouble(),
        "availableMemoryBytes" to memory.availMem.toDouble(),
        "totalDiskBytes" to disk.totalBytes.toDouble(),
        "freeDiskBytes" to disk.availableBytes.toDouble(),
      )
    }
  }
}
