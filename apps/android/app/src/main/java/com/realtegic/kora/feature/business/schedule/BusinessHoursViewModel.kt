package com.realtegic.kora.feature.business.schedule

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.SchedulingRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BusinessHoursIntervalDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DayHours(val isOpen: Boolean = false, val startLocalTime: String = "09:00", val endLocalTime: String = "17:00")

data class BusinessHoursUiState(
    val hours: ScreenState<Map<Int, DayHours>> = ScreenState.Loading,
    val isSaving: Boolean = false,
    val saveError: DomainError? = null,
    val saved: Boolean = false,
)

/** A full replace, matching the server's own semantics exactly -- this
 * is never an incremental patch (docs task "Branch Schedule and Booking
 * Policy"). Every time here is the branch's own local wall-clock time,
 * never converted through the phone's timezone. */
class BusinessHoursViewModel(
    private val organizationId: String,
    private val branchId: String,
    private val schedulingRepository: SchedulingRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(BusinessHoursUiState())
    val state: StateFlow<BusinessHoursUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(hours = ScreenState.Loading)
            when (val result = schedulingRepository.getBusinessHours(organizationId, branchId)) {
                is ApiResult.Success -> {
                    val map = (0..6).associateWith { day -> DayHours(isOpen = false) }.toMutableMap()
                    result.value.forEach { interval ->
                        map[interval.dayOfWeek] = DayHours(isOpen = true, startLocalTime = interval.startLocalTime, endLocalTime = interval.endLocalTime)
                    }
                    _state.value = _state.value.copy(hours = ScreenState.Content(map))
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(hours = ScreenState.Error(result.error))
            }
        }
    }

    fun onDayChanged(dayOfWeek: Int, hours: DayHours) {
        val current = (_state.value.hours as? ScreenState.Content)?.data ?: return
        _state.value = _state.value.copy(hours = ScreenState.Content(current + (dayOfWeek to hours)), saved = false, saveError = null)
    }

    fun save() {
        val current = (_state.value.hours as? ScreenState.Content)?.data ?: return
        val intervals = current.filterValues { it.isOpen }.map { (day, hours) ->
            BusinessHoursIntervalDto(dayOfWeek = day, startLocalTime = hours.startLocalTime, endLocalTime = hours.endLocalTime)
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, saveError = null)
            when (val result = schedulingRepository.replaceBusinessHours(organizationId, branchId, intervals)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSaving = false, saved = true)
                is ApiResult.Failure -> _state.value = _state.value.copy(isSaving = false, saveError = result.error)
            }
        }
    }
}
