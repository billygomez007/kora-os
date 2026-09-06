package com.realtegic.kora.feature.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
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
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.SessionState
import com.realtegic.kora.core.session.StoredSession
import com.realtegic.kora.core.session.TokenStore
import com.squareup.moshi.Moshi
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class SplashFakeAuthApi : AuthApi {
    val refreshResults = ArrayDeque<Response<ApiSuccessEnvelope<AuthResultDto>>>()
    var refreshThrows: Throwable? = null

    override suspend fun requestOtp(body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> = notImplemented()
    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> {
        refreshThrows?.let { throw it }
        return refreshResults.removeFirst()
    }
    override suspend fun logout(): Response<Unit> = Response.success(Unit)
    override suspend fun logoutAll(): Response<Unit> = Response.success(Unit)
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun authResult(refreshToken: String) = AuthResultDto(
    user = AuthUserDto(id = "user-1", email = "ama@example.test", displayName = "Ama Owusu"),
    accessToken = "access-token",
    accessTokenExpiresInSeconds = 900,
    refreshToken = refreshToken,
    session = AuthSessionDto(id = "session-1", expiresAt = "2027-01-01T00:00:00Z"),
)

private fun refreshSuccess(refreshToken: String = "new-refresh") =
    Response.success(ApiSuccessEnvelope(data = authResult(refreshToken), meta = ApiMeta("req")))

private fun refreshRejected() = Response.error<ApiSuccessEnvelope<AuthResultDto>>(
    401,
    """{"error":{"code":"REFRESH_INVALID","message":"invalid","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

/**
 * The splash screen's own session-restoration wiring (docs task Phase 3).
 * The state machine itself (valid/expired/revoked/network-failure) is
 * already thoroughly covered at the [SessionManager] layer -- this only
 * confirms the thin view-model wrapper around it: it restores exactly
 * once on creation and exposes whatever state came back, and
 * [SplashViewModel.retry] genuinely re-runs restoration rather than just
 * replaying a cached result.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SplashViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private var prefsCounter = 0

    private fun newTokenStore(): TokenStore {
        val prefs = context.getSharedPreferences("splash_vm_test_prefs_${prefsCounter++}", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        return TokenStore(context, prefsProvider = { prefs })
    }

    @Test
    fun `no stored session resolves straight to SignedOut`() {
        val sessionManager = SessionManager(newTokenStore(), SplashFakeAuthApi(), Moshi.Builder().build())
        val viewModel = SplashViewModel(AuthRepository(SplashFakeAuthApi(), sessionManager, Moshi.Builder().build()))

        assertEquals(SessionState.SignedOut, viewModel.sessionState.value)
    }

    @Test
    fun `a valid stored session resolves to SignedIn`() {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("old-refresh", "session-1", "user-1", "Ama Owusu", "ama@example.test"))
        val api = SplashFakeAuthApi().apply { refreshResults.add(refreshSuccess()) }
        val sessionManager = SessionManager(tokenStore, api, Moshi.Builder().build())
        val viewModel = SplashViewModel(AuthRepository(api, sessionManager, Moshi.Builder().build()))

        assertTrue(viewModel.sessionState.value is SessionState.SignedIn)
    }

    @Test
    fun `an expired or revoked session resolves to SignedOut, never left ambiguous`() {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("revoked-refresh", "session-1", "user-1", "Ama Owusu", "ama@example.test"))
        val api = SplashFakeAuthApi().apply { refreshResults.add(refreshRejected()) }
        val sessionManager = SessionManager(tokenStore, api, Moshi.Builder().build())
        val viewModel = SplashViewModel(AuthRepository(api, sessionManager, Moshi.Builder().build()))

        assertEquals(SessionState.SignedOut, viewModel.sessionState.value)
    }

    @Test
    fun `a network failure produces RestorationFailed, and retry genuinely restores again`() {
        val tokenStore = newTokenStore()
        tokenStore.save(StoredSession("some-refresh", "session-1", "user-1", "Ama Owusu", "ama@example.test"))
        val api = SplashFakeAuthApi().apply { refreshThrows = IOException("offline") }
        val sessionManager = SessionManager(tokenStore, api, Moshi.Builder().build())
        val viewModel = SplashViewModel(AuthRepository(api, sessionManager, Moshi.Builder().build()))

        assertTrue(viewModel.sessionState.value is SessionState.RestorationFailed)

        api.refreshThrows = null
        api.refreshResults.add(refreshSuccess())
        viewModel.retry()

        assertTrue(viewModel.sessionState.value is SessionState.SignedIn)
    }
}
