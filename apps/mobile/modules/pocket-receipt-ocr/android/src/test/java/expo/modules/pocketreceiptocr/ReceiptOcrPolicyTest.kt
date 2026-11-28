package expo.modules.pocketreceiptocr

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class ReceiptOcrPolicyTest {
  @Test fun restrictsCanonicalPathsToAppRoots() {
    val directory = Files.createTempDirectory("receipt-ocr-test").toFile()
    try {
      val cache = directory.resolve("cache").apply { mkdir() }
      val receipt = cache.resolve("receipt.jpg").apply { writeText("fixture") }
      val outside = directory.resolve("cache-other").apply { mkdir() }
        .resolve("private.jpg").apply { writeText("private") }
      assertEquals(receipt.canonicalFile, ReceiptOcrPolicy.readableFile(receipt, listOf(cache)))
      for (file in listOf(outside, cache.resolve("../cache-other/private.jpg"), cache, cache.resolve("missing"))) {
        assertThrows(IllegalArgumentException::class.java) { ReceiptOcrPolicy.readableFile(file, listOf(cache)) }
      }
    } finally {
      directory.deleteRecursively()
    }
  }

  @Test fun limitsDecodedSize() {
    assertEquals(1, ReceiptOcrPolicy.sampleSize(2000, 2000))
    assertEquals(2, ReceiptOcrPolicy.sampleSize(4096, 2048))
    assertEquals(2, ReceiptOcrPolicy.sampleSize(4097, 2048))
    assertEquals(4, ReceiptOcrPolicy.sampleSize(10000, 5000))
  }

  @Test fun squareImagesRespectPixelBudget() {
    assertEquals(4, ReceiptOcrPolicy.sampleSize(4096, 4096))
    for ((width, height) in listOf(4096 to 4096, 7000 to 7000, 10000 to 5000, 4097 to 975)) {
      val sample = ReceiptOcrPolicy.sampleSize(width, height)
      val decodedPixels = ((width.toLong() + sample - 1) / sample) *
        ((height.toLong() + sample - 1) / sample)
      assertTrue(decodedPixels <= ReceiptOcrPolicy.MAX_DECODED_PIXELS)
    }
  }

  @Test fun rejectsInvalidOrOversizedDimensions() {
    for ((width, height) in listOf(0 to 100, -1 to 100, 10001 to 5000, Int.MAX_VALUE to Int.MAX_VALUE)) {
      assertThrows(IllegalArgumentException::class.java) { ReceiptOcrPolicy.sampleSize(width, height) }
    }
  }

  @Test fun boundsUseTopLeftNormalizedCoordinates() {
    assertEquals(mapOf("x" to 0.1, "y" to 0.2, "width" to 0.5, "height" to 0.3),
      ReceiptOcrPolicy.bounds(10, 40, 60, 100, 100, 200))
    assertEquals(mapOf("x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0),
      ReceiptOcrPolicy.bounds(-10, -10, 110, 210, 100, 200))
  }

  @Test fun unknownConfidenceCannotBecomeHighConfidence() {
    assertEquals(0.0, ReceiptOcrPolicy.confidence(Float.NaN), 0.0)
    assertEquals(0.0, ReceiptOcrPolicy.confidence(-1f), 0.0)
    assertEquals(0.0, ReceiptOcrPolicy.confidence(Float.POSITIVE_INFINITY), 0.0)
    assertEquals(0.0, ReceiptOcrPolicy.confidence(2f), 0.0)
    assertEquals(0.75, ReceiptOcrPolicy.confidence(0.75f), 0.0)
  }
}
