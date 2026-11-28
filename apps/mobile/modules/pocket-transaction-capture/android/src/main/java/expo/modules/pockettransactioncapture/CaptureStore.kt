package expo.modules.pockettransactioncapture

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Private, backup-excluded encrypted queue. No network, React runtime or model required. */
internal class CaptureStore(private val context: Context) {
  data class Owner(val id: String, val generation: Long)
  companion object { private val lock = Any(); private const val ALIAS = "pocket-notification-queue-v1" }
  private val prefs get() = context.getSharedPreferences("pocket_capture_config", Context.MODE_PRIVATE)
  private val file get() = AtomicFile(File(context.noBackupFilesDir, "purchase-alerts.enc"))
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setUserAuthenticationRequired(false).build())
    }.generateKey()
  }
  private fun read(): JSONArray {
    // openRead/readFully recovers AtomicFile's backup after process death.
    val data = try { file.readFully() } catch (_: FileNotFoundException) { return JSONArray() }
    require(data.size in 29..1_000_000)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
    return JSONArray(String(cipher.doFinal(data.copyOfRange(12, data.size)), Charsets.UTF_8))
  }
  private fun write(events: JSONArray) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val bytes = cipher.iv + cipher.doFinal(events.toString().toByteArray(Charsets.UTF_8))
    val stream = file.startWrite()
    try { stream.write(bytes); file.finishWrite(stream) } catch (error: Exception) { file.failWrite(stream); throw error }
  }
  fun configure(owner: String, packages: List<String>) = synchronized(lock) {
    require(owner.startsWith("pocket-budget.") && owner.length <= 300)
    require(packages.all { CapturePolicy.apps.containsKey(it) })
    check(prefs.edit().putString("owner", owner).putStringSet("packages", packages.toSet()).commit())
    Unit
  }
  fun selectedOwner(packageName: String): Owner? = synchronized(lock) {
    if (!prefs.getStringSet("packages", emptySet())!!.contains(packageName)) null else
      prefs.getString("owner", null)?.let { Owner(it, prefs.getLong("generation:$it", 0L)) }
  }
  fun append(owner: Owner, packageName: String, notificationKey: String, time: Long, text: String) = synchronized(lock) {
    if (!CapturePolicy.apps.containsKey(packageName) || !CapturePolicy.eligible(text)) return@synchronized
    // Reset invalidates already queued work without reassigning pre-switch alerts.
    if (prefs.getLong("generation:${owner.id}", 0L) != owner.generation) return@synchronized
    val events = read()
    val id = CapturePolicy.eventId(packageName, notificationKey, time, text)
    for (i in 0 until events.length()) if (events.getJSONObject(i).optString("id") == id) return@synchronized
    if (events.length() >= 100) {
      prefs.edit().putInt("dropped", prefs.getInt("dropped", 0) + 1).commit()
      return@synchronized
    }
    val event = JSONObject().put("owner", owner.id).put("id", id)
      .put("provider", CapturePolicy.apps.getValue(packageName)).put("receivedAt", java.time.Instant.ofEpochMilli(time).toString())
      .put("text", CapturePolicy.redact(text))
    events.put(event)
    write(events)
  }
  fun pending(owner: String): List<Map<String, Any>> = synchronized(lock) {
    val events = read()
    (0 until events.length()).map { events.getJSONObject(it) }.filter { it.optString("owner") == owner }.map { event ->
      mapOf("id" to event.getString("id"), "provider" to event.getString("provider"),
        "receivedAt" to event.getString("receivedAt"), "text" to event.getString("text"))
    }
  }
  fun acknowledge(owner: String, ids: List<String>) = synchronized(lock) {
    val remove = ids.toSet()
    val old = read(); val retained = JSONArray()
    for (i in 0 until old.length()) {
      val event = old.getJSONObject(i)
      if (event.optString("owner") != owner || !remove.contains(event.optString("id"))) retained.put(event)
    }
    write(retained)
  }
  fun clear(owner: String) = synchronized(lock) {
    check(prefs.edit().putLong("generation:$owner", prefs.getLong("generation:$owner", 0L) + 1L).commit())
    acknowledge(owner, pending(owner).map { it.getValue("id") as String })
    if (prefs.getString("owner", null) == owner) check(prefs.edit().putStringSet("packages", emptySet()).commit())
    Unit
  }
  fun dropped() = prefs.getInt("dropped", 0)
  fun failed() { prefs.edit().putBoolean("error", true).commit() }
  fun error(): Boolean = prefs.getBoolean("error", false)
}
