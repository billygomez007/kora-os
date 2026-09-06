package com.realtegic.kora.feature.workspace

import com.realtegic.kora.core.model.MyWorkspacesDto

/** Where the app should land right after determining which workspaces a
 * signed-in person can access (docs task Phase 4). A pure function of
 * the server's own safe projection -- never a decision the client makes
 * on stale/cached data, and never itself an authorization check (every
 * protected screen still calls its own guarded endpoint regardless of
 * which branch is taken here). */
sealed class WorkspaceDecision {
    /** A genuinely undecided, membership-less account: zero organization
     * memberships, so there is no "workspace" to choose between yet
     * (docs task Phase 5: "Show this only when the authenticated user
     * genuinely needs to choose how to begin"). Replaces what used to be
     * an unconditional jump to the customer workspace, now that every
     * authenticated identity can always use the customer workspace
     * (`customerWorkspaceAvailable` is unconditionally `true` per the
     * backend's own `MyWorkspacesView` contract) -- that fact alone can
     * no longer stand in for "this person wants to be a customer." */
    data object ShowAccountTypeChoice : WorkspaceDecision()
    data class BusinessWorkspace(val organizationId: String) : WorkspaceDecision()
    data object ShowChooser : WorkspaceDecision()
}

fun decideInitialWorkspaceRoute(workspaces: MyWorkspacesDto): WorkspaceDecision {
    val organizations = workspaces.organizations
    return when {
        organizations.isEmpty() && workspaces.customerWorkspaceAvailable -> WorkspaceDecision.ShowAccountTypeChoice
        organizations.size == 1 && !workspaces.customerWorkspaceAvailable ->
            WorkspaceDecision.BusinessWorkspace(organizations.first().organizationId)
        else -> WorkspaceDecision.ShowChooser
    }
}
