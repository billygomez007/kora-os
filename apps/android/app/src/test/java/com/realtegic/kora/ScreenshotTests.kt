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
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.AuthSessionDto
import com.realtegic.kora.core.model.AuthUserDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.CancelAppointmentRequest
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.RescheduleAppointmentRequest
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.network.AppointmentsApi
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.network.DiscoveryApi
import com.realtegic.kora.core.network.WorkspacesApi
import com.realtegic.kora.core.preferences.LocalPreferences
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.TokenStore
import com.realtegic.kora.feature.auth.AuthViewModel
import com.realtegic.kora.feature.auth.OtpVerifyScreen
import com.realtegic.kora.feature.customer.home.HomeScreen
import com.realtegic.kora.feature.customer.home.HomeViewModel
import com.realtegic.kora.feature.workspace.WorkspaceChooserScreen
import com.realtegic.kora.feature.workspace.WorkspaceViewModel
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CompletableDeferred
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
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

private class ScreenshotAuthApi : AuthApi {
    var verifyOtpResult: Response<ApiSuccessEnvelope<AuthResultDto>>? = null
    var verifyOtpGate: CompletableDeferred<Response<ApiSuccessEnvelope<AuthResultDto>>>? = null

    override suspend fun requestOtp(body: RequestEmailOtpRequest) = Response.success(
        ApiSuccessEnvelope(data = RequestEmailOtpResponse(challengeId = "challenge-1", expiresAt = "2027-01-01T00:05:00Z"), meta = ApiMeta("req")),
    )
    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> {
        verifyOtpGate?.let { return it.await() }
        return verifyOtpResult!!
    }
    override suspend fun refresh(body: RefreshRequest) = notImplemented()
    override suspend fun logout(): Response<Unit> = Response.success(Unit)
    override suspend fun logoutAll(): Response<Unit> = Response.success(Unit)
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this screenshot")
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

    private fun otpViewModel(api: ScreenshotAuthApi): AuthViewModel {
        val prefs = context.getSharedPreferences("screenshot_otp_prefs_${System.nanoTime()}", Context.MODE_PRIVATE)
        val tokenStore = TokenStore(context, prefsProvider = { prefs })
        val sessionManager = SessionManager(tokenStore, api, Moshi.Builder().build())
        val authRepository = AuthRepository(api, sessionManager, Moshi.Builder().build())
        val viewModel = AuthViewModel(authRepository)
        viewModel.onEmailChanged("ama@example.test")
        viewModel.submitEmail()
        return viewModel
    }

    private fun setOtpContent(viewModel: AuthViewModel) {
        composeRule.setContent {
            KoraTheme {
                OtpVerifyScreen(viewModel = viewModel, onBack = {}, onSignedIn = {}, onUseDifferentEmail = {})
            }
        }
    }

    @Test
    fun `otp screen -- empty code`() {
        setOtpContent(otpViewModel(ScreenshotAuthApi()))
        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/otp_verify_empty.png")
    }

    @Test
    fun `otp screen -- partially entered code`() {
        val viewModel = otpViewModel(ScreenshotAuthApi())
        viewModel.onCodeChanged("123")
        setOtpContent(viewModel)
        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/otp_verify_partial.png")
    }

    @Test
    fun `otp screen -- complete code, resend available`() {
        val viewModel = otpViewModel(ScreenshotAuthApi())
        viewModel.onCodeChanged("123456")
        setOtpContent(viewModel)
        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/otp_verify_complete.png")
    }

    @Test
    fun `otp screen -- verifying`() {
        val api = ScreenshotAuthApi().apply { verifyOtpGate = CompletableDeferred() }
        val viewModel = otpViewModel(api)
        viewModel.onCodeChanged("123456")
        viewModel.submitCode()
        setOtpContent(viewModel)
        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/otp_verify_verifying.png")
    }

    @Test
    fun `otp screen -- invalid or expired code`() {
        val api = ScreenshotAuthApi().apply {
            verifyOtpResult = Response.error(
                401,
                """{"error":{"code":"OTP_INVALID","message":"This code is invalid or has expired.","retryable":false},"meta":{"requestId":"x"}}"""
                    .toResponseBody("application/json".toMediaType()),
            )
        }
        val viewModel = otpViewModel(api)
        viewModel.onCodeChanged("999999")
        viewModel.submitCode()
        setOtpContent(viewModel)
        composeRule.onRoot().captureRoboImage("build/outputs/roborazzi/otp_verify_invalid_code.png")
    }
}
