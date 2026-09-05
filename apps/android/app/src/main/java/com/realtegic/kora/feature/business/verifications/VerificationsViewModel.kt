package com.realtegic.kora.feature.business.verifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.PaymentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class VerificationTab { PENDING, DISPUTED, RESOLVED }

data class VerificationsUiState(
    val selectedTab: VerificationTab = VerificationTab.PENDING,
    val payments: ScreenState<List<PaymentRecordDto>> = ScreenState.Loading,
    val pendingActionPaymentId: String? = null,
    val actionError: DomainError? = null,
    val showDisputeForm: String? = null,
    val disputeReason: String = "",
)

/**
 * A provider's own confirm/dispute queue (docs task Phase 9) -- every
 * list here is server-scoped to the caller's own eligible work
 * already; this screen never filters by role name, only by what the
 * server actually returned. A conflict always triggers a full reload
 * of the authoritative state rather than any local guess (docs task:
 * "never update verification status optimistically").
 */
class VerificationsViewModel(
    private val organizationId: String,
    private val repository: PaymentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(VerificationsUiState())
    val state: StateFlow<VerificationsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun selectTab(tab: VerificationTab) {
        _state.value = _state.value.copy(selectedTab = tab)
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(payments = ScreenState.Loading)
            val status = when (_state.value.selectedTab) {
                VerificationTab.PENDING -> "RECORDED"
                VerificationTab.DISPUTED -> "DISPUTED"
                VerificationTab.RESOLVED -> "CONFIRMED"
            }
            when (val result = repository.myVerifications(organizationId, status)) {
                is ApiResult.Success -> _state.value = _state.value.copy(payments = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(payments = ScreenState.Error(result.error))
            }
        }
    }

    fun confirm(paymentId: String) {
        if (_state.value.pendingActionPaymentId != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(pendingActionPaymentId = paymentId, actionError = null)
            when (val result = repository.confirm(organizationId, paymentId, null)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(pendingActionPaymentId = null)
                    load()
                }
                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(pendingActionPaymentId = null, actionError = result.error)
                    load()
                }
            }
        }
    }

    fun showDisputeForm(paymentId: String) {
        _state.value = _state.value.copy(showDisputeForm = paymentId, disputeReason = "")
    }

    fun dismissDisputeForm() {
        _state.value = _state.value.copy(showDisputeForm = null)
    }

    fun onDisputeReasonChanged(reason: String) {
        _state.value = _state.value.copy(disputeReason = reason, actionError = null)
    }

    fun submitDispute() {
        val paymentId = _state.value.showDisputeForm ?: return
        if (_state.value.disputeReason.isBlank()) {
            _state.value = _state.value.copy(actionError = DomainError.Validation("Enter a reason for the dispute."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(pendingActionPaymentId = paymentId, showDisputeForm = null, actionError = null)
            when (val result = repository.dispute(organizationId, paymentId, _state.value.disputeReason.trim())) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(pendingActionPaymentId = null)
                    load()
                }
                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(pendingActionPaymentId = null, actionError = result.error)
                    load()
                }
            }
        }
    }
}
