package com.realtegic.kora.feature.business.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ServiceSessionsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ServiceSessionDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val COMPLETED_STATUS = "COMPLETED"

data class CheckoutSessionsUiState(val sessions: ScreenState<List<ServiceSessionDto>> = ScreenState.Loading)

/** The entry point for "Checkout" (docs task Phase 7: "only from a
 * server-confirmed COMPLETED ServiceSession") -- lists every completed
 * session in the branch so an authorized cashier can find one to check
 * out without needing to have been the provider who performed it. Never
 * shows which of these already has a checkout; tapping one always goes
 * through [CheckoutViewModel]'s own create-or-recover flow, which is the
 * single source of truth for that. */
class CheckoutSessionsViewModel(
    private val organizationId: String,
    private val branchId: String?,
    private val repository: ServiceSessionsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(CheckoutSessionsUiState())
    val state: StateFlow<CheckoutSessionsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(sessions = ScreenState.Loading)
            when (val result = repository.list(organizationId, branchId = branchId, status = COMPLETED_STATUS)) {
                is ApiResult.Success -> _state.value = _state.value.copy(sessions = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(sessions = ScreenState.Error(result.error))
            }
        }
    }
}
