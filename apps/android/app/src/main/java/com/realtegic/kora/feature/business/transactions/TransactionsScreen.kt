package com.realtegic.kora.feature.business.transactions

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.TextButton
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
import com.realtegic.kora.core.model.TransactionDto

@Composable
fun TransactionsListScreen(
    viewModel: TransactionsListViewModel,
    onBack: () -> Unit,
    onTransactionTapped: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Transactions", onBack = onBack) }) { padding ->
        when (val transactions = state.transactions) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = transactions.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty -> EmptyStateView(title = "No posted transactions yet", modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(transactions.data, key = TransactionDto::id) { transaction ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable { onTransactionTapped(transaction.id) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                            Column {
                                Text(transaction.reference, style = MaterialTheme.typography.titleMedium)
                                Text(transaction.kind, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(MoneyFormatter.format(transaction.totalMinor, transaction.currency), style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
fun TransactionDetailScreen(
    viewModel: TransactionDetailViewModel,
    onBack: () -> Unit,
    onOpenReceipt: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Transaction", onBack = onBack) }) { padding ->
        when (val transaction = state.transaction) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = transaction.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = transaction.data
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    Text(details.reference, style = MaterialTheme.typography.headlineSmall)
                    Text("${details.kind} · ${details.status}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    Text("Posted: ${details.postedAt}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    details.items.forEach { item ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                            Text(item.serviceName, style = MaterialTheme.typography.bodyMedium)
                            Text(MoneyFormatter.format(item.priceMinor, item.currency), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                        Text("Total", style = MaterialTheme.typography.titleLarge)
                        Text(MoneyFormatter.format(details.totalMinor, details.currency), style = MaterialTheme.typography.titleLarge)
                    }
                    if (details.correctedTransactionId != null) {
                        Text(
                            "Corrects transaction ${details.correctedTransactionId}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    state.receiptId?.let { receiptId ->
                        TextButton(onClick = { onOpenReceipt(receiptId) }, modifier = Modifier.padding(top = 16.dp)) { Text("View receipt") }
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}
