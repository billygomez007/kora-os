package com.realtegic.kora.feature.customer.appointments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.ui.theme.StatusAmber
import com.realtegic.kora.ui.theme.StatusAmberBg
import com.realtegic.kora.ui.theme.StatusGreen
import com.realtegic.kora.ui.theme.StatusGreenBg
import com.realtegic.kora.ui.theme.StatusRed
import com.realtegic.kora.ui.theme.StatusRedBg

object AppointmentsListScreenTestTags {
    const val UPCOMING_TAB = "appointments_upcoming_tab"
    const val PAST_TAB = "appointments_past_tab"
}

/**
 * Matches `kora-customer-appointments-reference.png` (docs task Customer
 * Marketplace Design Batch 02): Upcoming/Past is a client-side display
 * grouping over the real list, never a separate fetch or a fabricated
 * status.
 */
@Composable
fun AppointmentsListScreen(
    viewModel: AppointmentsListViewModel,
    onAppointmentTapped: (String) -> Unit,
    onBookNew: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val selectedTab by viewModel.selectedTab.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "My appointments") }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val screenState = state) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = screenState.error, onRetry = viewModel::load)
                ScreenState.Empty -> EmptyStateView(
                    title = "No appointments yet",
                    subtitle = "Book a service to see it here.",
                )
                is ScreenState.Content -> {
                    val upcoming = viewModel.upcoming(screenState.data)
                    val past = viewModel.past(screenState.data)
                    TabRow(
                        selectedTab = selectedTab,
                        upcomingCount = upcoming.size,
                        pastCount = past.size,
                        onTabSelected = viewModel::selectTab,
                    )
                    val visible = if (selectedTab == AppointmentsTab.UPCOMING) upcoming else past
                    if (visible.isEmpty()) {
                        EmptyStateView(
                            title = if (selectedTab == AppointmentsTab.UPCOMING) "No upcoming appointments" else "No past appointments",
                            subtitle = if (selectedTab == AppointmentsTab.UPCOMING) "Book a service to see it here." else null,
                        )
                    } else {
                        LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
                            items(visible, key = { it.id }) { appointment ->
                                AppointmentRow(appointment, onClick = { onAppointmentTapped(appointment.id) })
                            }
                        }
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun TabRow(
    selectedTab: AppointmentsTab,
    upcomingCount: Int,
    pastCount: Int,
    onTabSelected: (AppointmentsTab) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        TabChip(
            text = "Upcoming ($upcomingCount)",
            selected = selectedTab == AppointmentsTab.UPCOMING,
            onClick = { onTabSelected(AppointmentsTab.UPCOMING) },
            modifier = Modifier.weight(1f).testTag(AppointmentsListScreenTestTags.UPCOMING_TAB),
        )
        TabChip(
            text = "Past ($pastCount)",
            selected = selectedTab == AppointmentsTab.PAST,
            onClick = { onTabSelected(AppointmentsTab.PAST) },
            modifier = Modifier.weight(1f).testTag(AppointmentsListScreenTestTags.PAST_TAB),
        )
    }
}

@Composable
private fun TabChip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(24.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        modifier = modifier,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        )
    }
}

@Composable
private fun AppointmentRow(appointment: AppointmentDto, onClick: () -> Unit) {
    val (badgeBg, badgeFg) = when (appointment.status) {
        "CONFIRMED" -> StatusGreenBg to StatusGreen
        "CANCELLED" -> StatusRedBg to StatusRed
        else -> StatusAmberBg to StatusAmber
    }
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(appointment.businessName, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Surface(shape = RoundedCornerShape(12.dp), color = badgeBg) {
                    Text(appointment.status, style = MaterialTheme.typography.labelSmall, color = badgeFg, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                }
            }
            Text(
                appointment.items.firstOrNull()?.serviceName ?: "Appointment",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                KoraDateTimeFormatter.formatDayTimeWithZone(appointment.startAt, appointment.branchTimeZone),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
