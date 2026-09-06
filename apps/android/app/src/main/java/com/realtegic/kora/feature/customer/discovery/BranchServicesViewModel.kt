package com.realtegic.kora.feature.customer.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** This stage supports booking a single service per appointment --
 * the API itself allows a sequential multi-service chain
 * (`serviceIds` is an ordered list), but a single-service flow keeps
 * the date/availability step's UI tractable for this stage; a future
 * stage can extend the selection to multiple services without changing
 * this screen's shape. Provider selection moved to [BookingViewModel] as
 * its own wizard step (docs task Customer Marketplace Design Batch 02:
 * "Choose services" and "Choose a professional" are separate steps),
 * since eligible providers depend on the service *and* need to be
 * re-resolvable if the customer backs up and changes their date/time
 * choice later in the same flow. */
data class BranchServicesUiState(
    val services: ScreenState<List<PublicServiceSummaryDto>> = ScreenState.Loading,
    val selectedServiceId: String? = null,
)

class BranchServicesViewModel(
    private val slug: String,
    private val branchId: String,
    private val discoveryRepository: DiscoveryRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(BranchServicesUiState())
    val state: StateFlow<BranchServicesUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(services = ScreenState.Loading)
            // The server already returns only services that are enabled,
            // not archived, and customer-bookable at this branch -- no
            // client-side re-filtering needed.
            when (val result = discoveryRepository.getServices(slug, branchId)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(services = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(services = ScreenState.Error(result.error))
            }
        }
    }

    fun selectService(serviceId: String) {
        _state.value = _state.value.copy(selectedServiceId = serviceId)
    }
}
