package com.realtegic.kora.feature.business.payments

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.CashPolicyMode
import com.realtegic.kora.core.model.PaymentMethod

@Composable
fun RecordPaymentScreen(
    viewModel: RecordPaymentViewModel,
    onBack: () -> Unit,
    onRecorded: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.recorded) {
        if (state.recorded != null) onRecorded()
    }

    Scaffold(topBar = { KoraTopBar(title = "Record payment", onBack = onBack) }) { padding ->
        when (val checkout = state.checkout) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = checkout.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> {
                val details = checkout.data
                val activePayments = state.existingPayments.filter { it.status != "VOIDED" }
                val remaining = details.totalMinor - activePayments.sumOf { it.appliedAmountMinor }
                Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp)) {
                    Text(
                        "This records that payment was received manually. Kora does not process card, bank, or mobile money payments.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "Remaining balance: ${MoneyFormatter.format(remaining.coerceAtLeast(0), details.currency)}",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 12.dp, bottom = 12.dp),
                    )
                    Text("Payment method", style = MaterialTheme.typography.labelLarge)
                    listOf(
                        PaymentMethod.CASH to "Cash",
                        PaymentMethod.MOBILE_MONEY to "Mobile money (recorded manually)",
                        PaymentMethod.CARD to "Card (recorded manually)",
                        PaymentMethod.BANK_TRANSFER to "Bank transfer (recorded manually)",
                        PaymentMethod.OTHER to "Other",
                    ).forEach { (value, label) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = state.method == value, onClick = { viewModel.onMethodChanged(value) })
                            Text(label)
                        }
                    }
                    if (state.method == PaymentMethod.CASH && state.cashPolicyMode == CashPolicyMode.REQUIRED) {
                        Text(
                            "This branch requires an open cash session for cash payments, which isn't available in the app yet. Use a different payment method.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    KoraTextField(
                        value = state.amountMajor,
                        onValueChange = viewModel::onAmountChanged,
                        label = "Amount (${details.currency})",
                        keyboardType = KeyboardType.Decimal,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    if (state.method == PaymentMethod.CASH) {
                        KoraTextField(
                            value = state.tenderedMajor,
                            onValueChange = viewModel::onTenderedChanged,
                            label = "Tendered amount (optional, for change)",
                            keyboardType = KeyboardType.Decimal,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    if (state.method != PaymentMethod.CASH) {
                        KoraTextField(
                            value = state.externalReference,
                            onValueChange = viewModel::onExternalReferenceChanged,
                            label = "Reference code (optional, no card/account numbers)",
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    KoraTextField(
                        value = state.note,
                        onValueChange = viewModel::onNoteChanged,
                        label = "Note (optional)",
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    state.submitError?.let {
                        Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
                    }
                    KoraPrimaryButton(
                        text = "Record payment",
                        onClick = viewModel::submit,
                        isLoading = state.isSubmitting,
                        modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                    )
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}
