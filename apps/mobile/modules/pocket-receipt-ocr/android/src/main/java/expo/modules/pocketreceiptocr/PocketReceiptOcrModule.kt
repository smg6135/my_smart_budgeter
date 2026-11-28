package expo.modules.pocketreceiptocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

class PocketReceiptOcrModule : Module() {
  private val worker = ReceiptOcrWorker()

  override fun definition() = ModuleDefinition {
    Name("PocketReceiptOcr")

    OnDestroy { worker.close() }

    // Only enqueue on Expo's shared modulesQueue; all I/O/decoding/waiting is owned.
    AsyncFunction("recognize") { uri: String, promise: Promise ->
      worker.submit(
        unavailable = { promise.reject("ERR_RECEIPT_OCR", "Receipt scanner is unavailable.", null) }
      ) {
        try {
          promise.resolve(recognize(uri))
        } catch (error: IllegalArgumentException) {
          promise.reject("ERR_RECEIPT_OCR", error.message, null)
        } catch (_: Exception) {
          // Never expose local paths or receipt contents through native errors.
          promise.reject("ERR_RECEIPT_OCR", "Cannot read this image on-device. Try another photo.", null)
        }
      }
    }
  }

  private fun recognize(value: String): Map<String, Any> {
    val context = appContext.reactContext ?: error("Missing app context")
    val uri = Uri.parse(value)
    val bytes = when (uri.scheme) {
      "file" -> {
        require(uri.host.isNullOrEmpty() || uri.host == "localhost") { "Choose a receipt from this device." }
        val file = ReceiptOcrPolicy.readableFile(
          File(requireNotNull(uri.path)), listOf(context.filesDir, context.cacheDir)
        )
        file.inputStream()
      }
      else -> throw IllegalArgumentException("Choose a receipt from this device.")
    }.use { stream ->
      // Bound actual bytes rather than trusting picker metadata.
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      while (true) {
        val count = stream.read(buffer)
        if (count < 0) break
        require(output.size() + count <= ReceiptOcrPolicy.MAX_BYTES) { "File exceeds 8 MB." }
        output.write(buffer, 0, count)
      }
      output.toByteArray()
    }
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    options.inSampleSize = ReceiptOcrPolicy.sampleSize(options.outWidth, options.outHeight)
    options.inJustDecodeBounds = false
    options.inPreferredConfig = Bitmap.Config.ARGB_8888
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      ?: error("Unreadable image")
    var upright = decoded
    try {
      val exif = ExifInterface(ByteArrayInputStream(bytes))
      val matrix = Matrix().apply {
        // AndroidX handles all EXIF orientations, including mirrored images.
        if (exif.isFlipped) postScale(-1f, 1f)
        postRotate(exif.rotationDegrees.toFloat())
      }
      upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
      if (upright !== decoded) decoded.recycle()
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      val result = try {
        val task = recognizer.process(InputImage.fromBitmap(upright, 0))
        // No timeout/cancel path may recycle the bitmap before task completion.
        awaitReceiptSettlement { Tasks.await(task) }
      } finally {
        recognizer.close()
      }
      val lines = result.textBlocks.flatMap { it.lines }.filter { it.text.isNotBlank() }
      require(lines.isNotEmpty()) { "No readable text. Retake the photo or choose another photo." }
      require(lines.size <= 1000 && lines.sumOf { it.text.length } <= 64_000) {
        "Too much text in this image. Try a smaller photo."
      }
      return mapOf(
        "engine" to "mlkit", "width" to upright.width, "height" to upright.height,
        "lines" to lines.mapNotNull { line ->
          val rect = line.boundingBox ?: return@mapNotNull null
          if (rect.width() <= 0 || rect.height() <= 0) return@mapNotNull null
          mapOf(
            "text" to line.text.trim(),
            "confidence" to ReceiptOcrPolicy.confidence(line.confidence),
            "bounds" to ReceiptOcrPolicy.bounds(rect.left, rect.top, rect.right, rect.bottom, upright.width, upright.height)
          )
        }.also { require(it.isNotEmpty()) { "No readable text. Retake the photo or choose another photo." } }
      )
    } finally {
      if (upright !== decoded) upright.recycle()
      if (!decoded.isRecycled) decoded.recycle()
    }
  }
}
