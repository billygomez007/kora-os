package com.realtegic.kora.feature.business.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.OrganizationAppointmentsRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.core.model.QueueEntryDto
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
    /** Set only after a successful check-in -- the screen offers to
     * open the resulting queue entry, never assumes one was created
     * without the server's own response confirming it (docs task
     * Phase 3: "after check-in, navigate to or offer to open the
     * server-returned queue entry"). */
    val checkedInQueueEntry: QueueEntryDto? = null,
)

class AppointmentDetailViewModel(
    private val organizationId: String,
    private val branchId: String,
    private val appointmentId: String,
    private val repository: OrganizationAppointmentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AppointmentDetailUiState())
    val state: StateFlow<AppointmentDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(appointment = ScreenState.Loading)
            when (val result = repository.get(organizationId, branchId, appointmentId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(appointment = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(appointment = ScreenState.Error(result.error))
            }
        }
    }

    /** A repeated tap while already mutating is a no-op -- prevents a
     * duplicate check-in/cancel tap from reaching the network twice
     * (docs task Phase 3/4: "prevent duplicate taps"). */
    fun checkIn() {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = repository.checkIn(organizationId, appointmentId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, checkedInQueueEntry = result.value)
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun requestCancelConfirmation() {
        _state.value = _state.value.copy(showCancelConfirm = true)
    }

    fun dismissCancelConfirmation() {
        _state.value = _state.value.copy(showCancelConfirm = false)
    }

    fun confirmCancel() {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null, showCancelConfirm = false)
            when (val result = repository.cancel(organizationId, branchId, appointmentId, null)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, appointment = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun reschedule(startAtIso: String) {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = repository.reschedule(organizationId, branchId, appointmentId, startAtIso, null)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, appointment = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun markNoShow() {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = repository.noShow(organizationId, branchId, appointmentId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, appointment = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    fun dismissCheckedInPrompt() {
        _state.value = _state.value.copy(checkedInQueueEntry = null)
    }
}
