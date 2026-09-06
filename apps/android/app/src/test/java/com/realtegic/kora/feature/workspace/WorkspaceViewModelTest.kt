package com.realtegic.kora.feature.workspace

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ApiMeta
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.AuthResultDto
import com.realtegic.kora.core.model.MeDto
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.RefreshRequest
import com.realtegic.kora.core.model.RequestEmailOtpRequest
import com.realtegic.kora.core.model.RequestEmailOtpResponse
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.model.VerifyEmailOtpRequest
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.network.AuthApi
import com.realtegic.kora.core.network.WorkspacesApi
import com.realtegic.kora.core.preferences.LocalPreferences
import com.realtegic.kora.core.preferences.SelectedWorkspacePreference
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionManager
import com.realtegic.kora.core.session.TokenStore
import com.squareup.moshi.Moshi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeWorkspacesApiForViewModelTest(private val workspaces: MyWorkspacesDto) : WorkspacesApi {
    override suspend fun getMyWorkspaces() = Response.success(ApiSuccessEnvelope(data = workspaces, meta = ApiMeta("req")))
}

private class FakeAuthApi : AuthApi {
    var logoutCallCount = 0
    override suspend fun requestOtp(body: RequestEmailOtpRequest): Response<ApiSuccessEnvelope<RequestEmailOtpResponse>> = notImplemented()
    override suspend fun verifyOtp(body: VerifyEmailOtpRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun refresh(body: RefreshRequest): Response<ApiSuccessEnvelope<AuthResultDto>> = notImplemented()
    override suspend fun logout(): Response<Unit> {
        logoutCallCount++
        return Response.success(Unit)
    }
    override suspend fun logoutAll(): Response<Unit> = notImplemented()
    override suspend fun me(): Response<ApiSuccessEnvelope<MeDto>> = notImplemented()
    override suspend fun sessions(): Response<ApiSuccessEnvelope<List<SessionSummaryDto>>> = notImplemented()
    override suspend fun revokeSession(sessionId: String): Response<Unit> = notImplemented()
    private fun notImplemented(): Nothing = throw UnsupportedOperationException("Not needed for this test")
}

private fun org(id: String, name: String) = WorkspaceOrganizationDto(
    organizationId = id,
    membershipId = "membership-$id",
    name = name,
    slug = id,
    logoUrl = null,
    defaultCurrency = "GHS",
    roleCodes = listOf("owner"),
    permissionCodes = emptyList(),
    accessMode = "FULL",
    membershipStatus = "ACTIVE",
    branches = emptyList(),
)

/**
 * Pure view-model behaviour for workspace selection (docs task Phase 6),
 * separate from [WorkspaceChooserScreenTest]'s Compose-level coverage:
 * which row gets pre-highlighted from a remembered choice, that a
 * revoked/no-longer-available remembered choice is never trusted, and
 * that confirming a selection is what persists it and signs out is a
 * real session termination.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class WorkspaceViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    // LocalPreferences' DataStore always resolves on its own real
    // background dispatcher, never [MainDispatcherRule]'s eager test one
    // (docs task: the same reason WorkspaceChooserScreenTest waits for
    // its persistence rather than assuming it is synchronous) -- so any
    // assertion about a preselection or a persisted preference has to
    // poll for it instead of reading state the instant a suspend call
    // returns.
    private fun waitUntil(timeoutMs: Long = 5_000, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (!condition()) {
            if (System.currentTimeMillis() > deadline) throw AssertionError("Condition not met within ${timeoutMs}ms")
            Thread.sleep(10)
        }
    }

    private fun buildViewModel(
        workspaces: MyWorkspacesDto,
        localPreferences: LocalPreferences,
        fakeAuthApi: FakeAuthApi = FakeAuthApi(),
    ): WorkspaceViewModel {
        val tokenStore = TokenStore(context, prefsProvider = { context.getSharedPreferences("workspace_vm_test_prefs", Context.MODE_PRIVATE) })
        val sessionManager = SessionManager(tokenStore, fakeAuthApi, Moshi.Builder().build())
        val authRepository = AuthRepository(fakeAuthApi, sessionManager, Moshi.Builder().build())
        return WorkspaceViewModel(WorkspacesRepository(FakeWorkspacesApiForViewModelTest(workspaces), Moshi.Builder().build()), localPreferences, authRepository)
    }

    @Test
    fun `no remembered preference leaves nothing preselected`() = runTest {
        val localPreferences = LocalPreferences(context)
        val viewModel = buildViewModel(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = listOf(org("a", "Org A"))),
            localPreferences,
        )
        assertTrue((viewModel.state.value as ScreenState.Content).data.organizations.isNotEmpty())
        Thread.sleep(300)
        assertNull(viewModel.selectedRow.value)
    }

    @Test
    fun `a remembered organization that is still present is preselected`() = runTest {
        val localPreferences = LocalPreferences(context)
        localPreferences.setSelectedOrganizationWorkspace("a")
        val viewModel = buildViewModel(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = listOf(org("a", "Org A"))),
            localPreferences,
        )
        waitUntil { viewModel.selectedRow.value != null }
        assertEquals(SelectedWorkspaceRow.Organization("a"), viewModel.selectedRow.value)
    }

    @Test
    fun `a remembered organization that is no longer accessible is never preselected`() = runTest {
        val localPreferences = LocalPreferences(context)
        localPreferences.setSelectedOrganizationWorkspace("revoked-org")
        val viewModel = buildViewModel(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = listOf(org("a", "Org A"))),
            localPreferences,
        )
        // Give the (never-matching) preselection lookup a real chance to
        // run before asserting the negative, rather than passing only
        // because the async read had not resolved yet.
        Thread.sleep(300)
        assertNull(viewModel.selectedRow.value)
    }

    @Test
    fun `a remembered customer preference is not preselected if customer is no longer available`() = runTest {
        val localPreferences = LocalPreferences(context)
        localPreferences.setSelectedCustomerWorkspace()
        val viewModel = buildViewModel(
            MyWorkspacesDto(customerWorkspaceAvailable = false, organizations = listOf(org("a", "Org A"))),
            localPreferences,
        )
        Thread.sleep(300)
        assertNull(viewModel.selectedRow.value)
    }

    @Test
    fun `confirming a customer selection persists it and fires the customer callback only`() = runTest {
        val localPreferences = LocalPreferences(context)
        val viewModel = buildViewModel(MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = emptyList()), localPreferences)
        viewModel.selectRow(SelectedWorkspaceRow.Customer)

        var customerCalled = false
        var organizationCalled: String? = null
        viewModel.confirmSelection(onCustomer = { customerCalled = true }, onOrganization = { organizationCalled = it })

        // confirmSelection's own coroutine persists the preference and
        // only then invokes the callback, so once customerCalled flips
        // true the write below is already guaranteed to have landed.
        waitUntil { customerCalled }
        assertNull(organizationCalled)
        assertEquals(SelectedWorkspacePreference.Customer, localPreferences.selectedWorkspace.first())
    }

    @Test
    fun `confirming with nothing selected calls neither callback`() = runTest {
        val localPreferences = LocalPreferences(context)
        val viewModel = buildViewModel(MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = emptyList()), localPreferences)

        var anyCalled = false
        viewModel.confirmSelection(onCustomer = { anyCalled = true }, onOrganization = { anyCalled = true })

        assertTrue(!anyCalled)
    }

    @Test
    fun `signing out logs out through the real auth repository and fires the callback`() = runTest {
        val localPreferences = LocalPreferences(context)
        val fakeAuthApi = FakeAuthApi()
        val viewModel = buildViewModel(MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = emptyList()), localPreferences, fakeAuthApi)

        var signedOut = false
        viewModel.signOut { signedOut = true }

        assertTrue(signedOut)
        assertTrue(fakeAuthApi.logoutCallCount > 0)
    }
}
