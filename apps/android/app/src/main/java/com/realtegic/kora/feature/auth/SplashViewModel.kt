package com.realtegic.kora.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Runs [AuthRepository.restoreSession] exactly once per instance
 * (docs task Phase 3: "Session-restoration splash screen") -- [retry]
 * exists for the [SessionState.RestorationFailed] path, when a transient
 * network failure left a cached session that could not be verified. */
class SplashViewModel(private val authRepository: AuthRepository) : ViewModel() {
    private val _sessionState = MutableStateFlow<SessionState>(SessionState.Unknown)
    val sessionState: StateFlow<SessionState> = _sessionState.asStateFlow()

    init {
        restore()
    }

    fun retry() {
        _sessionState.value = SessionState.Unknown
        restore()
    }

    private fun restore() {
        viewModelScope.launch {
            _sessionState.value = authRepository.restoreSession()
        }
    }
}
