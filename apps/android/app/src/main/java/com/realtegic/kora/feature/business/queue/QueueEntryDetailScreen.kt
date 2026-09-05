package com.realtegic.kora.feature.business.queue

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueEntryDetailScreen(
    viewModel: QueueEntryDetailViewModel,
    branchTimeZone: String,
    onBack: () -> Unit,
    onServiceStarted: (serviceSessionId: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.startedServiceSessionId) {
        state.startedServiceSessionId?.let { onServiceStarted(it) }
    }

    Scaffold(topBar = { KoraTopBar(title = "Queue entry", onBack = onBack) }) { padding ->
        when (val entry = state.entry) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = entry.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = entry.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Text("Ticket #${details.ticketNumber}", style = MaterialTheme.typography.headlineSmall)
                    Text(details.customerName ?: "Customer", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                    Text(
                        details.services.joinToString(", ") { it.serviceName },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    Text(
                        "Status: ${details.status}",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        "Joined " + KoraDateTimeFormatter.formatDayTimeWithZone(details.joinedAt, branchTimeZone),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    state.actionError?.let {
                        Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 12.dp))
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    when (details.status) {
                        "WAITING" -> {
                            KoraPrimaryButton(text = "Call", onClick = viewModel::call, isLoading = state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                            KoraSecondaryButton(text = "Assign provider", onClick = viewModel::showAssignSheet, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                        }
                        "CALLED" -> {
                            if (details.assignedStaffProfileId != null) {
                                KoraPrimaryButton(text = "Start service", onClick = { viewModel.startService() }, isLoading = state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                            }
                            KoraSecondaryButton(text = "Assign provider", onClick = viewModel::showAssignSheet, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                            KoraSecondaryButton(text = "Return to waiting", onClick = viewModel::returnToWaiting, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                        }
                        else -> Unit
                    }
                    if (details.status == "WAITING" || details.status == "CALLED") {
                        KoraSecondaryButton(text = "Mark as no-show", onClick = viewModel::markNoShow, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                        KoraSecondaryButton(text = "Cancel", onClick = viewModel::requestCancelConfirmation, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }

    if (state.showAssignSheet) {
        ModalBottomSheet(onDismissRequest = viewModel::dismissAssignSheet) {
            Column(modifier = Modifier.padding(bottom = 24.dp)) {
                Text("Assign a provider", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
                state.staff.filter { it.staffProfileId != null }.forEach { staffMember ->
                    ListItem(
                        headlineContent = { Text(staffMember.displayName) },
                        modifier = Modifier.fillMaxWidth().clickable { viewModel.assign(staffMember.staffProfileId!!) },
                    )
                }
            }
        }
    }

    if (state.showCancelConfirm) {
        AlertDialog(
            onDismissRequest = viewModel::dismissCancelConfirmation,
            title = { Text("Cancel this queue entry?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = viewModel::confirmCancel) { Text("Cancel entry", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = viewModel::dismissCancelConfirmation) { Text("Keep") } },
        )
    }
}
