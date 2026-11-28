package expo.modules.pocketreceiptocr

import java.io.File

internal object ReceiptOcrPolicy {
  const val MAX_BYTES = 8 * 1024 * 1024
  const val MAX_DECODED_PIXELS = 4_000_000L

  fun readableFile(file: File, roots: List<File>): File {
    val canonical = file.canonicalFile
    require(canonical.isFile && roots.any {
      canonical.path.startsWith(it.canonicalPath + File.separator)
    }) { "Choose a receipt from this device." }
    return canonical
  }

  fun sampleSize(width: Int, height: Int): Int {
    require(width > 0 && height > 0) { "Cannot read this image on-device. Try another photo." }
    require(width.toLong() * height <= 50_000_000L) {
      "Photo exceeds 50 megapixels. Use a smaller photo."
    }
    var sample = 1
    while (true) {
      val decodedWidth = (width.toLong() + sample - 1) / sample
      val decodedHeight = (height.toLong() + sample - 1) / sample
      if (maxOf(decodedWidth, decodedHeight) <= 4096 &&
        decodedWidth * decodedHeight <= MAX_DECODED_PIXELS) break
      sample *= 2
    }
    return sample
  }

  fun confidence(value: Float): Double =
    if (value.isFinite() && value in 0f..1f) value.toDouble() else 0.0

  fun bounds(left: Int, top: Int, right: Int, bottom: Int, width: Int, height: Int): Map<String, Double> {
    val x = left.coerceIn(0, width).toDouble() / width
    val y = top.coerceIn(0, height).toDouble() / height
    return mapOf(
      "x" to x, "y" to y,
      "width" to (right.coerceIn(0, width).toDouble() / width - x).coerceAtLeast(0.0),
      "height" to (bottom.coerceIn(0, height).toDouble() / height - y).coerceAtLeast(0.0)
    )
  }
}
