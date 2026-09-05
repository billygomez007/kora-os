package com.realtegic.kora.feature.business.resolution

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.PaymentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.PaymentDisputeDto
import com.realtegic.kora.core.model.PaymentDisputeResolution
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DisputeResolutionListUiState(
    val disputes: ScreenState<List<PaymentDisputeDto>> = ScreenState.Loading,
)

class DisputeResolutionListViewModel(
    private val organizationId: String,
    private val repository: PaymentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(DisputeResolutionListUiState())
    val state: StateFlow<DisputeResolutionListUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(disputes = ScreenState.Loading)
            when (val result = repository.listDisputes(organizationId, status = "OPEN")) {
                is ApiResult.Success -> _state.value = _state.value.copy(disputes = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(disputes = ScreenState.Error(result.error))
            }
        }
    }
}

data class DisputeResolutionDetailUiState(
    val dispute: ScreenState<PaymentDisputeDto> = ScreenState.Loading,
    val resolutionNote: String = "",
    val isSubmitting: Boolean = false,
    val submitError: DomainError? = null,
    val showOverrideWarning: Boolean = false,
    val pendingResolution: String? = null,
    val resolved: Boolean = false,
)

/**
 * Owner/manager dispute resolution (docs task Phase 10). Resolution is
 * always server-controlled and atomic -- a successful resolution may
 * post an immutable Transaction, CommissionAccrual rows, and a Receipt,
 * but this ViewModel never manufactures any of those locally; it only
 * ever reads back what the server actually returned.
 */
class DisputeResolutionDetailViewModel(
    private val organizationId: String,
    private val disputeId: String,
    private val repository: PaymentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(DisputeResolutionDetailUiState())
    val state: StateFlow<DisputeResolutionDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(dispute = ScreenState.Loading)
            when (val result = repository.getDispute(organizationId, disputeId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(dispute = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(dispute = ScreenState.Error(result.error))
            }
        }
    }

    fun onResolutionNoteChanged(note: String) {
        _state.value = _state.value.copy(resolutionNote = note, submitError = null)
    }

    fun requestResolve(resolution: String) {
        _state.value = _state.value.copy(pendingResolution = resolution, showOverrideWarning = true)
    }

    fun dismissOverrideWarning() {
        _state.value = _state.value.copy(showOverrideWarning = false, pendingResolution = null)
    }

    fun confirmResolve() {
        val resolution = _state.value.pendingResolution ?: return
        if (resolution == PaymentDisputeResolution.REJECT_PAYMENT && _state.value.resolutionNote.isBlank()) {
            _state.value = _state.value.copy(showOverrideWarning = false, submitError = DomainError.Validation("Enter a reason for rejecting this payment."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, submitError = null, showOverrideWarning = false)
            when (val result = repository.resolveDispute(organizationId, disputeId, resolution, _state.value.resolutionNote.trim().takeIf { it.isNotBlank() })) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSubmitting = false, dispute = ScreenState.Content(result.value), resolved = true)
                is ApiResult.Failure -> _state.value = _state.value.copy(isSubmitting = false, submitError = result.error)
            }
        }
    }
}
