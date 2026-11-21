package expo.modules.pocketdeviceai

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import java.net.URI
import java.security.MessageDigest

class PocketDeviceAiModule : Module() {
  private val model by lazy { Generation.getClient() }
  override fun definition() = ModuleDefinition {
    Name("PocketDeviceAi")
    AsyncFunction("availability") Coroutine {
      try {
        val status = withTimeout(3000) { model.checkStatus() }
        if (status == FeatureStatus.AVAILABLE) mapOf("available" to true)
        else mapOf("available" to false, "reason" to "Gemini Nano is not available yet.")
      } catch (_: Exception) {
        // AICore can be absent or throw even on some otherwise eligible devices.
        mapOf("available" to false, "reason" to "Gemini Nano is unavailable on this device.")
      }
    }
    AsyncFunction("generate") Coroutine { prompt: String ->
      require(prompt.length <= 12000) { "Shorten the message." }
      withTimeout(45000) {
        val response = model.generateContent(generateContentRequest(TextPart(prompt)) {
          temperature = 0.0f
          maxOutputTokens = 192
        })
        response.candidates.firstOrNull()?.text ?: ""
      }
    }
    AsyncFunction("verifyModel") Coroutine { uri: String, bytes: Long, sha: String ->
      withContext(Dispatchers.IO) {
        val root = File(requireNotNull(appContext.reactContext).filesDir, "pocket-models").canonicalPath + File.separator
        val path = File(URI(uri)).canonicalFile
        if (!path.path.startsWith(root) || bytes <= 0 || path.length() != bytes || sha.length != 64) false
        else {
          val digest = MessageDigest.getInstance("SHA-256")
          path.inputStream().buffered().use { input ->
            val buffer = ByteArray(1024 * 1024)
            var read = input.read(buffer)
            while (read > 0) { digest.update(buffer, 0, read); read = input.read(buffer) }
          }
          digest.digest().joinToString("") { "%02x".format(it) } == sha.lowercase()
        }
      }
    }
  }
}
