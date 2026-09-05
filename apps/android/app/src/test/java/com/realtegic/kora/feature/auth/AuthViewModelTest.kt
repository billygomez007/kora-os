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
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.TokenStore
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeAuthApi : AuthApi {
    var requestOtpResult: Response<ApiSuccessEnvelope<RequestEmailOtpResponse>>? = null
    var verifyOtpResult: Response<ApiSuccessEnvelope<AuthResultDto>>? = null
    var requestOtpCallCount = 0
    var verifyOtpCallCount = 0

    override suspend fun requestOtp(body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> {
        requestOtpCallCount++
        return requestOtpResult!!
    }

    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> {
        verifyOtpCallCount++
        return verifyOtpResult!!
    }

    override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun logout(): Response<Unit> = Response.success(Unit)
    override suspend fun logoutAll(): Response<Unit> = Response.success(Unit)
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun otpRequested(challengeId: String) = Response.success(
    ApiSuccessEnvelope(
        data = RequestEmailOtpResponse(challengeId = challengeId, expiresAt = "2027-01-01T00:05:00Z"),
        meta = ApiMeta("req-1"),
    ),
)

private fun otpVerified() = Response.success(
    ApiSuccessEnvelope(
        data = AuthResultDto(
            user = AuthUserDto(id = "user-1", email = "ama@example.test", displayName = "Ama Owusu"),
            accessToken = "access-token",
            accessTokenExpiresInSeconds = 900,
            refreshToken = "refresh-token",
            session = AuthSessionDto(id = "session-1", expiresAt = "2027-01-01T00:00:00Z"),
        ),
        meta = ApiMeta("req-2"),
    ),
)

private fun httpError(status: Int) = Response.error<ApiSuccessEnvelope<AuthResultDto>>(
    status,
    "{}".toResponseBody("application/json".toMediaType()),
)

/**
 * OTP UI-state transitions, resend cooldown, and the "a terminal failure
 * always clears the field" rule (docs task Phase 3 & 12). Exercised
 * against a real [AuthRepository]/[SessionManager] backed by a fake
 * [AuthApi] and a plain-SharedPreferences [TokenStore] test double (see
 * TokenStoreTest for why a real Android Keystore is unavailable here) --
 * never a mock of the ViewModel's own collaborators.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AuthViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var fakeApi: FakeAuthApi
    private lateinit var viewModel: AuthViewModel

    @Before
    fun setUp() {
        val prefs = context.getSharedPreferences("test_auth_vm_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        fakeApi = FakeAuthApi()
        val tokenStore = TokenStore(context, prefsProvider = { prefs })
        val sessionManager = SessionManager(tokenStore, fakeApi, Moshi.Builder().build())
        val authRepository = AuthRepository(fakeApi, sessionManager, Moshi.Builder().build())
        viewModel = AuthViewModel(authRepository)
    }

    @Test
    fun `starts on the email-entry step`() {
        assertEquals(AuthStep.EMAIL_ENTRY, viewModel.state.value.step)
    }

    @Test
    fun `changing the email updates state and clears any prior error`() {
        viewModel.onEmailChanged("not-an-email")
        viewModel.submitEmail() // sets a validation error
        assertNotNull(viewModel.state.value.error)

        viewModel.onEmailChanged("ama@example.test")

        assertEquals("ama@example.test", viewModel.state.value.email)
        assertEquals(null, viewModel.state.value.error)
    }

    @Test
    fun `submitting an invalid email sets a validation error without calling the API`() = runTest {
        viewModel.onEmailChanged("not-an-email")

        viewModel.submitEmail()

        assertTrue(viewModel.state.value.error is DomainError.Validation)
        assertEquals(0, fakeApi.requestOtpCallCount)
        assertEquals(AuthStep.EMAIL_ENTRY, viewModel.state.value.step)
    }

    @Test
    fun `submitting a valid email moves to OTP verify and starts the resend cooldown`() = runTest {
        fakeApi.requestOtpResult = otpRequested("challenge-1")
        viewModel.onEmailChanged("ama@example.test")

        viewModel.submitEmail()

        val state = viewModel.state.value
        assertEquals(AuthStep.OTP_VERIFY, state.step)
        assertEquals("challenge-1", state.challengeId)
        assertEquals("", state.otpCode)
        assertEquals(30, state.resendAvailableInSeconds)
    }

    @Test
    fun `a generic response never reveals whether the email failed -- surfaces the mapped domain error only`() = runTest {
        fakeApi.requestOtpResult = Response.error(429, "{}".toResponseBody("application/json".toMediaType()))
        viewModel.onEmailChanged("ama@example.test")

        viewModel.submitEmail()

        assertTrue(viewModel.state.value.error is DomainError.RateLimited)
        assertEquals(AuthStep.EMAIL_ENTRY, viewModel.state.value.step)
    }

    @Test
    fun `resend is a no-op while the cooldown is still running`() = runTest {
        fakeApi.requestOtpResult = otpRequested("challenge-1")
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail()
        assertEquals(1, fakeApi.requestOtpCallCount)

        viewModel.resendCode()

        assertEquals(1, fakeApi.requestOtpCallCount)
    }

    @Test
    fun `the OTP field only accepts digits and caps at 10`() {
        viewModel.onCodeChanged("12a3-45!67890123")
        assertEquals("1234567890", viewModel.state.value.otpCode)
    }

    @Test
    fun `submitting a too-short code sets a validation error`() = runTest {
        fakeApi.requestOtpResult = otpRequested("challenge-1")
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail()

        viewModel.onCodeChanged("12")
        viewModel.submitCode()

        assertTrue(viewModel.state.value.error is DomainError.Validation)
        assertEquals(0, fakeApi.verifyOtpCallCount)
    }

    @Test
    fun `a successful verification signs in and clears the code`() = runTest {
        fakeApi.requestOtpResult = otpRequested("challenge-1")
        fakeApi.verifyOtpResult = otpVerified()
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail()
        viewModel.onCodeChanged("123456")

        viewModel.submitCode()

        val state = viewModel.state.value
        assertTrue(state.signedIn)
        assertEquals("", state.otpCode)
    }

    @Test
    fun `a terminal verification failure clears the code and never leaves a guessed code on screen`() = runTest {
        fakeApi.requestOtpResult = otpRequested("challenge-1")
        fakeApi.verifyOtpResult = httpError(401)
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail()
        viewModel.onCodeChanged("999999")

        viewModel.submitCode()

        val state = viewModel.state.value
        assertEquals("", state.otpCode)
        assertTrue(state.error is DomainError.Unauthorized)
        assertTrue(!state.signedIn)
    }

    @Test
    fun `changeEmail resets the flow back to email entry but keeps the typed email`() = runTest {
        fakeApi.requestOtpResult = otpRequested("challenge-1")
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail()

        viewModel.changeEmail()

        val state = viewModel.state.value
        assertEquals(AuthStep.EMAIL_ENTRY, state.step)
        assertEquals("ama@example.test", state.email)
        assertEquals(null, state.challengeId)
    }
}
