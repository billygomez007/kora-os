package com.realtegic.kora.feature.business.dashboard

import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.ReportsRepository
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.CurrencyAmountDto
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.model.WorkspaceBranchDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.network.ReportsApi
import com.realtegic.kora.core.network.WorkspacesApi
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

private class FakeWorkspacesApi : WorkspacesApi {
    var result: Response<ApiSuccessEnvelope<MyWorkspacesDto>>? = null
    override suspend fun getMyWorkspaces(): Response<ApiSuccessEnvelope<MyWorkspacesDto>> = result!!
}

private class FakeReportsApi : ReportsApi {
    var callCount = 0
    var result: Response<ApiSuccessEnvelope<ReportsOverviewDto>>? = null

    override suspend fun overview(organizationId: String, from: String, to: String, branchId: String?): Response<ApiSuccessEnvelope<ReportsOverviewDto>> {
        callCount++
        return result!!
    }
}

private fun org(
    organizationId: String = "org-1",
    permissionCodes: List<String> = emptyList(),
    accessMode: String = "FULL",
) = WorkspaceOrganizationDto(
    organizationId = organizationId,
    membershipId = "membership-1",
    name = "Urban Crown Salon",
    slug = "urban-crown",
    logoUrl = null,
    defaultCurrency = "GHS",
    roleCodes = listOf("owner"),
    permissionCodes = permissionCodes,
    accessMode = accessMode,
    membershipStatus = "ACTIVE",
    branches = listOf(WorkspaceBranchDto("branch-1", "Main Branch")),
)

private fun workspacesResult(vararg organizations: WorkspaceOrganizationDto) = Response.success(
    ApiSuccessEnvelope(data = MyWorkspacesDto(customerWorkspaceAvailable = false, organizations = organizations.toList()), meta = ApiMeta("req")),
)

private fun overviewResult() = Response.success(
    ApiSuccessEnvelope(
        data = ReportsOverviewDto(
            from = "2026-08-01T00:00:00Z",
            to = "2026-09-01T00:00:00Z",
            branchId = null,
            postedRevenue = listOf(CurrencyAmountDto("GHS", 100_000)),
            transactionCount = 10,
            averageTransactionValue = listOf(CurrencyAmountDto("GHS", 10_000)),
            completedServiceCount = 8,
            commissionAccrued = listOf(CurrencyAmountDto("GHS", 5_000)),
            pendingPaymentClaimCount = 1,
            disputedPaymentClaimCount = 0,
            grossPostedSales = listOf(CurrencyAmountDto("GHS", 100_000)),
            refundAmount = listOf(CurrencyAmountDto("GHS", 2_000)),
            reversalAmount = listOf(CurrencyAmountDto("GHS", 0)),
            netPostedRevenue = listOf(CurrencyAmountDto("GHS", 98_000)),
            refundTransactionCount = 1,
            reversalTransactionCount = 0,
        ),
        meta = ApiMeta("req-2"),
    ),
)

/**
 * The workspace's roles/permissions/accessMode are re-fetched fresh on
 * every load, never trusted from a cache (docs task Phase 4), and
 * `reports.read` alone gates whether the reports endpoint is ever called
 * at all (docs task Phase 9) -- a membership without it must never see
 * a network call to that endpoint, not even one that would 403.
 */
class BusinessDashboardViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var workspacesApi: FakeWorkspacesApi
    private lateinit var reportsApi: FakeReportsApi

    private fun newViewModel(organizationId: String = "org-1") = BusinessDashboardViewModel(
        organizationId = organizationId,
        workspacesRepository = WorkspacesRepository(workspacesApi, Moshi.Builder().build()),
        reportsRepository = ReportsRepository(reportsApi, Moshi.Builder().build()),
    )

    @Before
    fun setUp() {
        workspacesApi = FakeWorkspacesApi()
        reportsApi = FakeReportsApi()
    }

    @Test
    fun `a membership without reports_read never calls the reports endpoint`() = runTest {
        workspacesApi.result = workspacesResult(org(permissionCodes = emptyList()))
        val viewModel = newViewModel()

        assertTrue(viewModel.state.value.workspace is ScreenState.Content)
        assertEquals(0, reportsApi.callCount)
        assertNull(viewModel.state.value.overview)
    }

    @Test
    fun `a membership with reports_read loads the overview report`() = runTest {
        workspacesApi.result = workspacesResult(org(permissionCodes = listOf("reports.read")))
        reportsApi.result = overviewResult()
        val viewModel = newViewModel()

        assertEquals(1, reportsApi.callCount)
        assertTrue(viewModel.state.value.overview is ScreenState.Content)
    }

    @Test
    fun `READ_ONLY access mode still allows the reports read`() = runTest {
        workspacesApi.result = workspacesResult(org(permissionCodes = listOf("reports.read"), accessMode = "READ_ONLY"))
        reportsApi.result = overviewResult()
        val viewModel = newViewModel()

        assertEquals("READ_ONLY", (viewModel.state.value.workspace as ScreenState.Content).data.accessMode)
        assertTrue(viewModel.state.value.overview is ScreenState.Content)
    }

    @Test
    fun `a BLOCKED workspace still surfaces its accessMode for the screen to gate on`() = runTest {
        workspacesApi.result = workspacesResult(org(permissionCodes = emptyList(), accessMode = "BLOCKED"))
        val viewModel = newViewModel()

        assertEquals("BLOCKED", (viewModel.state.value.workspace as ScreenState.Content).data.accessMode)
        assertEquals(0, reportsApi.callCount)
    }

    @Test
    fun `an organization no longer present in the fresh workspace list surfaces as NotFound, never a stale cached view`() = runTest {
        workspacesApi.result = workspacesResult(org(organizationId = "some-other-org"))
        val viewModel = newViewModel(organizationId = "org-1")

        val workspace = viewModel.state.value.workspace
        assertTrue(workspace is ScreenState.Error)
        assertTrue((workspace as ScreenState.Error).error is DomainError.NotFound)
    }

    @Test
    fun `a failure fetching workspaces surfaces as an Error state`() = runTest {
        workspacesApi.result = Response.error(
            500,
            """{"error":{"code":"INTERNAL","message":"boom","retryable":true},"meta":{"requestId":"x"}}"""
                .toResponseBody("application/json".toMediaType()),
        )
        val viewModel = newViewModel()

        assertTrue(viewModel.state.value.workspace is ScreenState.Error)
    }
}
