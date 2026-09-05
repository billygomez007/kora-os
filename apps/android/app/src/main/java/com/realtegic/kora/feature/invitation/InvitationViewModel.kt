package com.realtegic.kora.feature.invitation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.InvitationPreviewDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.session.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class InvitationOutcome { ACCEPTED, REJECTED }

data class InvitationUiState(
    val preview: ScreenState<InvitationPreviewDto> = ScreenState.Loading,
    val isProcessing: Boolean = false,
    val actionError: DomainError? = null,
    val outcome: InvitationOutcome? = null,
)

/**
 * The safe, unauthenticated preview is fetched first regardless of
 * sign-in state (docs task "Invitation Deep Link and Acceptance") --
 * only accept/reject themselves require authentication. Role and branch
 * names shown here come only from the server's own preview response;
 * this screen never trusts anything embedded in the deep-link URI
 * itself beyond the opaque token used to fetch that preview. A `403`
 * from accept means the authenticated account's email does not match
 * the invitation -- shown as a specific, actionable message rather than
 * the generic "forbidden" text.
 */
class InvitationViewModel(
    private val token: String,
    private val staffRepository: StaffRepository,
    authRepository: AuthRepository,
) : ViewModel() {
    val sessionState = authRepository.sessionState

    private val _state = MutableStateFlow(InvitationUiState())
    val state: StateFlow<InvitationUiState> = _state.asStateFlow()

    init {
        loadPreview()
    }

    fun loadPreview() {
        viewModelScope.launch {
            _state.value = _state.value.copy(preview = ScreenState.Loading)
            when (val result = staffRepository.getInvitationPreview(token)) {
                is ApiResult.Success -> _state.value = _state.value.copy(preview = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(preview = ScreenState.Error(result.error))
            }
        }
    }

    fun accept(onAccepted: (organizationId: String) -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isProcessing = true, actionError = null)
            when (val result = staffRepository.acceptInvitation(token)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isProcessing = false, outcome = InvitationOutcome.ACCEPTED)
                    onAccepted(result.value.organizationId)
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isProcessing = false, actionError = result.error)
            }
        }
    }

    fun reject(onRejected: () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isProcessing = true, actionError = null)
            when (val result = staffRepository.rejectInvitation(token)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isProcessing = false, outcome = InvitationOutcome.REJECTED)
                    onRejected()
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isProcessing = false, actionError = result.error)
            }
        }
    }
}
