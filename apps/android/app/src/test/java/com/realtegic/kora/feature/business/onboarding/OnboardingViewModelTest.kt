package com.realtegic.kora.feature.business.onboarding

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.OrganizationsRepository
import com.realtegic.kora.core.data.SchedulingRepository
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.model.AssignStaffServiceRequest
import com.realtegic.kora.core.model.AssignableRoleDto
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.BookingPolicyDto
import com.realtegic.kora.core.model.BranchDto
import com.realtegic.kora.core.model.BranchScheduleExceptionDto
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.BusinessHoursIntervalDto
import com.realtegic.kora.core.model.CreateBranchScheduleExceptionRequest
import com.realtegic.kora.core.model.CreateOrganizationRequest
import com.realtegic.kora.core.model.CreateServiceCategoryRequest
import com.realtegic.kora.core.model.CreateServiceRequest
import com.realtegic.kora.core.model.CreateStaffAvailabilityExceptionRequest
import com.realtegic.kora.core.model.CreateStaffInvitationRequest
import com.realtegic.kora.core.model.CreateStaffInvitationResponseDto
import com.realtegic.kora.core.model.InvitationPreviewDto
import com.realtegic.kora.core.model.OnboardOrganizationResponseDto
import com.realtegic.kora.core.model.OrganizationDto
import com.realtegic.kora.core.model.OrganizationMembershipDto
import com.realtegic.kora.core.model.OrganizationSetupStatusDto
import com.realtegic.kora.core.model.OrganizationSubscriptionSummaryDto
import com.realtegic.kora.core.model.OrganizationSummaryDto
import com.realtegic.kora.core.model.AcceptInvitationResponseDto
import com.realtegic.kora.core.model.ReplaceBusinessHoursRequest
import com.realtegic.kora.core.model.ReplaceStaffAvailabilityRulesRequest
import com.realtegic.kora.core.model.ServiceCategoryDto
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.model.StaffAvailabilityExceptionDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffInvitationListItemDto
import com.realtegic.kora.core.model.StaffServiceAssignmentDto
import com.realtegic.kora.core.model.UpsertBookingPolicyRequest
import com.realtegic.kora.core.model.UpsertBranchServiceRequest
import com.realtegic.kora.core.network.OrganizationsApi
import com.realtegic.kora.core.network.SchedulingApi
import com.realtegic.kora.core.network.ServiceCatalogueApi
import com.realtegic.kora.core.network.StaffApi
import com.realtegic.kora.core.preferences.LocalPreferences
import com.squareup.moshi.Moshi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeOrganizationsApi : OrganizationsApi {
    val createdRequests = mutableListOf<Pair<String, CreateOrganizationRequest>>()
    val createResults = ArrayDeque<Response<ApiSuccessEnvelope<OnboardOrganizationResponseDto>>>()

    /** When set, [create] suspends here until the test completes it --
     * lets a test observe "submission in flight" state before the call
     * resolves, since a fully synchronous fake would resolve the whole
     * flow before a second call could ever observe it as in-flight. */
    var holdUntil: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    override suspend fun create(idempotencyKey: String, body: CreateOrganizationRequest): Response<ApiSuccessEnvelope<OnboardOrganizationResponseDto>> {
        createdRequests.add(idempotencyKey to body)
        holdUntil?.await()
        return createResults.removeFirst()
    }

    override suspend fun list(): Response<ApiSuccessEnvelope<List<OrganizationSummaryDto>>> = notImplemented()
    override suspend fun get(organizationId: String): Response<ApiSuccessEnvelope<OrganizationDto>> = notImplemented()
    override suspend fun getSetupStatus(organizationId: String): Response<ApiSuccessEnvelope<OrganizationSetupStatusDto>> = notImplemented()

    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class NoopServiceCatalogueApi : ServiceCatalogueApi {
    override suspend fun listCategories(organizationId: String, includeArchived: Boolean?) = notImplemented()
    override suspend fun createCategory(organizationId: String, body: CreateServiceCategoryRequest): Response<ApiSuccessEnvelope<ServiceCategoryDto>> = notImplemented()
    override suspend fun archiveCategory(organizationId: String, categoryId: String): Response<ApiSuccessEnvelope<ServiceCategoryDto>> = notImplemented()
    override suspend fun listServices(organizationId: String, includeArchived: Boolean?, serviceCategoryId: String?) = notImplemented()
    override suspend fun createService(organizationId: String, body: CreateServiceRequest): Response<ApiSuccessEnvelope<ServiceDto>> = notImplemented()
    override suspend fun archiveService(organizationId: String, serviceId: String): Response<ApiSuccessEnvelope<ServiceDto>> = notImplemented()
    override suspend fun restoreService(organizationId: String, serviceId: String): Response<ApiSuccessEnvelope<ServiceDto>> = notImplemented()
    override suspend fun listBranchServices(organizationId: String, branchId: String) = notImplemented()
    override suspend fun upsertBranchService(organizationId: String, branchId: String, serviceId: String, body: UpsertBranchServiceRequest): Response<ApiSuccessEnvelope<BranchServiceDto>> = notImplemented()
    override suspend fun listStaffAssignments(organizationId: String, branchId: String, serviceId: String) = notImplemented()
    override suspend fun assignStaff(organizationId: String, branchId: String, serviceId: String, body: AssignStaffServiceRequest): Response<ApiSuccessEnvelope<StaffServiceAssignmentDto>> = notImplemented()
    override suspend fun unassignStaff(organizationId: String, branchId: String, serviceId: String, staffProfileId: String): Response<Unit> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class NoopSchedulingApi : SchedulingApi {
    override suspend fun getBusinessHours(organizationId: String, branchId: String) = notImplemented()
    override suspend fun replaceBusinessHours(organizationId: String, branchId: String, body: ReplaceBusinessHoursRequest): Response<ApiSuccessEnvelope<List<BusinessHoursIntervalDto>>> = notImplemented()
    override suspend fun getScheduleExceptions(organizationId: String, branchId: String, from: String, to: String) = notImplemented()
    override suspend fun createScheduleException(organizationId: String, branchId: String, body: CreateBranchScheduleExceptionRequest): Response<ApiSuccessEnvelope<BranchScheduleExceptionDto>> = notImplemented()
    override suspend fun deleteScheduleException(organizationId: String, branchId: String, exceptionId: String): Response<Unit> = notImplemented()
    override suspend fun getBookingPolicy(organizationId: String, branchId: String): Response<ApiSuccessEnvelope<BookingPolicyDto>> = notImplemented()
    override suspend fun upsertBookingPolicy(organizationId: String, branchId: String, body: UpsertBookingPolicyRequest): Response<ApiSuccessEnvelope<BookingPolicyDto>> = notImplemented()
    override suspend fun getStaffAvailabilityRules(organizationId: String, branchId: String, staffProfileId: String) = notImplemented()
    override suspend fun replaceStaffAvailabilityRules(organizationId: String, branchId: String, staffProfileId: String, body: ReplaceStaffAvailabilityRulesRequest): Response<ApiSuccessEnvelope<List<BusinessHoursIntervalDto>>> = notImplemented()
    override suspend fun getStaffAvailabilityExceptions(organizationId: String, branchId: String, staffProfileId: String, from: String, to: String) = notImplemented()
    override suspend fun createStaffAvailabilityException(organizationId: String, branchId: String, staffProfileId: String, body: CreateStaffAvailabilityExceptionRequest): Response<ApiSuccessEnvelope<StaffAvailabilityExceptionDto>> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private class NoopStaffApi : StaffApi {
    override suspend fun getAssignableRoles(organizationId: String): Response<ApiSuccessEnvelope<List<AssignableRoleDto>>> = notImplemented()
    override suspend fun createInvitation(organizationId: String, body: CreateStaffInvitationRequest): Response<ApiSuccessEnvelope<CreateStaffInvitationResponseDto>> = notImplemented()
    override suspend fun listInvitations(organizationId: String, status: String?) = notImplemented()
    override suspend fun revokeInvitation(organizationId: String, invitationId: String): Response<Unit> = notImplemented()
    override suspend fun getInvitationPreview(token: String): Response<ApiSuccessEnvelope<InvitationPreviewDto>> = notImplemented()
    override suspend fun acceptInvitation(token: String): Response<ApiSuccessEnvelope<AcceptInvitationResponseDto>> = notImplemented()
    override suspend fun rejectInvitation(token: String): Response<Unit> = notImplemented()
    override suspend fun listStaff(organizationId: String): Response<ApiSuccessEnvelope<List<StaffDirectoryEntryDto>>> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun onboardSuccess(organizationId: String = "org-1") = Response.success(
    ApiSuccessEnvelope(
        data = OnboardOrganizationResponseDto(
            organization = OrganizationDto(organizationId, "Urban Crown", "urban-crown", "salon", "GHS", "Africa/Accra", "GH", "ACTIVE"),
            ownerMembership = OrganizationMembershipDto("membership-1", organizationId, "user-1", "ACTIVE"),
            primaryBranch = BranchDto("branch-1", organizationId, "Main Branch", "MAIN", "GH", "Africa/Accra", "GHS", "ACTIVE"),
            subscription = OrganizationSubscriptionSummaryDto("sub-1", organizationId, "TRIALING"),
            entitlements = mapOf("staff.max" to 5.0, "branches.max" to 1.0),
        ),
        meta = ApiMeta("req-1"),
    ),
)

private fun conflictResponse(code: String) = Response.error<ApiSuccessEnvelope<OnboardOrganizationResponseDto>>(
    409,
    """{"error":{"code":"$code","message":"error","retryable":false},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

private fun serverErrorResponse() = Response.error<ApiSuccessEnvelope<OnboardOrganizationResponseDto>>(
    503,
    """{"error":{"code":"SERVER_ERROR","message":"error","retryable":true},"meta":{"requestId":"x"}}"""
        .toResponseBody("application/json".toMediaType()),
)

/**
 * The onboarding wizard's business-basics-plus-first-branch step is
 * idempotent exactly like booking (docs task "Business Onboarding
 * Contract"): a stable key survives a transient-failure retry, a
 * definitive ORGANIZATION_SLUG_TAKEN conflict forces a fresh key since
 * that exact request can never succeed unchanged, and a second call
 * while already submitting is a no-op (never a duplicate organization).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OnboardingViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private lateinit var organizationsApi: FakeOrganizationsApi
    private lateinit var localPreferences: LocalPreferences

    private fun newViewModel(): OnboardingViewModel {
        val moshi = Moshi.Builder().build()
        return OnboardingViewModel(
            organizationsRepository = OrganizationsRepository(organizationsApi, moshi),
            serviceCatalogueRepository = ServiceCatalogueRepository(NoopServiceCatalogueApi(), moshi),
            schedulingRepository = SchedulingRepository(NoopSchedulingApi(), moshi),
            staffRepository = StaffRepository(NoopStaffApi(), moshi),
            localPreferences = localPreferences,
        )
    }

    @Before
    fun setUp() = runTest {
        organizationsApi = FakeOrganizationsApi()
        localPreferences = LocalPreferences(context)
        localPreferences.clear()
    }

    private fun fillValidBasics(viewModel: OnboardingViewModel) {
        viewModel.onBasicsChanged(
            businessName = "Urban Crown",
            slug = "urban-crown",
            businessType = "salon",
            defaultCurrency = "GHS",
            timeZone = "Africa/Accra",
            countryCode = "GH",
            branchName = "Main Branch",
            branchCode = "MAIN",
        )
    }

    @Test
    fun `a transient failure keeps the same idempotency key across a retry`() = runTest {
        organizationsApi.createResults.add(serverErrorResponse())
        organizationsApi.createResults.add(onboardSuccess())
        val viewModel = newViewModel()
        fillValidBasics(viewModel)

        viewModel.submitBasics()
        assertNotNull(viewModel.state.value.basicsError)
        val firstKey = organizationsApi.createdRequests[0].first

        viewModel.submitBasics()
        val secondKey = organizationsApi.createdRequests[1].first

        assertEquals(firstKey, secondKey)
        assertEquals("org-1", viewModel.state.value.organizationId)
    }

    @Test
    fun `a slug-taken conflict forces a fresh key on the next attempt`() = runTest {
        organizationsApi.createResults.add(conflictResponse("ORGANIZATION_SLUG_TAKEN"))
        organizationsApi.createResults.add(onboardSuccess())
        val viewModel = newViewModel()
        fillValidBasics(viewModel)

        viewModel.submitBasics()
        val firstKey = organizationsApi.createdRequests[0].first

        viewModel.onBasicsChanged(slug = "urban-crown-2")
        viewModel.submitBasics()
        val secondKey = organizationsApi.createdRequests[1].first

        assertNotEquals(firstKey, secondKey)
    }

    @Test
    fun `submitBasics is a no-op while a submission is already in flight, preventing a duplicate tap`() = runTest {
        organizationsApi.createResults.add(onboardSuccess())
        val hold = kotlinx.coroutines.CompletableDeferred<Unit>()
        organizationsApi.holdUntil = hold
        val viewModel = newViewModel()
        fillValidBasics(viewModel)

        viewModel.submitBasics() // suspends inside the fake network call
        assertTrue(viewModel.state.value.isSubmittingBasics)

        viewModel.submitBasics() // a second tap while still in flight must be ignored

        hold.complete(Unit)
        mainDispatcherRule.dispatcher.let { (it as? kotlinx.coroutines.test.TestDispatcher)?.scheduler?.advanceUntilIdle() }
        waitUntilTrue { organizationsApi.createdRequests.size >= 1 && !viewModel.state.value.isSubmittingBasics }

        assertEquals(1, organizationsApi.createdRequests.size)
    }

    @Test
    fun `a successful submission remembers the organization id and advances to the services step`() = runTest {
        organizationsApi.createResults.add(onboardSuccess("org-42"))
        val viewModel = newViewModel()
        fillValidBasics(viewModel)

        viewModel.submitBasics()

        assertEquals(OnboardingStep.SERVICES, viewModel.state.value.step)
        // The local-preference write happens after the state update and
        // is a real (not virtual-time) DataStore disk write, so it is
        // not necessarily finished the instant submitBasics() returns --
        // poll for it rather than assuming it is synchronous.
        waitUntilTrue { runBlocking { localPreferences.onboardingOrganizationId.first() } == "org-42" }
    }
}

/** Polls a real (wall-clock) condition -- for a genuinely asynchronous
 * disk write racing a synchronous test assertion, `runTest`'s virtual
 * time cannot help, since the write happens on a real background
 * thread regardless of the test dispatcher's virtual clock. */
private fun waitUntilTrue(timeoutMs: Long = 3_000, intervalMs: Long = 20, condition: () -> Boolean) {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
        if (condition()) return
        Thread.sleep(intervalMs)
    }
    if (!condition()) throw AssertionError("Condition was not met within ${timeoutMs}ms")
}
