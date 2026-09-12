package expo.modules.documentocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import java.util.UUID

private object OcrNative {
  init { System.loadLibrary("documentocr") }
  external fun begin(): Boolean
  external fun cancel()
  external fun end()
  external fun recognize(bitmap: Bitmap, models: String): String
}

class DocumentOcrModule : Module() {
  private val previews = mutableListOf<File>()
  override fun definition() = ModuleDefinition {
    Name("DocumentOcr")
    Function("begin") { OcrNative.begin() }
    Function("cancel") { OcrNative.cancel() }
    AsyncFunction("inspectAsync") { uri: String -> inspect(localFile(uri)) }
    AsyncFunction("recognizePageAsync") { uri: String, page: Int, rotation: Int ->
      val bitmap = orient(render(localFile(uri), page), rotation)
      try {
        val result = org.json.JSONObject(OcrNative.recognize(bitmap, models().absolutePath))
        mapOf("text" to result.getString("text"), "confidence" to result.getDouble("confidence"))
      } finally { bitmap.recycle() }
    }
    AsyncFunction("previewPageAsync") { uri: String, page: Int, rotation: Int ->
      val context = requireNotNull(appContext.reactContext)
      val bitmap = orient(render(localFile(uri), page), rotation)
      val target = File(context.cacheDir, "ocr-preview-${UUID.randomUUID()}.png")
      try {
        target.outputStream().use { if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) error("DOCUMENT_CORRUPT") }
        synchronized(previews) { previews.add(target) }
        Uri.fromFile(target).toString()
      } finally { bitmap.recycle() }
    }
    AsyncFunction("cleanupAsync") {
      try { synchronized(previews) { previews.forEach { it.delete() }; previews.clear() } }
      finally { OcrNative.end() }
    }
  }

  private fun localFile(uri: String): File {
    val context = requireNotNull(appContext.reactContext)
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "DOCUMENT_LOCAL_FILE_REQUIRED" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    require(listOf(context.filesDir, context.cacheDir).any { file.path.startsWith(it.canonicalPath + "/") }) { "DOCUMENT_LOCAL_FILE_REQUIRED" }
    require(file.length() in 1..(20L * 1024 * 1024)) { "DOCUMENT_SIZE" }
    return file
  }

  private fun orient(bitmap: Bitmap, rotation: Int): Bitmap {
    if (rotation !in listOf(0, 90, 180, 270)) { bitmap.recycle(); error("DOCUMENT_ROTATION") }
    if (rotation == 0) return bitmap
    try {
      val result = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
      if (result !== bitmap) bitmap.recycle()
      return result
    } catch (error: Exception) { bitmap.recycle(); throw IllegalArgumentException("DOCUMENT_CORRUPT") }
  }

  private fun isPdf(file: File): Boolean = file.inputStream().use {
    val header = ByteArray(5)
    it.read(header) == 5 && header.contentEquals("%PDF-".toByteArray(Charsets.US_ASCII))
  }

  private fun <T> withPdf(file: File, block: (PdfRenderer) -> T): T {
    try {
      return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          require(renderer.pageCount in 1..20) { "DOCUMENT_PAGES" }
          block(renderer)
        }
      }
    } catch (error: SecurityException) { throw IllegalArgumentException("DOCUMENT_PASSWORD") }
      catch (error: java.io.IOException) { throw IllegalArgumentException("DOCUMENT_CORRUPT") }
  }

  private fun inspect(file: File): Map<String, Any> {
    if (isPdf(file)) return withPdf(file) { mapOf("mime" to "application/pdf", "bytes" to file.length(), "pages" to it.pageCount) }
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, options)
    require(options.outMimeType in listOf("image/jpeg", "image/png")) { "DOCUMENT_UNSUPPORTED" }
    require(options.outWidth > 0 && options.outHeight > 0) { "DOCUMENT_CORRUPT" }
    return mapOf("mime" to options.outMimeType, "bytes" to file.length(), "pages" to 1)
  }

  private fun render(file: File, pageNumber: Int): Bitmap {
    inspect(file)
    if (isPdf(file)) return withPdf(file) { renderer ->
      require(pageNumber in 1..renderer.pageCount) { "DOCUMENT_PAGES" }
      renderer.openPage(pageNumber - 1).use { page ->
        require(page.width > 0 && page.height > 0) { "DOCUMENT_CORRUPT" }
        val scale = 2500.0 / maxOf(page.width, page.height)
        val bitmap = Bitmap.createBitmap(maxOf(1, (page.width * scale).toInt()), maxOf(1, (page.height * scale).toInt()), Bitmap.Config.ARGB_8888)
        try {
          bitmap.eraseColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          bitmap
        } catch (error: Exception) { bitmap.recycle(); throw IllegalArgumentException("DOCUMENT_CORRUPT") }
      }
    }
    require(pageNumber == 1) { "DOCUMENT_PAGES" }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2500) sample *= 2
    val decoded = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 })
      ?: throw IllegalArgumentException("DOCUMENT_CORRUPT")
    try {
      val exif = ExifInterface(file)
      val matrix = Matrix().apply {
        if (exif.isFlipped) postScale(-1f, 1f)
        postRotate(exif.rotationDegrees.toFloat())
      }
      if (matrix.isIdentity) return decoded
      val oriented = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
      if (oriented !== decoded) decoded.recycle()
      return oriented
    } catch (error: Exception) { decoded.recycle(); throw IllegalArgumentException("DOCUMENT_CORRUPT") }
  }

  private fun models(): File {
    val context = requireNotNull(appContext.reactContext)
    val directory = File(context.noBackupFilesDir, "document-ocr/tessdata").apply { mkdirs() }
    val hashes = mapOf(
      "eng" to "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
      "rus" to "e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225",
    )
    for ((language, expected) in hashes) {
      val bytes = context.assets.open("tessdata/$language.traineddata").use { it.readBytes() }
      val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
      require(hash == expected) { "DOCUMENT_ENGINE_UNAVAILABLE" }
      File(directory, "$language.traineddata").writeBytes(bytes)
    }
    return directory
  }
}
