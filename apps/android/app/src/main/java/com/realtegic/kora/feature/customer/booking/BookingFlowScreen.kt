package com.realtegic.kora.feature.customer.booking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AvailabilityDayDto
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.AvailabilitySlotDto

@Composable
fun BookingFlowScreen(
    viewModel: BookingViewModel,
    onBack: () -> Unit,
    onBooked: (appointmentId: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.bookedAppointmentId) {
        state.bookedAppointmentId?.let(onBooked)
    }

    val title = when (state.step) {
        BookingStep.DATE -> "Choose a date"
        BookingStep.TIME -> "Choose a time"
        BookingStep.REVIEW -> "Review booking"
    }
    val onStepBack: () -> Unit = when (state.step) {
        BookingStep.DATE -> onBack
        BookingStep.TIME -> viewModel::backToDate
        BookingStep.REVIEW -> viewModel::backToTime
    }

    Scaffold(topBar = { KoraTopBar(title = title, onBack = onStepBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val availability = state.availability) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = availability.error, onRetry = viewModel::loadAvailability)
                ScreenState.Empty -> ErrorStateView(
                    error = com.realtegic.kora.core.network.DomainError.Unknown("No availability found for this service."),
                    onRetry = viewModel::loadAvailability,
                )
                is ScreenState.Content -> when (state.step) {
                    BookingStep.DATE -> DateStep(availability.data, onSelectDate = viewModel::selectDate)
                    BookingStep.TIME -> TimeStep(
                        availability = availability.data,
                        selectedDate = state.selectedDate,
                        onSelectSlot = viewModel::selectSlot,
                    )
                    BookingStep.REVIEW -> ReviewStep(
                        availability = availability.data,
                        state = state,
                        onSubmit = viewModel::submitBooking,
                    )
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun DateStep(availability: AvailabilityResultDto, onSelectDate: (String) -> Unit) {
    val daysWithSlots = availability.days.filter { it.slots.isNotEmpty() }
    if (daysWithSlots.isEmpty()) {
        ErrorStateView(error = com.realtegic.kora.core.network.DomainError.Unknown("No upcoming availability for this service."))
        return
    }
    LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
        items(daysWithSlots, key = { it.date }) { day ->
            DateRow(day, availability.branchTimeZone, onClick = { onSelectDate(day.date) })
        }
    }
}

@Composable
private fun DateRow(day: AvailabilityDayDto, timeZone: String, onClick: () -> Unit) {
    val sampleIso = day.slots.first().startAt
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(KoraDateTimeFormatter.formatDay(sampleIso, timeZone), style = MaterialTheme.typography.titleSmall)
            Text(
                "${day.slots.size} slot${if (day.slots.size == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TimeStep(
    availability: AvailabilityResultDto,
    selectedDate: String?,
    onSelectSlot: (AvailabilitySlotDto) -> Unit,
) {
    val day = availability.days.firstOrNull { it.date == selectedDate }
    if (day == null || day.slots.isEmpty()) {
        ErrorStateView(error = com.realtegic.kora.core.network.DomainError.Unknown("No times available for that date."))
        return
    }
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        item {
            Text(
                text = "${availability.items.firstOrNull()?.name.orEmpty()} • ${availability.items.firstOrNull()?.durationMinutes ?: 0} min • timezone ${KoraDateTimeFormatter.zoneShortName(availability.branchTimeZone)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp),
            )
        }
        items(day.slots, key = { it.startAt + it.staffProfileId }) { slot ->
            Surface(
                onClick = { onSelectSlot(slot) },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            ) {
                Text(
                    text = KoraDateTimeFormatter.formatTime(slot.startAt, availability.branchTimeZone),
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
    }
}

@Composable
private fun ReviewStep(
    availability: AvailabilityResultDto,
    state: BookingUiState,
    onSubmit: () -> Unit,
) {
    val slot = state.selectedSlot ?: return
    val item = availability.items.firstOrNull()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(item?.name.orEmpty(), style = MaterialTheme.typography.titleMedium)
        Text(
            KoraDateTimeFormatter.formatDayTimeWithZone(slot.startAt, availability.branchTimeZone),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            "${item?.durationMinutes ?: 0} min",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Total", style = MaterialTheme.typography.titleMedium)
            Text(
                MoneyFormatter.format(availability.totalPriceMinor, availability.currency),
                style = MaterialTheme.typography.titleMedium,
            )
        }
        if (state.submissionError != null) {
            Text(
                text = state.submissionError.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp),
            )
        }
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f))
        KoraPrimaryButton(
            text = "Confirm booking",
            onClick = onSubmit,
            isLoading = state.isSubmitting,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
