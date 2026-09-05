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

data class ReceiptsListUiState(val receipts: ScreenState<List<ReceiptDto>> = ScreenState.Loading)

/** Business-side list only -- a customer's own receipts are a separate,
 * customer-scoped endpoint (docs task Phase 11: "customer Receipts only
 * via existing customer-scoped endpoints"), never merged with this
 * organization-wide view. */
class ReceiptsListViewModel(
    private val organizationId: String,
    private val repository: ReceiptsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ReceiptsListUiState())
    val state: StateFlow<ReceiptsListUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(receipts = ScreenState.Loading)
            when (val result = repository.list(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(receipts = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(receipts = ScreenState.Error(result.error))
            }
        }
    }
}
