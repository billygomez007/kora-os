package com.realtegic.kora.feature.business.walkin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.QueueRepository
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.CreateWalkInRequest
import com.realtegic.kora.core.model.NewCustomerRequest
import com.realtegic.kora.core.model.QueueEntryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WalkInUiState(
    val branchServices: ScreenState<List<BranchServiceDto>> = ScreenState.Loading,
    val customerName: String = "",
    val customerPhone: String = "",
    val selectedServiceIds: Set<String> = emptySet(),
    val notes: String = "",
    val isSubmitting: Boolean = false,
    val submitError: DomainError? = null,
    val createdEntry: QueueEntryDto? = null,
)

/**
 * Anonymous walk-ins (no Kora account) never create a fake
 * CustomerProfile -- only a [NewCustomerRequest] the server turns into
 * an organization-scoped CustomerRecord (docs task Phase 4). One stable
 * idempotency key covers the whole intake attempt, reused across a safe
 * retry and regenerated only when the submitted request actually
 * changes -- the exact same lifecycle discipline as booking/checkout.
 */
class WalkInViewModel(
    private val organizationId: String,
    private val branchId: String,
    private val queueRepository: QueueRepository,
    private val serviceCatalogueRepository: ServiceCatalogueRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(WalkInUiState())
    val state: StateFlow<WalkInUiState> = _state.asStateFlow()

    private var idempotencyKey: String? = null
    private var lastSnapshot: String? = null

    init {
        loadServices()
    }

    private fun loadServices() {
        viewModelScope.launch {
            when (val result = serviceCatalogueRepository.listBranchServices(organizationId, branchId)) {
                is ApiResult.Success -> {
                    val enabled = result.value.filter { it.isEnabled }
                    _state.value = _state.value.copy(branchServices = if (enabled.isEmpty()) ScreenState.Empty else ScreenState.Content(enabled))
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(branchServices = ScreenState.Error(result.error))
            }
        }
    }

    fun onNameChanged(name: String) {
        _state.value = _state.value.copy(customerName = name, submitError = null)
    }

    fun onPhoneChanged(phone: String) {
        _state.value = _state.value.copy(customerPhone = phone, submitError = null)
    }

    fun onNotesChanged(notes: String) {
        _state.value = _state.value.copy(notes = notes)
    }

    fun toggleService(serviceId: String) {
        val current = _state.value.selectedServiceIds
        _state.value = _state.value.copy(
            selectedServiceIds = if (serviceId in current) current - serviceId else current + serviceId,
            submitError = null,
        )
    }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return
        if (current.customerName.isBlank()) {
            _state.value = current.copy(submitError = DomainError.Validation("Enter the customer's name."))
            return
        }
        if (current.selectedServiceIds.isEmpty()) {
            _state.value = current.copy(submitError = DomainError.Validation("Select at least one service."))
            return
        }
        val request = CreateWalkInRequest(
            newCustomer = NewCustomerRequest(
                name = current.customerName.trim(),
                phoneE164 = current.customerPhone.trim().takeIf { it.isNotBlank() },
            ),
            serviceIds = current.selectedServiceIds.toList(),
            notes = current.notes.trim().takeIf { it.isNotBlank() },
        )
        val snapshot = request.toString()
        if (idempotencyKey == null || lastSnapshot != snapshot) {
            idempotencyKey = UUID.randomUUID().toString()
            lastSnapshot = snapshot
        }
        val key = idempotencyKey!!

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, submitError = null)
            when (val result = queueRepository.createWalkIn(organizationId, branchId, key, request)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSubmitting = false, createdEntry = result.value)
                is ApiResult.Failure -> _state.value = _state.value.copy(isSubmitting = false, submitError = result.error)
            }
        }
    }
}
