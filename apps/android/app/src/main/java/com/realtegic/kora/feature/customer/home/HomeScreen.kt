package com.realtegic.kora.feature.customer.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraDateTimeFormatter
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import java.time.LocalTime

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onSearchTapped: () -> Unit,
    onNearYouTapped: () -> Unit,
    onCategoryTapped: (String) -> Unit,
    onBusinessTapped: (String) -> Unit,
    onProfileTapped: () -> Unit,
    onUpcomingAppointmentTapped: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            HomeHeader(
                displayName = state.customerDisplayName,
                locationLine = state.customerLocationLine,
                onProfileTapped = onProfileTapped,
            )
        }
        item {
            SearchBar(onSearchTapped = onSearchTapped, onNearYouTapped = onNearYouTapped)
        }
        item {
            VoiceSearchTeaser()
        }
        state.upcomingAppointment?.let { appointment ->
            item {
                UpcomingAppointmentCard(
                    businessTimeZone = appointment.branchTimeZone,
                    startAtIso = appointment.startAt,
                    serviceName = appointment.items.firstOrNull()?.serviceName ?: "Appointment",
                    onClick = { onUpcomingAppointmentTapped(appointment.id) },
                )
            }
        }
        item {
            when (val categories = state.categories) {
                is ScreenState.Content -> CategoriesRow(categories.data, onCategoryTapped)
                else -> Unit
            }
        }
        item {
            Text(
                text = "Featured near you",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
        when (val featured = state.featured) {
            is ScreenState.Loading, ScreenState.Initial -> item { LoadingStateView(modifier = Modifier.height(200.dp)) }
            is ScreenState.Error -> item { ErrorStateView(error = featured.error, onRetry = viewModel::load, modifier = Modifier.height(200.dp)) }
            ScreenState.Empty -> item {
                Text(
                    text = "No businesses to show yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
            is ScreenState.Content -> items(featured.data) { business ->
                BusinessRow(business = business, onClick = { onBusinessTapped(business.slug) })
            }
            ScreenState.AuthenticationExpired -> Unit
        }
    }
}

private fun timeOfDayGreeting(): String = when (LocalTime.now().hour) {
    in 0..11 -> "Good morning"
    in 12..16 -> "Good afternoon"
    else -> "Good evening"
}

object HomeScreenTestTags {
    const val ACCOUNT_BUTTON = "home_account_button"
    const val VOICE_SEARCH_TEASER = "home_voice_search_teaser"
}

@Composable
private fun HomeHeader(displayName: String?, locationLine: String?, onProfileTapped: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                text = if (displayName != null) "${timeOfDayGreeting()}, $displayName" else timeOfDayGreeting(),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (locationLine != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                    Text(locationLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 2.dp))
                }
            }
        }
        IconButton(onClick = onProfileTapped, modifier = Modifier.testTag(HomeScreenTestTags.ACCOUNT_BUTTON)) {
            Icon(Icons.Default.AccountCircle, contentDescription = "Account", tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun SearchBar(onSearchTapped: () -> Unit, onNearYouTapped: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(MaterialTheme.colorScheme.surface)
                .clickable(onClick = onSearchTapped)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = "Search businesses or services",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
        Row(
            modifier = Modifier
                .padding(top = 12.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(onClick = onNearYouTapped)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.NearMe, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            Text(text = "Near you", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

/**
 * Matches the "Tell Kora what you need" card position from
 * `kora-customer-home-reference.png`, but deliberately not functional
 * (docs task Batch 02: "Do not expose a functioning voice button or
 * pretend AI search works... Hide or honestly feature-gate the voice
 * entry point until a separate secure AI stage is approved"). Tapping it
 * only explains that this is coming later -- no microphone permission is
 * ever requested and no capture ever starts.
 */
@Composable
private fun VoiceSearchTeaser() {
    var showExplanation by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable { showExplanation = true }
            .padding(16.dp)
            .testTag(HomeScreenTestTags.VOICE_SEARCH_TEASER),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.Mic, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text("Voice search", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            Text("Coming soon", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (showExplanation) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showExplanation = false },
            title = { Text("Voice search is coming soon") },
            text = { Text("We're building a secure way to search by voice. It isn't available yet.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = { showExplanation = false }) { Text("Got it") }
            },
        )
    }
}

@Composable
private fun CategoriesRow(categories: List<BusinessCategoryDto>, onCategoryTapped: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(categories) { category ->
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.clickable { onCategoryTapped(category.code) },
            ) {
                Text(
                    text = category.name,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun BusinessRow(business: DiscoveryBusinessSummaryDto, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (business.logoImageUrl != null) {
                AsyncImage(
                    model = business.logoImageUrl,
                    contentDescription = business.displayName,
                    modifier = Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)),
                )
            } else {
                Box(
                    modifier = Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Storefront, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(modifier = Modifier.padding(start = 12.dp)) {
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
    }
}

@Composable
private fun UpcomingAppointmentCard(
    businessTimeZone: String,
    startAtIso: String,
    serviceName: String,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text("Upcoming: $serviceName", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text(
                    KoraDateTimeFormatter.formatDayTimeWithZone(startAtIso, businessTimeZone),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
    }
}
