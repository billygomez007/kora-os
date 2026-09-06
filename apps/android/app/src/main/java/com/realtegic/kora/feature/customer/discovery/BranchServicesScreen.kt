package com.realtegic.kora.feature.customer.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Schedule
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.BookingStepIndicator
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.MoneyFormatter
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.PublicServiceSummaryDto

object BranchServicesScreenTestTags {
    const val CONTINUE_BUTTON = "branch_services_continue_button"
}

/**
 * Matches `kora-customer-service-selection-reference.png`, step 1 of the
 * 4-step booking wizard (docs task Batch 02). Deliberately does not show
 * per-service images or category chips the reference depicts: no image
 * field exists on `PublicServiceSummaryDto`, and category *names* are
 * only available through an authenticated, organization-scoped endpoint
 * -- never publicly, so a customer-facing category filter here would
 * either fabricate labels or silently misuse an endpoint that requires a
 * membership the customer does not have.
 */
@Composable
fun BranchServicesScreen(
    viewModel: BranchServicesViewModel,
    onBack: () -> Unit,
    onContinue: (serviceId: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Choose services", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            BookingStepIndicator(step = 1, totalSteps = 4, label = "Choose services")
            when (val services = state.services) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = services.error, onRetry = viewModel::load)
                ScreenState.Empty -> EmptyStateView(title = "No services available", subtitle = "This branch has no bookable services right now.")
                is ScreenState.Content -> {
                    LazyColumn(modifier = Modifier.weight(1f, fill = true).padding(top = 8.dp)) {
                        items(services.data, key = { it.id }) { service ->
                            ServiceRow(
                                service = service,
                                selected = state.selectedServiceId == service.id,
                                onSelect = { viewModel.selectService(service.id) },
                            )
                        }
                    }
                    val selected = services.data.firstOrNull { it.id == state.selectedServiceId }
                    Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
                        Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
                            if (selected != null) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("1 service • ${selected.durationMinutes} min", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        MoneyFormatter.format(selected.priceMinor, selected.currency),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                Spacer(modifier = Modifier.height(12.dp))
                            }
                            KoraPrimaryButton(
                                text = "Continue",
                                enabled = state.selectedServiceId != null,
                                onClick = { state.selectedServiceId?.let(onContinue) },
                                modifier = Modifier.fillMaxWidth().testTag(BranchServicesScreenTestTags.CONTINUE_BUTTON),
                            )
                        }
                    }
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
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = if (selected) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(48.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.ContentCut, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(service.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                if (service.description != null) {
                    Text(
                        service.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Row(modifier = Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Schedule, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                    Text(
                        "${service.durationMinutes} min",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp, end = 8.dp),
                    )
                    Text(
                        MoneyFormatter.format(service.priceMinor, service.currency),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Icon(
                imageVector = if (selected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = if (selected) "Selected" else null,
                tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
