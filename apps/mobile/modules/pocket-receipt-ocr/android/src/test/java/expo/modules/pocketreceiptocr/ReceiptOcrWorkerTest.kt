package expo.modules.pocketreceiptocr

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class ReceiptOcrWorkerTest {
  @Test fun teardownLetsActiveReadSettleAndRejectsQueuedWork() {
    val worker = ReceiptOcrWorker()
    val started = CountDownLatch(1)
    val settle = CountDownLatch(1)
    val finished = CountDownLatch(1)
    val rejected = CountDownLatch(2)
    val interrupted = AtomicBoolean(false)
    val queuedRan = AtomicBoolean(false)
    try {
      worker.submit({ fail("Active request rejected") }) {
        started.countDown()
        try {
          settle.await()
        } catch (_: InterruptedException) {
          interrupted.set(true)
        } finally {
          finished.countDown()
        }
      }
      assertTrue(started.await(5, TimeUnit.SECONDS))
      worker.submit({ rejected.countDown() }) { queuedRan.set(true) }
      worker.close()
      worker.submit({ rejected.countDown() }) { queuedRan.set(true) }
      assertEquals(1L, finished.count)
      settle.countDown()
      assertTrue(finished.await(5, TimeUnit.SECONDS))
      assertTrue(rejected.await(5, TimeUnit.SECONDS))
      assertFalse(interrupted.get())
      assertFalse(queuedRan.get())
    } finally {
      settle.countDown()
      worker.close()
    }
  }

  @Test fun interruptionIsRestoredOnlyAfterSettlement() {
    val started = CountDownLatch(1)
    val settled = CountDownLatch(1)
    val finished = CountDownLatch(1)
    val restored = AtomicBoolean(false)
    val thread = Thread {
      awaitReceiptSettlement {
        started.countDown()
        settled.await()
      }
      restored.set(Thread.currentThread().isInterrupted)
      finished.countDown()
    }
    thread.start()
    try {
      assertTrue(started.await(5, TimeUnit.SECONDS))
      thread.interrupt()
      assertEquals(1L, finished.count)
      settled.countDown()
      assertTrue(finished.await(5, TimeUnit.SECONDS))
      assertTrue(restored.get())
    } finally {
      settled.countDown()
      thread.join(5000)
    }
  }
}
