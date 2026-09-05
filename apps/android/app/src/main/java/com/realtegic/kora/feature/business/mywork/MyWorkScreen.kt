package com.realtegic.kora.feature.business.mywork

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.ServiceSessionDto

@Composable
fun MyWorkScreen(viewModel: MyWorkViewModel, onSessionTapped: (String) -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "My work") }) { padding ->
        when (val sessions = state.sessions) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Error -> ErrorStateView(error = sessions.error, onRetry = viewModel::load, modifier = Modifier.fillMaxSize().padding(padding))
            ScreenState.Empty -> EmptyStateView(title = "No active service right now", modifier = Modifier.fillMaxSize().padding(padding))
            is ScreenState.Content -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(sessions.data, key = ServiceSessionDto::id) { session ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable { onSessionTapped(session.id) },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(session.items.joinToString(", ") { it.serviceName }, style = MaterialTheme.typography.titleMedium)
                            Text("In progress", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}
