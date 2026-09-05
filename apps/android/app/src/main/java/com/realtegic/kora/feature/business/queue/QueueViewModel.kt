package com.realtegic.kora.feature.business.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.QueueRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.QueueListDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlin.random.Random
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class QueueTab { WAITING, CALLED, IN_SERVICE, COMPLETED }

data class QueueUiState(
    val queue: ScreenState<QueueListDto> = ScreenState.Loading,
    val selectedTab: QueueTab = QueueTab.WAITING,
    val commandError: DomainError? = null,
    val pendingCommandEntryId: String? = null,
)

/**
 * Near-real-time foreground synchronization only -- there is no
 * WebSocket/push channel (docs task Phase 5). [startPolling] is meant
 * to be called from a lifecycle-aware effect (started on
 * resume/visible, stopped on pause/not-visible); it refreshes on a
 * jittered 10-20s interval and backs off exponentially (capped) after
 * consecutive failures, resetting to the normal interval on the next
 * success. The server's own [QueueListDto.revision]/`serverTime` are
 * never second-guessed locally -- every refresh simply replaces the
 * whole state with the latest fetch.
 */
class QueueViewModel(
    private val organizationId: String,
    private val branchId: String,
    private val repository: QueueRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(QueueUiState())
    val state: StateFlow<QueueUiState> = _state.asStateFlow()

    private var pollingJob: Job? = null
    private var consecutiveFailures = 0

    fun selectTab(tab: QueueTab) {
        _state.value = _state.value.copy(selectedTab = tab)
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    fun startPolling() {
        if (pollingJob?.isActive == true) return
        pollingJob = viewModelScope.launch {
            while (isActive) {
                refresh()
                val baseDelayMs = if (consecutiveFailures > 0) {
                    (10_000L * (1L shl minOf(consecutiveFailures, 4))).coerceAtMost(160_000L)
                } else {
                    Random.nextLong(10_000L, 20_000L)
                }
                delay(baseDelayMs)
            }
        }
    }

    fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private suspend fun refresh() {
        when (val result = repository.getQueue(organizationId, branchId)) {
            is ApiResult.Success -> {
                consecutiveFailures = 0
                _state.value = _state.value.copy(queue = ScreenState.Content(result.value))
            }
            is ApiResult.Failure -> {
                consecutiveFailures++
                if (_state.value.queue !is ScreenState.Content) {
                    _state.value = _state.value.copy(queue = ScreenState.Error(result.error))
                }
            }
        }
    }

    fun call(queueEntryId: String) = runCommand(queueEntryId) { repository.call(organizationId, queueEntryId) }

    fun returnToWaiting(queueEntryId: String) = runCommand(queueEntryId) { repository.returnToWaiting(organizationId, queueEntryId) }

    fun assign(queueEntryId: String, staffProfileId: String) = runCommand(queueEntryId) { repository.assign(organizationId, queueEntryId, staffProfileId) }

    fun cancelEntry(queueEntryId: String, reason: String?) = runCommand(queueEntryId) { repository.cancelEntry(organizationId, queueEntryId, reason) }

    fun noShowEntry(queueEntryId: String) = runCommand(queueEntryId) { repository.noShowEntry(organizationId, queueEntryId) }

    private fun runCommand(queueEntryId: String, block: suspend () -> ApiResult<*>) {
        if (_state.value.pendingCommandEntryId != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(pendingCommandEntryId = queueEntryId, commandError = null)
            when (val result = block()) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(pendingCommandEntryId = null)
                    refresh()
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(pendingCommandEntryId = null, commandError = result.error)
            }
        }
    }
}
