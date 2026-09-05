package com.realtegic.kora.feature.customer.discovery

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto

@Composable
fun SearchResultsScreen(
    viewModel: DiscoveryViewModel,
    onBack: () -> Unit,
    onBusinessTapped: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Search", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.padding(16.dp)) {
                KoraTextField(
                    value = state.query,
                    onValueChange = viewModel::onQueryChanged,
                    label = "Search businesses or services",
                    imeAction = ImeAction.Search,
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                        color = if (state.nearby != null) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.clickableRow(onClick = {
                            if (state.nearby != null) viewModel.clearNearby() else viewModel.onNearYouRequested()
                        }),
                    ) {
                        Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (state.isLoadingNearby) {
                                CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Default.NearMe, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            }
                            Text(
                                text = if (state.nearby != null) "Near you (on)" else "Near you",
                                modifier = Modifier.padding(start = 6.dp),
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                }
                if (state.nearbyError != null) {
                    Text(
                        text = state.nearbyError.orEmpty(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            when (val results = state.results) {
                ScreenState.Initial -> Unit
                ScreenState.Loading -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = results.error, onRetry = viewModel::retry)
                ScreenState.Empty -> EmptyStateView(
                    title = "No results",
                    subtitle = "Try a different search term or category.",
                )
                is ScreenState.Content -> ResultsList(results.data, state.hasMore, onBusinessTapped, onLoadMore = viewModel::loadMore)
                ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

private fun Modifier.clickableRow(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)

@Composable
private fun ResultsList(
    businesses: List<DiscoveryBusinessSummaryDto>,
    hasMore: Boolean,
    onBusinessTapped: (String) -> Unit,
    onLoadMore: () -> Unit,
) {
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        items(businesses, key = { it.organizationId }) { business ->
            SearchResultRow(business, onClick = { onBusinessTapped(business.slug) })
        }
        if (hasMore) {
            item {
                LoadMoreTrigger(onLoadMore)
            }
        }
    }
}

@Composable
private fun LoadMoreTrigger(onLoadMore: () -> Unit) {
    androidx.compose.runtime.LaunchedEffect(Unit) { onLoadMore() }
    Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) {
        CircularProgressIndicator(modifier = Modifier.padding(8.dp), strokeWidth = 2.dp)
    }
}

@Composable
private fun SearchResultRow(business: DiscoveryBusinessSummaryDto, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickableRow(onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(business.displayName, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        if (business.categories.isNotEmpty()) {
            Text(
                business.categories.joinToString(" • "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
