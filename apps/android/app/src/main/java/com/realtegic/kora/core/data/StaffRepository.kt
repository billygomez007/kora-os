package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.AcceptInvitationResponseDto
import com.realtegic.kora.core.model.AssignableRoleDto
import com.realtegic.kora.core.model.CreateStaffInvitationRequest
import com.realtegic.kora.core.model.CreateStaffInvitationResponseDto
import com.realtegic.kora.core.model.InvitationPreviewDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffInvitationListItemDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.StaffApi
import com.realtegic.kora.core.network.safeApiCall
import com.realtegic.kora.core.network.safeUnitApiCall
import com.squareup.moshi.Moshi

/**
 * The raw invitation token this repository returns from [createInvitation]
 * must be shown to the caller exactly once and never persisted to
 * ordinary storage or logged (docs task "Staff and Role Invitations");
 * everything downstream of accept/reject re-resolves the invitation
 * from its secure token server-side -- this repository never trusts a
 * role or branch name embedded in a deep link.
 */
class StaffRepository(
    private val staffApi: StaffApi,
    private val moshi: Moshi,
) {
    suspend fun getAssignableRoles(organizationId: String): ApiResult<List<AssignableRoleDto>> =
        safeApiCall(moshi) { staffApi.getAssignableRoles(organizationId) }

    suspend fun createInvitation(organizationId: String, request: CreateStaffInvitationRequest): ApiResult<CreateStaffInvitationResponseDto> =
        safeApiCall(moshi) { staffApi.createInvitation(organizationId, request) }

    suspend fun listInvitations(organizationId: String, status: String? = null): ApiResult<List<StaffInvitationListItemDto>> =
        safeApiCall(moshi) { staffApi.listInvitations(organizationId, status) }

    suspend fun revokeInvitation(organizationId: String, invitationId: String): ApiResult<Unit> =
        safeUnitApiCall(moshi) { staffApi.revokeInvitation(organizationId, invitationId) }

    suspend fun getInvitationPreview(token: String): ApiResult<InvitationPreviewDto> =
        safeApiCall(moshi) { staffApi.getInvitationPreview(token) }

    suspend fun acceptInvitation(token: String): ApiResult<AcceptInvitationResponseDto> =
        safeApiCall(moshi) { staffApi.acceptInvitation(token) }

    suspend fun rejectInvitation(token: String): ApiResult<Unit> =
        safeUnitApiCall(moshi) { staffApi.rejectInvitation(token) }

    suspend fun listStaff(organizationId: String): ApiResult<List<StaffDirectoryEntryDto>> =
        safeApiCall(moshi) { staffApi.listStaff(organizationId) }
}
