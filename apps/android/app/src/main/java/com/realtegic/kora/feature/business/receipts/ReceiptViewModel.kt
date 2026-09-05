package com.realtegic.kora.feature.business.receipts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ReceiptsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ReceiptDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ReceiptUiState(val receipt: ScreenState<ReceiptDto> = ScreenState.Loading)

/**
 * Every receipt is an immutable server snapshot -- this ViewModel never
 * recalculates a total or treats it as a tax invoice (docs task Phase
 * 11). [isCustomerView] selects the business-side or the
 * customer-scoped `/me/receipts` endpoint; a walk-in receipt with no
 * linked account is only ever reachable business-side.
 */
class ReceiptViewModel(
    private val organizationId: String?,
    private val receiptId: String,
    private val isCustomerView: Boolean,
    private val repository: ReceiptsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ReceiptUiState())
    val state: StateFlow<ReceiptUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(receipt = ScreenState.Loading)
            val result = if (isCustomerView) {
                repository.getMine(receiptId)
            } else {
                repository.get(organizationId!!, receiptId)
            }
            when (result) {
                is ApiResult.Success -> _state.value = _state.value.copy(receipt = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(receipt = ScreenState.Error(result.error))
            }
        }
    }
}
