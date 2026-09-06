package com.realtegic.kora.feature.customer.appointments

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.AppointmentDto
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Matches `kora-customer-appointment-details-reference.png` (docs task
 * Customer Marketplace Design Batch 02). Business name, provider name,
 * and booking reference all come from the real, already-authoritative
 * [AppointmentDto] (Batch 02 added `businessName`/`businessSlug`/
 * `providerDisplayName` to the server response specifically for this
 * screen). Call/Directions appear only when the business's own public
 * branch data currently supplies a phone number or coordinates -- never
 * as dead buttons.
 */
@Composable
fun AppointmentDetailScreen(viewModel: AppointmentDetailViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    Scaffold(topBar = { KoraTopBar(title = "Appointment details", onBack = onBack) }) { padding ->
        when (val appointment = state.appointment) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = appointment.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> {
                val details = appointment.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    StatusBadge(details.status)
                    Spacer(modifier = Modifier.height(16.dp))

                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                KoraDateTimeFormatter.formatDay(details.startAt, details.branchTimeZone),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                "${KoraDateTimeFormatter.formatTime(details.startAt, details.branchTimeZone)} – ${KoraDateTimeFormatter.formatTime(details.endAt, details.branchTimeZone)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                            KoraTextButton(text = "Add to calendar", onClick = { addToCalendar(context, details) })
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(details.businessName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            if (state.branchLocationLine != null) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.height(16.dp))
                                    Text(state.branchLocationLine.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp))
                                }
                            }
                            if (state.branchPublicPhone != null || state.branchLatitude != null) {
                                Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (state.branchPublicPhone != null) {
                                        KoraSecondaryButton(
                                            text = "Call",
                                            onClick = { callBranch(context, state.branchPublicPhone.orEmpty()) },
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                    if (state.branchLatitude != null && state.branchLongitude != null) {
                                        KoraSecondaryButton(
                                            text = "Directions",
                                            onClick = { openDirections(context, state.branchLatitude!!, state.branchLongitude!!) },
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(details.items.firstOrNull()?.serviceName ?: "Appointment", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${details.items.firstOrNull()?.durationMinutes ?: 0} min", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(MoneyFormatter.format(details.totalPriceMinor, details.currency), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                            }
                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                            DetailRow(Icons.Default.Person, "Professional", details.providerDisplayName ?: "Assigned by the business")
                            DetailRow(Icons.Default.Receipt, "Booking reference", details.reference, showDivider = false)
                        }
                    }

                    if (state.actionError != null) {
                        Text(
                            text = state.actionError?.message.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    if (details.status == "CONFIRMED") {
                        Text(
                            "Payment will be recorded by the business after your service.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 12.dp),
                        )
                        KoraSecondaryButton(
                            text = "Reschedule appointment",
                            enabled = !state.isMutating,
                            onClick = {
                                pickNewDateTime(context, details.branchTimeZone) { newStartAtIso ->
                                    viewModel.reschedule(newStartAtIso)
                                }
                            },
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        )
                        TextButton(onClick = viewModel::requestCancelConfirmation, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth()) {
                            Text("Cancel appointment", color = MaterialTheme.colorScheme.error)
                        }
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

@Composable
private fun StatusBadge(status: String) {
    val (bg, fg) = when (status) {
        "CONFIRMED" -> com.realtegic.kora.ui.theme.StatusGreenBg to com.realtegic.kora.ui.theme.StatusGreen
        "CANCELLED" -> com.realtegic.kora.ui.theme.StatusRedBg to com.realtegic.kora.ui.theme.StatusRed
        else -> com.realtegic.kora.ui.theme.StatusAmberBg to com.realtegic.kora.ui.theme.StatusAmber
    }
    Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(50), color = bg) {
        Text(status, style = MaterialTheme.typography.labelMedium, color = fg, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp))
    }
}

@Composable
private fun DetailRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, showDivider: Boolean = true) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.height(18.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp))
        }
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
    if (showDivider) HorizontalDivider()
}

/** Opens the dialer pre-filled with the business's own published number
 * -- ACTION_DIAL, never ACTION_CALL, so the customer confirms the call
 * themselves and no CALL_PHONE permission is ever needed. */
private fun callBranch(context: Context, phone: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }
}

/** Hands off to whatever maps app is installed via a standard geo intent
 * -- never a bundled routing/distance calculation of this app's own. */
private fun openDirections(context: Context, latitude: Double, longitude: Double) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude"))) }
}

private fun addToCalendar(context: Context, appointment: AppointmentDto) {
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
