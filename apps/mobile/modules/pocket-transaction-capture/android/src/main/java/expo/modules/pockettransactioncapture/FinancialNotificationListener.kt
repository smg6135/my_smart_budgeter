package expo.modules.pockettransactioncapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.RejectedExecutionException

class FinancialNotificationListener : NotificationListenerService() {
  private val worker = ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(100))
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!CapturePolicy.apps.containsKey(sbn.packageName)) return
    // Snapshot ownership before asynchronous work: a profile switch cannot move an alert.
    val owner = CaptureStore(applicationContext).selectedOwner(sbn.packageName) ?: return
    val notification = sbn.notification
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    val extras = notification.extras ?: return
    // Never inspect other apps, history, actions, remote input or credentials.
    val text = listOfNotNull(extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
      (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()).joinToString("\n")
    if (!CapturePolicy.eligible(text)) return
    try {
      worker.execute {
        val store = CaptureStore(applicationContext)
        try { store.append(owner, sbn.packageName, sbn.key, sbn.postTime, text) }
        catch (_: Exception) { store.failed() } // No notification contents or native errors in logs.
      }
    } catch (_: RejectedExecutionException) { CaptureStore(applicationContext).failed() }
  }
  override fun onDestroy() { worker.shutdown(); super.onDestroy() }
}
