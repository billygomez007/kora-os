package com.realtegic.kora.feature.customer.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.SessionSummaryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.session.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AccountSettingsViewModel(private val authRepository: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<List<SessionSummaryDto>>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<List<SessionSummaryDto>>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = authRepository.listSessions()) {
                is ApiResult.Success -> if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }

    fun revoke(sessionId: String) {
        viewModelScope.launch {
            authRepository.revokeSession(sessionId)
            load()
        }
    }

    fun signOutEverywhere(onSignedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logoutAllDevices()
            onSignedOut()
        }
    }
}
