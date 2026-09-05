package com.realtegic.kora.feature.workspace

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.WorkspacesRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.preferences.LocalPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class WorkspaceViewModel(
    private val workspacesRepository: WorkspacesRepository,
    private val localPreferences: LocalPreferences,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<MyWorkspacesDto>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<MyWorkspacesDto>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = workspacesRepository.getMyWorkspaces()) {
                is ApiResult.Success -> ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }

    fun selectCustomer(onSelected: () -> Unit) {
        viewModelScope.launch {
            localPreferences.setSelectedCustomerWorkspace()
            onSelected()
        }
    }

    fun selectOrganization(organizationId: String, onSelected: () -> Unit) {
        viewModelScope.launch {
            localPreferences.setSelectedOrganizationWorkspace(organizationId)
            onSelected()
        }
    }
}
