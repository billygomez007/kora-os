package com.realtegic.kora.feature.business.services

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.designsystem.MoneyParser
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CreateServiceRequest
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ServicesUiState(
    val services: ScreenState<List<ServiceDto>> = ScreenState.Loading,
    val defaultCurrency: String = "GHS",
    val newName: String = "",
    val newDurationMinutes: String = "30",
    val newPriceMajor: String = "",
    val isCreating: Boolean = false,
    val createError: DomainError? = null,
    val pendingArchiveServiceId: String? = null,
)

/**
 * Archive is the only removal offered here, matching the backend's
 * soft-delete model exactly (docs task "Service Catalogue Mobile
 * Management") -- a service referenced by a past appointment must never
 * be hard-deleted, and this app never attempts to.
 */
class ServicesViewModel(
    private val organizationId: String,
    private val defaultCurrency: String,
    private val serviceCatalogueRepository: ServiceCatalogueRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ServicesUiState(defaultCurrency = defaultCurrency))
    val state: StateFlow<ServicesUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(services = ScreenState.Loading)
            when (val result = serviceCatalogueRepository.listServices(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    services = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value),
                )
                is ApiResult.Failure -> _state.value = _state.value.copy(services = ScreenState.Error(result.error))
            }
        }
    }

    fun onNewServiceChanged(name: String = _state.value.newName, durationMinutes: String = _state.value.newDurationMinutes, priceMajor: String = _state.value.newPriceMajor) {
        _state.value = _state.value.copy(newName = name, newDurationMinutes = durationMinutes, newPriceMajor = priceMajor, createError = null)
    }

    fun createService() {
        val current = _state.value
        val durationMinutes = current.newDurationMinutes.toIntOrNull()
        val priceMinor = MoneyParser.parseMinorUnits(current.newPriceMajor, current.defaultCurrency)
        if (current.newName.isBlank() || durationMinutes == null || durationMinutes <= 0 || priceMinor == null) {
            _state.value = current.copy(createError = DomainError.Validation("Enter a name, a duration in minutes, and a price."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isCreating = true, createError = null)
            val request = CreateServiceRequest(name = current.newName.trim(), durationMinutes = durationMinutes, priceMinor = priceMinor, currency = current.defaultCurrency)
            when (val result = serviceCatalogueRepository.createService(organizationId, request)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isCreating = false, newName = "", newDurationMinutes = "30", newPriceMajor = "")
                    load()
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isCreating = false, createError = result.error)
            }
        }
    }

    fun requestArchiveConfirmation(serviceId: String) {
        _state.value = _state.value.copy(pendingArchiveServiceId = serviceId)
    }

    fun dismissArchiveConfirmation() {
        _state.value = _state.value.copy(pendingArchiveServiceId = null)
    }

    fun confirmArchive() {
        val serviceId = _state.value.pendingArchiveServiceId ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(pendingArchiveServiceId = null)
            serviceCatalogueRepository.archiveService(organizationId, serviceId)
            load()
        }
    }
}
