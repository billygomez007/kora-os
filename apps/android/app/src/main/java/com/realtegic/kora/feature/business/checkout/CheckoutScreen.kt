package com.realtegic.kora.feature.business.checkout

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CheckoutAdjustmentType
import com.realtegic.kora.core.model.ServiceSessionDto

@Composable
fun CheckoutSessionsScreen(viewModel: CheckoutSessionsViewModel, onSessionTapped: (String) -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Checkout") }) { padding ->
        when (val sessions = state.sessions) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = sessions.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty -> EmptyStateView(title = "No completed services awaiting checkout", modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(sessions.data, key = ServiceSessionDto::id) { session ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable { onSessionTapped(session.id) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Text(
                                    session.items.joinToString(", ") { it.serviceName }.ifBlank { "Service session" },
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Text("Completed at ${session.completedAt ?: session.startedAt}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(MoneyFormatter.format(session.serviceTotalMinor, session.currency), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel,
    onBack: () -> Unit,
    onRecordPayment: (checkoutId: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Checkout", onBack = onBack) }) { padding ->
        when (val checkout = state.checkout) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = checkout.error, onRetry = viewModel::createOrLoad, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = checkout.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Text("Checkout ${details.reference}", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Status: ${details.status}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    if (state.isReadOnly) {
                        Text(
                            "This workspace is read-only. You can view this checkout but not change it.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    details.items.forEach { item ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                            Text(item.serviceName, style = MaterialTheme.typography.bodyMedium)
                            Text(MoneyFormatter.format(item.priceMinor, item.currency), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if (details.adjustments.isNotEmpty()) {
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        details.adjustments.forEach { adjustment ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                                Text("${adjustment.type}: ${adjustment.reason}", style = MaterialTheme.typography.bodySmall)
                                Text(
                                    (if (adjustment.type == CheckoutAdjustmentType.DISCOUNT) "-" else "+") + MoneyFormatter.format(adjustment.amountMinor, details.currency),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                        Text("Subtotal", style = MaterialTheme.typography.bodyMedium)
                        Text(MoneyFormatter.format(details.subtotalMinor, details.currency), style = MaterialTheme.typography.bodyMedium)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                        Text("Total", style = MaterialTheme.typography.titleLarge)
                        Text(MoneyFormatter.format(details.totalMinor, details.currency), style = MaterialTheme.typography.titleLarge)
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    if (details.status == "OPEN") {
                        KoraSecondaryButton(text = "Add adjustment", onClick = viewModel::showAdjustmentForm, enabled = !state.isReadOnly, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
                    }
                    if (details.status in setOf("OPEN", "AWAITING_VERIFICATION", "DISPUTED")) {
                        KoraPrimaryButton(
                            text = "Record payment",
                            onClick = { onRecordPayment(details.id) },
                            enabled = !state.isReadOnly,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        )
                        KoraSecondaryButton(text = "Void checkout", onClick = viewModel::showVoidConfirm, enabled = !state.isReadOnly, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }

    if (state.showAdjustmentForm) {
        AlertDialog(
            onDismissRequest = viewModel::dismissAdjustmentForm,
            title = { Text("Add adjustment") },
            text = {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = state.adjustmentType == CheckoutAdjustmentType.DISCOUNT, onClick = { viewModel.onAdjustmentTypeChanged(CheckoutAdjustmentType.DISCOUNT) })
                        Text("Discount")
                        RadioButton(selected = state.adjustmentType == CheckoutAdjustmentType.SURCHARGE, onClick = { viewModel.onAdjustmentTypeChanged(CheckoutAdjustmentType.SURCHARGE) })
                        Text("Surcharge")
                    }
                    KoraTextField(value = state.adjustmentAmountMajor, onValueChange = viewModel::onAdjustmentAmountChanged, label = "Amount", keyboardType = KeyboardType.Decimal)
                    KoraTextField(value = state.adjustmentReason, onValueChange = viewModel::onAdjustmentReasonChanged, label = "Reason", modifier = Modifier.padding(top = 8.dp))
                    state.adjustmentError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = { KoraPrimaryButton(text = "Add", onClick = viewModel::submitAdjustment, isLoading = state.isSubmittingAdjustment) },
            dismissButton = { TextButton(onClick = viewModel::dismissAdjustmentForm) { Text("Cancel") } },
        )
    }

    if (state.showVoidConfirm) {
        AlertDialog(
            onDismissRequest = viewModel::dismissVoidConfirm,
            title = { Text("Void this checkout?") },
            text = {
                Column {
                    Text("This cannot be undone.")
                    KoraTextField(value = state.voidReason, onValueChange = viewModel::onVoidReasonChanged, label = "Reason", modifier = Modifier.padding(top = 8.dp))
                    state.voidError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = { TextButton(onClick = viewModel::confirmVoid) { Text("Void checkout", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = viewModel::dismissVoidConfirm) { Text("Back") } },
        )
    }
}
