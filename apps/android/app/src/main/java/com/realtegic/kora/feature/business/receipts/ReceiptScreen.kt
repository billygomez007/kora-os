package com.realtegic.kora.feature.business.receipts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
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
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ReceiptDto

@Composable
fun ReceiptsListScreen(viewModel: ReceiptsListViewModel, onReceiptTapped: (String) -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Receipts") }) { padding ->
        when (val receipts = state.receipts) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = receipts.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty -> EmptyStateView(title = "No receipts yet", modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(receipts.data, key = ReceiptDto::id) { receipt ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable { onReceiptTapped(receipt.id) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Text(receipt.receiptNumber, style = MaterialTheme.typography.titleMedium)
                                Text(receipt.kind, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(MoneyFormatter.format(receipt.totalMinor, receipt.currency), style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
fun ReceiptScreen(viewModel: ReceiptViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Receipt", onBack = onBack) }) { padding ->
        when (val receipt = state.receipt) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = receipt.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = receipt.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Text(details.businessName, style = MaterialTheme.typography.headlineSmall)
                    Text(details.branchName, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Receipt ${details.receiptNumber}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                    Text("Issued: ${details.issuedAt}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (details.kind != "SALE_RECEIPT") {
                        Text(
                            "${details.kind}${details.originalReceiptNumber?.let { " · refers to $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        details.correctionReason?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp)) }
                    }
                    details.customerName?.let { Text("Customer: $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp)) }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    details.lineItems.forEach { item ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(item.serviceName, style = MaterialTheme.typography.bodyMedium)
                            Text(MoneyFormatter.format(item.lineTotalMinor, item.currency), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", style = MaterialTheme.typography.titleLarge)
                        Text(MoneyFormatter.format(details.totalMinor, details.currency), style = MaterialTheme.typography.titleLarge)
                    }
                    if (details.paymentSummaries.isNotEmpty()) {
                        Text("Payment", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 16.dp))
                        details.paymentSummaries.forEach { summary ->
                            Text(
                                "${summary.method}: ${MoneyFormatter.format(summary.amountMinor, summary.currency)}" +
                                    (summary.safeReference?.let { " ($it)" } ?: ""),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}
