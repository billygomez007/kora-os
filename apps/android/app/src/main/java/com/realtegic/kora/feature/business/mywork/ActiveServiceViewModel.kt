package com.realtegic.kora.feature.business.mywork

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.data.ServiceSessionsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.model.ServiceSessionDto
import com.realtegic.kora.core.model.ServiceSessionCancelDisposition
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ActiveServiceUiState(
    val session: ScreenState<ServiceSessionDto> = ScreenState.Loading,
    val availableServices: List<ServiceDto> = emptyList(),
    val isMutating: Boolean = false,
    val actionError: DomainError? = null,
    val showEditItems: Boolean = false,
    val editSelectedServiceIds: Set<String> = emptySet(),
    val showCancelDialog: Boolean = false,
    val cancelReason: String = "",
    val cancelDisposition: String = ServiceSessionCancelDisposition.RETURN_TO_QUEUE,
    val showCompleteConfirm: Boolean = false,
    val completed: Boolean = false,
)

/**
 * The active-service screen (docs task Phase 6). Elapsed time is
 * derived purely from `startedAt` for display -- it never drives any
 * server state or is sent back to the server as if it were
 * authoritative.
 */
class ActiveServiceViewModel(
    private val organizationId: String,
    private val serviceSessionId: String,
    private val serviceSessionsRepository: ServiceSessionsRepository,
    private val serviceCatalogueRepository: ServiceCatalogueRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ActiveServiceUiState())
    val state: StateFlow<ActiveServiceUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(session = ScreenState.Loading)
            when (val result = serviceSessionsRepository.get(organizationId, serviceSessionId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(session = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(session = ScreenState.Error(result.error))
            }
        }
    }

    fun startEditingItems() {
        val current = (_state.value.session as? ScreenState.Content)?.data ?: return
        viewModelScope.launch {
            val servicesResult = serviceCatalogueRepository.listServices(organizationId)
            val available = (servicesResult as? ApiResult.Success)?.value ?: emptyList()
            _state.value = _state.value.copy(
                availableServices = available,
                editSelectedServiceIds = current.items.map { it.serviceId }.toSet(),
                showEditItems = true,
            )
        }
    }

    fun dismissEditingItems() {
        _state.value = _state.value.copy(showEditItems = false)
    }

    fun toggleEditService(serviceId: String) {
        val current = _state.value.editSelectedServiceIds
        _state.value = _state.value.copy(editSelectedServiceIds = if (serviceId in current) current - serviceId else current + serviceId)
    }

    fun saveItems() {
        if (_state.value.isMutating) return
        val serviceIds = _state.value.editSelectedServiceIds.toList()
        if (serviceIds.isEmpty()) {
            _state.value = _state.value.copy(actionError = DomainError.Validation("Select at least one service."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = serviceSessionsRepository.replaceItems(organizationId, serviceSessionId, serviceIds)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, showEditItems = false, session = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun requestComplete() {
        _state.value = _state.value.copy(showCompleteConfirm = true)
    }

    fun dismissCompleteConfirm() {
        _state.value = _state.value.copy(showCompleteConfirm = false)
    }

    fun confirmComplete() {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null, showCompleteConfirm = false)
            when (val result = serviceSessionsRepository.complete(organizationId, serviceSessionId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, session = ScreenState.Content(result.value), completed = true)
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun showCancelDialog() {
        _state.value = _state.value.copy(showCancelDialog = true, cancelReason = "")
    }

    fun dismissCancelDialog() {
        _state.value = _state.value.copy(showCancelDialog = false)
    }

    fun onCancelReasonChanged(reason: String) {
        _state.value = _state.value.copy(cancelReason = reason)
    }

    fun onCancelDispositionChanged(disposition: String) {
        _state.value = _state.value.copy(cancelDisposition = disposition)
    }

    fun confirmCancelSession() {
        if (_state.value.isMutating) return
        val reason = _state.value.cancelReason
        if (reason.isBlank()) {
            _state.value = _state.value.copy(actionError = DomainError.Validation("Enter a reason for cancelling."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null, showCancelDialog = false)
            when (val result = serviceSessionsRepository.cancel(organizationId, serviceSessionId, reason, _state.value.cancelDisposition)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, session = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }
}
