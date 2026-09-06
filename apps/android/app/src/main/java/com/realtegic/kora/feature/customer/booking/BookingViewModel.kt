package com.realtegic.kora.feature.customer.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.AppointmentsRepository
import com.realtegic.kora.core.data.DiscoveryRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.AvailabilitySlotDto
import com.realtegic.kora.core.model.CreateAppointmentRequest
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val AVAILABILITY_WINDOW_DAYS = 13L

enum class BookingStep { PROVIDER, DATE_TIME, REVIEW }

data class BookingUiState(
    val step: BookingStep = BookingStep.PROVIDER,
    val providers: ScreenState<List<PublicProviderSummaryDto>> = ScreenState.Loading,
    val selectedProviderId: String? = null,
    val availability: ScreenState<AvailabilityResultDto> = ScreenState.Loading,
    val selectedDate: String? = null,
    val selectedSlot: AvailabilitySlotDto? = null,
    val hasReviewedDetails: Boolean = false,
    val isSubmitting: Boolean = false,
    val submissionError: DomainError? = null,
    val bookedAppointmentId: String? = null,
    /** Fetched once for display only on the review step (docs task Batch
     * 02: "Show only real selected and server-derived information:
     * Business, Branch"). Never sent back to the booking API -- the
     * request only ever carries [businessSlug]/[branchId]. */
    val businessName: String? = null,
    val branchLocationLine: String? = null,
)

/**
 * The 4-step booking wizard, steps 2-4 (docs task Customer Marketplace
 * Design Batch 02 -- step 1, service selection, is
 * [com.realtegic.kora.feature.customer.discovery.BranchServicesScreen]).
 * [selectedProviderId] `null` means "any available provider," matching
 * the same convention the availability API itself uses (omitting
 * `staffProfileId` from the query).
 *
 * One idempotency key per *booking attempt*, not per HTTP call. Its
 * snapshot now includes [BookingUiState.selectedProviderId] (previously
 * a fixed constructor parameter) since provider choice can change within
 * the same flow by backing up from date/time -- any such change is a
 * materially different booking and must mint a fresh key.
 */
class BookingViewModel(
    private val businessSlug: String,
    private val branchId: String,
    private val serviceId: String,
    private val discoveryRepository: DiscoveryRepository,
    private val appointmentsRepository: AppointmentsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(BookingUiState())
    val state: StateFlow<BookingUiState> = _state.asStateFlow()

    private var idempotencyKey: String? = null
    private var idempotencyKeySnapshot: String? = null

    init {
        loadProviders()
        loadBusinessContext()
    }

    private fun loadBusinessContext() {
        viewModelScope.launch {
            val business = discoveryRepository.getBusiness(businessSlug)
            if (business is ApiResult.Success) {
                val branches = discoveryRepository.getBranches(businessSlug)
                val branch = (branches as? ApiResult.Success)?.value?.firstOrNull { it.branchId == branchId }
                _state.value = _state.value.copy(
                    businessName = business.value.displayName,
                    branchLocationLine = listOfNotNull(branch?.city, branch?.region).joinToString(", ").ifBlank { null },
                )
            }
        }
    }

    fun loadProviders() {
        viewModelScope.launch {
            _state.value = _state.value.copy(providers = ScreenState.Loading)
            when (val result = discoveryRepository.getProviders(businessSlug, branchId, serviceId)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(providers = if (result.value.isEmpty()) ScreenState.Empty else ScreenState.Content(result.value))
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(providers = ScreenState.Error(result.error))
            }
        }
    }

    fun selectProvider(staffProfileId: String?) {
        _state.value = _state.value.copy(selectedProviderId = staffProfileId)
    }

    fun continueFromProvider() {
        _state.value = _state.value.copy(step = BookingStep.DATE_TIME)
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
                staffProfileId = _state.value.selectedProviderId,
                fromDate = from,
                toDate = to,
            )
            _state.value = when (result) {
                is ApiResult.Success -> {
                    // Pre-selects the first day with any slots so times
                    // are visible immediately, rather than requiring an
                    // extra tap on a date the customer must otherwise
                    // guess has availability.
                    val firstAvailableDate = result.value.days.firstOrNull { it.slots.isNotEmpty() }?.date
                    _state.value.copy(availability = ScreenState.Content(result.value), selectedDate = firstAvailableDate, selectedSlot = null)
                }
                is ApiResult.Failure -> _state.value.copy(availability = ScreenState.Error(result.error))
            }
        }
    }

    fun selectDate(date: String) {
        _state.value = _state.value.copy(selectedDate = date, selectedSlot = null)
    }

    fun selectSlot(slot: AvailabilitySlotDto) {
        _state.value = _state.value.copy(selectedSlot = slot, step = BookingStep.REVIEW, hasReviewedDetails = false)
    }

    fun setHasReviewedDetails(reviewed: Boolean) {
        _state.value = _state.value.copy(hasReviewedDetails = reviewed)
    }

    fun backToProvider() {
        _state.value = _state.value.copy(step = BookingStep.PROVIDER, hasReviewedDetails = false)
    }

    fun backToDateTime() {
        _state.value = _state.value.copy(step = BookingStep.DATE_TIME, submissionError = null)
    }

    fun submitBooking() {
        if (_state.value.isSubmitting) return
        val slot = _state.value.selectedSlot ?: return

        val snapshot = "$serviceId|${_state.value.selectedProviderId}|${slot.startAt}|${slot.staffProfileId}"
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
                staffProfileId = _state.value.selectedProviderId,
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
                            step = BookingStep.DATE_TIME,
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
