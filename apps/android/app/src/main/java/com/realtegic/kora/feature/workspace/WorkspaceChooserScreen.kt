package com.realtegic.kora.feature.workspace

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.WorkspaceOrganizationDto

@Composable
fun WorkspaceChooserScreen(
    viewModel: WorkspaceViewModel,
    onCustomerSelected: () -> Unit,
    onOrganizationSelected: (String) -> Unit,
    onCreateBusiness: () -> Unit,
) {
    val screenState by viewModel.state.collectAsState()

    Scaffold { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Text(
                text = "Choose a workspace",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(24.dp),
            )
            when (val state = screenState) {
                is ScreenState.Loading, ScreenState.Initial -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = state.error, onRetry = viewModel::load)
                is ScreenState.Content -> {
                    val workspaces = state.data
                    if (workspaces.organizations.isEmpty() && !workspaces.customerWorkspaceAvailable) {
                        EmptyStateView(
                            title = "No workspaces available",
                            subtitle = "Contact your organization owner for access, or create your own business.",
                            action = {
                                WorkspaceCard(title = "Create a business", subtitle = "Set up your own Kora workspace", icon = Icons.Default.Add, onClick = onCreateBusiness)
                            },
                        )
                    } else {
                        LazyColumn(
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            if (workspaces.customerWorkspaceAvailable) {
                                item {
                                    WorkspaceCard(
                                        title = "Customer",
                                        subtitle = "Book and manage your appointments",
                                        icon = Icons.Default.Person,
                                        onClick = { viewModel.selectCustomer(onCustomerSelected) },
                                    )
                                }
                            }
                            items(workspaces.organizations) { org: WorkspaceOrganizationDto ->
                                WorkspaceCard(
                                    title = org.name,
                                    subtitle = org.roleCodes.joinToString(", ") { it.replaceFirstChar(Char::uppercase) },
                                    icon = Icons.Default.Store,
                                    onClick = { viewModel.selectOrganization(org.organizationId) { onOrganizationSelected(org.organizationId) } },
                                )
                            }
                            item {
                                WorkspaceCard(title = "Create a business", subtitle = "Set up another Kora workspace", icon = Icons.Default.Add, onClick = onCreateBusiness)
                            }
                        }
                    }
                }
                ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun WorkspaceCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Column(modifier = Modifier.padding(start = 16.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
