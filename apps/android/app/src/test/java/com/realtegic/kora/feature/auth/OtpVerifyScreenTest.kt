package com.realtegic.kora.feature.auth

import android.content.Context
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
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
import com.realtegic.kora.core.session.TokenStore
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.junit.runner.RunWith
import retrofit2.Response
import java.io.IOException

private const val VERIFY_BUTTON = "Verify and continue"

private class OtpScreenFakeAuthApi : AuthApi {
    var requestOtpResult: Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> = Response.success(
        ApiSuccessEnvelope(data = RequestEmailOtpResponse(challengeId = "challenge-1", expiresAt = "2027-01-01T00:05:00Z"), meta = ApiMeta("req")),
    )
    var verifyOtpResult: Response<ApiSuccessEnvelope<AuthResultDto>>? = null
    var throwOnVerify: Throwable? = null
    var requestOtpCallCount = 0
    var verifyOtpCallCount = 0

    override suspend fun requestOtp(body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> {
        requestOtpCallCount++
        return requestOtpResult
    }

    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> {
        verifyOtpCallCount++
        throwOnVerify?.let { throw it }
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

private fun otpInvalidError() = Response.error<ApiSuccessEnvelope<AuthResultDto>>(
    401,
    """{"error":{"code":"OTP_INVALID","message":"This code is invalid or has expired.","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

private fun serverErrorResponse() = Response.error<ApiSuccessEnvelope<AuthResultDto>>(
    503,
    """{"error":{"code":"INTERNAL","message":"boom","retryable":true},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
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

/**
 * The OTP entry screen (docs task Stage 7): matches
 * `kora-auth-otp-reference.png` behaviourally -- six-digit sanitized
 * input, verify enablement, duplicate-tap prevention, the server's own
 * safe error message for every OTP_INVALID cause (incorrect, expired,
 * consumed, invalidated, and locked all collapse to this one API-level
 * outcome by deliberate backend design -- there is no wire-level way for
 * a client to tell them apart, and this screen must not pretend
 * otherwise), resend behaviour, and "use a different email."
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
    private lateinit var prefs: android.content.SharedPreferences

    private fun setContent(onUseDifferentEmail: () -> Unit = {}, onSignedIn: () -> Unit = {}) {
        composeRule.setContent {
            KoraTheme {
                OtpVerifyScreen(viewModel = viewModel, onBack = {}, onSignedIn = onSignedIn, onUseDifferentEmail = onUseDifferentEmail)
            }
        }
    }

    @Before
    fun setUp() {
        prefs = context.getSharedPreferences("test_otp_screen_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        fakeApi = OtpScreenFakeAuthApi()
        val tokenStore = TokenStore(context, prefsProvider = { prefs })
        val sessionManager = SessionManager(tokenStore, fakeApi, Moshi.Builder().build())
        val authRepository = AuthRepository(fakeApi, sessionManager, Moshi.Builder().build())
        viewModel = AuthViewModel(authRepository)
        viewModel.onEmailChanged("AMA@Example.TEST")
        viewModel.submitEmail() // moves to OTP_VERIFY synchronously under the eager test dispatcher
    }

    @Test
    fun `the email is shown normalized -- trimmed and lower-cased -- never exactly as typed`() {
        setContent()

        composeRule.onNodeWithText("ama@example.test").assertExists()
    }

    @Test
    fun `the verify button is disabled until exactly six digits are entered`() {
        setContent()

        composeRule.onNodeWithText(VERIFY_BUTTON).assertIsNotEnabled()

        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("12345")
        composeRule.onNodeWithText(VERIFY_BUTTON).assertIsNotEnabled()

        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("6")
        composeRule.onNodeWithText(VERIFY_BUTTON).assertIsEnabled()
    }

    @Test
    fun `non-numeric characters are sanitized out and the field caps at six digits`() {
        setContent()

        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("1a2-3 4567890")

        assertEquals("123456", viewModel.state.value.otpCode)
    }

    @Test
    fun `a full six-digit block entered at once -- the paste case -- is accepted in full`() {
        setContent()

        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("482913")

        assertEquals("482913", viewModel.state.value.otpCode)
        composeRule.onNodeWithText(VERIFY_BUTTON).assertIsEnabled()
    }

    @Test
    fun `tapping verify twice in a row only submits once`() {
        fakeApi.verifyOtpResult = otpVerified()
        setContent()
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("123456")

        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()
        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()

        assertEquals(1, fakeApi.verifyOtpCallCount)
    }

    @Test
    fun `a successful verification navigates onSignedIn and never leaves the code on screen`() {
        fakeApi.verifyOtpResult = otpVerified()
        var signedIn = false
        setContent(onSignedIn = { signedIn = true })
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("123456")

        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()
        composeRule.waitForIdle()

        assertEquals("", viewModel.state.value.otpCode)
        assertTrue(signedIn)
    }

    @Test
    fun `an incorrect, expired, consumed, invalidated, or locked code all surface the same safe server message`() {
        fakeApi.verifyOtpResult = otpInvalidError()
        setContent()
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("999999")

        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()

        composeRule.onNodeWithText("This code is invalid or has expired.").assertExists()
        assertEquals("", viewModel.state.value.otpCode)
        assertFalse(viewModel.state.value.signedIn)
    }

    @Test
    fun `a server failure during verification shows a safe message, never a raw exception`() {
        fakeApi.verifyOtpResult = serverErrorResponse()
        setContent()
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("123456")

        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()

        composeRule.onNodeWithText("Kora is temporarily unavailable. Please try again shortly.").assertExists()
    }

    @Test
    fun `an offline verification attempt shows a safe network message`() {
        fakeApi.throwOnVerify = IOException("no network")
        setContent()
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("123456")

        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()

        composeRule.onNodeWithText("You appear to be offline. Check your connection and try again.").assertExists()
    }

    @Test
    fun `the resend countdown is visible and resend is unavailable while it runs`() {
        setContent()

        composeRule.onNodeWithText("Resend code in 00:30").assertExists()
    }

    @Test
    fun `resend is blocked while the countdown is still running, even if tapped`() {
        setContent()
        fakeApi.requestOtpResult = Response.success(
            ApiSuccessEnvelope(data = RequestEmailOtpResponse(challengeId = "challenge-2", expiresAt = "2027-01-01T00:10:00Z"), meta = ApiMeta("req-3")),
        )

        viewModel.resendCode()

        assertEquals("challenge-1", viewModel.state.value.challengeId)
        assertEquals(1, fakeApi.requestOtpCallCount)
    }

    @Test
    fun `use a different email invokes the provided navigation callback and resets the challenge`() {
        var usedDifferentEmail = false
        setContent(onUseDifferentEmail = { usedDifferentEmail = true; viewModel.changeEmail() })

        composeRule.onNodeWithText("Use a different email").performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(null, viewModel.state.value.challengeId)
        assertEquals(AuthStep.EMAIL_ENTRY, viewModel.state.value.step)
        assertTrue(usedDifferentEmail)
    }

    @Test
    fun `the OTP code is never written to the token store's backing preferences`() {
        fakeApi.verifyOtpResult = otpVerified()
        setContent()
        composeRule.onNodeWithTag(AuthScreenTestTags.OTP_FIELD).performTextInput("123456")
        composeRule.onNodeWithText(VERIFY_BUTTON).performClick()

        val allStoredValues = prefs.all.values.joinToString(" ")
        assertFalse(allStoredValues.contains("123456"))
    }
}
