package expo.modules.smsretriever

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.os.BundleCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsRetrieverModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("SmsRetriever")

    Events("onSmsReceived", "onSmsTimeout")

    AsyncFunction("startAsync") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("SMS_RETRIEVER_UNAVAILABLE", "React context is unavailable", null)
        return@AsyncFunction
      }

      unregisterReceiver(context)
      val nextReceiver = object : BroadcastReceiver() {
        override fun onReceive(receiveContext: Context, intent: Intent) {
          if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
          val extras = intent.extras ?: return
          val status = BundleCompat.getParcelable(
            extras,
            SmsRetriever.EXTRA_STATUS,
            Status::class.java,
          ) ?: return
          when (status.statusCode) {
            CommonStatusCodes.SUCCESS -> {
              val message = intent.extras?.getString(SmsRetriever.EXTRA_SMS_MESSAGE)
              if (message != null) sendEvent("onSmsReceived", mapOf("message" to message))
              unregisterReceiver(receiveContext)
            }
            CommonStatusCodes.TIMEOUT -> {
              sendEvent("onSmsTimeout")
              unregisterReceiver(receiveContext)
            }
          }
        }
      }
      receiver = nextReceiver
      val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(
          nextReceiver,
          filter,
          SmsRetriever.SEND_PERMISSION,
          null,
          Context.RECEIVER_EXPORTED,
        )
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(nextReceiver, filter, SmsRetriever.SEND_PERMISSION, null)
      }

      SmsRetriever.getClient(context).startSmsRetriever()
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { error ->
          unregisterReceiver(context)
          promise.reject("SMS_RETRIEVER_UNAVAILABLE", error.message, error)
        }
    }

    OnDestroy {
      appContext.reactContext?.let(::unregisterReceiver)
    }
  }

  private fun unregisterReceiver(context: Context) {
    val current = receiver ?: return
    try {
      context.unregisterReceiver(current)
    } catch (_: IllegalArgumentException) {
      // The receiver may already have been removed after success or timeout.
    }
    receiver = null
  }
}
