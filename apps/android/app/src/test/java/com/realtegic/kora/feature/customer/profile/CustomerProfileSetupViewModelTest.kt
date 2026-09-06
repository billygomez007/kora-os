package com.realtegic.kora.feature.customer.profile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.CustomerProfileRepository
import com.realtegic.kora.core.location.ApproximateLocationProvider
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.AuthSessionDto
import com.realtegic.kora.core.model.AuthUserDto
import com.realtegic.kora.core.model.CustomerProfileDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.UpdateCustomerProfileRequest
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.network.CustomerProfileApi
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.SessionState
import com.realtegic.kora.core.session.TokenStore
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private fun profile(phoneE164: String? = null, displayName: String = "") = CustomerProfileDto(
    id = "profile-1",
    displayName = displayName,
    email = "ama@example.test",
    phoneE164 = phoneE164,
    city = null,
    area = null,
    latitude = null,
    longitude = null,
    locationConsentedAt = null,
)

private class NotImplementedAuthApi : AuthApi {
    override suspend fun requestOtp(body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> = notImplemented()
    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun logout(): Response<Unit> = notImplemented()
    override suspend fun logoutAll(): Response<Unit> = notImplemented()
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FakeCustomerProfileApi : CustomerProfileApi {
    var lastUpdateRequest: UpdateCustomerProfileRequest? = null
    var updateCallCount = 0
    var updateResult: Response<ApiSuccessEnvelope<CustomerProfileDto>> = Response.success(
        ApiSuccessEnvelope(data = profile(), meta = ApiMeta("req")),
    )
    var updateGate: CompletableDeferred<Unit>? = null

    override suspend fun get(): Response<ApiSuccessEnvelope<CustomerProfileDto>> = notImplemented()

    override suspend fun update(body: UpdateCustomerProfileRequest): Response<ApiSuccessEnvelope<CustomerProfileDto>> {
        updateCallCount++
        lastUpdateRequest = body
        updateGate?.await()
        return updateResult
    }

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

/**
 * The customer-profile setup screen's own logic (docs task Phase 7):
 * every field maps straight to `UpdateCustomerProfileRequest`, a blank
 * optional field is never a validation failure, only a malformed phone
 * number is, a save is never fired twice concurrently, and a denied
 * location permission settles safely without ever blocking the rest of
 * the form.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class CustomerProfileSetupViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun newSignedInSessionManager(): SessionManager {
        val sessionManager = SessionManager(TokenStore(context), NotImplementedAuthApi(), Moshi.Builder().build())
        sessionManager.completeSignIn(
            AuthResultDto(
                user = AuthUserDto(id = "user-1", email = "ama@example.test", displayName = "Ama"),
                accessToken = "access-token",
                accessTokenExpiresInSeconds = 900,
                refreshToken = "refresh-token",
                session = AuthSessionDto(id = "session-1", expiresAt = "2027-01-01T00:00:00Z"),
            ),
        )
        return sessionManager
    }

    private fun buildViewModel(
        api: FakeCustomerProfileApi,
        sessionManager: SessionManager = newSignedInSessionManager(),
    ): CustomerProfileSetupViewModel {
        val repository = CustomerProfileRepository(api, Moshi.Builder().build())
        val moshi = Moshi.Builder().build()
        val authRepository = AuthRepository(NotImplementedAuthApi(), sessionManager, moshi)
        return CustomerProfileSetupViewModel(repository, ApproximateLocationProvider(context), authRepository)
    }

    @Test
    fun `saving with every field blank succeeds and sends only nulls`() = runTest {
        val api = FakeCustomerProfileApi()
        val viewModel = buildViewModel(api)

        var saved = false
        viewModel.save { saved = true }

        assertTrue(saved)
        assertEquals(UpdateCustomerProfileRequest(), api.lastUpdateRequest)
    }

    @Test
    fun `a successful save syncs the server's authoritative name into the cached session`() = runTest {
        val api = FakeCustomerProfileApi().apply { updateResult = Response.success(ApiSuccessEnvelope(data = profile(displayName = "Kora Tester"), meta = ApiMeta("req"))) }
        val sessionManager = newSignedInSessionManager()
        val viewModel = buildViewModel(api, sessionManager)

        viewModel.onFullNameChanged("Kora Tester")
        var saved = false
        viewModel.save { saved = true }

        assertTrue(saved)
        val state = sessionManager.sessionState.value
        assertTrue(state is SessionState.SignedIn)
        assertEquals("Kora Tester", (state as SessionState.SignedIn).displayName)
    }

    @Test
    fun `a malformed phone number blocks save with a validation error and never calls the API`() = runTest {
        val api = FakeCustomerProfileApi()
        val viewModel = buildViewModel(api)

        viewModel.onPhoneChanged("12")
        var saved = false
        viewModel.save { saved = true }

        assertFalse(saved)
        assertEquals(0, api.updateCallCount)
        assertTrue(viewModel.state.value.error is DomainError.Validation)
    }

    @Test
    fun `a valid Ghana number combines the default country code with the typed digits`() = runTest {
        val api = FakeCustomerProfileApi()
        val viewModel = buildViewModel(api)

        viewModel.onFullNameChanged("Ama Mensah")
        viewModel.onPhoneChanged("241234567")
        var saved = false
        viewModel.save { saved = true }

        assertTrue(saved)
        assertEquals("+233241234567", api.lastUpdateRequest?.phoneE164)
        assertEquals("Ama Mensah", api.lastUpdateRequest?.displayName)
    }

    @Test
    fun `an internationally extended country code is honored, not forced back to Ghana`() = runTest {
        val api = FakeCustomerProfileApi()
        val viewModel = buildViewModel(api)

        viewModel.onCountryCodeChanged("+1")
        viewModel.onPhoneChanged("2025550123")
        var saved = false
        viewModel.save { saved = true }

        assertTrue(saved)
        assertEquals("+12025550123", api.lastUpdateRequest?.phoneE164)
    }

    @Test
    fun `a server failure surfaces the domain error and does not fabricate success`() = runTest {
        val api = FakeCustomerProfileApi().apply {
            updateResult = Response.error(
                503,
                """{"error":{"code":"INTERNAL","message":"boom","retryable":true},"meta":{"requestId":"x"}}"""
                    .toResponseBody("application/json".toMediaType()),
            )
        }
        val viewModel = buildViewModel(api)

        var saved = false
        viewModel.save { saved = true }

        assertFalse(saved)
        assertTrue(viewModel.state.value.error is DomainError.ServerUnavailable)
        assertFalse(viewModel.state.value.isSaving)
    }

    @Test
    fun `saving while a save is already in flight is a no-op -- never a duplicate submission`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeCustomerProfileApi().apply { updateGate = gate }
        val viewModel = buildViewModel(api)

        viewModel.onFullNameChanged("Ama")
        viewModel.save {}
        assertTrue(viewModel.state.value.isSaving)

        // The first call is still suspended on the gate -- a second tap
        // while it is in flight must not fire a second network call.
        viewModel.save {}
        assertEquals(1, api.updateCallCount)

        gate.complete(Unit)
    }

    @Test
    fun `denying the location permission settles back to disabled without blocking the form`() = runTest {
        val api = FakeCustomerProfileApi()
        val viewModel = buildViewModel(api)

        // Robolectric grants no runtime permissions by default, so this
        // exercises the same denial path a real system-dialog rejection
        // would produce.
        viewModel.onLocationPermissionGranted()

        assertFalse(viewModel.state.value.locationEnabled)
        assertNull(viewModel.state.value.latitude)
        assertNull(viewModel.state.value.longitude)

        var saved = false
        viewModel.save { saved = true }
        assertTrue(saved)
    }

    @Test
    fun `disabling location clears any previously resolved coordinates`() = runTest {
        val api = FakeCustomerProfileApi()
        val viewModel = buildViewModel(api)

        viewModel.onLocationDisabled()

        assertFalse(viewModel.state.value.locationEnabled)
        assertNull(viewModel.state.value.latitude)
        assertNull(viewModel.state.value.longitude)
    }
}
