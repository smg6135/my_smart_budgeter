package expo.modules.pockettransactioncapture

import org.junit.Assert.*
import org.junit.Test

class CapturePolicyTest {
  @Test fun rejectsSecurityAndNonPurchaseAlerts() {
    for (text in listOf("OTP 123456 for SGD 12.50", "Login SGD 12.50", "Purchase USD 2.00 declined", "Your statement ready SGD 2.00"))
      assertFalse(CapturePolicy.eligible(text))
    assertTrue(CapturePolicy.eligible("Paid SGD 12.50 at Corner Cafe"))
    assertTrue(CapturePolicy.eligible("Paid SGD 12.50 at Corner Cafe; available balance SGD 900.00"))
    assertFalse(CapturePolicy.eligible("Available balance SGD 900.00"))
    assertTrue(CapturePolicy.eligible("Paid $12.50 at Corner Cafe"))
    assertFalse(CapturePolicy.eligible("Your rewards are ready"))
  }
  @Test fun stableEventIdsIncludeSourceAndRevisionWithoutExposingText() {
    val first = CapturePolicy.eventId("bank", "notice-1", 1000L, "Paid SGD 12.50")
    assertEquals(first, CapturePolicy.eventId("bank", "notice-1", 1000L, "Paid SGD 12.50"))
    assertNotEquals(first, CapturePolicy.eventId("wallet", "notice-1", 1000L, "Paid SGD 12.50"))
    assertNotEquals(first, CapturePolicy.eventId("bank", "notice-1", 1000L, "Paid SGD 13.50"))
    assertTrue(first.matches(Regex("android:[a-f0-9]{64}")))
  }
  @Test fun redactsFullCardNumbersBeforeQueueing() {
    assertEquals("Paid with [redacted]", CapturePolicy.redact("Paid with 1234 5678 9012 3456"))
    assertEquals("Card ending 1234", CapturePolicy.redact("Card ending 1234"))
    assertEquals("Account A[redacted]B", CapturePolicy.redact("Account A123456789012B"))
  }
}
