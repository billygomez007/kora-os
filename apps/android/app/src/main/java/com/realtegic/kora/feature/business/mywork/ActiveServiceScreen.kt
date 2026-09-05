package com.realtegic.kora.feature.business.mywork

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ServiceSessionCancelDisposition
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.delay

@Composable
fun ActiveServiceScreen(
    viewModel: ActiveServiceViewModel,
    onBack: () -> Unit,
    onCompleted: (serviceSessionId: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.completed) {
        if (state.completed) onCompleted((state.session as? ScreenState.Content)?.data?.id ?: return@LaunchedEffect)
    }

    Scaffold(topBar = { KoraTopBar(title = "Active service", onBack = onBack) }) { padding ->
        when (val session = state.session) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = session.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = session.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    ElapsedTimeDisplay(startedAtIso = details.startedAt)
                    Text(details.status, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    Text("Services", style = MaterialTheme.typography.titleMedium)
                    details.items.forEach { item ->
                        Text(
                            "${item.serviceName} · ${MoneyFormatter.format(item.priceMinor, item.currency)}",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Text(
                        "Total: ${MoneyFormatter.format(details.serviceTotalMinor, details.currency)}",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    state.actionError?.let {
                        Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    if (details.status == "IN_PROGRESS") {
                        KoraSecondaryButton(text = "Edit services", onClick = viewModel::startEditingItems, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                        KoraPrimaryButton(text = "Complete service", onClick = viewModel::requestComplete, isLoading = state.isMutating, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                        KoraSecondaryButton(text = "Cancel service", onClick = viewModel::showCancelDialog, enabled = !state.isMutating, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }

    if (state.showEditItems) {
        AlertDialog(
            onDismissRequest = viewModel::dismissEditingItems,
            title = { Text("Edit services") },
            text = {
                Column {
                    state.availableServices.forEach { svc ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = svc.id in state.editSelectedServiceIds, onCheckedChange = { viewModel.toggleEditService(svc.id) })
                            Text(svc.name)
                        }
                    }
                }
            },
            confirmButton = { KoraPrimaryButton(text = "Save", onClick = viewModel::saveItems, isLoading = state.isMutating) },
            dismissButton = { TextButton(onClick = viewModel::dismissEditingItems) { Text("Cancel") } },
        )
    }

    if (state.showCompleteConfirm) {
        AlertDialog(
            onDismissRequest = viewModel::dismissCompleteConfirm,
            title = { Text("Complete this service?") },
            text = { Text("This finalizes the service and moves it to checkout.") },
            confirmButton = { TextButton(onClick = viewModel::confirmComplete) { Text("Complete") } },
            dismissButton = { TextButton(onClick = viewModel::dismissCompleteConfirm) { Text("Not yet") } },
        )
    }

    if (state.showCancelDialog) {
        AlertDialog(
            onDismissRequest = viewModel::dismissCancelDialog,
            title = { Text("Cancel this service") },
            text = {
                Column {
                    KoraTextField(value = state.cancelReason, onValueChange = viewModel::onCancelReasonChanged, label = "Reason")
                    Row(modifier = Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = state.cancelDisposition == ServiceSessionCancelDisposition.RETURN_TO_QUEUE,
                            onClick = { viewModel.onCancelDispositionChanged(ServiceSessionCancelDisposition.RETURN_TO_QUEUE) },
                        )
                        Text("Return customer to queue")
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = state.cancelDisposition == ServiceSessionCancelDisposition.CANCEL_VISIT,
                            onClick = { viewModel.onCancelDispositionChanged(ServiceSessionCancelDisposition.CANCEL_VISIT) },
                        )
                        Text("Cancel the visit entirely")
                    }
                }
            },
            confirmButton = { TextButton(onClick = viewModel::confirmCancelSession) { Text("Cancel service", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = viewModel::dismissCancelDialog) { Text("Back") } },
        )
    }
}

/** Purely informational -- ticks locally from [startedAtIso] but never
 * feeds anything back to the server or drives any state transition
 * (docs task Phase 6: "elapsed time must not drive server state"). */
@Composable
private fun ElapsedTimeDisplay(startedAtIso: String) {
    var elapsedSeconds by remember(startedAtIso) { mutableLongStateOf(Duration.between(Instant.parse(startedAtIso), Instant.now()).seconds.coerceAtLeast(0)) }
    LaunchedEffect(startedAtIso) {
        while (true) {
            elapsedSeconds = Duration.between(Instant.parse(startedAtIso), Instant.now()).seconds.coerceAtLeast(0)
            delay(1000)
        }
    }
    val minutes = elapsedSeconds / 60
    val seconds = elapsedSeconds % 60
    Text(
        "Elapsed: %d:%02d".format(minutes, seconds),
        style = MaterialTheme.typography.headlineMedium,
    )
}
