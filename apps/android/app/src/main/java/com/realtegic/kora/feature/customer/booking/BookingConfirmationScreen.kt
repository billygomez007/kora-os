package com.realtegic.kora.feature.customer.booking

import android.content.Intent
import android.provider.CalendarContract
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextButton
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import com.realtegic.kora.ui.theme.StatusGreen
import java.time.Instant

/**
 * Shown only once the server has confirmed the appointment (docs task
 * Batch 02) -- every value here comes from the real, freshly-fetched
 * [AppointmentDto], never from what the booking wizard held locally. No
 * fabricated booking reference: [AppointmentDto.reference] is the real
 * server-issued value. No "we'll notify you" claim -- no push
 * notification system exists in this app.
 */
@Composable
fun BookingConfirmationScreen(
    viewModel: BookingConfirmationViewModel,
    onViewAppointment: (appointmentId: String) -> Unit,
    onDone: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    Scaffold { padding ->
        when (val appointment = state) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = appointment.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> {
                val details = appointment.data
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(modifier = Modifier.height(24.dp))
                    Box(
                        modifier = Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusGreen, modifier = Modifier.size(56.dp))
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Booking confirmed", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        text = "Your appointment is saved and ready.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
                    )

                    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(details.businessName, style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                            Text(
                                details.items.firstOrNull()?.serviceName ?: "Appointment",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            InfoRow(Icons.Default.CalendarMonth, KoraDateTimeFormatter.formatDay(details.startAt, details.branchTimeZone))
                            InfoRow(Icons.Default.Schedule, KoraDateTimeFormatter.formatTime(details.startAt, details.branchTimeZone))
                            if (details.providerDisplayName != null) {
                                InfoRow(Icons.Default.Person, "Professional: ${details.providerDisplayName}")
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Booking reference: ${details.reference}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    KoraPrimaryButton(text = "View appointment", onClick = { onViewAppointment(details.id) }, modifier = Modifier.fillMaxWidth())
                    androidx.compose.material3.OutlinedButton(onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text("Back to home")
                    }
                    KoraTextButton(text = "Add to calendar", onClick = { addToCalendar(context, details) })
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun InfoRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
    }
}

/** Launches Android's own calendar-insert UI -- this only ever hands the
 * intent to whatever calendar app the user has; it never claims the
 * event was actually saved, since only the external app (and the user,
 * inside it) can confirm that (docs task Batch 02: "'Add to calendar'
 * may use Android's calendar insert intent without claiming that it
 * succeeded before the external calendar confirms"). */
private fun addToCalendar(context: android.content.Context, appointment: AppointmentDto) {
    val startMillis = Instant.parse(appointment.startAt).toEpochMilli()
    val endMillis = Instant.parse(appointment.endAt).toEpochMilli()
    val intent = Intent(Intent.ACTION_INSERT)
        .setData(CalendarContract.Events.CONTENT_URI)
        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
        .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis)
        .putExtra(CalendarContract.Events.TITLE, appointment.items.firstOrNull()?.serviceName ?: appointment.businessName)
        .putExtra(CalendarContract.Events.DESCRIPTION, "Appointment at ${appointment.businessName}")
    runCatching { context.startActivity(intent) }
}
