package com.realtegic.kora.core.designsystem

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.Modifier
import com.realtegic.kora.core.navigation.KoraRoutes

/**
 * The customer workspace's own primary navigation shell (docs task
 * Customer Marketplace Design Batch 02 Phase 5) -- entirely separate
 * from the permission-driven business bottom bar
 * (`core/designsystem` has no dependency the other way). Favorites is
 * included as a real tab, not omitted, because it is backed by a real,
 * tested `/me/favorites` API (`FavoritesRepository`,
 * `FavoritesViewModelTest`) -- the one condition the task set for
 * showing it at all.
 */
enum class CustomerTab(val route: String, val label: String, val icon: ImageVector, val testTag: String) {
    HOME(KoraRoutes.CUSTOMER_HOME, "Home", Icons.Default.Home, "customer_tab_home"),
    SEARCH(KoraRoutes.CUSTOMER_SEARCH, "Search", Icons.Default.Search, "customer_tab_search"),
    APPOINTMENTS(KoraRoutes.CUSTOMER_APPOINTMENTS, "Appointments", Icons.Default.CalendarMonth, "customer_tab_appointments"),
    FAVORITES(KoraRoutes.CUSTOMER_FAVORITES, "Favorites", Icons.Default.Favorite, "customer_tab_favorites"),
    PROFILE(KoraRoutes.CUSTOMER_PROFILE, "Profile", Icons.Default.Person, "customer_tab_profile"),
}

@Composable
fun CustomerBottomNavBar(currentRoute: String?, onTabSelected: (CustomerTab) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        CustomerTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = currentRoute == tab.route,
                onClick = { onTabSelected(tab) },
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                ),
                modifier = Modifier.testTag(tab.testTag),
            )
        }
    }
}
