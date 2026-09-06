package com.realtegic.kora.feature.customer.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.CustomerProfileRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.ApiResult
import java.time.Instant
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val categories: ScreenState<List<BusinessCategoryDto>> = ScreenState.Loading,
    val featured: ScreenState<List<DiscoveryBusinessSummaryDto>> = ScreenState.Loading,
    val upcomingAppointment: AppointmentDto? = null,
    /** `null` while still loading, or if the profile call fails --
     * [HomeScreen] falls back to a name-less greeting rather than ever
     * showing a hardcoded sample name (docs task Batch 02: "The sample
     * name 'Ama' must not be hardcoded"). */
    val customerDisplayName: String? = null,
    /** The customer's own saved city/area from profile setup -- never a
     * live reverse-geocode of GPS coordinates, since no reverse-geocoding
     * capability exists anywhere in this app. */
    val customerLocationLine: String? = null,
)

class HomeViewModel(
    private val discoveryRepository: DiscoveryRepository,
    private val appointmentsRepository: AppointmentsRepository,
    private val customerProfileRepository: CustomerProfileRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    // Each load*() call cancels its own previous job before relaunching, so
    // a second call while the first is still in flight (e.g. tapping
    // "Retry" before an earlier request has resolved) can never let a
    // stale, late-arriving response overwrite a newer one -- the same
    // "a newer request supersedes an older one" contract DiscoveryViewModel
    // gets from collectLatest, expressed here as plain Job cancellation
    // since each field has its own independent load, not a single stream.
    private var categoriesJob: Job? = null
    private var featuredJob: Job? = null
    private var upcomingAppointmentJob: Job? = null
    private var customerProfileJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadCategories()
        loadFeatured()
        loadUpcomingAppointment()
        loadCustomerProfile()
    }

    private fun loadCategories() {
        categoriesJob?.cancel()
        categoriesJob = viewModelScope.launch {
            _state.value = _state.value.copy(categories = ScreenState.Loading)
            _state.value = _state.value.copy(
                categories = when (val result = discoveryRepository.categories()) {
                    is ApiResult.Success -> if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value)
                    is ApiResult.Failure -> ScreenState.Error(result.error)
                },
            )
        }
    }

    private fun loadFeatured() {
        featuredJob?.cancel()
        featuredJob = viewModelScope.launch {
            _state.value = _state.value.copy(featured = ScreenState.Loading)
            _state.value = _state.value.copy(
                featured = when (val result = discoveryRepository.search(limit = 20)) {
                    is ApiResult.Success -> if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value)
                    is ApiResult.Failure -> ScreenState.Error(result.error)
                },
            )
        }
    }

    private fun loadUpcomingAppointment() {
        upcomingAppointmentJob?.cancel()
        upcomingAppointmentJob = viewModelScope.launch {
            when (val result = appointmentsRepository.list(limit = 20)) {
                is ApiResult.Success -> {
                    val now = Instant.now()
                    val upcoming = result.value
                        .filter { it.status == "CONFIRMED" && Instant.parse(it.startAt).isAfter(now) }
                        .minByOrNull { Instant.parse(it.startAt) }
                    _state.value = _state.value.copy(upcomingAppointment = upcoming)
                }
                is ApiResult.Failure -> Unit // The homepage still functions without this optional card.
            }
        }
    }

    private fun loadCustomerProfile() {
        customerProfileJob?.cancel()
        customerProfileJob = viewModelScope.launch {
            when (val result = customerProfileRepository.get()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    customerDisplayName = result.value.displayName.ifBlank { null },
                    customerLocationLine = listOfNotNull(result.value.area, result.value.city).joinToString(", ").ifBlank { null },
                )
                is ApiResult.Failure -> Unit // The homepage still functions with a name-less greeting.
            }
        }
    }
}
