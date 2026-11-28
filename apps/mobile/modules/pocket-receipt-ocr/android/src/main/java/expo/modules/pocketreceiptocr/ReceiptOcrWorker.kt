package expo.modules.pocketreceiptocr

import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/** Owns blocking OCR work; teardown never interrupts an in-flight ML Kit read. */
internal class ReceiptOcrWorker {
  private val closed = AtomicBoolean(false)
  private val executor = Executors.newSingleThreadExecutor { task ->
    Thread(task, "pocket-receipt-ocr")
  }

  fun submit(unavailable: () -> Unit, work: () -> Unit) {
    try {
      executor.execute {
        if (closed.get()) unavailable() else work()
      }
    } catch (_: RejectedExecutionException) {
      unavailable()
    }
  }

  fun close() {
    closed.set(true)
    // Drain queued calls through their unavailable callback. Do not use shutdownNow:
    // interrupting Tasks.await would free a bitmap that ML Kit may still be reading.
    executor.shutdown()
  }
}

/** Restore interruption only after the asynchronous reader has actually settled. */
internal fun <T> awaitReceiptSettlement(await: () -> T): T {
  var interrupted = false
  try {
    while (true) {
      try {
        return await()
      } catch (_: InterruptedException) {
        interrupted = true
      }
    }
  } finally {
    if (interrupted) Thread.currentThread().interrupt()
  }
}
