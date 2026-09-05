package com.realtegic.kora.feature.business.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.CheckoutsRepository
import com.realtegic.kora.core.designsystem.MoneyParser
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CheckoutAdjustmentType
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CheckoutUiState(
    val checkout: ScreenState<com.realtegic.kora.core.model.CheckoutDto> = ScreenState.Loading,
    val isReadOnly: Boolean = false,
    val showAdjustmentForm: Boolean = false,
    val adjustmentType: String = CheckoutAdjustmentType.DISCOUNT,
    val adjustmentAmountMajor: String = "",
    val adjustmentReason: String = "",
    val isSubmittingAdjustment: Boolean = false,
    val adjustmentError: DomainError? = null,
    val showVoidConfirm: Boolean = false,
    val voidReason: String = "",
    val isVoiding: Boolean = false,
    val voidError: DomainError? = null,
)

/**
 * Creates (or safely recovers) the checkout for one completed
 * ServiceSession (docs task Phase 7). The create idempotency key is
 * generated once and held for this ViewModel's lifetime -- there is
 * exactly one legitimate create attempt per session, so "the request
 * changes" never applies here; only a definitively different outcome
 * (success, or CHECKOUT_ALREADY_EXISTS resolved by fetching the real
 * one) ends the need to keep retrying with it.
 */
class CheckoutViewModel(
    private val organizationId: String,
    private val serviceSessionId: String,
    accessMode: String,
    private val repository: CheckoutsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(CheckoutUiState(isReadOnly = accessMode == "READ_ONLY"))
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    private val idempotencyKey = UUID.randomUUID().toString()

    init {
        createOrLoad()
    }

    fun createOrLoad() {
        viewModelScope.launch {
            _state.value = _state.value.copy(checkout = ScreenState.Loading)
            when (val result = repository.create(organizationId, serviceSessionId, idempotencyKey)) {
                is ApiResult.Success -> _state.value = _state.value.copy(checkout = ScreenState.Content(result.value))
                is ApiResult.Failure -> {
                    if (result.error is DomainError.Conflict && result.error.code == "CHECKOUT_ALREADY_EXISTS") {
                        recoverExisting()
                    } else {
                        _state.value = _state.value.copy(checkout = ScreenState.Error(result.error))
                    }
                }
            }
        }
    }

    private suspend fun recoverExisting() {
        when (val existing = repository.findForServiceSession(organizationId, serviceSessionId)) {
            is ApiResult.Success -> {
                val checkout = existing.value
                _state.value = _state.value.copy(
                    checkout = if (checkout != null) ScreenState.Content(checkout) else ScreenState.Error(DomainError.Unknown("A checkout already exists but could not be retrieved.")),
                )
            }
            is ApiResult.Failure -> _state.value = _state.value.copy(checkout = ScreenState.Error(existing.error))
        }
    }

    fun showAdjustmentForm() {
        _state.value = _state.value.copy(showAdjustmentForm = true, adjustmentAmountMajor = "", adjustmentReason = "", adjustmentError = null)
    }

    fun dismissAdjustmentForm() {
        _state.value = _state.value.copy(showAdjustmentForm = false)
    }

    fun onAdjustmentTypeChanged(type: String) {
        _state.value = _state.value.copy(adjustmentType = type)
    }

    fun onAdjustmentAmountChanged(amount: String) {
        _state.value = _state.value.copy(adjustmentAmountMajor = amount, adjustmentError = null)
    }

    fun onAdjustmentReasonChanged(reason: String) {
        _state.value = _state.value.copy(adjustmentReason = reason, adjustmentError = null)
    }

    fun submitAdjustment() {
        if (_state.value.isReadOnly) return
        val current = _state.value
        val checkout = (current.checkout as? ScreenState.Content)?.data ?: return
        val amountMinor = MoneyParser.parseMinorUnits(current.adjustmentAmountMajor, checkout.currency)
        if (amountMinor == null || amountMinor <= 0) {
            _state.value = current.copy(adjustmentError = DomainError.Validation("Enter a valid amount."))
            return
        }
        if (current.adjustmentReason.isBlank()) {
            _state.value = current.copy(adjustmentError = DomainError.Validation("Enter a reason for this adjustment."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmittingAdjustment = true, adjustmentError = null)
            when (val result = repository.addAdjustment(organizationId, checkout.id, current.adjustmentType, amountMinor, current.adjustmentReason.trim())) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSubmittingAdjustment = false, showAdjustmentForm = false, checkout = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isSubmittingAdjustment = false, adjustmentError = result.error)
            }
        }
    }

    fun showVoidConfirm() {
        _state.value = _state.value.copy(showVoidConfirm = true, voidReason = "", voidError = null)
    }

    fun dismissVoidConfirm() {
        _state.value = _state.value.copy(showVoidConfirm = false)
    }

    fun onVoidReasonChanged(reason: String) {
        _state.value = _state.value.copy(voidReason = reason, voidError = null)
    }

    fun confirmVoid() {
        if (_state.value.isReadOnly) return
        val current = _state.value
        val checkout = (current.checkout as? ScreenState.Content)?.data ?: return
        if (current.voidReason.isBlank()) {
            _state.value = current.copy(voidError = DomainError.Validation("Enter a reason for voiding this checkout."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isVoiding = true, voidError = null)
            when (val result = repository.void(organizationId, checkout.id, current.voidReason.trim())) {
                is ApiResult.Success -> _state.value = _state.value.copy(isVoiding = false, showVoidConfirm = false, checkout = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isVoiding = false, voidError = result.error)
            }
        }
    }
}
