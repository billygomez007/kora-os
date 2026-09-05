package com.realtegic.kora.feature.customer.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto

@Composable
fun BranchServicesScreen(
    viewModel: BranchServicesViewModel,
    onBack: () -> Unit,
    onContinue: (serviceId: String, staffProfileId: String?) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Choose a service", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val services = state.services) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = services.error, onRetry = viewModel::load)
                ScreenState.Empty -> EmptyStateView(title = "No services available", subtitle = "This branch has no bookable services right now.")
                is ScreenState.Content -> {
                    LazyColumn(modifier = Modifier.weight(1f, fill = true)) {
                        items(services.data, key = { it.id }) { service ->
                            ServiceRow(
                                service = service,
                                selected = state.selectedServiceId == service.id,
                                onSelect = { viewModel.selectService(service.id) },
                            )
                        }
                        if (state.selectedServiceId != null) {
                            item {
                                ProviderSection(
                                    providers = state.providers,
                                    selectedProviderId = state.selectedProviderId,
                                    onSelectProvider = viewModel::selectProvider,
                                )
                            }
                        }
                    }
                    KoraPrimaryButton(
                        text = "Continue",
                        enabled = state.selectedServiceId != null,
                        onClick = { state.selectedServiceId?.let { onContinue(it, state.selectedProviderId) } },
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                    )
                }
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun ServiceRow(service: PublicServiceSummaryDto, selected: Boolean, onSelect: () -> Unit) {
    Card(
        onClick = onSelect,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(service.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    "${service.durationMinutes} min",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                MoneyFormatter.format(service.priceMinor, service.currency),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ProviderSection(
    providers: ScreenState<List<PublicProviderSummaryDto>>,
    selectedProviderId: String?,
    onSelectProvider: (String?) -> Unit,
) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Provider (optional)", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 8.dp))
        ProviderOption(label = "Any available provider", selected = selectedProviderId == null, onClick = { onSelectProvider(null) })
        when (providers) {
            is ScreenState.Content -> providers.data.forEach { provider ->
                ProviderOption(
                    label = provider.displayName,
                    selected = selectedProviderId == provider.staffProfileId,
                    onClick = { onSelectProvider(provider.staffProfileId) },
                )
            }
            else -> Unit
        }
    }
}

@Composable
private fun ProviderOption(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
    }
}
