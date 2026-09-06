package com.realtegic.kora.feature.workspace

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.preferences.LocalPreferences
import com.realtegic.kora.core.preferences.SelectedWorkspacePreference
import com.realtegic.kora.core.session.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Which row is currently highlighted, distinct from which workspace is
 * actually active -- tapping a row only ever updates this; committing the
 * switch requires the separate, explicit "Continue to workspace" tap
 * (docs task Phase 6: "clearly show the selected workspace"). */
sealed class SelectedWorkspaceRow {
    data object Customer : SelectedWorkspaceRow()
    data class Organization(val organizationId: String) : SelectedWorkspaceRow()
}

class WorkspaceViewModel(
    private val workspacesRepository: WorkspacesRepository,
    private val localPreferences: LocalPreferences,
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<MyWorkspacesDto>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<MyWorkspacesDto>> = _state.asStateFlow()

    private val _selectedRow = MutableStateFlow<SelectedWorkspaceRow?>(null)
    val selectedRow: StateFlow<SelectedWorkspaceRow?> = _selectedRow.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            when (val result = workspacesRepository.getMyWorkspaces()) {
                is ApiResult.Success -> {
                    _state.value = ScreenState.Content(result.value)
                    preselectFromRemembered(result.value)
                }
                is ApiResult.Failure -> _state.value = ScreenState.Error(result.error)
            }
        }
    }

    // Pre-highlights whichever row matches the last remembered choice, but
    // only when that choice is still actually valid against this fresh
    // fetch -- a revoked membership or a no-longer-available customer
    // workspace never leaves a stale row highlighted (docs task Phase 6:
    // "revoked or inactive memberships must disappear after refresh").
    private suspend fun preselectFromRemembered(workspaces: MyWorkspacesDto) {
        _selectedRow.value = when (val stored = localPreferences.selectedWorkspace.first()) {
            is SelectedWorkspacePreference.Organization ->
                workspaces.organizations.firstOrNull { it.organizationId == stored.organizationId }
                    ?.let { SelectedWorkspaceRow.Organization(it.organizationId) }
            SelectedWorkspacePreference.Customer -> SelectedWorkspaceRow.Customer.takeIf { workspaces.customerWorkspaceAvailable }
            SelectedWorkspacePreference.NeverChosen -> null
        }
    }

    fun selectRow(row: SelectedWorkspaceRow) {
        _selectedRow.value = row
    }

    fun confirmSelection(onCustomer: () -> Unit, onOrganization: (String) -> Unit) {
        when (val row = _selectedRow.value) {
            is SelectedWorkspaceRow.Customer -> viewModelScope.launch {
                localPreferences.setSelectedCustomerWorkspace()
                onCustomer()
            }
            is SelectedWorkspaceRow.Organization -> viewModelScope.launch {
                localPreferences.setSelectedOrganizationWorkspace(row.organizationId)
                onOrganization(row.organizationId)
            }
            null -> Unit
        }
    }

    /** "Sign in with a different email" (docs task Phase 6) -- ends the
     * current session through the same real sign-out path as Account
     * Settings, never just a local state reset. */
    fun signOut(onSignedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onSignedOut()
        }
    }
}
