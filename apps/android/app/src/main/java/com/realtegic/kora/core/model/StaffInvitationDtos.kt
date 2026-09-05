package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Matches the backend's exact `StaffInvitationStatus` enum values --
 * note DECLINED, not "REJECTED", for a rejected invitation. */
object StaffInvitationStatus {
    const val PENDING = "PENDING"
    const val ACCEPTED = "ACCEPTED"
    const val DECLINED = "DECLINED"
    const val REVOKED = "REVOKED"
    const val EXPIRED = "EXPIRED"
}

/** A role a staff invitation may actually grant -- never `owner`, which
 * can only ever be the creator of an organization (docs task "Staff and
 * Role Invitations"). Looked up from the server rather than
 * hard-coded, since role ids are database-generated. */
@JsonClass(generateAdapter = true)
data class AssignableRoleDto(
    val id: String,
    val code: String,
    val name: String,
)

@JsonClass(generateAdapter = true)
data class CreateStaffInvitationRequest(
    val email: String? = null,
    val phone: String? = null,
    val roleId: String,
    val branchId: String? = null,
)

@JsonClass(generateAdapter = true)
data class StaffInvitationSummaryDto(
    val id: String,
    val expiresAt: String,
    val status: String,
)

/** The raw token is present only in this one response, exactly once --
 * never persisted to ordinary storage, never logged (docs task "Staff
 * and Role Invitations"). */
@JsonClass(generateAdapter = true)
data class CreateStaffInvitationResponseDto(
    val invitation: StaffInvitationSummaryDto,
    val rawToken: String,
)

/** Owner/manager-facing invitation list entry -- never the token or its
 * hash. */
@JsonClass(generateAdapter = true)
data class StaffInvitationListItemDto(
    val id: String,
    val email: String?,
    val phone: String?,
    val roleId: String,
    val roleName: String,
    val roleCode: String,
    val branchId: String?,
    val branchName: String?,
    val status: String,
    val expiresAt: String,
    val createdAt: String,
)

/** The safe, minimal, unauthenticated preview of an invitation --
 * deliberately excludes the invited email/phone and any organization
 * id, matching what `GET /v1/staff-invitations/:token` actually
 * returns. */
@JsonClass(generateAdapter = true)
data class InvitationPreviewDto(
    val organizationName: String,
    val roleName: String,
    val branchName: String?,
    val status: String,
    val expiresAt: String,
    val isExpired: Boolean,
)

@JsonClass(generateAdapter = true)
data class AcceptInvitationResponseDto(
    val organizationId: String,
    val membershipId: String,
)

@JsonClass(generateAdapter = true)
data class StaffDirectoryBranchDto(
    val branchId: String,
    val name: String,
)

@JsonClass(generateAdapter = true)
data class StaffDirectoryServiceDto(
    val serviceId: String,
    val name: String,
)

@JsonClass(generateAdapter = true)
data class StaffDirectoryEntryDto(
    val membershipId: String,
    val userId: String,
    val displayName: String,
    val email: String?,
    val status: String,
    val roleNames: List<String>,
    val roleCodes: List<String>,
    val branches: List<StaffDirectoryBranchDto>,
    val services: List<StaffDirectoryServiceDto>,
)
