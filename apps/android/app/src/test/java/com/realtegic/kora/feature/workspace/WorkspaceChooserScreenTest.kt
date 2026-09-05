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
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.core.network.WorkspacesApi
import com.realtegic.kora.core.preferences.LocalPreferences
import com.realtegic.kora.core.preferences.SelectedWorkspacePreference
import com.realtegic.kora.ui.theme.KoraTheme
import com.squareup.moshi.Moshi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response

private class FakeWorkspacesApi(private val workspaces: MyWorkspacesDto) : WorkspacesApi {
    override suspend fun getMyWorkspaces() = Response.success(ApiSuccessEnvelope(data = workspaces, meta = ApiMeta("req")))
}

private fun org(id: String, name: String) = WorkspaceOrganizationDto(
    organizationId = id,
    membershipId = "membership-$id",
    name = name,
    slug = id,
    logoUrl = null,
    roleCodes = listOf("owner"),
    permissionCodes = emptyList(),
    accessMode = "FULL",
    membershipStatus = "ACTIVE",
    branches = emptyList(),
)

/**
 * Workspace selection: both a customer entry point and every accessible
 * business are shown, and picking one persists the selection (via
 * [LocalPreferences], a UX convenience only -- never an access decision
 * on its own) and fires the right navigation callback (docs task Phase
 * 4).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class WorkspaceChooserScreenTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `shows a Customer entry and every accessible business, and selecting one navigates and persists the choice`() = runTest {
        val api = FakeWorkspacesApi(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = listOf(org("org-1", "Urban Crown Salon"))),
        )
        val localPreferences = LocalPreferences(context)
        val viewModel = WorkspaceViewModel(WorkspacesRepository(api, Moshi.Builder().build()), localPreferences)
        var selectedOrganizationId: String? = null

        composeRule.setContent {
            KoraTheme {
                WorkspaceChooserScreen(
                    viewModel = viewModel,
                    onCustomerSelected = {},
                    onOrganizationSelected = { selectedOrganizationId = it },
                )
            }
        }

        composeRule.onNodeWithText("Customer").assertExists()
        composeRule.onNodeWithText("Urban Crown Salon").assertExists()

        composeRule.onNodeWithText("Urban Crown Salon").performClick()

        // The selection callback fires only after LocalPreferences' DataStore
        // write completes, which runs on a real background dispatcher --
        // wait for it rather than assuming the eager test dispatcher alone
        // makes it synchronous.
        composeRule.waitUntil(timeoutMillis = 5_000) { selectedOrganizationId != null }

        assertEquals("org-1", selectedOrganizationId)
        assertEquals(SelectedWorkspacePreference.Organization("org-1"), localPreferences.selectedWorkspace.first())
    }
}
