package expo.modules.pockettransactioncapture

import java.security.MessageDigest

internal object CapturePolicy {
  val apps = linkedMapOf(
    "com.dbs.sg.dbsmbanking" to "DBS digibank",
    "com.dbs.sg.posbmbanking" to "POSB digibank",
    "com.americanexpress.android.acctsvcs.sg" to "Amex Singapore",
    "com.americanexpress.android.acctsvcs.us" to "Amex US",
    "com.google.android.apps.walletnfcrel" to "Google Wallet"
  )
  private val security = Regex("\\b(?:otp|one[ -]time|verification code|security code|passcode|password|sign[ -]?in|log[ -]?in|authenticate)\\b", RegexOption.IGNORE_CASE)
  private val irrelevant = Regex("\\b(?:declined|unsuccessful|failed|payment due|minimum payment|statement ready)\\b", RegexOption.IGNORE_CASE)
  private val balanceOnly = Regex("\\b(?:available balance|credit limit)\\b", RegexOption.IGNORE_CASE)
  private val purchase = Regex("\\b(?:paid|purchase|spent|charged|payment|transaction)\\b", RegexOption.IGNORE_CASE)
  private val money = Regex("(?:[A-Z]{3}|S\\$|[$€£¥₩])\\s*\\d|\\d[\\d,.]*\\s*[A-Z]{3}\\b")
  fun eligible(text: String): Boolean = text.length <= 4000 && !security.containsMatchIn(text) &&
    !irrelevant.containsMatchIn(text) && (!balanceOnly.containsMatchIn(text) || purchase.containsMatchIn(text)) && money.containsMatchIn(text)
  fun digest(text: String): String = MessageDigest.getInstance("SHA-256")
    .digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) }
  fun eventId(packageName: String, key: String, time: Long, text: String): String =
    "android:" + digest("$packageName\u0000$key\u0000$time\u0000$text")
  fun redact(text: String): String = text.replace(Regex("\\d(?:[ -]?\\d){7,}"), "[redacted]").take(1600)
}
