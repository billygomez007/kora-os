package com.realtegic.kora.feature.business.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.QueueRepository
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.QueueEntryDto
import com.realtegic.kora.core.model.StaffDirectoryEntryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class QueueEntryDetailUiState(
    val entry: ScreenState<QueueEntryDto> = ScreenState.Loading,
    val staff: List<StaffDirectoryEntryDto> = emptyList(),
    val isMutating: Boolean = false,
    val actionError: DomainError? = null,
    val showAssignSheet: Boolean = false,
    val showCancelConfirm: Boolean = false,
    /** Set only once the server confirms a session actually started --
     * the screen never assumes IN_SERVICE locally (docs task Phase 5:
     * "never set queue status locally as authoritative"). */
    val startedServiceSessionId: String? = null,
)

class QueueEntryDetailViewModel(
    private val organizationId: String,
    private val queueEntryId: String,
    private val queueRepository: QueueRepository,
    private val staffRepository: StaffRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(QueueEntryDetailUiState())
    val state: StateFlow<QueueEntryDetailUiState> = _state.asStateFlow()

    init {
        load()
        loadStaff()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(entry = ScreenState.Loading)
            when (val result = queueRepository.getQueueEntry(organizationId, queueEntryId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(entry = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(entry = ScreenState.Error(result.error))
            }
        }
    }

    private fun loadStaff() {
        viewModelScope.launch {
            val result = staffRepository.listStaff(organizationId)
            if (result is ApiResult.Success) {
                _state.value = _state.value.copy(staff = result.value)
            }
        }
    }

    fun call() = runCommand { queueRepository.call(organizationId, queueEntryId) }

    fun returnToWaiting() = runCommand { queueRepository.returnToWaiting(organizationId, queueEntryId) }

    fun showAssignSheet() {
        _state.value = _state.value.copy(showAssignSheet = true)
    }

    fun dismissAssignSheet() {
        _state.value = _state.value.copy(showAssignSheet = false)
    }

    fun assign(staffProfileId: String) {
        _state.value = _state.value.copy(showAssignSheet = false)
        runCommand { queueRepository.assign(organizationId, queueEntryId, staffProfileId) }
    }

    fun requestCancelConfirmation() {
        _state.value = _state.value.copy(showCancelConfirm = true)
    }

    fun dismissCancelConfirmation() {
        _state.value = _state.value.copy(showCancelConfirm = false)
    }

    fun confirmCancel() {
        _state.value = _state.value.copy(showCancelConfirm = false)
        runCommand { queueRepository.cancelEntry(organizationId, queueEntryId, null) }
    }

    fun markNoShow() = runCommand { queueRepository.noShowEntry(organizationId, queueEntryId) }

    /** [staffProfileId] omitted uses the already-assigned provider --
     * the server rejects a start with no provider assigned at all
     * (docs task Phase 6). */
    fun startService(staffProfileId: String? = null) {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = queueRepository.startService(organizationId, queueEntryId, staffProfileId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, startedServiceSessionId = result.value.id)
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }

    private fun runCommand(block: suspend () -> ApiResult<QueueEntryDto>) {
        if (_state.value.isMutating) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isMutating = true, actionError = null)
            when (val result = block()) {
                is ApiResult.Success -> _state.value = _state.value.copy(isMutating = false, entry = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isMutating = false, actionError = result.error)
            }
        }
    }
}
