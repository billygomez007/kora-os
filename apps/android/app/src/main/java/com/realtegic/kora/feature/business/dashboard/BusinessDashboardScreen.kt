package com.realtegic.kora.feature.business.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CurrencyAmountDto
import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto
import com.realtegic.kora.ui.theme.StatusAmber
import com.realtegic.kora.ui.theme.StatusAmberBg

@Composable
fun BusinessDashboardScreen(viewModel: BusinessDashboardViewModel, onSwitchWorkspace: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = (state.workspace as? ScreenState.Content)?.data?.name ?: "Dashboard") }) { padding ->
        when (val workspace = state.workspace) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = workspace.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> {
                val org = workspace.data
                Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                    when (org.accessMode) {
                        "BLOCKED" -> BlockedSubscriptionView(onSwitchWorkspace)
                        else -> {
                            if (org.accessMode == "READ_ONLY") {
                                ReadOnlyBanner()
                            }
                            DashboardContent(org, state.overview)
                        }
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun ReadOnlyBanner() {
    Surface(color = StatusAmberBg, modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Lock, contentDescription = null, tint = StatusAmber, modifier = Modifier.padding(end = 8.dp))
            Text("This workspace is read-only. Some actions are unavailable.", color = StatusAmber, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun BlockedSubscriptionView(onSwitchWorkspace: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 16.dp))
        Text("Subscription inactive", style = MaterialTheme.typography.titleLarge)
        Text(
            "This workspace's subscription is not active. Contact the owner to restore access.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
        )
        com.realtegic.kora.core.designsystem.KoraSecondaryButton(text = "Switch workspace", onClick = onSwitchWorkspace)
    }
}

@Composable
private fun DashboardContent(org: WorkspaceOrganizationDto, overview: ScreenState<ReportsOverviewDto>?) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            org.roleCodes.joinToString(", ") { it.replaceFirstChar(Char::uppercase) },
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        if (org.branches.isNotEmpty()) {
            Text(
                "Branches: ${org.branches.joinToString(", ") { it.name }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        when (overview) {
            null -> Text(
                "You don't have access to financial reports in this workspace.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 24.dp),
            )
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(top = 24.dp))
            is ScreenState.Error -> ErrorStateView(error = overview.error)
            is ScreenState.Content -> OverviewGrid(overview.data)
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun OverviewGrid(overview: ReportsOverviewDto) {
    Text("Last 30 days", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 20.dp, bottom = 12.dp))
    LazyVerticalGrid(columns = GridCells.Fixed(2), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(overview.grossPostedSales) { amount -> MetricCard("Gross sales", amount) }
        items(overview.refundAmount) { amount -> MetricCard("Refunds", amount) }
        items(overview.reversalAmount) { amount -> MetricCard("Reversals", amount) }
        items(overview.netPostedRevenue) { amount -> MetricCard("Net revenue", amount) }
        item {
            CountCard("Transactions", overview.transactionCount)
        }
        item {
            CountCard("Pending claims", overview.pendingPaymentClaimCount)
        }
        item {
            CountCard("Disputed claims", overview.disputedPaymentClaimCount)
        }
    }
}

@Composable
private fun MetricCard(label: String, amount: CurrencyAmountDto) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                MoneyFormatter.format(amount.amountMinor, amount.currency),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun CountCard(label: String, count: Int) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(count.toString(), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
