package com.realtegic.kora.feature.business.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.OrganizationAppointmentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.network.ApiResult
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OrganizationAppointmentsUiState(
    val appointments: ScreenState<List<AppointmentDto>> = ScreenState.Loading,
)

/**
 * Today plus the next 14 days, fetched in one server call and split
 * client-side into "Today"/"Upcoming" purely for display grouping --
 * this is not an authoritative business decision, only a UI grouping of
 * already-fetched, server-decided data (docs task Phase 3).
 */
class OrganizationAppointmentsViewModel(
    private val organizationId: String,
    private val branchId: String,
    private val repository: OrganizationAppointmentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(OrganizationAppointmentsUiState())
    val state: StateFlow<OrganizationAppointmentsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(appointments = ScreenState.Loading)
            val from = Instant.now().truncatedTo(ChronoUnit.DAYS).toString()
            val to = Instant.now().plus(14, ChronoUnit.DAYS).toString()
            when (val result = repository.list(organizationId, branchId, from, to)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    appointments = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value),
                )
                is ApiResult.Failure -> _state.value = _state.value.copy(appointments = ScreenState.Error(result.error))
            }
        }
    }
}
