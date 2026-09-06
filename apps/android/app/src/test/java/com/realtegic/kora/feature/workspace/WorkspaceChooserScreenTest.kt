package com.realtegic.kora.feature.workspace

import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.realtegic.kora.MainDispatcherRule
import com.realtegic.kora.core.data.WorkspacesRepository
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
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeWorkspacesApi(private val workspaces: MyWorkspacesDto) : WorkspacesApi {
    override suspend fun getMyWorkspaces() = Response.success(ApiSuccessEnvelope(data = workspaces, meta = ApiMeta("req")))
}

private class ChooserFakeAuthApi : AuthApi {
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
 * Workspace selection: both a customer entry point and every accessible
 * business are shown, tapping a row only highlights it, and only the
 * separate "Continue to workspace" tap actually persists the selection
 * and fires the right navigation callback (docs task Phase 6).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h800dp")
class WorkspaceChooserScreenTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun buildViewModel(workspaces: MyWorkspacesDto, fakeAuthApi: ChooserFakeAuthApi, localPreferences: LocalPreferences): WorkspaceViewModel {
        val api = FakeWorkspacesApi(workspaces)
        val tokenStore = TokenStore(context, prefsProvider = { context.getSharedPreferences("test_workspace_chooser_prefs", Context.MODE_PRIVATE) })
        val sessionManager = SessionManager(tokenStore, fakeAuthApi, Moshi.Builder().build())
        val authRepository = AuthRepository(fakeAuthApi, sessionManager, Moshi.Builder().build())
        return WorkspaceViewModel(WorkspacesRepository(api, Moshi.Builder().build()), localPreferences, authRepository)
    }

    @Test
    fun `shows a Customer entry and every accessible business, and confirming a selection navigates and persists the choice`() = runTest {
        val localPreferences = LocalPreferences(context)
        val viewModel = buildViewModel(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = listOf(org("org-1", "Urban Crown Salon"))),
            ChooserFakeAuthApi(),
            localPreferences,
        )
        var selectedOrganizationId: String? = null

        composeRule.setContent {
            KoraTheme {
                WorkspaceChooserScreen(
                    viewModel = viewModel,
                    onCustomerSelected = {},
                    onOrganizationSelected = { selectedOrganizationId = it },
                    onCreateBusiness = {},
                    onSignInDifferentEmail = {},
                )
            }
        }

        composeRule.onNodeWithText("Customer").assertExists()
        composeRule.onNodeWithText("Urban Crown Salon").assertExists()

        // A single tap only highlights the row -- it must not navigate on
        // its own (docs task Phase 6: never apply a selection by accident).
        composeRule.onNodeWithText("Urban Crown Salon").performClick()
        composeRule.waitForIdle()
        assertEquals(null, selectedOrganizationId)

        composeRule.onNodeWithText("Continue to workspace").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000) { selectedOrganizationId != null }

        assertEquals("org-1", selectedOrganizationId)
        assertEquals(SelectedWorkspacePreference.Organization("org-1"), localPreferences.selectedWorkspace.first())
    }

    @Test
    fun `sign in with a different email signs out and fires the callback`() = runTest {
        val localPreferences = LocalPreferences(context)
        val fakeAuthApi = ChooserFakeAuthApi()
        val viewModel = buildViewModel(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = emptyList()),
            fakeAuthApi,
            localPreferences,
        )
        var signedOut = false

        composeRule.setContent {
            KoraTheme {
                WorkspaceChooserScreen(
                    viewModel = viewModel,
                    onCustomerSelected = {},
                    onOrganizationSelected = {},
                    onCreateBusiness = {},
                    onSignInDifferentEmail = { signedOut = true },
                )
            }
        }

        composeRule.onNodeWithText("Sign in with a different email").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000) { signedOut }
        assertTrue(fakeAuthApi.logoutCallCount > 0)
    }
}
