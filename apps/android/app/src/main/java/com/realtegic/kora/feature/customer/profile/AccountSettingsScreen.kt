package com.realtegic.kora.feature.customer.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextButton
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.SessionSummaryDto

@Composable
fun AccountSettingsScreen(
    viewModel: AccountSettingsViewModel,
    onBack: () -> Unit,
    onSignedOutEverywhere: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    var showSignOutEverywhereConfirm by remember { mutableStateOf(false) }

    Scaffold(topBar = { KoraTopBar(title = "Account & sessions", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val screenState = state) {
                ScreenState.Initial, ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = screenState.error, onRetry = viewModel::load)
                ScreenState.Empty -> EmptyStateView(title = "No active sessions")
                is ScreenState.Content -> LazyColumn(
                    modifier = Modifier.weight(1f, fill = true),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    items(screenState.data, key = { it.id }) { session ->
                        SessionRow(session, onRevoke = { viewModel.revoke(session.id) })
                    }
                }
                ScreenState.AuthenticationExpired -> Unit
            }
            KoraSecondaryButton(
                text = "Sign out of all devices",
                onClick = { showSignOutEverywhereConfirm = true },
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            )
        }
    }

    if (showSignOutEverywhereConfirm) {
        AlertDialog(
            onDismissRequest = { showSignOutEverywhereConfirm = false },
            title = { Text("Sign out everywhere?") },
            text = { Text("This immediately signs every device out, including this one.") },
            confirmButton = {
                TextButton(onClick = { viewModel.signOutEverywhere(onSignedOutEverywhere) }) {
                    Text("Sign out everywhere", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { showSignOutEverywhereConfirm = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SessionRow(session: SessionSummaryDto, onRevoke: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(session.deviceLabel ?: "Unknown device", style = MaterialTheme.typography.titleSmall)
                Text(
                    if (session.isCurrent) "This device" else "Last used ${session.lastUsedAt.take(10)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!session.isCurrent) {
                KoraTextButton(text = "Revoke", onClick = onRevoke, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
