package com.realtegic.kora.feature.customer.discovery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto

@Composable
fun BusinessDetailScreen(
    viewModel: BusinessDetailViewModel,
    onBack: () -> Unit,
    onBranchSelected: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            com.realtegic.kora.core.designsystem.KoraTopBar(
                title = (state.business as? ScreenState.Content)?.data?.displayName ?: "Business",
                onBack = onBack,
                actions = {
                    if (state.business is ScreenState.Content) {
                        IconButton(onClick = viewModel::toggleFavorite) {
                            Icon(
                                imageVector = if (state.isFavorited) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                contentDescription = if (state.isFavorited) "Remove from favorites" else "Add to favorites",
                                tint = if (state.isFavorited) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        when (val business = state.business) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = business.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                    item {
                        if (business.data.coverImageUrl != null) {
                            AsyncImage(
                                model = business.data.coverImageUrl,
                                contentDescription = null,
                                modifier = Modifier.fillMaxWidth().height(160.dp),
                            )
                        }
                        Column(modifier = Modifier.padding(16.dp)) {
                            if (business.data.categories.isNotEmpty()) {
                                Text(
                                    business.data.categories.joinToString(" • "),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                            if (business.data.description != null) {
                                Text(
                                    business.data.description,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 8.dp),
                                )
                            }
                            Text(
                                "Branches",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
                            )
                        }
                    }
                    when (val branches = state.branches) {
                        ScreenState.Initial, ScreenState.Loading -> item { LoadingStateView(modifier = Modifier.height(120.dp)) }
                        is ScreenState.Error -> item { ErrorStateView(error = branches.error, onRetry = viewModel::load, modifier = Modifier.height(120.dp)) }
                        ScreenState.Empty -> item {
                            Text(
                                "No branches available yet.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(16.dp),
                            )
                        }
                        is ScreenState.Content -> items(branches.data) { branch ->
                            BranchRow(branch, onClick = { onBranchSelected(branch.branchId) })
                        }
                        ScreenState.AuthenticationExpired -> Unit
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun BranchRow(branch: DiscoveryBranchSummaryDto, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(branch.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                val locationLine = listOfNotNull(branch.city, branch.region).joinToString(", ")
                if (locationLine.isNotBlank()) {
                    Text(locationLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (branch.openingHoursNote != null) {
                    Text(branch.openingHoursNote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
