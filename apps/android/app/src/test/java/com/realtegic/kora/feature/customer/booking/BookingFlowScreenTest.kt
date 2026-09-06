package com.realtegic.kora.feature.customer.booking

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
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
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FlowScreenFakeDiscoveryApi(private val providers: List<PublicProviderSummaryDto>) : DiscoveryApi {
    override suspend fun categories() = notImplemented()
    override suspend fun searchBusinesses(text: String?, category: String?, verificationStatus: String?, nearLat: Double?, nearLng: Double?, radiusKm: Int?, cursor: String?, limit: Int?) = notImplemented()
    override suspend fun getBusiness(slug: String) = Response.success(
        ApiSuccessEnvelope(
            data = DiscoveryBusinessSummaryDto("org-1", slug, "Naya Braids Studio", null, null, null, "VERIFIED", emptyList()),
            meta = ApiMeta("req"),
        ),
    )
    override suspend fun getBranches(slug: String) = Response.success(
        ApiSuccessEnvelope(
            data = listOf(DiscoveryBranchSummaryDto("branch-1", "Main branch", "Accra", "Greater Accra", "GH", null, null, null, null, null)),
            meta = ApiMeta("req"),
        ),
    )
    override suspend fun getServices(slug: String, branchId: String) = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String) =
        Response.success(ApiSuccessEnvelope(data = providers, meta = ApiMeta("req")))
    override suspend fun getAvailability(slug: String, branchId: String, serviceIds: String, staffProfileId: String?, date: String?, fromDate: String?, toDate: String?) =
        Response.success(
            ApiSuccessEnvelope(
                data = AvailabilityResultDto(
                    branchTimeZone = "Africa/Accra",
                    currency = "GHS",
                    totalPriceMinor = 18000,
                    items = listOf(AvailabilityItemDto("service-1", "Knotless Braids", 180, 18000, "GHS", true)),
                    eligibleProviderIds = providers.map { it.staffProfileId },
                    days = listOf(AvailabilityDayDto(date = "2027-01-01", slots = listOf(AvailabilitySlotDto("2027-01-01T14:30:00Z", "2027-01-01T17:30:00Z", "staff-1")))),
                ),
                meta = ApiMeta("req"),
            ),
        )
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FlowScreenFakeAppointmentsApi : AppointmentsApi {
    override suspend fun book(body: CreateAppointmentRequest) = notImplemented()
    override suspend fun list(cursor: String?, limit: Int?) = notImplemented()
    override suspend fun get(appointmentId: String) = notImplemented()
    override suspend fun cancel(appointmentId: String, body: CancelAppointmentRequest) = notImplemented()
    override suspend fun reschedule(appointmentId: String, body: RescheduleAppointmentRequest) = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

/**
 * Steps 2-4 of the booking wizard (docs task Customer Marketplace Design
 * Batch 02): provider selection defaults to "any available," a specific
 * pick is honored, and the review step's "Confirm booking" stays
 * disabled until the customer explicitly checks "I have reviewed my
 * booking details" -- a deliberate safety gate, never auto-checked.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h1600dp")
class BookingFlowScreenTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    private fun buildViewModel(providers: List<PublicProviderSummaryDto> = emptyList()): BookingViewModel {
        val moshi = Moshi.Builder().build()
        return BookingViewModel(
            businessSlug = "naya-braids",
            branchId = "branch-1",
            serviceId = "service-1",
            discoveryRepository = DiscoveryRepository(FlowScreenFakeDiscoveryApi(providers), moshi),
            appointmentsRepository = AppointmentsRepository(FlowScreenFakeAppointmentsApi(), moshi),
        )
    }

    @Test
    fun `defaults to any available professional and reaching date-time does not require picking a specific one`() {
        val viewModel = buildViewModel(providers = listOf(PublicProviderSummaryDto("staff-1", "Abena Osei")))

        composeRule.setContent { KoraTheme { BookingFlowScreen(viewModel = viewModel, onBack = {}, onBooked = {}) } }

        composeRule.onNodeWithText("Any available professional").assertIsEnabled()
        composeRule.onNodeWithTag(BookingFlowScreenTestTags.PROVIDER_CONTINUE_BUTTON).performClick()

        composeRule.onNodeWithText("Choose date & time").assertIsEnabled()
    }

    @Test
    fun `picking a named professional selects them instead of any-available`() {
        val viewModel = buildViewModel(providers = listOf(PublicProviderSummaryDto("staff-1", "Abena Osei")))

        composeRule.setContent { KoraTheme { BookingFlowScreen(viewModel = viewModel, onBack = {}, onBooked = {}) } }

        composeRule.onNodeWithText("Abena Osei").performClick()
        composeRule.onNodeWithTag(BookingFlowScreenTestTags.PROVIDER_CONTINUE_BUTTON).performClick()

        org.junit.Assert.assertEquals("staff-1", viewModel.state.value.selectedProviderId)
    }

    @Test
    fun `Confirm booking stays disabled until the reviewed-details checkbox is explicitly checked`() {
        val viewModel = buildViewModel()

        composeRule.setContent { KoraTheme { BookingFlowScreen(viewModel = viewModel, onBack = {}, onBooked = {}) } }
        composeRule.onNodeWithTag(BookingFlowScreenTestTags.PROVIDER_CONTINUE_BUTTON).performClick()
        composeRule.onNodeWithText("2:30 PM").performClick()

        composeRule.onNodeWithTag(BookingFlowScreenTestTags.CONFIRM_BUTTON).assertIsNotEnabled()

        composeRule.onNodeWithTag(BookingFlowScreenTestTags.REVIEWED_CHECKBOX).performClick()

        composeRule.onNodeWithTag(BookingFlowScreenTestTags.CONFIRM_BUTTON).assertIsEnabled()
    }
}
