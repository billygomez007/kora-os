package com.realtegic.kora.feature.business.appointments

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto

@Composable
fun OrganizationAppointmentsScreen(
    viewModel: OrganizationAppointmentsViewModel,
    onBack: () -> Unit,
    onAppointmentTapped: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Appointments", onBack = onBack) }) { padding ->
        when (val appointments = state.appointments) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = appointments.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty -> EmptyStateView(title = "No appointments in the next two weeks", modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(appointments.data, key = AppointmentDto::id) { appointment ->
                    AppointmentRow(appointment, onClick = { onAppointmentTapped(appointment.id) })
                }
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun AppointmentRow(appointment: AppointmentDto, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                appointment.items.joinToString(", ") { it.serviceName }.ifBlank { "Appointment" },
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                KoraDateTimeFormatter.formatDayTimeWithZone(appointment.startAt, appointment.branchTimeZone),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                "Status: ${appointment.status}",
                style = MaterialTheme.typography.bodySmall,
                color = when (appointment.status) {
                    "CANCELLED", "NO_SHOW" -> MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
