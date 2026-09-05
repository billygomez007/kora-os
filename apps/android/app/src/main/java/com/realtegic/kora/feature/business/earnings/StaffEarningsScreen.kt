package com.realtegic.kora.feature.business.earnings

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
import androidx.compose.material3.FilterChip
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
import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.CurrencyAmountDto
import com.realtegic.kora.core.model.MyEarningsLineDto

@Composable
fun StaffEarningsScreen(viewModel: StaffEarningsViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "My earnings", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = state.range == EarningsRangePreset.TODAY,
                    onClick = { viewModel.selectRange(EarningsRangePreset.TODAY) },
                    label = { Text("Today") },
                )
                FilterChip(
                    selected = state.range == EarningsRangePreset.THIS_WEEK,
                    onClick = { viewModel.selectRange(EarningsRangePreset.THIS_WEEK) },
                    label = { Text("This week") },
                )
            }

            when (val summary = state.summary) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(16.dp))
                is ScreenState.Error -> ErrorStateView(error = summary.error, onRetry = viewModel::load, modifier = Modifier.padding(16.dp))
                is ScreenState.Content -> SummaryCard(summary.data)
                ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            when (val lines = state.lines) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize())
                is ScreenState.Error -> ErrorStateView(error = lines.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize())
                ScreenState.Empty -> EmptyStateView(title = "No earnings in this range", modifier = Modifier.fillMaxSize())
                is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(lines.data, key = MyEarningsLineDto::id) { line -> EarningsLineRow(line) }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun SummaryCard(summary: CommissionReportEntryDto) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Net accrued commission", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (summary.net.isEmpty()) {
                Text("No commission accrued yet", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
            }
            summary.net.forEach { amount ->
                Text(MoneyFormatter.format(amount.amountMinor, amount.currency), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp))
            }
            if (summary.refunded.isNotEmpty() || summary.reversed.isNotEmpty()) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                AmountRow("Refund adjustments", summary.refunded)
                AmountRow("Reversal adjustments", summary.reversed)
            }
        }
    }
}

@Composable
private fun AmountRow(label: String, amounts: List<CurrencyAmountDto>) {
    if (amounts.isEmpty()) return
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(horizontalAlignment = androidx.compose.ui.Alignment.End) {
            amounts.forEach { amount -> Text(MoneyFormatter.format(amount.amountMinor, amount.currency), style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun EarningsLineRow(line: MyEarningsLineDto) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(line.serviceName ?: "Service", style = MaterialTheme.typography.bodyMedium)
            Text(
                "${line.kind.lowercase().replaceFirstChar(Char::uppercase)} · ${line.transactionReference}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(MoneyFormatter.format(line.calculatedAmountMinor, line.currency), style = MaterialTheme.typography.bodyMedium)
    }
}
