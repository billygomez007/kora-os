package com.realtegic.kora.feature.customer.booking

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.BookingStepIndicator
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.network.DomainError

object BookingFlowScreenTestTags {
    const val ANY_PROVIDER_OPTION = "booking_any_provider_option"
    const val PROVIDER_CONTINUE_BUTTON = "booking_provider_continue_button"
    const val REVIEWED_CHECKBOX = "booking_reviewed_checkbox"
    const val CONFIRM_BUTTON = "booking_confirm_button"
}

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

    val (stepNumber, title) = when (state.step) {
        BookingStep.PROVIDER -> 2 to "Choose a professional"
        BookingStep.DATE_TIME -> 3 to "Choose date & time"
        BookingStep.REVIEW -> 4 to "Review booking"
    }
    val onStepBack: () -> Unit = when (state.step) {
        BookingStep.PROVIDER -> onBack
        BookingStep.DATE_TIME -> viewModel::backToProvider
        BookingStep.REVIEW -> viewModel::backToDateTime
    }

    Scaffold(topBar = { KoraTopBar(title = title, onBack = onStepBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            BookingStepIndicator(step = stepNumber, totalSteps = 4, label = title)
            when (state.step) {
                BookingStep.PROVIDER -> ProviderStep(
                    providers = state.providers,
                    selectedProviderId = state.selectedProviderId,
                    onSelectProvider = viewModel::selectProvider,
                    onContinue = viewModel::continueFromProvider,
                )
                BookingStep.DATE_TIME -> when (val availability = state.availability) {
                    ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                    is ScreenState.Error -> ErrorStateView(error = availability.error, onRetry = viewModel::loadAvailability)
                    ScreenState.Empty -> ErrorStateView(error = DomainError.Unknown("No availability found for this service."), onRetry = viewModel::loadAvailability)
                    is ScreenState.Content -> DateTimeStep(
                        availability = availability.data,
                        selectedDate = state.selectedDate,
                        onSelectDate = viewModel::selectDate,
                        onSelectSlot = viewModel::selectSlot,
                    )
                    ScreenState.AuthenticationExpired -> Unit
                }
                BookingStep.REVIEW -> ReviewStep(state = state, onReviewedChanged = viewModel::setHasReviewedDetails, onSubmit = viewModel::submitBooking)
            }
        }
    }
}

@Composable
private fun ProviderStep(
    providers: ScreenState<List<PublicProviderSummaryDto>>,
    selectedProviderId: String?,
    onSelectProvider: (String?) -> Unit,
    onContinue: () -> Unit,
) {
    when (providers) {
        ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
        is ScreenState.Error -> ErrorStateView(error = providers.error)
        else -> {
            Column(modifier = Modifier.fillMaxSize()) {
                LazyColumn(modifier = Modifier.weight(1f).padding(horizontal = 16.dp)) {
                    item {
                        ProviderRow(
                            title = "Any available professional",
                            subtitle = "We'll match you with an available professional.",
                            icon = Icons.Default.Groups,
                            selected = selectedProviderId == null,
                            onClick = { onSelectProvider(null) },
                            modifier = Modifier.testTag(BookingFlowScreenTestTags.ANY_PROVIDER_OPTION),
                        )
                    }
                    if (providers is ScreenState.Content && providers.data.isNotEmpty()) {
                        item {
                            Text(
                                "Choose someone",
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                            )
                        }
                        items(providers.data, key = { it.staffProfileId }) { provider ->
                            ProviderRow(
                                title = provider.displayName,
                                subtitle = null,
                                icon = Icons.Default.Person,
                                selected = selectedProviderId == provider.staffProfileId,
                                onClick = { onSelectProvider(provider.staffProfileId) },
                            )
                        }
                    }
                }
                Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
                    KoraPrimaryButton(
                        text = "Continue",
                        onClick = onContinue,
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).testTag(BookingFlowScreenTestTags.PROVIDER_CONTINUE_BUTTON),
                    )
                }
            }
        }
    }
}

@Composable
private fun ProviderRow(
    title: String,
    subtitle: String?,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(44.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Icon(
                imageVector = if (selected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = if (selected) "Selected" else null,
                tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DateTimeStep(
    availability: AvailabilityResultDto,
    selectedDate: String?,
    onSelectDate: (String) -> Unit,
    onSelectSlot: (com.realtegic.kora.core.model.AvailabilitySlotDto) -> Unit,
) {
    val daysWithSlots = availability.days.filter { it.slots.isNotEmpty() }
    if (daysWithSlots.isEmpty()) {
        ErrorStateView(error = DomainError.Unknown("No upcoming availability for this service."))
        return
    }
    val day = daysWithSlots.firstOrNull { it.date == selectedDate } ?: daysWithSlots.first()

    Column(modifier = Modifier.fillMaxSize()) {
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(daysWithSlots, key = { it.date }) { candidate ->
                val isSelected = candidate.date == day.date
                Surface(
                    onClick = { onSelectDate(candidate.date) },
                    shape = RoundedCornerShape(14.dp),
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                    border = if (isSelected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Column(modifier = Modifier.width(72.dp).padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            KoraDateTimeFormatter.formatShortDay(candidate.slots.first().startAt, availability.branchTimeZone),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            KoraDateTimeFormatter.formatDayNumber(candidate.slots.first().startAt, availability.branchTimeZone),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
        HorizontalDivider()
        LazyColumn(modifier = Modifier.weight(1f).padding(16.dp)) {
            item {
                Text(
                    text = "${availability.items.firstOrNull()?.name.orEmpty()} • ${availability.items.firstOrNull()?.durationMinutes ?: 0} min",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
            }
            items(day.slots, key = { it.startAt + it.staffProfileId }) { slot ->
                Surface(
                    onClick = { onSelectSlot(slot) },
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                ) {
                    Text(
                        text = KoraDateTimeFormatter.formatTime(slot.startAt, availability.branchTimeZone),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
            item {
                Text(
                    text = "Times are shown in ${KoraDateTimeFormatter.zoneShortName(availability.branchTimeZone)}. Availability is confirmed when you book.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun ReviewStep(
    state: BookingUiState,
    onReviewedChanged: (Boolean) -> Unit,
    onSubmit: () -> Unit,
) {
    val availability = (state.availability as? ScreenState.Content)?.data ?: return
    val slot = state.selectedSlot ?: return
    val item = availability.items.firstOrNull()
    val providerLabel = if (state.selectedProviderId == null) {
        "Any available professional"
    } else {
        (state.providers as? ScreenState.Content)?.data?.firstOrNull { it.staffProfileId == state.selectedProviderId }?.displayName ?: "Selected professional"
    }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        if (state.businessName != null) {
            item {
                Column(modifier = Modifier.padding(bottom = 16.dp)) {
                    Text(state.businessName, style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                    if (state.branchLocationLine != null) {
                        Text(state.branchLocationLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        item { Text("Appointment details", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 8.dp)) }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    ReviewRow(Icons.Default.ContentCut, "Service", item?.name.orEmpty())
                    ReviewRow(Icons.Default.Person, "Professional", providerLabel)
                    ReviewRow(Icons.Default.CalendarMonth, "Date", KoraDateTimeFormatter.formatDay(slot.startAt, availability.branchTimeZone))
                    ReviewRow(Icons.Default.Schedule, "Time", KoraDateTimeFormatter.formatTime(slot.startAt, availability.branchTimeZone), showDivider = false)
                }
            }
        }
        item { Spacer(modifier = Modifier.padding(top = 20.dp)) }
        item { Text("Price summary", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 8.dp)) }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", style = MaterialTheme.typography.titleMedium)
                        Text(MoneyFormatter.format(availability.totalPriceMinor, availability.currency), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                    }
                    Text(
                        "Payment will be recorded by the business after your service.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }
        item {
            Row(modifier = Modifier.padding(top = 16.dp)) {
                Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
                Column(modifier = Modifier.padding(start = 8.dp)) {
                    Text("Cancellation policy", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Cancel or reschedule according to the business's booking policy.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (state.submissionError != null) {
            item {
                Text(
                    text = state.submissionError.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 16.dp),
                )
            }
        }
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = state.hasReviewedDetails,
                    onCheckedChange = onReviewedChanged,
                    modifier = Modifier.testTag(BookingFlowScreenTestTags.REVIEWED_CHECKBOX),
                )
                Text("I have reviewed my booking details.", style = MaterialTheme.typography.bodyMedium)
            }
        }
        item {
            KoraPrimaryButton(
                text = "Confirm booking",
                onClick = onSubmit,
                isLoading = state.isSubmitting,
                enabled = !state.isSubmitting && state.hasReviewedDetails,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag(BookingFlowScreenTestTags.CONFIRM_BUTTON),
            )
        }
    }
}

@Composable
private fun ReviewRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, showDivider: Boolean = true) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        }
    }
    if (showDivider) HorizontalDivider()
}
