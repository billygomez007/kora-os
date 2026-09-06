package com.realtegic.kora.feature.customer.home

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.CustomerProfileRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AppointmentItemDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.CustomerProfileDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.UpdateCustomerProfileRequest
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.CustomerProfileApi
import com.realtegic.kora.core.network.DiscoveryApi
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import java.time.Instant
import java.time.temporal.ChronoUnit
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeDiscoveryApi(private val categoriesList: List<BusinessCategoryDto>, private val businesses: List<DiscoveryBusinessSummaryDto>) : DiscoveryApi {
    override suspend fun categories() = Response.success(ApiSuccessEnvelope(data = categoriesList, meta = ApiMeta("req")))
    override suspend fun searchBusinesses(text: String?, category: String?, verificationStatus: String?, nearLat: Double?, nearLng: Double?, radiusKm: Int?, cursor: String?, limit: Int?) =
        Response.success(ApiSuccessEnvelope(data = businesses, meta = ApiMeta("req")))
    override suspend fun getBusiness(slug: String) = notImplemented()
    override suspend fun getBranches(slug: String) = notImplemented()
    override suspend fun getServices(slug: String, branchId: String) = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String) = notImplemented()
    override suspend fun getAvailability(slug: String, branchId: String, serviceIds: String, staffProfileId: String?, date: String?, fromDate: String?, toDate: String?): Response<ApiSuccessEnvelope<AvailabilityResultDto>> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FakeAppointmentsApi(private val appointments: List<AppointmentDto>) : AppointmentsApi {
    override suspend fun book(body: com.realtegic.kora.core.model.CreateAppointmentRequest) = notImplemented()
    override suspend fun list(cursor: String?, limit: Int?) = Response.success(ApiSuccessEnvelope(data = appointments, meta = ApiMeta("req")))
    override suspend fun get(appointmentId: String) = notImplemented()
    override suspend fun cancel(appointmentId: String, body: com.realtegic.kora.core.model.CancelAppointmentRequest) = notImplemented()
    override suspend fun reschedule(appointmentId: String, body: com.realtegic.kora.core.model.RescheduleAppointmentRequest) = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class FakeCustomerProfileApi(private val profile: CustomerProfileDto?) : CustomerProfileApi {
    override suspend fun get(): Response<ApiSuccessEnvelope<CustomerProfileDto>> =
        if (profile != null) Response.success(ApiSuccessEnvelope(data = profile, meta = ApiMeta("req"))) else notImplemented()
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

private fun customerProfile(displayName: String = "", city: String? = null, area: String? = null) = CustomerProfileDto(
    id = "profile-1",
    displayName = displayName,
    email = "ama@example.test",
    phoneE164 = "+233241234567",
    city = city,
    area = area,
    latitude = null,
    longitude = null,
    locationConsentedAt = null,
)

private fun confirmedAppointmentStartingIn(hours: Long) = AppointmentDto(
    id = "appt-1",
    reference = "REF-1",
    organizationId = "org-1",
    branchId = "branch-1",
    status = "CONFIRMED",
    source = "CUSTOMER_APP",
    customerProfileId = "customer-1",
    customerRecordId = "record-1",
    assignedStaffProfileId = "staff-1",
    startAt = Instant.now().plus(hours, ChronoUnit.HOURS).toString(),
    endAt = Instant.now().plus(hours, ChronoUnit.HOURS).plusSeconds(1800).toString(),
    occupiedStartAt = Instant.now().plus(hours, ChronoUnit.HOURS).toString(),
    occupiedEndAt = Instant.now().plus(hours, ChronoUnit.HOURS).plusSeconds(1800).toString(),
    branchTimeZone = "Africa/Accra",
    currency = "GHS",
    totalPriceMinor = 5000,
    cancelledAt = null,
    cancelledReason = null,
    noShowMarkedAt = null,
    version = 1,
    createdAt = Instant.now().toString(),
    updatedAt = Instant.now().toString(),
    items = listOf(AppointmentItemDto("service-1", "Haircut", 30, 5000, "GHS", 0)),
    businessName = "Urban Crown Salon",
    businessSlug = "urban-crown",
    providerDisplayName = "Abena Osei",
)

/**
 * The customer homepage: real customer profile greeting (never the
 * "Ama" sample name), search entry, categories, an upcoming-appointment
 * card only when one genuinely exists, no hardcoded demo business
 * content, and a voice-search entry point that is present but inert
 * (docs task Customer Marketplace Design Batch 02).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h1600dp")
class HomeScreenTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    private fun viewModel(
        categories: List<BusinessCategoryDto> = emptyList(),
        businesses: List<DiscoveryBusinessSummaryDto> = emptyList(),
        appointments: List<AppointmentDto> = emptyList(),
        profile: CustomerProfileDto? = customerProfile(),
    ) = HomeViewModel(
        discoveryRepository = DiscoveryRepository(FakeDiscoveryApi(categories, businesses), Moshi.Builder().build()),
        appointmentsRepository = AppointmentsRepository(FakeAppointmentsApi(appointments), Moshi.Builder().build()),
        customerProfileRepository = CustomerProfileRepository(FakeCustomerProfileApi(profile), Moshi.Builder().build()),
    )

    private fun setContent(viewModel: HomeViewModel, onUpcomingAppointmentTapped: (String) -> Unit = {}) {
        composeRule.setContent {
            KoraTheme {
                HomeScreen(viewModel, onSearchTapped = {}, onNearYouTapped = {}, onCategoryTapped = {}, onBusinessTapped = {}, onProfileTapped = {}, onUpcomingAppointmentTapped = onUpcomingAppointmentTapped)
            }
        }
    }

    @Test
    fun `renders the search entry, categories, and featured businesses`() {
        setContent(viewModel(categories = listOf(BusinessCategoryDto("salon", "Salon")), businesses = listOf(business("urban-crown"))))

        composeRule.onNodeWithTag(HomeScreenTestTags.ACCOUNT_BUTTON).assertIsDisplayed()
        composeRule.onNodeWithText("Search businesses or services").assertIsDisplayed()
        composeRule.onNodeWithText("Salon").assertIsDisplayed()
        composeRule.onNodeWithText("urban-crown").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `greets the customer using their real saved profile name, never a hardcoded sample name`() {
        setContent(viewModel(profile = customerProfile(displayName = "Kwame Mensah")))

        composeRule.onNodeWithText("Kwame Mensah", substring = true).assertIsDisplayed()
        composeRule.onAllNodes(hasText("Ama", substring = true)).assertCountEquals(0)
    }

    @Test
    fun `shows the customer's saved area and city, never a live location lookup`() {
        setContent(viewModel(profile = customerProfile(displayName = "Kwame", city = "Accra", area = "East Legon")))

        composeRule.onNodeWithText("East Legon, Accra").assertIsDisplayed()
    }

    @Test
    fun `falls back to a name-less greeting when the profile fetch fails, never blocking the homepage`() {
        setContent(viewModel(profile = null))

        composeRule.onNodeWithText("Search businesses or services").assertIsDisplayed()
    }

    @Test
    fun `the voice search teaser is present but explains it is not available instead of doing anything functional`() {
        setContent(viewModel())

        composeRule.onNodeWithTag(HomeScreenTestTags.VOICE_SEARCH_TEASER).assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Voice search is coming soon").assertIsDisplayed()
    }

    @Test
    fun `shows an upcoming appointment card only when a confirmed future appointment exists`() {
        setContent(viewModel(appointments = listOf(confirmedAppointmentStartingIn(4))))

        composeRule.onNodeWithText("Upcoming: Haircut").assertIsDisplayed()
    }

    @Test
    fun `shows no upcoming appointment card when there is none`() {
        setContent(viewModel())

        composeRule.onAllNodes(hasText("Upcoming:", substring = true)).assertCountEquals(0)
    }
}
