package com.realtegic.kora.feature.business.verifications

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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import com.realtegic.kora.core.model.PaymentRecordDto
import com.realtegic.kora.core.network.DomainError

@Composable
fun VerificationsScreen(viewModel: VerificationsViewModel) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Payment verifications") }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = state.selectedTab.ordinal) {
                Tab(selected = state.selectedTab == VerificationTab.PENDING, onClick = { viewModel.selectTab(VerificationTab.PENDING) }, text = { Text("Pending") })
                Tab(selected = state.selectedTab == VerificationTab.DISPUTED, onClick = { viewModel.selectTab(VerificationTab.DISPUTED) }, text = { Text("Disputed") })
                Tab(selected = state.selectedTab == VerificationTab.RESOLVED, onClick = { viewModel.selectTab(VerificationTab.RESOLVED) }, text = { Text("Resolved") })
            }
            state.actionError?.let {
                Text(friendlyMessage(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(16.dp))
            }
            when (val payments = state.payments) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize())
                is ScreenState.Error -> ErrorStateView(error = payments.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize())
                ScreenState.Empty -> EmptyStateView(title = "Nothing here right now", modifier = Modifier.fillMaxSize())
                is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(payments.data, key = PaymentRecordDto::id) { payment ->
                        VerificationRow(
                            payment = payment,
                            isPending = state.selectedTab == VerificationTab.PENDING,
                            isBusy = state.pendingActionPaymentId == payment.id,
                            onConfirm = { viewModel.confirm(payment.id) },
                            onDispute = { viewModel.showDisputeForm(payment.id) },
                        )
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }

    state.showDisputeForm?.let {
        AlertDialog(
            onDismissRequest = viewModel::dismissDisputeForm,
            title = { Text("Dispute this payment") },
            text = {
                Column {
                    Text("Explain why this payment claim is incorrect.")
                    KoraTextField(value = state.disputeReason, onValueChange = viewModel::onDisputeReasonChanged, label = "Reason", modifier = Modifier.padding(top = 8.dp))
                }
            },
            confirmButton = { TextButton(onClick = viewModel::submitDispute) { Text("Submit dispute", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = viewModel::dismissDisputeForm) { Text("Cancel") } },
        )
    }
}

@Composable
private fun VerificationRow(payment: PaymentRecordDto, isPending: Boolean, isBusy: Boolean, onConfirm: () -> Unit, onDispute: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(MoneyFormatter.format(payment.appliedAmountMinor, payment.currency), style = MaterialTheme.typography.titleMedium)
            Text("${payment.method} · ${payment.status}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            payment.note?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp)) }
            if (isPending) {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    KoraSecondaryButton(text = "Dispute", onClick = onDispute, enabled = !isBusy, modifier = Modifier.padding(end = 8.dp))
                    KoraPrimaryButton(text = "Confirm", onClick = onConfirm, isLoading = isBusy)
                }
            }
        }
    }
}

/** Surfaces the specific server-provided forbidden/conflict reason
 * rather than a generic message where one exists (docs task Phase 9:
 * "already confirmed; already disputed; already resolved; ... a
 * recorder confirming their own payment"). */
private fun friendlyMessage(error: DomainError): String = when {
    error is DomainError.Forbidden && error.code == "PAYMENT_SELF_CONFIRMATION_FORBIDDEN" ->
        "You recorded this payment yourself, so you can't also confirm it. Ask an owner or manager to review it."
    error is DomainError.Forbidden && error.code == "PAYMENT_CONFIRMATION_FORBIDDEN" ->
        "You're not eligible to confirm this payment."
    error is DomainError.Conflict && error.code == "PAYMENT_STATE_INVALID" ->
        "This payment has already been confirmed, disputed, or voided by someone else. The list has been refreshed."
    else -> error.message
}
