package com.realtegic.kora.feature.auth

import android.content.Context
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.TokenStore
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class OtpScreenFakeAuthApi : AuthApi {
    var verifyOtpResult: Response<ApiSuccessEnvelope<AuthResultDto>>? = null

    override suspend fun requestOtp(body: RequestEmailOtpRequest) = Response.success(
        ApiSuccessEnvelope(data = RequestEmailOtpResponse(challengeId = "challenge-1", expiresAt = "2027-01-01T00:05:00Z"), meta = ApiMeta("req")),
    )

    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = verifyOtpResult!!
    override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun logout(): Response<Unit> = Response.success(Unit)
    override suspend fun logoutAll(): Response<Unit> = Response.success(Unit)
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun httpError(status: Int, code: String) = Response.error<ApiSuccessEnvelope<AuthResultDto>>(
    status,
    """{"error":{"code":"$code","message":"error","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

/**
 * The OTP entry screen: the verify button only enables once a plausible
 * code length is reached, and a terminal failure shows the server's own
 * safe error message rather than a raw exception (docs task Phase 3 &
 * 12).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OtpVerifyScreenTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var fakeApi: OtpScreenFakeAuthApi
    private lateinit var viewModel: AuthViewModel

    @Before
    fun setUp() {
        val prefs = context.getSharedPreferences("test_otp_screen_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        fakeApi = OtpScreenFakeAuthApi()
        val tokenStore = TokenStore(context, prefsProvider = { prefs })
        val sessionManager = SessionManager(tokenStore, fakeApi, Moshi.Builder().build())
        val authRepository = AuthRepository(fakeApi, sessionManager, Moshi.Builder().build())
        viewModel = AuthViewModel(authRepository)
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail() // moves to OTP_VERIFY synchronously under the eager test dispatcher
    }

    @Test
    fun `the verify button is disabled until a plausible code length is entered`() {
        composeRule.setContent { KoraTheme { OtpVerifyScreen(viewModel = viewModel, onBack = {}, onSignedIn = {}) } }

        composeRule.onNodeWithText("Verify and sign in").assertIsNotEnabled()

        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("1234")

        composeRule.onNodeWithText("Verify and sign in").assertIsEnabled()
    }

    @Test
    fun `a terminal verification failure shows the server's safe error message`() {
        fakeApi.verifyOtpResult = httpError(401, "OTP_INVALID")
        composeRule.setContent { KoraTheme { OtpVerifyScreen(viewModel = viewModel, onBack = {}, onSignedIn = {}) } }
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("999999")

        composeRule.onNodeWithText("Verify and sign in").performClick()

        composeRule.onNodeWithText("Your session has expired. Please sign in again.").assertExists()
    }
}
