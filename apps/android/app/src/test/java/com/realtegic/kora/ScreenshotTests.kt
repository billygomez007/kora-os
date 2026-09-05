package com.realtegic.kora

import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.DiscoveryApi
import com.realtegic.kora.core.network.WorkspacesApi
import com.realtegic.kora.core.preferences.LocalPreferences
import com.realtegic.kora.feature.customer.home.HomeScreen
import com.realtegic.kora.feature.customer.home.HomeViewModel
import com.realtegic.kora.feature.workspace.WorkspaceChooserScreen
import com.realtegic.kora.feature.workspace.WorkspaceViewModel
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import retrofit2.Response

private class ScreenshotDiscoveryApi(private val categories: List<BusinessCategoryDto>, private val businesses: List<DiscoveryBusinessSummaryDto>) : DiscoveryApi {
    override suspend fun categories() = Response.success(ApiSuccessEnvelope(data = categories, meta = ApiMeta("req")))
    override suspend fun searchBusinesses(text: String?, category: String?, nearLat: Double?, nearLng: Double?, radiusKm: Int?, cursor: String?, limit: Int?) =
        Response.success(ApiSuccessEnvelope(data = businesses, meta = ApiMeta("req")))
    override suspend fun getBusiness(slug: String) = notImplemented()
    override suspend fun getBranches(slug: String) = notImplemented()
    override suspend fun getServices(slug: String, branchId: String) = notImplemented()
    override suspend fun getProviders(slug: String, branchId: String, serviceId: String) = notImplemented()
    override suspend fun getAvailability(slug: String, branchId: String, serviceIds: String, staffProfileId: String?, date: String?, fromDate: String?, toDate: String?): Response<ApiSuccessEnvelope<AvailabilityResultDto>> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this screenshot")
}

private class ScreenshotAppointmentsApi : AppointmentsApi {
    override suspend fun book(body: CreateAppointmentRequest) = notImplemented()
    override suspend fun list(cursor: String?, limit: Int?) = Response.success(ApiSuccessEnvelope(data = emptyList<AppointmentDto>(), meta = ApiMeta("req")))
    override suspend fun get(appointmentId: String) = notImplemented()
    override suspend fun cancel(appointmentId: String, body: CancelAppointmentRequest) = notImplemented()
    override suspend fun reschedule(appointmentId: String, body: RescheduleAppointmentRequest) = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this screenshot")
}

private class ScreenshotWorkspacesApi(private val workspaces: MyWorkspacesDto) : WorkspacesApi {
    override suspend fun getMyWorkspaces() = Response.success(ApiSuccessEnvelope(data = workspaces, meta = ApiMeta("req")))
}

private fun business(slug: String, name: String) = DiscoveryBusinessSummaryDto(
    organizationId = "org-$slug",
    slug = slug,
    displayName = name,
    description = null,
    logoImageUrl = null,
    coverImageUrl = null,
    verificationStatus = "VERIFIED",
    categories = listOf("Salon"),
)

/**
 * Visual-review captures for principal Kora screens (docs task Phase 12:
 * "screenshot tests ... using existing screenshot infra (Roborazzi) where
 * practical"). These capture a PNG to `build/outputs/roborazzi/` on every
 * run for a human to review -- clipping, wrong colors, a missing logo,
 * broken labels -- rather than a pixel-diff regression gate against a
 * committed golden image (no golden baseline is checked in this stage).
 * `GraphicsMode.NATIVE` is required for Robolectric to render real pixels
 * instead of stub drawing.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h800dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScreenshotTests {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `customer home screen`() {
        val viewModel = HomeViewModel(
            discoveryRepository = DiscoveryRepository(
                ScreenshotDiscoveryApi(
                    listOf(BusinessCategoryDto("salon", "Salon"), BusinessCategoryDto("barber", "Barber")),
                    listOf(business("urban-crown", "Urban Crown Salon"), business("fade-masters", "Fade Masters")),
                ),
                Moshi.Builder().build(),
            ),
            appointmentsRepository = AppointmentsRepository(ScreenshotAppointmentsApi(), Moshi.Builder().build()),
        )

        composeRule.setContent {
            KoraTheme {
                HomeScreen(viewModel, onSearchTapped = {}, onNearYouTapped = {}, onCategoryTapped = {}, onBusinessTapped = {}, onProfileTapped = {}, onUpcomingAppointmentTapped = {})
            }
        }

        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/customer_home_screen.png")
    }

    @Test
    fun `workspace chooser screen`() {
        val api = ScreenshotWorkspacesApi(
            MyWorkspacesDto(
                customerWorkspaceAvailable = true,
                organizations = listOf(
                    WorkspaceOrganizationDto(
                        organizationId = "org-1",
                        membershipId = "membership-1",
                        name = "Urban Crown Salon",
                        slug = "urban-crown",
                        logoUrl = null,
                        defaultCurrency = "GHS",
                        roleCodes = listOf("owner"),
                        permissionCodes = emptyList(),
                        accessMode = "FULL",
                        membershipStatus = "ACTIVE",
                        branches = emptyList(),
                    ),
                ),
            ),
        )
        val viewModel = WorkspaceViewModel(WorkspacesRepository(api, Moshi.Builder().build()), LocalPreferences(context))

        composeRule.setContent {
            KoraTheme {
                WorkspaceChooserScreen(viewModel = viewModel, onCustomerSelected = {}, onOrganizationSelected = {}, onCreateBusiness = {})
            }
        }

        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/workspace_chooser_screen.png")
    }
}
