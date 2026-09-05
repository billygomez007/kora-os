package com.realtegic.kora.feature.customer.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AppointmentDetailUiState(
    val appointment: ScreenState<AppointmentDto> = ScreenState.Loading,
    val isMutating: Boolean = false,
    val actionError: DomainError? = null,
    val showCancelConfirm: Boolean = false,
)

/** Cancellation and reschedule eligibility (the cutoff window, whether
 * the appointment is even still CONFIRMED) is decided only by the
 * server's own response -- this ViewModel never precomputes "can this
 * be cancelled" itself (docs task Phase 7: "the client must not
 * calculate whether a cancellation is allowed"). A `403`/`409` from
 * either action simply surfaces as [actionError], exactly like any
 * other recoverable failure. */
class AppointmentDetailViewModel(
    private val appointmentId: String,
    private val appointmentsRepository: AppointmentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AppointmentDetailUiState())
    val state: StateFlow<AppointmentDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(appointment = ScreenState.Loading)
            _state.value = _state.value.copy(
                appointment = when (val result = appointmentsRepository.get(appointmentId)) {
                    is ApiResult.Success -> ScreenState.Content(result.value)
                    is ApiResult.Failure -> ScreenState.Error(result.error)
                },
            )
        }
    }

    fun requestCancelConfirmation() {
        _state.value = _state.value.copy(showCancelConfirm = true)
    }

    fun dismissCancelConfirmation() {
        _state.value = _state.value.copy(showCancelConfirm = false)
    }

    fun confirmCancel() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, showCancelConfirm = false, actionError = null)
            when (val result = appointmentsRepository.cancel(appointmentId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, appointment = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun reschedule(newStartAtIso: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = appointmentsRepository.reschedule(appointmentId, newStartAtIso)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, appointment = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun clearActionError() {
        _state.value = _state.value.copy(actionError = null)
    }
}
