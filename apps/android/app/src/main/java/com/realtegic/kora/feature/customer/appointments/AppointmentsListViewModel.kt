package com.realtegic.kora.feature.customer.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AppointmentsListViewModel(private val appointmentsRepository: AppointmentsRepository) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<List<AppointmentDto>>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<List<AppointmentDto>>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = appointmentsRepository.list(limit = 50)) {
                is ApiResult.Success -> {
                    val sorted = result.value.sortedByDescending { it.startAt }
                    if (sorted.isEmpty()) ScreenState.Empty else ScreenState.Content(sorted)
                }
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }
}
