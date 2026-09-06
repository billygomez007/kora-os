package com.realtegic.kora.feature.customer.profile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.CustomerProfileRepository
import com.realtegic.kora.core.location.ApproximateLocationProvider
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.CustomerProfileDto
import com.realtegic.kora.core.model.UpdateCustomerProfileRequest
import com.realtegic.kora.core.network.CustomerProfileApi
import com.realtegic.kora.core.network.DomainError
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

private fun profile(phoneE164: String? = null) = CustomerProfileDto(
    id = "profile-1",
    displayName = "",
    email = "ama@example.test",
    phoneE164 = phoneE164,
    city = null,
    area = null,
    latitude = null,
    longitude = null,
    locationConsentedAt = null,
)

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

    private fun buildViewModel(api: FakeCustomerProfileApi): CustomerProfileSetupViewModel {
        val repository = CustomerProfileRepository(api, Moshi.Builder().build())
        return CustomerProfileSetupViewModel(repository, ApproximateLocationProvider(context))
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
