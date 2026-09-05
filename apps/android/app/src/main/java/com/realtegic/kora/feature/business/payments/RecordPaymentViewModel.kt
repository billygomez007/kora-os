package com.realtegic.kora.feature.business.payments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.CashPolicyRepository
import com.realtegic.kora.core.data.CheckoutsRepository
import com.realtegic.kora.core.data.PaymentsRepository
import com.realtegic.kora.core.designsystem.MoneyParser
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CashPolicyMode
import com.realtegic.kora.core.model.CheckoutDto
import com.realtegic.kora.core.model.PaymentMethod
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.model.RecordPaymentRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RecordPaymentUiState(
    val checkout: ScreenState<CheckoutDto> = ScreenState.Loading,
    val existingPayments: List<PaymentRecordDto> = emptyList(),
    val cashPolicyMode: String = CashPolicyMode.OPTIONAL,
    val method: String = PaymentMethod.CASH,
    val amountMajor: String = "",
    val tenderedMajor: String = "",
    val externalReference: String = "",
    val note: String = "",
    val isSubmitting: Boolean = false,
    val submitError: DomainError? = null,
    val recorded: PaymentRecordDto? = null,
)

/**
 * "Record payment," never "process payment" -- no gateway exists, and
 * nothing here ever claims a bank, card processor, or mobile-money
 * provider confirmed settlement (docs task locked rules). Recording
 * requires a stable idempotency key, generated once per attempt and
 * reused across a safe retry, regenerated only when the submitted
 * request itself changes.
 */
class RecordPaymentViewModel(
    private val organizationId: String,
    private val branchId: String,
    private val checkoutId: String,
    private val checkoutsRepository: CheckoutsRepository,
    private val paymentsRepository: PaymentsRepository,
    private val cashPolicyRepository: CashPolicyRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(RecordPaymentUiState())
    val state: StateFlow<RecordPaymentUiState> = _state.asStateFlow()

    private var idempotencyKey: String? = null
    private var lastSnapshot: String? = null

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(checkout = ScreenState.Loading)
            val checkoutResult = checkoutsRepository.get(organizationId, checkoutId)
            val payments = when (val result = paymentsRepository.list(organizationId, checkoutId)) {
                is ApiResult.Success -> result.value
                is ApiResult.Failure -> emptyList()
            }
            val policyResult = cashPolicyRepository.get(organizationId, branchId)
            val policyMode = (policyResult as? ApiResult.Success)?.value?.mode ?: CashPolicyMode.OPTIONAL
            when (checkoutResult) {
                is ApiResult.Success -> {
                    val activePayments = payments.filter { it.status != "VOIDED" }
                    val remaining = checkoutResult.value.totalMinor - activePayments.sumOf { it.appliedAmountMinor }
                    _state.value = _state.value.copy(
                        checkout = ScreenState.Content(checkoutResult.value),
                        existingPayments = payments,
                        cashPolicyMode = policyMode,
                        amountMajor = if (_state.value.amountMajor.isBlank()) formatMinorAsMajor(remaining, checkoutResult.value.currency) else _state.value.amountMajor,
                    )
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(checkout = ScreenState.Error(checkoutResult.error))
            }
        }
    }

    fun onMethodChanged(method: String) {
        _state.value = _state.value.copy(method = method, submitError = null)
    }

    fun onAmountChanged(amount: String) {
        _state.value = _state.value.copy(amountMajor = amount, submitError = null)
    }

    fun onTenderedChanged(tendered: String) {
        _state.value = _state.value.copy(tenderedMajor = tendered, submitError = null)
    }

    fun onExternalReferenceChanged(reference: String) {
        _state.value = _state.value.copy(externalReference = reference, submitError = null)
    }

    fun onNoteChanged(note: String) {
        _state.value = _state.value.copy(note = note)
    }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return
        val checkout = (current.checkout as? ScreenState.Content)?.data ?: return
        if (current.method == PaymentMethod.CASH && current.cashPolicyMode == CashPolicyMode.REQUIRED) {
            _state.value = current.copy(submitError = DomainError.Validation("An open cash session is required to record cash payments at this branch. Choose a different payment method, or open a cash session first."))
            return
        }
        val amountMinor = MoneyParser.parseMinorUnits(current.amountMajor, checkout.currency)
        if (amountMinor == null || amountMinor <= 0) {
            _state.value = current.copy(submitError = DomainError.Validation("Enter a valid amount."))
            return
        }
        val tenderedMinor = if (current.method == PaymentMethod.CASH && current.tenderedMajor.isNotBlank()) {
            MoneyParser.parseMinorUnits(current.tenderedMajor, checkout.currency)
        } else null
        if (current.method == PaymentMethod.CASH && current.tenderedMajor.isNotBlank() && tenderedMinor == null) {
            _state.value = current.copy(submitError = DomainError.Validation("Enter a valid tendered amount."))
            return
        }
        val request = RecordPaymentRequest(
            method = current.method,
            appliedAmountMinor = amountMinor,
            currency = checkout.currency,
            tenderedAmountMinor = tenderedMinor,
            externalReference = current.externalReference.trim().takeIf { it.isNotBlank() },
            note = current.note.trim().takeIf { it.isNotBlank() },
        )
        val snapshot = request.toString()
        if (idempotencyKey == null || lastSnapshot != snapshot) {
            idempotencyKey = UUID.randomUUID().toString()
            lastSnapshot = snapshot
        }
        val key = idempotencyKey!!

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, submitError = null)
            when (val result = paymentsRepository.record(organizationId, checkoutId, key, request)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSubmitting = false, recorded = result.value)
                is ApiResult.Failure -> _state.value = _state.value.copy(isSubmitting = false, submitError = result.error)
            }
        }
    }
}

private fun formatMinorAsMajor(minor: Long, currencyCode: String): String {
    val fractionDigits = runCatching { java.util.Currency.getInstance(currencyCode).defaultFractionDigits }
        .getOrNull()
        ?.takeIf { it >= 0 }
        ?: 2
    return java.math.BigDecimal(minor).movePointLeft(fractionDigits).toPlainString()
}
