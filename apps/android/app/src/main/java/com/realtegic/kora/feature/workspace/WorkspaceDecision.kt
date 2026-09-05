package com.realtegic.kora.feature.workspace

import com.realtegic.kora.core.model.MyWorkspacesDto

/** Where the app should land right after determining which workspaces a
 * signed-in person can access (docs task Phase 4). A pure function of
 * the server's own safe projection -- never a decision the client makes
 * on stale/cached data, and never itself an authorization check (every
 * protected screen still calls its own guarded endpoint regardless of
 * which branch is taken here). */
sealed class WorkspaceDecision {
    data object CustomerHome : WorkspaceDecision()
    data class BusinessWorkspace(val organizationId: String) : WorkspaceDecision()
    data object ShowChooser : WorkspaceDecision()
}

fun decideInitialWorkspaceRoute(workspaces: MyWorkspacesDto): WorkspaceDecision {
    val organizations = workspaces.organizations
    return when {
        organizations.isEmpty() && workspaces.customerWorkspaceAvailable -> WorkspaceDecision.CustomerHome
        organizations.size == 1 && !workspaces.customerWorkspaceAvailable ->
            WorkspaceDecision.BusinessWorkspace(organizations.first().organizationId)
        else -> WorkspaceDecision.ShowChooser
    }
}
