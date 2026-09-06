package com.realtegic.kora.feature.customer.appointments

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AppointmentItemDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.DiscoveryApi
import com.realtegic.kora.core.network.DomainError
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakeAppointmentsApi : AppointmentsApi {
    var getResult: Response<ApiSuccessEnvelope<AppointmentDto>>? = null
    var cancelResult: Response<ApiSuccessEnvelope<AppointmentDto>>? = null
    var rescheduleResult: Response<ApiSuccessEnvelope<AppointmentDto>>? = null
    var rescheduleRequests = mutableListOf<RescheduleAppointmentRequest>()

    override suspend fun book(body: CreateAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>> = notImplemented()
    override suspend fun list(cursor: String?, limit: Int?): Response<ApiSuccessEnvelope<List<AppointmentDto>>> = notImplemented()
    override suspend fun get(appointmentId: String): Response<ApiSuccessEnvelope<AppointmentDto>> = getResult!!

    override suspend fun cancel(appointmentId: String, body: CancelAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>> =
        cancelResult!!

    override suspend fun reschedule(appointmentId: String, body: RescheduleAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>> {
        rescheduleRequests.add(body)
        return rescheduleResult!!
    }

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FakeDiscoveryApi : DiscoveryApi {
    var branchesResult: Response<ApiSuccessEnvelope<List<DiscoveryBranchSummaryDto>>> =
        Response.success(ApiSuccessEnvelope(data = emptyList(), meta = ApiMeta("req")))

    override suspend fun categories(): Response<ApiSuccessEnvelope<List<BusinessCategoryDto>>> = notImplemented()
    override suspend fun searchBusinesses(text: String?, category: String?, verificationStatus: String?, nearLat: Double?, nearLng: Double?, radiusKm: Int?, cursor: String?, limit: Int?) = notImplemented()
    override suspend fun getBusiness(slug: String): Response<ApiSuccessEnvelope<DiscoveryBusinessSummaryDto>> = notImplemented()
    override suspend fun getBranches(slug: String): Response<ApiSuccessEnvelope<List<DiscoveryBranchSummaryDto>>> = branchesResult
    override suspend fun getServices(slug: String, branchId: String): Response<ApiSuccessEnvelope<List<PublicServiceSummaryDto>>> = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String): Response<ApiSuccessEnvelope<List<PublicProviderSummaryDto>>> = notImplemented()
    override suspend fun getAvailability(slug: String, branchId: String, serviceIds: String, staffProfileId: String?, date: String?, fromDate: String?, toDate: String?): Response<ApiSuccessEnvelope<AvailabilityResultDto>> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun appointment(
    status: String = "CONFIRMED",
    startAt: String = "2026-09-10T10:00:00Z",
    businessSlug: String? = null,
) = AppointmentDto(
    id = "appt-1",
    reference = "REF-1",
    organizationId = "org-1",
    branchId = "branch-1",
    status = status,
    source = "CUSTOMER_APP",
    customerProfileId = "customer-1",
    customerRecordId = "record-1",
    assignedStaffProfileId = "staff-1",
    startAt = startAt,
    endAt = "2026-09-10T10:30:00Z",
    occupiedStartAt = startAt,
    occupiedEndAt = "2026-09-10T10:30:00Z",
    branchTimeZone = "Africa/Accra",
    currency = "GHS",
    totalPriceMinor = 5000,
    cancelledAt = null,
    cancelledReason = null,
    noShowMarkedAt = null,
    version = 1,
    createdAt = "2026-09-05T00:00:00Z",
    updatedAt = "2026-09-05T00:00:00Z",
    items = listOf(AppointmentItemDto("service-1", "Haircut", 30, 5000, "GHS", 0)),
    businessName = "Urban Crown Salon",
    businessSlug = businessSlug,
    providerDisplayName = "Abena Osei",
)

private fun success(appointment: AppointmentDto) =
    Response.success(ApiSuccessEnvelope(data = appointment, meta = ApiMeta("req-1")))

private fun httpError(status: Int, code: String) = Response.error<ApiSuccessEnvelope<AppointmentDto>>(
    status,
    """{"error":{"code":"$code","message":"error","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

/**
 * Cancellation and reschedule always defer eligibility to the server
 * (docs task Phase 7: "the client must not calculate whether a
 * cancellation is allowed") -- the ViewModel only ever forwards the
 * server's response, success or failure, and drives the destructive-
 * action confirmation dialog.
 */
class AppointmentDetailViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var api: FakeAppointmentsApi
    private lateinit var discoveryApi: FakeDiscoveryApi
    private lateinit var viewModel: AppointmentDetailViewModel

    private fun newViewModel() = AppointmentDetailViewModel(
        appointmentId = "appt-1",
        appointmentsRepository = AppointmentsRepository(api, Moshi.Builder().build()),
        discoveryRepository = DiscoveryRepository(discoveryApi, Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        api = FakeAppointmentsApi()
        discoveryApi = FakeDiscoveryApi()
    }

    @Test
    fun `loads the appointment into Content on success`() = runTest {
        api.getResult = success(appointment())
        viewModel = newViewModel()

        assertTrue(viewModel.state.value.appointment is ScreenState.Content)
        assertEquals("appt-1", (viewModel.state.value.appointment as ScreenState.Content).data.id)
    }

    @Test
    fun `a load failure surfaces as an Error state`() = runTest {
        api.getResult = httpError(404, "NOT_FOUND")
        viewModel = newViewModel()

        assertTrue(viewModel.state.value.appointment is ScreenState.Error)
    }

    @Test
    fun `requestCancelConfirmation shows the destructive-action dialog, dismiss hides it`() = runTest {
        api.getResult = success(appointment())
        viewModel = newViewModel()

        viewModel.requestCancelConfirmation()
        assertTrue(viewModel.state.value.showCancelConfirm)

        viewModel.dismissCancelConfirmation()
        assertFalse(viewModel.state.value.showCancelConfirm)
    }

    @Test
    fun `confirming cancel updates the appointment from the server response and closes the dialog`() = runTest {
        api.getResult = success(appointment(status = "CONFIRMED"))
        api.cancelResult = success(appointment(status = "CANCELLED"))
        viewModel = newViewModel()
        viewModel.requestCancelConfirmation()

        viewModel.confirmCancel()

        val state = viewModel.state.value
        assertFalse(state.showCancelConfirm)
        assertFalse(state.isMutating)
        assertEquals("CANCELLED", (state.appointment as ScreenState.Content).data.status)
    }

    @Test
    fun `the server rejecting a cancellation, such as past the cutoff, surfaces as a recoverable action error, not a crash`() = runTest {
        api.getResult = success(appointment())
        api.cancelResult = httpError(409, "CANCELLATION_WINDOW_PASSED")
        viewModel = newViewModel()

        viewModel.confirmCancel()

        val state = viewModel.state.value
        assertTrue(state.actionError is DomainError.Conflict)
        assertTrue(state.appointment is ScreenState.Content) // the original appointment is left untouched
    }

    @Test
    fun `reschedule sends the new start time and updates from the server response on success`() = runTest {
        api.getResult = success(appointment(startAt = "2026-09-10T10:00:00Z"))
        api.rescheduleResult = success(appointment(startAt = "2026-09-11T14:00:00Z"))
        viewModel = newViewModel()

        viewModel.reschedule("2026-09-11T14:00:00Z")

        assertEquals("2026-09-11T14:00:00Z", api.rescheduleRequests.single().startAt)
        assertEquals(
            "2026-09-11T14:00:00Z",
            (viewModel.state.value.appointment as ScreenState.Content).data.startAt,
        )
    }

    @Test
    fun `a SLOT_UNAVAILABLE reschedule failure surfaces as an action error without a client-side pre-check`() = runTest {
        api.getResult = success(appointment())
        api.rescheduleResult = httpError(409, "SLOT_UNAVAILABLE")
        viewModel = newViewModel()

        viewModel.reschedule("2026-09-11T14:00:00Z")

        assertTrue(viewModel.state.value.actionError is DomainError.SlotUnavailable)
    }

    @Test
    fun `clearActionError clears a previously surfaced error`() = runTest {
        api.getResult = success(appointment())
        api.cancelResult = httpError(409, "CANCELLATION_WINDOW_PASSED")
        viewModel = newViewModel()
        viewModel.confirmCancel()
        assertTrue(viewModel.state.value.actionError != null)

        viewModel.clearActionError()

        assertNull(viewModel.state.value.actionError)
    }

    @Test
    fun `loads real branch contact info for Call and Directions only when the business currently resolves publicly`() = runTest {
        api.getResult = success(appointment(businessSlug = "urban-crown"))
        discoveryApi.branchesResult = Response.success(
            ApiSuccessEnvelope(
                data = listOf(
                    DiscoveryBranchSummaryDto(
                        branchId = "branch-1", name = "Main branch", city = "Accra", region = "Greater Accra", countryCode = "GH",
                        latitude = 5.6, longitude = -0.18, publicPhone = "+233241234567", publicEmail = null, openingHoursNote = null,
                    ),
                ),
                meta = ApiMeta("req"),
            ),
        )
        viewModel = newViewModel()

        assertEquals("Accra, Greater Accra", viewModel.state.value.branchLocationLine)
        assertEquals("+233241234567", viewModel.state.value.branchPublicPhone)
        assertEquals(5.6, viewModel.state.value.branchLatitude)
        assertEquals(-0.18, viewModel.state.value.branchLongitude)
    }

    @Test
    fun `never attempts a branch lookup when the appointment carries no businessSlug`() = runTest {
        api.getResult = success(appointment(businessSlug = null))
        viewModel = newViewModel() // discoveryApi.getBranches would throw if this were called

        assertNull(viewModel.state.value.branchPublicPhone)
    }
}
