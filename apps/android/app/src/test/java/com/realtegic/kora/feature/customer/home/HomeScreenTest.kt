package com.realtegic.kora.feature.customer.home

import android.content.Context
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AppointmentItemDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.AppointmentsApi
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
    override suspend fun searchBusinesses(text: String?, category: String?, nearLat: Double?, nearLng: Double?, radiusKm: Int?, cursor: String?, limit: Int?) =
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
)

/**
 * The customer homepage: real branded banner, search entry, categories,
 * an upcoming-appointment card only when one genuinely exists, and no
 * hardcoded demo business content (docs task Phase 5 & 9).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h1600dp")
class HomeScreenTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `renders the branded banner, search entry, categories, and featured businesses`() {
        val viewModel = HomeViewModel(
            discoveryRepository = DiscoveryRepository(
                FakeDiscoveryApi(listOf(BusinessCategoryDto("salon", "Salon")), listOf(business("urban-crown"))),
                Moshi.Builder().build(),
            ),
            appointmentsRepository = AppointmentsRepository(FakeAppointmentsApi(emptyList()), Moshi.Builder().build()),
        )

        composeRule.setContent {
            KoraTheme {
                HomeScreen(viewModel, onSearchTapped = {}, onNearYouTapped = {}, onCategoryTapped = {}, onBusinessTapped = {}, onProfileTapped = {}, onUpcomingAppointmentTapped = {})
            }
        }

        composeRule.onNodeWithTag(HomeScreenTestTags.ACCOUNT_BUTTON).assertIsDisplayed()
        composeRule.onNodeWithText("Find and book trusted services near you.").assertIsDisplayed()
        composeRule.onNodeWithText("Search businesses or services").assertIsDisplayed()
        composeRule.onNodeWithText("Salon").assertIsDisplayed()
        composeRule.onNodeWithText("urban-crown").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `shows an upcoming appointment card only when a confirmed future appointment exists`() {
        val viewModel = HomeViewModel(
            discoveryRepository = DiscoveryRepository(FakeDiscoveryApi(emptyList(), emptyList()), Moshi.Builder().build()),
            appointmentsRepository = AppointmentsRepository(FakeAppointmentsApi(listOf(confirmedAppointmentStartingIn(4))), Moshi.Builder().build()),
        )

        composeRule.setContent {
            KoraTheme {
                HomeScreen(viewModel, onSearchTapped = {}, onNearYouTapped = {}, onCategoryTapped = {}, onBusinessTapped = {}, onProfileTapped = {}, onUpcomingAppointmentTapped = {})
            }
        }

        composeRule.onNodeWithText("Upcoming: Haircut").assertIsDisplayed()
    }

    @Test
    fun `shows no upcoming appointment card when there is none`() {
        val viewModel = HomeViewModel(
            discoveryRepository = DiscoveryRepository(FakeDiscoveryApi(emptyList(), emptyList()), Moshi.Builder().build()),
            appointmentsRepository = AppointmentsRepository(FakeAppointmentsApi(emptyList()), Moshi.Builder().build()),
        )

        composeRule.setContent {
            KoraTheme {
                HomeScreen(viewModel, onSearchTapped = {}, onNearYouTapped = {}, onCategoryTapped = {}, onBusinessTapped = {}, onProfileTapped = {}, onUpcomingAppointmentTapped = {})
            }
        }

        composeRule.onAllNodes(hasText("Upcoming:", substring = true)).assertCountEquals(0)
    }
}
