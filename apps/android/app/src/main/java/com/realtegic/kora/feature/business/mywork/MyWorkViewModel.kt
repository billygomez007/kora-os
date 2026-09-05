package com.realtegic.kora.feature.business.mywork

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ServiceSessionsRepository
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ServiceSessionDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MyWorkUiState(
    val sessions: ScreenState<List<ServiceSessionDto>> = ScreenState.Loading,
)

/**
 * "My Work" for a service provider (docs task Phase 6/navigation) --
 * scoped to the caller's own eligible work only. No endpoint resolves
 * "sessions assigned to me" directly, so this ViewModel resolves the
 * caller's own StaffProfile id itself: the team directory (already
 * permission-gated and already used for the owner/manager team screen)
 * carries both `userId` and `staffProfileId` per entry, so matching the
 * authenticated session's own `userId` against it is a safe, purely
 * client-side lookup of already-authorized data -- never a new
 * authorization decision, and never a value trusted for anything beyond
 * which sessions to *ask* the server for (the server independently
 * re-validates every session-level action regardless).
 */
class MyWorkViewModel(
    private val organizationId: String,
    private val authRepository: AuthRepository,
    private val staffRepository: StaffRepository,
    private val serviceSessionsRepository: ServiceSessionsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(MyWorkUiState())
    val state: StateFlow<MyWorkUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(sessions = ScreenState.Loading)
            val signedIn = authRepository.sessionState.value as? SessionState.SignedIn
            if (signedIn == null) {
                _state.value = _state.value.copy(sessions = ScreenState.AuthenticationExpired)
                return@launch
            }
            val staffResult = staffRepository.listStaff(organizationId)
            val ownStaffProfileId = (staffResult as? ApiResult.Success)?.value
                ?.firstOrNull { it.userId == signedIn.userId }
                ?.staffProfileId
            if (ownStaffProfileId == null) {
                _state.value = _state.value.copy(sessions = ScreenState.Empty)
                return@launch
            }
            when (val result = serviceSessionsRepository.list(organizationId, status = "IN_PROGRESS", assignedStaffProfileId = ownStaffProfileId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(sessions = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(sessions = ScreenState.Error(result.error))
            }
        }
    }
}
