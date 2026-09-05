package com.realtegic.kora.feature.business.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.TransactionsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.TransactionDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TransactionsUiState(
    val transactions: ScreenState<List<TransactionDto>> = ScreenState.Loading,
)

/** Read-only -- a POSTED Transaction is immutable and cannot be created,
 * edited, or deleted through any client action (docs task locked
 * rules). */
class TransactionsListViewModel(
    private val organizationId: String,
    private val repository: TransactionsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TransactionsUiState())
    val state: StateFlow<TransactionsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(transactions = ScreenState.Loading)
            when (val result = repository.list(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(transactions = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(transactions = ScreenState.Error(result.error))
            }
        }
    }
}

data class TransactionDetailUiState(
    val transaction: ScreenState<TransactionDto> = ScreenState.Loading,
    val receiptId: String? = null,
)

class TransactionDetailViewModel(
    private val organizationId: String,
    private val transactionId: String,
    private val repository: TransactionsRepository,
    private val receiptsRepository: com.realtegic.kora.core.data.ReceiptsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TransactionDetailUiState())
    val state: StateFlow<TransactionDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(transaction = ScreenState.Loading)
            when (val result = repository.get(organizationId, transactionId)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(transaction = ScreenState.Content(result.value))
                    val receipt = receiptsRepository.findForTransaction(organizationId, transactionId)
                    if (receipt is ApiResult.Success) {
                        _state.value = _state.value.copy(receiptId = receipt.value?.id)
                    }
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(transaction = ScreenState.Error(result.error))
            }
        }
    }
}
