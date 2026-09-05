package com.realtegic.kora.feature.customer.booking

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AppointmentItemDto
import com.realtegic.kora.core.model.AvailabilityDayDto
import com.realtegic.kora.core.model.AvailabilityItemDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.AvailabilitySlotDto
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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakeDiscoveryApi : DiscoveryApi {
    var availabilityResult: Response<ApiSuccessEnvelope<AvailabilityResultDto>>? = null
    var availabilityCallCount = 0

    override suspend fun categories(): Response<ApiSuccessEnvelope<List<BusinessCategoryDto>>> = notImplemented()
    override suspend fun searchBusinesses(
        text: String?,
        category: String?,
        nearLat: Double?,
        nearLng: Double?,
        radiusKm: Int?,
        cursor: String?,
        limit: Int?,
    ): Response<ApiSuccessEnvelope<List<DiscoveryBusinessSummaryDto>>> = notImplemented()
    override suspend fun getBusiness(slug: String): Response<ApiSuccessEnvelope<DiscoveryBusinessSummaryDto>> = notImplemented()
    override suspend fun getBranches(slug: String): Response<ApiSuccessEnvelope<List<DiscoveryBranchSummaryDto>>> = notImplemented()
    override suspend fun getServices(slug: String, branchId: String): Response<ApiSuccessEnvelope<List<PublicServiceSummaryDto>>> = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String): Response<ApiSuccessEnvelope<List<PublicProviderSummaryDto>>> = notImplemented()

    override suspend fun getAvailability(
        slug: String,
        branchId: String,
        serviceIds: String,
        staffProfileId: String?,
        date: String?,
        fromDate: String?,
        toDate: String?,
    ): Response<ApiSuccessEnvelope<AvailabilityResultDto>> {
        availabilityCallCount++
        return availabilityResult!!
    }

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FakeAppointmentsApi : AppointmentsApi {
    val bookResults = ArrayDeque<Response<ApiSuccessEnvelope<AppointmentDto>>>()
    val bookedRequests = mutableListOf<CreateAppointmentRequest>()

    /** When set, [book] suspends here until the test completes it -- lets a
     * test observe "submission in flight" state before the call resolves. */
    var holdUntil: CompletableDeferred<Unit>? = null

    override suspend fun book(body: CreateAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>> {
        bookedRequests.add(body)
        holdUntil?.await()
        return bookResults.removeFirst()
    }

    override suspend fun list(cursor: String?, limit: Int?): Response<ApiSuccessEnvelope<List<AppointmentDto>>> = notImplemented()
    override suspend fun get(appointmentId: String): Response<ApiSuccessEnvelope<AppointmentDto>> = notImplemented()
    override suspend fun cancel(appointmentId: String, body: CancelAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>> = notImplemented()
    override suspend fun reschedule(appointmentId: String, body: RescheduleAppointmentRequest): Response<ApiSuccessEnvelope<AppointmentDto>> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun slot(startAt: String, staffProfileId: String = "staff-1") =
    AvailabilitySlotDto(startAt = startAt, endAt = startAt, staffProfileId = staffProfileId)

private fun availability(vararg slots: AvailabilitySlotDto) = Response.success(
    ApiSuccessEnvelope(
        data = AvailabilityResultDto(
            branchTimeZone = "Africa/Accra",
            currency = "GHS",
            totalPriceMinor = 5000,
            items = listOf(AvailabilityItemDto("service-1", "Haircut", 30, 5000, "GHS", true)),
            eligibleProviderIds = listOf("staff-1"),
            days = listOf(AvailabilityDayDto(date = "2026-09-10", slots = slots.toList())),
        ),
        meta = ApiMeta("req-1"),
    ),
)

private fun bookedAppointment(id: String) = Response.success(
    ApiSuccessEnvelope(
        data = AppointmentDto(
            id = id,
            reference = "REF-1",
            organizationId = "org-1",
            branchId = "branch-1",
            status = "CONFIRMED",
            source = "CUSTOMER_APP",
            customerProfileId = "customer-1",
            customerRecordId = "record-1",
            assignedStaffProfileId = "staff-1",
            startAt = "2026-09-10T10:00:00Z",
            endAt = "2026-09-10T10:30:00Z",
            occupiedStartAt = "2026-09-10T10:00:00Z",
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
        ),
        meta = ApiMeta("req-2"),
    ),
)

private fun bookingError(status: Int, code: String) = Response.error<ApiSuccessEnvelope<AppointmentDto>>(
    status,
    """{"error":{"code":"$code","message":"error","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

/**
 * The stable booking idempotency key (docs task Phase 7): one UUID per
 * booking *attempt* (a given service/provider/slot triple), reused across
 * retries of the same attempt, replaced only on a terminal outcome
 * (success, or SLOT_UNAVAILABLE). Exercised against real
 * [DiscoveryRepository]/[AppointmentsRepository] instances backed by fake
 * Retrofit API interfaces, capturing the exact request bodies sent.
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class BookingViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var discoveryApi: FakeDiscoveryApi
    private lateinit var appointmentsApi: FakeAppointmentsApi
    private lateinit var viewModel: BookingViewModel

    private fun newViewModel(): BookingViewModel {
        val moshi = Moshi.Builder().build()
        return BookingViewModel(
            businessSlug = "urban-crown",
            branchId = "branch-1",
            serviceId = "service-1",
            staffProfileId = null,
            discoveryRepository = DiscoveryRepository(discoveryApi, moshi),
            appointmentsRepository = AppointmentsRepository(appointmentsApi, moshi),
        )
    }

    @Before
    fun setUp() {
        discoveryApi = FakeDiscoveryApi()
        appointmentsApi = FakeAppointmentsApi()
    }

    @Test
    fun `loads availability into Content on init`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"))
        viewModel = newViewModel()

        assertTrue(viewModel.state.value.availability is ScreenState.Content)
    }

    @Test
    fun `a recoverable failure keeps the same idempotency key across a retry`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"))
        appointmentsApi.bookResults.add(bookingError(503, "SERVER_ERROR"))
        appointmentsApi.bookResults.add(bookedAppointment("appt-1"))
        viewModel = newViewModel()
        viewModel.selectDate("2026-09-10")
        viewModel.selectSlot(slot("2026-09-10T10:00:00Z"))

        viewModel.submitBooking() // fails with a transient server error
        assertTrue(viewModel.state.value.submissionError is DomainError.ServerUnavailable)
        val firstKey = appointmentsApi.bookedRequests[0].idempotencyKey

        viewModel.submitBooking() // client retries the same attempt
        val secondKey = appointmentsApi.bookedRequests[1].idempotencyKey

        assertEquals(firstKey, secondKey)
        assertEquals("appt-1", viewModel.state.value.bookedAppointmentId)
    }

    @Test
    fun `SLOT_UNAVAILABLE clears the key, reloads availability, and returns to the TIME step`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"))
        appointmentsApi.bookResults.add(bookingError(409, "SLOT_UNAVAILABLE"))
        viewModel = newViewModel()
        viewModel.selectDate("2026-09-10")
        viewModel.selectSlot(slot("2026-09-10T10:00:00Z"))

        viewModel.submitBooking()

        val state = viewModel.state.value
        assertTrue(state.submissionError is DomainError.SlotUnavailable)
        assertEquals(BookingStep.TIME, state.step)
        assertNull(state.selectedSlot)
        assertEquals(2, discoveryApi.availabilityCallCount) // once on init, once on SLOT_UNAVAILABLE recovery
    }

    @Test
    fun `a fresh key is generated after a terminal success, never reused for the next booking`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"), slot("2026-09-10T11:00:00Z"))
        appointmentsApi.bookResults.add(bookedAppointment("appt-1"))
        appointmentsApi.bookResults.add(bookedAppointment("appt-2"))
        viewModel = newViewModel()
        viewModel.selectDate("2026-09-10")
        viewModel.selectSlot(slot("2026-09-10T10:00:00Z"))
        viewModel.submitBooking()
        val firstKey = appointmentsApi.bookedRequests[0].idempotencyKey
        assertEquals("appt-1", viewModel.state.value.bookedAppointmentId)

        // Start a new, separate booking attempt for a different slot.
        viewModel.selectSlot(slot("2026-09-10T11:00:00Z"))
        viewModel.submitBooking()
        val secondKey = appointmentsApi.bookedRequests[1].idempotencyKey

        assertNotEquals(firstKey, secondKey)
    }

    @Test
    fun `selecting a different slot before retrying also generates a fresh key`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"), slot("2026-09-10T11:00:00Z"))
        appointmentsApi.bookResults.add(bookingError(503, "SERVER_ERROR"))
        appointmentsApi.bookResults.add(bookedAppointment("appt-2"))
        viewModel = newViewModel()
        viewModel.selectDate("2026-09-10")
        viewModel.selectSlot(slot("2026-09-10T10:00:00Z"))
        viewModel.submitBooking()
        val firstKey = appointmentsApi.bookedRequests[0].idempotencyKey

        // The customer picks a different slot instead of retrying the same one.
        viewModel.selectSlot(slot("2026-09-10T11:00:00Z"))
        viewModel.submitBooking()
        val secondKey = appointmentsApi.bookedRequests[1].idempotencyKey

        assertNotEquals(firstKey, secondKey)
    }

    @Test
    fun `never generates a fresh key per HTTP retry -- the very first key is a stable UUID reused verbatim`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"))
        appointmentsApi.bookResults.add(bookingError(503, "SERVER_ERROR"))
        appointmentsApi.bookResults.add(bookingError(503, "SERVER_ERROR"))
        appointmentsApi.bookResults.add(bookedAppointment("appt-1"))
        viewModel = newViewModel()
        viewModel.selectDate("2026-09-10")
        viewModel.selectSlot(slot("2026-09-10T10:00:00Z"))

        viewModel.submitBooking()
        viewModel.submitBooking()
        viewModel.submitBooking()

        val keys = appointmentsApi.bookedRequests.map { it.idempotencyKey }.toSet()
        assertEquals(1, keys.size)
        assertNotNull(java.util.UUID.fromString(keys.first()))
    }

    @Test
    fun `submitBooking is a no-op while a submission is already in flight, preventing a duplicate tap`() = runTest {
        discoveryApi.availabilityResult = availability(slot("2026-09-10T10:00:00Z"))
        appointmentsApi.bookResults.add(bookedAppointment("appt-1"))
        val hold = CompletableDeferred<Unit>()
        appointmentsApi.holdUntil = hold
        viewModel = newViewModel()
        viewModel.selectDate("2026-09-10")
        viewModel.selectSlot(slot("2026-09-10T10:00:00Z"))

        viewModel.submitBooking() // suspends inside the fake network call
        assertTrue(viewModel.state.value.isSubmitting)

        viewModel.submitBooking() // a second tap while still in flight must be ignored

        hold.complete(Unit)
        advanceUntilIdle()

        assertEquals(1, appointmentsApi.bookedRequests.size)
        assertEquals("appt-1", viewModel.state.value.bookedAppointmentId)
    }
}
