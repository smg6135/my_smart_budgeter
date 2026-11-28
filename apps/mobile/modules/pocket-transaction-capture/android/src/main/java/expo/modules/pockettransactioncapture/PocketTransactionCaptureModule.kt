package expo.modules.pockettransactioncapture

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PocketTransactionCaptureModule : Module() {
  private fun context() = appContext.reactContext ?: error("Notification capture is unavailable.")
  override fun definition() = ModuleDefinition {
    Name("PocketTransactionCapture")
    AsyncFunction("status") {
      val context = context()
      val component = ComponentName(context, FinancialNotificationListener::class.java)
      val granted = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        ?.split(':')?.any { ComponentName.unflattenFromString(it) == component } ?: false
      val store = CaptureStore(context)
      mapOf("available" to true, "granted" to granted, "dropped" to store.dropped(),
        "error" to if (store.error()) "Some alerts could not be captured. Check your bank statement." else "",
        "apps" to CapturePolicy.apps.mapNotNull { (name, label) ->
          try { context.packageManager.getApplicationInfo(name, 0); mapOf("packageName" to name, "label" to label) }
          catch (_: android.content.pm.PackageManager.NameNotFoundException) { null }
        })
    }
    AsyncFunction("configure") { owner: String, packages: List<String> -> CaptureStore(context()).configure(owner, packages) }
    AsyncFunction("pending") { owner: String -> CaptureStore(context()).pending(owner) }
    AsyncFunction("acknowledge") { owner: String, ids: List<String> -> CaptureStore(context()).acknowledge(owner, ids) }
    AsyncFunction("clear") { owner: String -> CaptureStore(context()).clear(owner) }
    AsyncFunction("openSettings") {
      context().startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
