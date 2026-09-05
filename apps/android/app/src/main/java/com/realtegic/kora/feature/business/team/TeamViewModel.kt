package com.realtegic.kora.feature.business.team

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AssignableRoleDto
import com.realtegic.kora.core.model.CreateStaffInvitationRequest
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.model.StaffInvitationListItemDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TeamUiState(
    val staff: ScreenState<List<StaffDirectoryEntryDto>> = ScreenState.Loading,
    val invitations: ScreenState<List<StaffInvitationListItemDto>> = ScreenState.Loading,
    val assignableRoles: List<AssignableRoleDto> = emptyList(),
    val showInviteForm: Boolean = false,
    val inviteEmail: String = "",
    val selectedRoleId: String? = null,
    val isSendingInvite: Boolean = false,
    val inviteError: DomainError? = null,
    val pendingRevokeInvitationId: String? = null,
    /** The raw invitation link, shown exactly once right after creation
     * (docs task "Staff and Role Invitations": "display it only once
     * with a deliberate Copy/Share action, never persist to ordinary
     * local storage") -- held only in this in-memory Compose state,
     * cleared as soon as the owner dismisses the dialog. */
    val pendingInvitationLink: String? = null,
)

/**
 * The team directory and pending-invitation list are two independent
 * queries (docs task "Team Directory and Staff Profile" and "Staff and
 * Role Invitations") -- a membership only ever appears in the directory
 * once actually accepted; a still-pending invite lives only in the
 * second list until then.
 */
class TeamViewModel(
    private val organizationId: String,
    private val staffRepository: StaffRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TeamUiState())
    val state: StateFlow<TeamUiState> = _state.asStateFlow()

    init {
        loadStaff()
        loadInvitations()
        loadAssignableRoles()
    }

    fun loadStaff() {
        viewModelScope.launch {
            _state.value = _state.value.copy(staff = ScreenState.Loading)
            when (val result = staffRepository.listStaff(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(staff = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(staff = ScreenState.Error(result.error))
            }
        }
    }

    fun loadInvitations() {
        viewModelScope.launch {
            _state.value = _state.value.copy(invitations = ScreenState.Loading)
            when (val result = staffRepository.listInvitations(organizationId, status = "PENDING")) {
                is ApiResult.Success -> _state.value = _state.value.copy(invitations = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(invitations = ScreenState.Error(result.error))
            }
        }
    }

    private fun loadAssignableRoles() {
        viewModelScope.launch {
            when (val result = staffRepository.getAssignableRoles(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    assignableRoles = result.value,
                    selectedRoleId = _state.value.selectedRoleId ?: result.value.firstOrNull()?.id,
                )
                is ApiResult.Failure -> Unit
            }
        }
    }

    fun showInviteForm() {
        _state.value = _state.value.copy(showInviteForm = true)
    }

    fun dismissInviteForm() {
        _state.value = _state.value.copy(showInviteForm = false, inviteEmail = "", inviteError = null)
    }

    fun onInviteChanged(email: String = _state.value.inviteEmail, roleId: String? = _state.value.selectedRoleId) {
        _state.value = _state.value.copy(inviteEmail = email, selectedRoleId = roleId, inviteError = null)
    }

    fun sendInvite() {
        val current = _state.value
        val roleId = current.selectedRoleId
        if (current.inviteEmail.isBlank() || roleId == null) {
            _state.value = current.copy(inviteError = DomainError.Validation("Enter an email and choose a role."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSendingInvite = true, inviteError = null)
            val request = CreateStaffInvitationRequest(email = current.inviteEmail.trim(), roleId = roleId)
            when (val result = staffRepository.createInvitation(organizationId, request)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(
                        isSendingInvite = false,
                        showInviteForm = false,
                        inviteEmail = "",
                        pendingInvitationLink = "kora://invite/${result.value.rawToken}",
                    )
                    loadInvitations()
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isSendingInvite = false, inviteError = result.error)
            }
        }
    }

    /** Called once the owner has copied/shared the link (or dismissed
     * the dialog outright) -- the raw token must not linger in memory
     * any longer than necessary. */
    fun dismissInvitationLink() {
        _state.value = _state.value.copy(pendingInvitationLink = null)
    }

    fun requestRevokeConfirmation(invitationId: String) {
        _state.value = _state.value.copy(pendingRevokeInvitationId = invitationId)
    }

    fun dismissRevokeConfirmation() {
        _state.value = _state.value.copy(pendingRevokeInvitationId = null)
    }

    fun confirmRevoke() {
        val invitationId = _state.value.pendingRevokeInvitationId ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(pendingRevokeInvitationId = null)
            staffRepository.revokeInvitation(organizationId, invitationId)
            loadInvitations()
        }
    }
}
