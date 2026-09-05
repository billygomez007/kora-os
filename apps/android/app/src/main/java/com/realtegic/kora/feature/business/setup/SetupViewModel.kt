package com.realtegic.kora.feature.business.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.OrganizationsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.OrganizationSetupStatusDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Every checklist item is computed by the server from real database
 * state, refreshed on every visit -- this screen never marks a step
 * complete on its own (docs task "Business Onboarding Contract"). */
class SetupViewModel(
    private val organizationId: String,
    private val organizationsRepository: OrganizationsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<OrganizationSetupStatusDto>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<OrganizationSetupStatusDto>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = organizationsRepository.getSetupStatus(organizationId)) {
                is ApiResult.Success -> ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }
}
