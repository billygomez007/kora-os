package com.realtegic.kora.core.session

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.AuthSessionDto
import com.realtegic.kora.core.model.AuthUserDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.network.AuthApi
import com.squareup.moshi.Moshi
import java.io.IOException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeAuthApi : AuthApi {
    val refreshResults = ArrayDeque<Response<ApiSuccessEnvelope<AuthResultDto>>>()
    var refreshCallCount = 0

    override suspend fun requestOtp(body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> = notImplemented()
    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()

    override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> {
        refreshCallCount++
        return refreshResults.removeFirst()
    }

    override suspend fun logout(): Response<Unit> = Response.success(Unit)
    override suspend fun logoutAll(): Response<Unit> = Response.success(Unit)
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FailingLogoutAuthApi : AuthApi by FakeAuthApi() {
    override suspend fun logout(): Response<Unit> = throw IOException("offline")
}

private fun authResult(accessToken: String, refreshToken: String, sessionId: String = "session-1") = AuthResultDto(
    user = AuthUserDto(id = "user-1", email = "ama@example.test", displayName = "Ama Owusu"),
    accessToken = accessToken,
    accessTokenExpiresInSeconds = 900,
    refreshToken = refreshToken,
    session = AuthSessionDto(id = sessionId, expiresAt = "2027-01-01T00:00:00Z"),
)

private fun success(result: AuthResultDto): Response<ApiSuccessEnvelope<AuthResultDto>> =
    Response.success(ApiSuccessEnvelope(data = result, meta = ApiMeta("req-1")))

private fun httpError(status: Int): Response<ApiSuccessEnvelope<AuthResultDto>> =
    Response.error(status, "{}".toResponseBody("application/json".toMediaType()))

/**
 * The security-critical refresh-rotation contract (docs task Phase 3):
 * a single coordinated refresh under concurrent 401s, atomic token
 * replacement, transient-vs-definitive failure handling, and logout
 * that always clears local state.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SessionManagerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val moshi = Moshi.Builder().build()

    // Robolectric's plain-JVM environment has no real Android Keystore, so
    // these tests exercise SessionManager's own logic against a plain
    // SharedPreferences via TokenStore's test-only `prefsProvider` seam
    // (see TokenStoreTest for why). Real Keystore-backed persistence is
    // covered by TokenStoreTest's dedicated fail-safe test plus this app's
    // connected/instrumented tests.
    private val testPrefs = context.getSharedPreferences("test_session_manager_prefs", Context.MODE_PRIVATE)
    private fun newTokenStore() = TokenStore(context, prefsProvider = { testPrefs })

    @Before
    fun setUp() {
        testPrefs.edit().clear().commit()
    }

    @Test
    fun `restoreSession returns SignedOut when nothing was ever stored`() = runTest {
        val sessionManager = SessionManager(newTokenStore(), FakeAuthApi(), moshi)
        val state = sessionManager.restoreSession()
        assertEquals(SessionState.SignedOut, state)
    }

    @Test
    fun `restoreSession exchanges the stored refresh token and reports SignedIn on success`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("old-refresh", "old-session", "user-1", "Ama Owusu", "ama@example.test"))
        val api = FakeAuthApi().apply { refreshResults.add(success(authResult("new-access", "new-refresh"))) }

        val sessionManager = SessionManager(tokenStore, api, moshi)
        val state = sessionManager.restoreSession()

        assertTrue(state is SessionState.SignedIn)
        assertEquals("new-refresh", tokenStore.load()?.refreshToken)
        assertEquals("new-access", sessionManager.currentAccessToken())
    }

    @Test
    fun `restoreSession keeps the stored session on a transient network failure, never signing out`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("refresh", "session", "user-1", "Ama Owusu", null))
        val api = object : AuthApi by FakeAuthApi() {
            override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = throw IOException("offline")
        }

        val sessionManager = SessionManager(tokenStore, api, moshi)
        val state = sessionManager.restoreSession()

        assertTrue(state is SessionState.RestorationFailed)
        assertEquals("refresh", tokenStore.load()?.refreshToken) // never cleared
    }

    @Test
    fun `restoreSession clears the session on a definitive rejection (invalid or reused refresh token)`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("refresh", "session", "user-1", "Ama Owusu", null))
        val api = FakeAuthApi().apply { refreshResults.add(httpError(401)) }

        val sessionManager = SessionManager(tokenStore, api, moshi)
        val state = sessionManager.restoreSession()

        assertEquals(SessionState.SignedOut, state)
        assertNull(tokenStore.load())
    }

    @Test
    fun `concurrent refresh attempts for the same failed token perform exactly one network call`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("refresh-1", "session-1", "user-1", "Ama Owusu", null))
        val api = FakeAuthApi().apply { refreshResults.add(success(authResult("new-access", "refresh-2"))) }
        val sessionManager = SessionManager(tokenStore, api, moshi)
        sessionManager.completeSignIn(authResult("old-access", "refresh-1"))

        val results = listOf(
            async { sessionManager.refreshIfNeeded("old-access") },
            async { sessionManager.refreshIfNeeded("old-access") },
        ).awaitAll()

        assertEquals(1, api.refreshCallCount)
        assertEquals(listOf("new-access", "new-access"), results)
    }

    @Test
    fun `a caller whose failed token no longer matches current gets the already-refreshed token without a new call`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("refresh-1", "session-1", "user-1", "Ama Owusu", null))
        val api = FakeAuthApi() // no results enqueued -- a second network call would throw NoSuchElementException
        val sessionManager = SessionManager(tokenStore, api, moshi)
        sessionManager.completeSignIn(authResult("current-access", "refresh-1"))

        // The caller's failed token is already stale (someone else refreshed first) -- must not call the network at all.
        val token = sessionManager.refreshIfNeeded("some-other-stale-token")

        assertEquals("current-access", token)
        assertEquals(0, api.refreshCallCount)
    }

    @Test
    fun `refresh failure clears the session so no refresh loop can ever occur`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("refresh-1", "session-1", "user-1", "Ama Owusu", null))
        val api = FakeAuthApi().apply { refreshResults.add(httpError(401)) }
        val sessionManager = SessionManager(tokenStore, api, moshi)
        sessionManager.completeSignIn(authResult("old-access", "refresh-1"))

        val token = sessionManager.refreshIfNeeded("old-access")

        assertNull(token)
        assertNull(tokenStore.load())
        assertEquals(SessionState.SignedOut, sessionManager.sessionState.value)
    }

    @Test
    fun `logout clears local session material even when the server call fails`() = runTest {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("refresh-1", "session-1", "user-1", "Ama Owusu", null))
        val sessionManager = SessionManager(tokenStore, FailingLogoutAuthApi(), moshi)
        sessionManager.completeSignIn(authResult("access", "refresh-1"))

        sessionManager.logout()

        assertNull(tokenStore.load())
        assertNull(sessionManager.currentAccessToken())
        assertEquals(SessionState.SignedOut, sessionManager.sessionState.value)
    }
}
