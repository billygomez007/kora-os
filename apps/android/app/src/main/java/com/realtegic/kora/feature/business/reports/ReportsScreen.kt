package com.realtegic.kora.feature.business.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import com.realtegic.kora.core.model.CashReconciliationEntryDto
import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.CurrencyAmountDto
import com.realtegic.kora.core.model.DailyRevenueBucketDto
import com.realtegic.kora.core.model.PaymentMethodEntryDto
import com.realtegic.kora.core.model.ServicePerformanceEntryDto
import com.realtegic.kora.core.model.StaffPerformanceEntryDto

@Composable
fun ReportsScreen(viewModel: ReportsViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Reports", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ReportWindow.entries.forEach { window ->
                    FilterChip(selected = state.window == window, onClick = { viewModel.selectWindow(window) }, label = { Text(window.label) })
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                sectionLabels.forEach { (section, label) ->
                    FilterChip(selected = state.section == section, onClick = { viewModel.selectSection(section) }, label = { Text(label) })
                }
            }
            HorizontalDivider(modifier = Modifier.padding(top = 8.dp))

            when (state.section) {
                ReportSection.OVERVIEW -> ScreenStateSection(state.overview, viewModel::retry) { OverviewSection(it) }
                ReportSection.REVENUE -> ScreenStateSection(state.revenue, viewModel::retry) { RevenueSection(it.buckets) }
                ReportSection.STAFF -> ListSection(state.staffPerformance, viewModel::retry) { StaffPerformanceRow(it) }
                ReportSection.SERVICES -> ListSection(state.services, viewModel::retry) { ServicePerformanceRow(it) }
                ReportSection.PAYMENT_METHODS -> ListSection(state.paymentMethods, viewModel::retry) { PaymentMethodRow(it) }
                ReportSection.COMMISSIONS -> ListSection(state.commissions, viewModel::retry) { CommissionRow(it) }
                ReportSection.CASH -> ListSection(state.cashReconciliation, viewModel::retry) { CashReconciliationRow(it) }
            }
        }
    }
}

private val sectionLabels = listOf(
    ReportSection.OVERVIEW to "Overview",
    ReportSection.REVENUE to "Revenue",
    ReportSection.STAFF to "Staff",
    ReportSection.SERVICES to "Services",
    ReportSection.PAYMENT_METHODS to "Payment methods",
    ReportSection.COMMISSIONS to "Commissions",
    ReportSection.CASH to "Cash",
)

@Composable
private fun <T> ScreenStateSection(state: ScreenState<T>, onRetry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize())
        is ScreenState.Error -> ErrorStateView(error = state.error, onRetry = onRetry, modifier = Modifier.fillMaxSize())
        is ScreenState.Content -> content(state.data)
        ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
    }
}

@Composable
private fun <T> ListSection(state: ScreenState<List<T>>, onRetry: () -> Unit, row: @Composable (T) -> Unit) {
    when (state) {
        ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize())
        is ScreenState.Error -> ErrorStateView(error = state.error, onRetry = onRetry, modifier = Modifier.fillMaxSize())
        ScreenState.Empty -> EmptyStateView(title = "Nothing in this range", modifier = Modifier.fillMaxSize())
        is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.data) { item -> row(item) }
        }
        ScreenState.AuthenticationExpired -> Unit
    }
}

@Composable
private fun OverviewSection(overview: com.realtegic.kora.core.model.ReportsOverviewDto) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { AmountsCard("Gross posted sales", overview.grossPostedSales) }
        item { AmountsCard("Refunds", overview.refundAmount) }
        item { AmountsCard("Reversals", overview.reversalAmount) }
        item { AmountsCard("Net posted revenue", overview.netPostedRevenue) }
        item { AmountsCard("Commission accrued", overview.commissionAccrued) }
        item { CountCard("Posted transactions", overview.transactionCount) }
        item { CountCard("Completed services", overview.completedServiceCount) }
        item { CountCard("Pending payment claims", overview.pendingPaymentClaimCount) }
        item { CountCard("Disputed payment claims", overview.disputedPaymentClaimCount) }
    }
}

@Composable
private fun RevenueSection(buckets: List<DailyRevenueBucketDto>) {
    if (buckets.isEmpty()) {
        EmptyStateView(title = "No posted revenue in this range", modifier = Modifier.fillMaxSize())
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(buckets) { bucket ->
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(bucket.date, style = MaterialTheme.typography.bodyMedium)
                    Text("${bucket.transactionCount} transactions", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(MoneyFormatter.format(bucket.totalMinor, bucket.currency), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun StaffPerformanceRow(entry: StaffPerformanceEntryDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Staff ${entry.staffProfileId.take(8)}", style = MaterialTheme.typography.bodyMedium)
        Text("${entry.serviceCount} completed services", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InlineAmounts("Net revenue", entry.netRevenue)
        InlineAmounts("Net commission", entry.netCommission)
    }
}

@Composable
private fun ServicePerformanceRow(entry: ServicePerformanceEntryDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(entry.serviceName, style = MaterialTheme.typography.bodyMedium)
        Text("${entry.serviceCount} performed", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InlineAmounts("Net amount", entry.netAmount)
    }
}

@Composable
private fun PaymentMethodRow(entry: PaymentMethodEntryDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(entry.method, style = MaterialTheme.typography.bodyMedium)
        Text("${entry.count} payments recorded", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InlineAmounts("Net total", entry.netTotal)
    }
}

@Composable
private fun CommissionRow(entry: CommissionReportEntryDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Staff ${entry.staffProfileId.take(8)}", style = MaterialTheme.typography.bodyMedium)
        InlineAmounts("Net", entry.net)
    }
}

@Composable
private fun CashReconciliationRow(entry: CashReconciliationEntryDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(entry.registerName, style = MaterialTheme.typography.bodyMedium)
        Text("${entry.status} · custody only, not revenue", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Expected closing cash", style = MaterialTheme.typography.bodySmall)
            Text(MoneyFormatter.format(entry.expectedClosingCashMinor, entry.currency), style = MaterialTheme.typography.bodySmall)
        }
        entry.countedCashMinor?.let { counted ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Counted cash", style = MaterialTheme.typography.bodySmall)
                Text(MoneyFormatter.format(counted, entry.currency), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun AmountsCard(label: String, amounts: List<CurrencyAmountDto>) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (amounts.isEmpty()) {
                Text("—", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
            }
            amounts.forEach { amount ->
                Text(MoneyFormatter.format(amount.amountMinor, amount.currency), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun CountCard(label: String, count: Int) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(count.toString(), style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun InlineAmounts(label: String, amounts: List<CurrencyAmountDto>) {
    if (amounts.isEmpty()) return
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(horizontalAlignment = androidx.compose.ui.Alignment.End) {
            amounts.forEach { amount -> Text(MoneyFormatter.format(amount.amountMinor, amount.currency), style = MaterialTheme.typography.bodySmall) }
        }
    }
}
