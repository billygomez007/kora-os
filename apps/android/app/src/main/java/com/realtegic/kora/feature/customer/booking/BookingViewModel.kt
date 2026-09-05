package com.realtegic.kora.feature.customer.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.AvailabilitySlotDto
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val AVAILABILITY_WINDOW_DAYS = 13L

enum class BookingStep { DATE, TIME, REVIEW }

data class BookingUiState(
    val step: BookingStep = BookingStep.DATE,
    val availability: ScreenState<AvailabilityResultDto> = ScreenState.Loading,
    val selectedDate: String? = null,
    val selectedSlot: AvailabilitySlotDto? = null,
    val isSubmitting: Boolean = false,
    val submissionError: DomainError? = null,
    val bookedAppointmentId: String? = null,
)

/**
 * One idempotency key per *booking attempt*, not per HTTP call (docs
 * task Phase 7). [idempotencyKey] is generated the first time
 * [submitBooking] runs for a given (service, provider, slot) triple and
 * is reused on every subsequent call with that same triple -- a
 * client-side retry after a dropped connection replays the exact same
 * request rather than risking a duplicate appointment. It is only ever
 * cleared on a terminal outcome: a successful booking, or a
 * `SLOT_UNAVAILABLE` conflict (the slot is gone -- any further attempt
 * is necessarily a *different* booking, so it must get a fresh key).
 */
class BookingViewModel(
    private val businessSlug: String,
    private val branchId: String,
    private val serviceId: String,
    private val staffProfileId: String?,
    private val discoveryRepository: DiscoveryRepository,
    private val appointmentsRepository: AppointmentsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(BookingUiState())
    val state: StateFlow<BookingUiState> = _state.asStateFlow()

    private var idempotencyKey: String? = null
    private var idempotencyKeySnapshot: String? = null

    init {
        loadAvailability()
    }

    fun loadAvailability() {
        viewModelScope.launch {
            _state.value = _state.value.copy(availability = ScreenState.Loading)
            val from = LocalDate.now().toString()
            val to = LocalDate.now().plusDays(AVAILABILITY_WINDOW_DAYS).toString()
            val result = discoveryRepository.getAvailability(
                slug = businessSlug,
                branchId = branchId,
                serviceIds = listOf(serviceId),
                staffProfileId = staffProfileId,
                fromDate = from,
                toDate = to,
            )
            _state.value = _state.value.copy(
                availability = when (result) {
                    is ApiResult.Success -> ScreenState.Content(result.value)
                    is ApiResult.Failure -> ScreenState.Error(result.error)
                },
            )
        }
    }

    fun selectDate(date: String) {
        _state.value = _state.value.copy(selectedDate = date, step = BookingStep.TIME, selectedSlot = null)
    }

    fun selectSlot(slot: AvailabilitySlotDto) {
        _state.value = _state.value.copy(selectedSlot = slot, step = BookingStep.REVIEW)
    }

    fun backToDate() {
        _state.value = _state.value.copy(step = BookingStep.DATE)
    }

    fun backToTime() {
        _state.value = _state.value.copy(step = BookingStep.TIME, submissionError = null)
    }

    fun submitBooking() {
        if (_state.value.isSubmitting) return
        val slot = _state.value.selectedSlot ?: return

        val snapshot = "$serviceId|$staffProfileId|${slot.startAt}|${slot.staffProfileId}"
        if (idempotencyKey == null || idempotencyKeySnapshot != snapshot) {
            idempotencyKey = UUID.randomUUID().toString()
            idempotencyKeySnapshot = snapshot
        }
        val key = requireNotNull(idempotencyKey)

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, submissionError = null)
            val request = CreateAppointmentRequest(
                businessSlug = businessSlug,
                branchId = branchId,
                serviceIds = listOf(serviceId),
                staffProfileId = staffProfileId,
                startAt = slot.startAt,
                idempotencyKey = key,
            )
            when (val result = appointmentsRepository.book(request)) {
                is ApiResult.Success -> {
                    clearIdempotencyKey()
                    _state.value = _state.value.copy(isSubmitting = false, bookedAppointmentId = result.value.id)
                }
                is ApiResult.Failure -> {
                    if (result.error is DomainError.SlotUnavailable) {
                        clearIdempotencyKey()
                        _state.value = _state.value.copy(
                            isSubmitting = false,
                            submissionError = result.error,
                            step = BookingStep.TIME,
                            selectedSlot = null,
                        )
                        loadAvailability()
                    } else {
                        _state.value = _state.value.copy(isSubmitting = false, submissionError = result.error)
                    }
                }
            }
        }
    }

    private fun clearIdempotencyKey() {
        idempotencyKey = null
        idempotencyKeySnapshot = null
    }
}
