package com.realtegic.kora.feature.business.subscription

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.SubscriptionDetailDto

@Composable
fun SubscriptionScreen(viewModel: SubscriptionViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Subscription", onBack = onBack) }) { padding ->
        when (val detail = state) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = detail.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> SubscriptionContent(detail.data, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun SubscriptionContent(detail: SubscriptionDetailDto, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(detail.planName, style = MaterialTheme.typography.headlineSmall)
        Text("Status: ${detail.status}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        detail.trialEndsAt?.let {
            Text("Trial ends: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        UsageRow("Branches", detail.usage.branchesUsed, detail.usage.branchesMax)
        UsageRow("Staff", detail.usage.staffUsed, detail.usage.staffMax)
    }
}

@Composable
private fun UsageRow(label: String, used: Int, max: Int?) {
    Column {
        Text(
            if (max != null) "$label: $used of $max" else "$label: $used",
            style = MaterialTheme.typography.bodyLarge,
        )
        if (max != null && max > 0) {
            LinearProgressIndicator(
                progress = { (used.toFloat() / max.toFloat()).coerceIn(0f, 1f) },
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
