package com.realtegic.kora.feature.workspace

import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkspaceDecisionTest {

    private fun org(id: String) = WorkspaceOrganizationDto(
        organizationId = id,
        membershipId = "membership_$id",
        name = "Org $id",
        slug = "org-$id",
        logoUrl = null,
        defaultCurrency = "GHS",
        roleCodes = listOf("owner"),
        permissionCodes = emptyList(),
        accessMode = "FULL",
        membershipStatus = "ACTIVE",
        branches = emptyList(),
    )

    @Test
    fun `no memberships and customer available shows the account type choice`() {
        val decision = decideInitialWorkspaceRoute(MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = emptyList()))
        assertEquals(WorkspaceDecision.ShowAccountTypeChoice, decision)
    }

    @Test
    fun `one business membership with customer unavailable goes straight to that business`() {
        val decision = decideInitialWorkspaceRoute(
            MyWorkspacesDto(customerWorkspaceAvailable = false, organizations = listOf(org("a"))),
        )
        assertEquals(WorkspaceDecision.BusinessWorkspace("a"), decision)
    }

    @Test
    fun `customer plus one business always shows the chooser`() {
        val decision = decideInitialWorkspaceRoute(
            MyWorkspacesDto(customerWorkspaceAvailable = true, organizations = listOf(org("a"))),
        )
        assertEquals(WorkspaceDecision.ShowChooser, decision)
    }

    @Test
    fun `multiple businesses always shows the chooser regardless of customer availability`() {
        val decision = decideInitialWorkspaceRoute(
            MyWorkspacesDto(customerWorkspaceAvailable = false, organizations = listOf(org("a"), org("b"))),
        )
        assertEquals(WorkspaceDecision.ShowChooser, decision)
    }

    @Test
    fun `no memberships and customer unavailable shows the chooser rather than a dead end`() {
        val decision = decideInitialWorkspaceRoute(MyWorkspacesDto(customerWorkspaceAvailable = false, organizations = emptyList()))
        assertEquals(WorkspaceDecision.ShowChooser, decision)
    }
}
