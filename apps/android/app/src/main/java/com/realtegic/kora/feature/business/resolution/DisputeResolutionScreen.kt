package com.realtegic.kora.feature.business.resolution

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import com.realtegic.kora.core.model.PaymentDisputeDto
import com.realtegic.kora.core.model.PaymentDisputeResolution

@Composable
fun DisputeResolutionListScreen(
    viewModel: DisputeResolutionListViewModel,
    onBack: () -> Unit,
    onDisputeTapped: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Disputed payments", onBack = onBack) }) { padding ->
        when (val disputes = state.disputes) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = disputes.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty -> EmptyStateView(title = "No open disputes", modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(disputes.data, key = PaymentDisputeDto::id) { dispute ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable { onDisputeTapped(dispute.id) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            dispute.payment?.let { Text(MoneyFormatter.format(it.appliedAmountMinor, it.currency), style = MaterialTheme.typography.titleMedium) }
                            Text(dispute.reason, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
fun DisputeResolutionDetailScreen(viewModel: DisputeResolutionDetailViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.resolved) {
        if (state.resolved) onBack()
    }

    Scaffold(topBar = { KoraTopBar(title = "Resolve dispute", onBack = onBack) }) { padding ->
        when (val dispute = state.dispute) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = dispute.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = dispute.data
                val payment = details.payment
                Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                    payment?.let {
                        Text(MoneyFormatter.format(it.appliedAmountMinor, it.currency), style = MaterialTheme.typography.headlineSmall)
                        Text("${it.method} · ${it.status}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                        it.externalReference?.let { ref -> Text("Reference: $ref", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp)) }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    Text("Dispute reason", style = MaterialTheme.typography.labelLarge)
                    Text(details.reason, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                    if (details.status != "OPEN") {
                        Text(
                            "Already resolved: ${details.status}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                    KoraTextField(
                        value = state.resolutionNote,
                        onValueChange = viewModel::onResolutionNoteChanged,
                        label = "Resolution note (required to reject)",
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    state.submitError?.let {
                        Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    if (details.status == "OPEN") {
                        KoraPrimaryButton(
                            text = "Confirm payment",
                            onClick = { viewModel.requestResolve(PaymentDisputeResolution.CONFIRM_PAYMENT) },
                            isLoading = state.isSubmitting,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        )
                        KoraSecondaryButton(
                            text = "Reject payment",
                            onClick = { viewModel.requestResolve(PaymentDisputeResolution.REJECT_PAYMENT) },
                            enabled = !state.isSubmitting,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }

    if (state.showOverrideWarning) {
        AlertDialog(
            onDismissRequest = viewModel::dismissOverrideWarning,
            title = { Text("Confirm resolution") },
            text = {
                Text(
                    if (state.pendingResolution == PaymentDisputeResolution.CONFIRM_PAYMENT) {
                        "This confirms the payment was received despite the provider's dispute. This is a management override and will be recorded in the audit trail."
                    } else {
                        "This rejects the payment claim. The recorder will need to correct or re-record it. This will be recorded in the audit trail."
                    },
                )
            },
            confirmButton = { TextButton(onClick = viewModel::confirmResolve) { Text("Proceed") } },
            dismissButton = { TextButton(onClick = viewModel::dismissOverrideWarning) { Text("Cancel") } },
        )
    }
}
