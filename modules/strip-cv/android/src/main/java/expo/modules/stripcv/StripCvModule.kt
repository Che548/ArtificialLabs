package expo.modules.stripcv

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

private object StripCvNative {
  init {
    System.loadLibrary("stripcv")
  }

  external fun analyze(
    bitmap: Bitmap,
    assayProfileJson: String,
    cardProfileJson: String?,
    optionsJson: String,
  ): String

  external fun analyzeLearned(bitmap: Bitmap, modelDirectory: String, detectionOnly: Boolean): String
}

class StripCvModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StripCv")

    AsyncFunction("detectStripJsonAsync") { requestJson: String ->
      val request = JSONObject(requestJson)
      val context = requireNotNull(appContext.reactContext)
      val uri = request.getString("imageUri")
      require(Uri.parse(uri).scheme in listOf("file", "content")) { "A local image is required" }
      val models = prepareLearnedModels(context)
      val bitmap = decodeOrientedBitmap(context, uri)
      try {
        StripCvNative.analyzeLearned(bitmap, models.absolutePath, true)
      } finally {
        bitmap.recycle()
      }
    }

    AsyncFunction("analyzeLearnedStripJsonAsync") { requestJson: String ->
      val request = JSONObject(requestJson)
      val context = requireNotNull(appContext.reactContext)
      val uri = request.getString("imageUri")
      require(Uri.parse(uri).scheme in listOf("file", "content")) { "A local image is required" }
      val models = prepareLearnedModels(context)
      val bitmap = decodeOrientedBitmap(context, uri)
      try {
        StripCvNative.analyzeLearned(bitmap, models.absolutePath, false)
      } finally {
        bitmap.recycle()
      }
    }

    AsyncFunction("analyzeStripJsonAsync") { requestJson: String ->
      val request = JSONObject(requestJson)
      val imageUri = request.getString("imageUri")
      val assayProfileJson = request.getJSONObject("assayProfile").toString()
      val cardProfileJson = request.optJSONObject("cardProfile")?.toString()
      val optionsJson = request.getJSONObject("options").toString()
      val bitmap = decodeOrientedBitmap(requireNotNull(appContext.reactContext), imageUri)

      try {
        StripCvNative.analyze(
          bitmap,
          assayProfileJson,
          cardProfileJson,
          optionsJson,
        )
      } finally {
        bitmap.recycle()
      }
    }
  }

  companion object {
    private var preparedModels: File? = null

    @Synchronized
    private fun prepareLearnedModels(context: Context): File {
      preparedModels?.let { return it }
      val assetRoot = "reader-20260914"
      val manifest = context.assets.open("$assetRoot/manifest.json").bufferedReader().use {
        JSONObject(it.readText())
      }
      require(manifest.getString("version") == "strip-reader-experimental-20260914")
      val directory = File(context.noBackupFilesDir, "stripcv/$assetRoot")
      check(directory.isDirectory || directory.mkdirs())
      for (name in listOf("detector", "points", "presence", "coverage", "auxiliary")) {
        val descriptor = manifest.getJSONObject("models").getJSONObject(name)
        val filename = "$name.onnx"
        require(descriptor.getString("path") == filename)
        val expected = descriptor.getString("sha256")
        val destination = File(directory, filename)
        fun checksum(file: File): String {
          val hash = MessageDigest.getInstance("SHA-256")
          file.inputStream().use { input ->
            val buffer = ByteArray(1024 * 64)
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              hash.update(buffer, 0, read)
            }
          }
          return hash.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
        if (!destination.isFile || checksum(destination) != expected) {
          val temporary = File(directory, "$filename.pending")
          try {
            context.assets.open("$assetRoot/$filename").use { input ->
              temporary.outputStream().use { input.copyTo(it) }
            }
            check(checksum(temporary) == expected) { "Reader model verification failed" }
            check(temporary.renameTo(destination)) { "Reader model preparation failed" }
          } finally {
            temporary.delete()
          }
        }
      }
      preparedModels = directory
      return directory
    }
  }

  private fun decodeOrientedBitmap(context: Context, uriString: String): Bitmap {
    val uri = Uri.parse(uriString)
    val orientation = context.contentResolver.openInputStream(uri)?.use {
      ExifInterface(it).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL,
      )
    } ?: ExifInterface.ORIENTATION_NORMAL
    val decoded = context.contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
      ?: throw IllegalArgumentException("Unable to decode captured image URI")
    val matrix = Matrix().apply {
      when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> {
          setRotate(90f)
          postScale(-1f, 1f)
        }
        ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> {
          setRotate(-90f)
          postScale(-1f, 1f)
        }
        ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
      }
    }
    val oriented = if (matrix.isIdentity) decoded else Bitmap.createBitmap(
      decoded,
      0,
      0,
      decoded.width,
      decoded.height,
      matrix,
      true,
    )
    if (oriented !== decoded) {
      decoded.recycle()
    }
    val rgba = oriented.copy(Bitmap.Config.ARGB_8888, false)
      ?: throw IllegalArgumentException("Unable to normalize captured image pixels")
    if (rgba !== oriented) {
      oriented.recycle()
    }
    return rgba
  }
}
