package com.realtegic.kora.feature.customer.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.network.ApiResult
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AppointmentsTab { UPCOMING, PAST }

/** "Upcoming" vs "Past" is a display grouping only, computed once here
 * from the real, authoritative [AppointmentDto.status] and
 * [AppointmentDto.startAt] -- never a fabricated "Completed" status
 * (docs task Customer Marketplace Design Batch 02: "Do not infer
 * completion merely because the time passed"). An appointment whose time
 * has passed is grouped under Past regardless of status; a still-
 * CONFIRMED appointment in the future is Upcoming. The status badge each
 * row shows remains exactly the server's own CONFIRMED/CANCELLED/
 * NO_SHOW value either way. */
class AppointmentsListViewModel(private val appointmentsRepository: AppointmentsRepository) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<List<AppointmentDto>>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<List<AppointmentDto>>> = _state.asStateFlow()

    private val _selectedTab = MutableStateFlow(AppointmentsTab.UPCOMING)
    val selectedTab: StateFlow<AppointmentsTab> = _selectedTab.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = appointmentsRepository.list(limit = 50)) {
                is ApiResult.Success -> if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }

    fun selectTab(tab: AppointmentsTab) {
        _selectedTab.value = tab
    }

    fun upcoming(all: List<AppointmentDto>): List<AppointmentDto> {
        val now = Instant.now()
        return all.filter { it.status == "CONFIRMED" && Instant.parse(it.startAt).isAfter(now) }
            .sortedBy { Instant.parse(it.startAt) }
    }

    fun past(all: List<AppointmentDto>): List<AppointmentDto> {
        val now = Instant.now()
        return all.filter { it.status != "CONFIRMED" || !Instant.parse(it.startAt).isAfter(now) }
            .sortedByDescending { Instant.parse(it.startAt) }
    }
}
