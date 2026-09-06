package com.realtegic.kora.feature.customer.home

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.CustomerProfileRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.CustomerProfileDto
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.model.UpdateCustomerProfileRequest
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.CustomerProfileApi
import com.realtegic.kora.core.network.DiscoveryApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class RaceDiscoveryApi : DiscoveryApi {
    val startedSearches = mutableListOf<Int>()
    /** Call N suspends here until the test completes it -- lets a test
     * hold an earlier search open while a later one is allowed to finish
     * first, to prove the earlier one's late result cannot clobber it. */
    val gates = mutableMapOf<Int, CompletableDeferred<List<DiscoveryBusinessSummaryDto>>>()
    private var callCount = 0

    override suspend fun categories() = Response.success(ApiSuccessEnvelope(data = emptyList<BusinessCategoryDto>(), meta = ApiMeta("req")))

    override suspend fun searchBusinesses(
        text: String?,
        category: String?,
        verificationStatus: String?,
        nearLat: Double?,
        nearLng: Double?,
        radiusKm: Int?,
        cursor: String?,
        limit: Int?,
    ): Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>> {
        callCount += 1
        val callNumber = callCount
        startedSearches.add(callNumber)
        val result = gates.getOrPut(callNumber) { CompletableDeferred() }.await()
        return Response.success(ApiSuccessEnvelope(data = result, meta = ApiMeta("req")))
    }

    override suspend fun getBusiness(slug: String): Response<ApiSuccessEnvelope<DiscoveryBusinessSummaryDto>> = notImplemented()
    override suspend fun getBranches(slug: String): Response<ApiSuccessEnvelope<List<DiscoveryBranchSummaryDto>>> = notImplemented()
    override suspend fun getServices(slug: String, branchId: String): Response<ApiSuccessEnvelope<List<PublicServiceSummaryDto>>> = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String): Response<ApiSuccessEnvelope<List<PublicProviderSummaryDto>>> = notImplemented()
    override suspend fun getAvailability(slug: String, branchId: String, serviceIds: String, staffProfileId: String?, date: String?, fromDate: String?, toDate: String?): Response<ApiSuccessEnvelope<AvailabilityResultDto>> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class NotImplementedAppointmentsApi : AppointmentsApi {
    override suspend fun book(body: CreateAppointmentRequest) = notImplemented()
    override suspend fun list(cursor: String?, limit: Int?) = Response.success(ApiSuccessEnvelope(data = emptyList<AppointmentDto>(), meta = ApiMeta("req")))
    override suspend fun get(appointmentId: String) = notImplemented()
    override suspend fun cancel(appointmentId: String, body: CancelAppointmentRequest) = notImplemented()
    override suspend fun reschedule(appointmentId: String, body: RescheduleAppointmentRequest) = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class NotImplementedCustomerProfileApi : CustomerProfileApi {
    override suspend fun get(): Response<ApiSuccessEnvelope<CustomerProfileDto>> = notImplemented()
    override suspend fun update(body: UpdateCustomerProfileRequest) = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun business(slug: String) = DiscoveryBusinessSummaryDto(
    organizationId = "org-$slug",
    slug = slug,
    displayName = slug,
    description = null,
    logoImageUrl = null,
    coverImageUrl = null,
    verificationStatus = "VERIFIED",
    categories = emptyList(),
)

/**
 * A live acceptance pass (Kora Customer Marketplace — Live Acceptance
 * and Hardening) surfaced a real race: tapping "Retry" (or anything else
 * that calls `load()` again) while an earlier `loadFeatured()` call was
 * still in flight let that earlier call's late-arriving response
 * overwrite the newer call's already-applied result, since neither
 * `viewModelScope.launch` call was ever cancelled. `HomeViewModel` now
 * cancels each load's own previous job before relaunching -- these
 * tests prove a late first response can no longer clobber an
 * already-applied second one, the same "newer supersedes older"
 * contract `DiscoveryViewModelTest` already proves for search.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class HomeViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(testDispatcher)

    private fun newViewModel(api: RaceDiscoveryApi): HomeViewModel = HomeViewModel(
        discoveryRepository = DiscoveryRepository(api, Moshi.Builder().build()),
        appointmentsRepository = AppointmentsRepository(NotImplementedAppointmentsApi(), Moshi.Builder().build()),
        customerProfileRepository = CustomerProfileRepository(NotImplementedCustomerProfileApi(), Moshi.Builder().build()),
    )

    @Test
    fun `a late response from a superseded load can never overwrite a newer one's already-applied result`() = runTest(testDispatcher) {
        val api = RaceDiscoveryApi()
        val viewModel = newViewModel(api)
        testDispatcher.scheduler.runCurrent() // the initial load's search (call 1) starts and suspends on its gate

        viewModel.load() // e.g. the user tapped "Retry" -- must cancel call 1's job, not merely start call 2 alongside it
        api.gates[2] = CompletableDeferred(listOf(business("fresh")))
        testDispatcher.scheduler.advanceUntilIdle() // call 2 runs to completion uncontested

        assertEquals(listOf(1, 2), api.startedSearches)
        assertTrue(viewModel.state.value.featured is ScreenState.Content)
        assertEquals("fresh", (viewModel.state.value.featured as ScreenState.Content).data.single().slug)

        api.gates.getValue(1).complete(listOf(business("stale"))) // call 1 finally "arrives" after being superseded
        testDispatcher.scheduler.advanceUntilIdle()

        // Cancelling call 1's job means its coroutine never reaches the
        // state-assignment line after this resume -- the fresh result
        // from call 2 must still be showing, not "stale".
        assertTrue(viewModel.state.value.featured is ScreenState.Content)
        assertEquals("fresh", (viewModel.state.value.featured as ScreenState.Content).data.single().slug)
    }

    @Test
    fun `a normal single load still resolves to its own result`() = runTest(testDispatcher) {
        val api = RaceDiscoveryApi()
        val viewModel = newViewModel(api)
        testDispatcher.scheduler.runCurrent()

        api.gates.getValue(1).complete(listOf(business("only")))
        testDispatcher.scheduler.advanceUntilIdle()

        assertTrue(viewModel.state.value.featured is ScreenState.Content)
        assertEquals("only", (viewModel.state.value.featured as ScreenState.Content).data.single().slug)
    }
}
