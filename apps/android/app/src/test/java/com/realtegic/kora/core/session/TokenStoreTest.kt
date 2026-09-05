package com.realtegic.kora.core.session

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A plain-JVM Robolectric test cannot exercise a real Android Keystore --
 * there is no hardware (or emulated) keystore inside it, only the host
 * JDK's own security providers, which have no "AndroidKeyStore" entry.
 * So these tests use a plain [android.content.SharedPreferences] (which
 * Robolectric supports natively) via [TokenStore]'s test-only
 * `prefsProvider` seam to verify this class's own field-mapping logic --
 * the encryption itself is AndroidX's, already tested by AndroidX, and is
 * additionally exercised by this app's connected/instrumented tests on a
 * real device or emulator.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class TokenStoreTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun newTestStore(name: String = "test_kora_secure_session"): TokenStore {
        val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        return TokenStore(context, prefsProvider = { prefs })
    }

    @Test
    fun `round-trips a stored session exactly`() {
        val store = newTestStore()
        val session = StoredSession(
            refreshToken = "refresh-token-123",
            sessionId = "session-1",
            userId = "user-1",
            displayName = "Ama Owusu",
            email = "ama@example.test",
        )

        store.save(session)
        val loaded = store.load()

        assertEquals(session, loaded)
    }

    @Test
    fun `returns null when nothing has ever been stored`() {
        val store = newTestStore()
        assertNull(store.load())
    }

    @Test
    fun `clear removes everything`() {
        val store = newTestStore()
        store.save(StoredSession("rt", "sid", "uid", "Name", null))

        store.clear()

        assertNull(store.load())
    }

    @Test
    fun `updateRefreshToken rotates only the refresh token and session id, keeping display info`() {
        val store = newTestStore()
        store.save(StoredSession("old-refresh", "old-session", "user-1", "Ama Owusu", "ama@example.test"))

        store.updateRefreshToken("new-refresh", "new-session")
        val loaded = store.load()

        assertEquals("new-refresh", loaded?.refreshToken)
        assertEquals("new-session", loaded?.sessionId)
        assertEquals("Ama Owusu", loaded?.displayName)
        assertEquals("ama@example.test", loaded?.email)
    }

    @Test
    fun `a null email is preserved as null, not coerced to a blank string`() {
        val store = newTestStore()
        store.save(StoredSession("rt", "sid", "uid", "No Email User", null))

        assertNull(store.load()?.email)
    }

    @Test
    fun `fails safe rather than crashing when the secure store is unavailable`() {
        // Uses the REAL default (Keystore-backed) factory. This JVM test
        // environment has no AndroidKeyStore provider at all, which is
        // exactly the "missing Keystore key" scenario the docs task asks
        // to handle: TokenStore must never throw, and must report no
        // stored session rather than crash the caller.
        val store = TokenStore(context)
        val loaded = store.load()
        assertNull(loaded)
    }
}
