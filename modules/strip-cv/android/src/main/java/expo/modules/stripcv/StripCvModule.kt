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
}

class StripCvModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StripCv")

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
