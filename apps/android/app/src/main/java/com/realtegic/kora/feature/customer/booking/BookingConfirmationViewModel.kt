package com.realtegic.kora.feature.customer.booking

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

/**
 * Shown only after the server has already confirmed the appointment
 * (docs task Customer Marketplace Design Batch 02: "Show this screen
 * only after the server confirms appointment creation... Use only
 * response data"). This re-fetches the real appointment by id rather
 * than trusting whatever [BookingViewModel] held in memory, so the
 * confirmation always reflects the authoritative server record -- the
 * same real reference, business name, provider name, and status a later
 * visit to the appointment's own detail screen would show.
 */
class BookingConfirmationViewModel(
    private val appointmentId: String,
    private val appointmentsRepository: AppointmentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<AppointmentDto>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<AppointmentDto>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = appointmentsRepository.get(appointmentId)) {
                is ApiResult.Success -> ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }
}
