package com.realtegic.kora.core.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

private const val PREFS_FILE_NAME = "kora_secure_session"
private const val MASTER_KEY_ALIAS = "kora_secure_session_master_key"
private const val KEY_REFRESH_TOKEN = "refresh_token"
private const val KEY_SESSION_ID = "session_id"
private const val KEY_USER_ID = "user_id"
private const val KEY_DISPLAY_NAME = "display_name"
private const val KEY_EMAIL = "email"

data class StoredSession(
    val refreshToken: String,
    val sessionId: String,
    val userId: String,
    val displayName: String,
    val email: String?,
)

/**
 * Android Keystore-backed AES-GCM encrypted storage for the refresh
 * token and the minimal session metadata needed to restore a session
 * without a network round trip first (docs task Phase 3: "Secure token
 * handling"). Never stores an access token here -- the access token
 * lives only in memory, in [SessionManager]. Built on
 * `androidx.security.crypto.EncryptedSharedPreferences`, which itself
 * uses a Keystore-managed [MasterKey] (AES256-GCM) and encrypts both
 * keys (AES256-SIV) and values (AES256-GCM) -- the same primitive the
 * task calls for, via the audited AndroidX implementation rather than a
 * hand-rolled Cipher/KeyStore integration.
 *
 * If the underlying Keystore key has been invalidated (e.g. device
 * credentials changed) or the encrypted file is otherwise unreadable,
 * every method here fails safe: the corrupted file is deleted and the
 * caller sees "no stored session", never a crash or a caller-visible
 * decryption exception (docs task Phase 3: "handle invalidated/missing
 * Keystore keys by safely signing the user out").
 *
 * [prefsProvider] exists solely as a unit-testing seam: production code
 * always uses the default, real Keystore-backed factory. A hardware (or
 * emulated) Android Keystore does not exist inside a plain-JVM Robolectric
 * test, so tests substitute a plain [SharedPreferences] to verify this
 * class's own field-mapping logic; the real encrypted round trip is
 * exercised by AndroidX's own test suite plus this app's connected tests.
 */
class TokenStore(
    private val context: Context,
    private val prefsProvider: () -> SharedPreferences = { createEncryptedPrefs(context) },
) {

    fun save(session: StoredSession) {
        runCatching {
            prefs().edit()
                .putString(KEY_REFRESH_TOKEN, session.refreshToken)
                .putString(KEY_SESSION_ID, session.sessionId)
                .putString(KEY_USER_ID, session.userId)
                .putString(KEY_DISPLAY_NAME, session.displayName)
                .putString(KEY_EMAIL, session.email)
                .apply()
        }.onFailure { logAndReset(it) }
    }

    /** Called after a successful refresh -- only the rotated refresh
     * token (and session id, which does not rotate) change; user
     * display info is left untouched. */
    fun updateRefreshToken(refreshToken: String, sessionId: String) {
        runCatching {
            prefs().edit()
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .putString(KEY_SESSION_ID, sessionId)
                .apply()
        }.onFailure { logAndReset(it) }
    }

    fun load(): StoredSession? {
        return runCatching {
            val p = prefs()
            val refreshToken = p.getString(KEY_REFRESH_TOKEN, null) ?: return@runCatching null
            val sessionId = p.getString(KEY_SESSION_ID, null) ?: return@runCatching null
            val userId = p.getString(KEY_USER_ID, null) ?: return@runCatching null
            val displayName = p.getString(KEY_DISPLAY_NAME, null) ?: return@runCatching null
            StoredSession(
                refreshToken = refreshToken,
                sessionId = sessionId,
                userId = userId,
                displayName = displayName,
                email = p.getString(KEY_EMAIL, null),
            )
        }.getOrElse {
            logAndReset(it)
            null
        }
    }

    fun clear() {
        runCatching { prefs().edit().clear().apply() }
            .onFailure { logAndReset(it) }
    }

    private fun logAndReset(error: Throwable) {
        Log.w("Kora.TokenStore", "Secure session storage was unreadable; clearing and signing out.", error)
        runCatching { context.deleteSharedPreferences(PREFS_FILE_NAME) }
    }

    private fun prefs(): SharedPreferences = prefsProvider()
}

private fun createEncryptedPrefs(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context, MASTER_KEY_ALIAS)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    return EncryptedSharedPreferences.create(
        context,
        PREFS_FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
}
