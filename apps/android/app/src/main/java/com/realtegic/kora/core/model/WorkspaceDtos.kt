package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class MyWorkspacesDto(
    val customerWorkspaceAvailable: Boolean,
    val organizations: List<WorkspaceOrganizationDto>,
)

@JsonClass(generateAdapter = true)
data class WorkspaceOrganizationDto(
    val organizationId: String,
    val membershipId: String,
    val name: String,
    val slug: String,
    val logoUrl: String?,
    val roleCodes: List<String>,
    val permissionCodes: List<String>,
    val accessMode: String,
    val membershipStatus: String,
    val branches: List<WorkspaceBranchDto>,
)

@JsonClass(generateAdapter = true)
data class WorkspaceBranchDto(
    val branchId: String,
    val name: String,
)
