package com.realtegic.kora.feature.customer.appointments

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import java.time.ZoneId
import java.time.ZonedDateTime

@Composable
fun AppointmentDetailScreen(viewModel: AppointmentDetailViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    Scaffold(topBar = { KoraTopBar(title = "Appointment", onBack = onBack) }) { padding ->
        when (val appointment = state.appointment) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = appointment.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> {
                val details = appointment.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Text(details.items.firstOrNull()?.serviceName ?: "Appointment", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Status: ${details.status}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        KoraDateTimeFormatter.formatDayTimeWithZone(details.startAt, details.branchTimeZone),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    Text(
                        "Reference: ${details.reference}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    Text(
                        MoneyFormatter.format(details.totalPriceMinor, details.currency),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    if (state.actionError != null) {
                        Text(
                            text = state.actionError?.message.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f))
                    if (details.status == "CONFIRMED") {
                        KoraSecondaryButton(
                            text = "Reschedule",
                            enabled = !state.isMutating,
                            onClick = {
                                pickNewDateTime(context, details.branchTimeZone) { newStartAtIso ->
                                    viewModel.reschedule(newStartAtIso)
                                }
                            },
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        )
                        KoraSecondaryButton(
                            text = "Cancel appointment",
                            enabled = !state.isMutating,
                            onClick = viewModel::requestCancelConfirmation,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }

    if (state.showCancelConfirm) {
        AlertDialog(
            onDismissRequest = viewModel::dismissCancelConfirmation,
            title = { Text("Cancel this appointment?") },
            text = { Text("This cannot be undone. The business's cancellation policy still applies.") },
            confirmButton = {
                TextButton(onClick = viewModel::confirmCancel) {
                    Text("Cancel appointment", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissCancelConfirmation) { Text("Keep appointment") }
            },
        )
    }
}

/** Reschedule picks a new local date/time expressed in the appointment's
 * own branch timezone (never the phone's), then converts it to a UTC
 * instant for the API -- the server is the sole authority on whether
 * the new time is actually available (docs task Phase 7). */
private fun pickNewDateTime(context: Context, branchTimeZone: String, onPicked: (String) -> Unit) {
    val zone = ZoneId.of(branchTimeZone)
    val now = ZonedDateTime.now(zone)
    val datePicker = DatePickerDialog(
        context,
        { _, year, month, dayOfMonth ->
            TimePickerDialog(
                context,
                { _, hour, minute ->
                    val picked = ZonedDateTime.of(year, month + 1, dayOfMonth, hour, minute, 0, 0, zone)
                    onPicked(picked.toInstant().toString())
                },
                now.hour,
                now.minute,
                false,
            ).show()
        },
        now.year,
        now.monthValue - 1,
        now.dayOfMonth,
    )
    datePicker.datePicker.minDate = System.currentTimeMillis()
    datePicker.show()
}
