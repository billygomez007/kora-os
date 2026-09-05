package com.realtegic.kora.feature.customer.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.ApiResult
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val categories: ScreenState<List<BusinessCategoryDto>> = ScreenState.Loading,
    val featured: ScreenState<List<DiscoveryBusinessSummaryDto>> = ScreenState.Loading,
    val upcomingAppointment: AppointmentDto? = null,
)

class HomeViewModel(
    private val discoveryRepository: DiscoveryRepository,
    private val appointmentsRepository: AppointmentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        loadCategories()
        loadFeatured()
        loadUpcomingAppointment()
    }

    private fun loadCategories() {
        viewModelScope.launch {
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
        viewModelScope.launch {
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
        viewModelScope.launch {
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
}
