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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Verified
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto

object SearchResultsScreenTestTags {
    const val VERIFIED_FILTER = "search_verified_filter"
}

@Composable
fun SearchResultsScreen(
    viewModel: DiscoveryViewModel,
    onBusinessTapped: (String) -> Unit,
    onBack: (() -> Unit)? = null,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Search", onBack = onBack) }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.padding(top = 16.dp, start = 16.dp, end = 16.dp)) {
                KoraTextField(
                    value = state.query,
                    onValueChange = viewModel::onQueryChanged,
                    label = "Search businesses or services",
                    imeAction = ImeAction.Search,
                )
                if (state.nearbyError != null) {
                    Text(
                        text = state.nearbyError.orEmpty(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            FilterChipsRow(
                categories = (state.categories as? ScreenState.Content)?.data.orEmpty(),
                selectedCategory = state.selectedCategory,
                nearbyOn = state.nearby != null,
                isLoadingNearby = state.isLoadingNearby,
                verifiedOnly = state.verifiedOnly,
                onCategorySelected = viewModel::onCategorySelected,
                onNearYouToggled = { if (state.nearby != null) viewModel.clearNearby() else viewModel.onNearYouRequested() },
                onVerifiedToggled = viewModel::onVerifiedOnlyToggled,
            )
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

@Composable
private fun FilterChipsRow(
    categories: List<BusinessCategoryDto>,
    selectedCategory: String?,
    nearbyOn: Boolean,
    isLoadingNearby: Boolean,
    verifiedOnly: Boolean,
    onCategorySelected: (String?) -> Unit,
    onNearYouToggled: () -> Unit,
    onVerifiedToggled: () -> Unit,
) {
    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            FilterChip(
                label = "Near you",
                selected = nearbyOn,
                onClick = onNearYouToggled,
                leading = {
                    if (isLoadingNearby) {
                        CircularProgressIndicator(modifier = Modifier.padding(end = 4.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.NearMe, contentDescription = null, modifier = Modifier.padding(end = 4.dp))
                    }
                },
            )
        }
        item {
            FilterChip(
                label = "Verified",
                selected = verifiedOnly,
                onClick = onVerifiedToggled,
                leading = { Icon(Icons.Default.Verified, contentDescription = null, modifier = Modifier.padding(end = 4.dp)) },
                modifier = Modifier.testTag(SearchResultsScreenTestTags.VERIFIED_FILTER),
            )
        }
        items(categories, key = { it.code }) { category ->
            FilterChip(label = category.name, selected = selectedCategory == category.code, onClick = { onCategorySelected(category.code) })
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        modifier = modifier.clickable(onClick = onClick),
    ) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            leading?.invoke()
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

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
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(business.displayName, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            if (business.verificationStatus == "VERIFIED") {
                Icon(
                    Icons.Default.Verified,
                    contentDescription = "Verified",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
        if (business.categories.isNotEmpty()) {
            Text(
                business.categories.joinToString(" • "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
