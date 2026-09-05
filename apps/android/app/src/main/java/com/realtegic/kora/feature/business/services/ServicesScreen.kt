package com.realtegic.kora.feature.business.services

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ServiceDto

@Composable
fun ServicesScreen(viewModel: ServicesViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Services", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val services = state.services) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.weight(1f))
                is ScreenState.Error -> ErrorStateView(error = services.error, onRetry = viewModel::load, modifier = Modifier.weight(1f))
                ScreenState.Empty -> Text(
                    "No services yet. Add your first one below.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
                is ScreenState.Content -> LazyColumn(modifier = Modifier.weight(1f)) {
                    items(services.data, key = ServiceDto::id) { service ->
                        ServiceRow(service, onArchive = { viewModel.requestArchiveConfirmation(service.id) })
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }

            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Add a service", style = MaterialTheme.typography.titleMedium)
                KoraTextField(value = state.newName, onValueChange = { viewModel.onNewServiceChanged(name = it) }, label = "Service name")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KoraTextField(
                        value = state.newDurationMinutes,
                        onValueChange = { viewModel.onNewServiceChanged(durationMinutes = it) },
                        label = "Duration (min)",
                        keyboardType = KeyboardType.Number,
                        modifier = Modifier.weight(1f),
                    )
                    KoraTextField(
                        value = state.newPriceMajor,
                        onValueChange = { viewModel.onNewServiceChanged(priceMajor = it) },
                        label = "Price (${state.defaultCurrency})",
                        keyboardType = KeyboardType.Decimal,
                        modifier = Modifier.weight(1f),
                    )
                }
                state.createError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                KoraSecondaryButton(text = "Add", onClick = viewModel::createService, enabled = !state.isCreating, modifier = Modifier.fillMaxWidth())
            }
        }
    }

    if (state.pendingArchiveServiceId != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissArchiveConfirmation,
            title = { Text("Archive this service?") },
            text = { Text("Customers will no longer be able to book it. This does not affect past appointments.") },
            confirmButton = { TextButton(onClick = viewModel::confirmArchive) { Text("Archive", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = viewModel::dismissArchiveConfirmation) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ServiceRow(service: ServiceDto, onArchive: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(service.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${service.durationMinutes} min · ${MoneyFormatter.format(service.priceMinor, service.currency)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onArchive) { Text("Archive") }
        }
    }
}
