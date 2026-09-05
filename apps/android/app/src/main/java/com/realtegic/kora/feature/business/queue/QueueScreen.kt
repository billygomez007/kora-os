package com.realtegic.kora.feature.business.queue

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.QueueEntryDto

/**
 * Foreground-only near-real-time refresh: polling starts when this
 * screen becomes resumed/visible and stops the moment it isn't (docs
 * task Phase 5) -- there is no background service, no push channel.
 */
@Composable
fun QueueScreen(
    viewModel: QueueViewModel,
    branchTimeZone: String,
    onBack: () -> Unit,
    onEntryTapped: (String) -> Unit,
    onAddWalkIn: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LifecycleResumeEffect(Unit) {
        viewModel.startPolling()
        onPauseOrDispose { viewModel.stopPolling() }
    }

    Scaffold(
        topBar = {
            KoraTopBar(
                title = "Queue",
                onBack = onBack,
                actions = {
                    IconButton(onClick = onAddWalkIn) { Icon(Icons.Default.PersonAdd, contentDescription = "Add walk-in") }
                    IconButton(onClick = viewModel::refreshNow) { Icon(Icons.Default.Refresh, contentDescription = "Refresh") }
                },
            )
        },
    ) { padding ->
        when (val queue = state.queue) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = queue.error, onRetry = viewModel::refreshNow, modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                val data = queue.data
                TabRow(selectedTabIndex = state.selectedTab.ordinal) {
                    Tab(selected = state.selectedTab == QueueTab.WAITING, onClick = { viewModel.selectTab(QueueTab.WAITING) }, text = { Text("Waiting (${data.counts.waiting})") })
                    Tab(selected = state.selectedTab == QueueTab.CALLED, onClick = { viewModel.selectTab(QueueTab.CALLED) }, text = { Text("Called (${data.counts.called})") })
                    Tab(selected = state.selectedTab == QueueTab.IN_SERVICE, onClick = { viewModel.selectTab(QueueTab.IN_SERVICE) }, text = { Text("In service (${data.counts.inService})") })
                    Tab(selected = state.selectedTab == QueueTab.COMPLETED, onClick = { viewModel.selectTab(QueueTab.COMPLETED) }, text = { Text("Done (${data.counts.completed})") })
                }
                state.commandError?.let {
                    Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(16.dp))
                }
                val filtered = data.entries.filter { entry ->
                    when (state.selectedTab) {
                        QueueTab.WAITING -> entry.status == "WAITING"
                        QueueTab.CALLED -> entry.status == "CALLED"
                        QueueTab.IN_SERVICE -> entry.status == "IN_SERVICE"
                        QueueTab.COMPLETED -> entry.status == "COMPLETED"
                    }
                }
                if (filtered.isEmpty()) {
                    EmptyStateView(title = "Nothing here right now", modifier = Modifier.fillMaxSize())
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(filtered, key = QueueEntryDto::id) { entry ->
                            QueueEntryRow(entry, branchTimeZone, onClick = { onEntryTapped(entry.id) })
                        }
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun QueueEntryRow(entry: QueueEntryDto, branchTimeZone: String, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Text("#${entry.ticketNumber}", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(end = 12.dp))
            Column {
                Text(entry.customerName ?: "Customer", style = MaterialTheme.typography.titleMedium)
                Text(
                    entry.services.joinToString(", ") { it.serviceName },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Joined " + KoraDateTimeFormatter.formatTime(entry.joinedAt, branchTimeZone),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
