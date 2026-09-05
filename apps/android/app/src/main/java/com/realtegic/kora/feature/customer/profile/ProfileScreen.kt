package com.realtegic.kora.feature.customer.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.ManageAccounts
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.KoraTopBar

@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onFavorites: () -> Unit,
    onAccountSettings: () -> Unit,
    onSwitchWorkspace: () -> Unit,
    onCreateBusiness: () -> Unit,
    onSignedOut: () -> Unit,
) {
    val sessionState by viewModel.sessionState.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Profile") }) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(sessionState.displayNameOrDefault(), style = MaterialTheme.typography.titleLarge)
                sessionState.emailOrNull()?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Favorites") },
                leadingContent = { Icon(Icons.Default.Favorite, contentDescription = null) },
                modifier = Modifier.fillMaxWidth().clickable(onClick = onFavorites),
            )
            ListItem(
                headlineContent = { Text("Switch workspace") },
                leadingContent = { Icon(Icons.Default.SwapHoriz, contentDescription = null) },
                modifier = Modifier.fillMaxWidth().clickable(onClick = onSwitchWorkspace),
            )
            ListItem(
                headlineContent = { Text("Account & sessions") },
                leadingContent = { Icon(Icons.Default.ManageAccounts, contentDescription = null) },
                modifier = Modifier.fillMaxWidth().clickable(onClick = onAccountSettings),
            )
            ListItem(
                headlineContent = { Text("Create a business") },
                leadingContent = { Icon(Icons.Default.Add, contentDescription = null) },
                modifier = Modifier.fillMaxWidth().clickable(onClick = onCreateBusiness),
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Sign out", color = MaterialTheme.colorScheme.error) },
                leadingContent = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                modifier = Modifier.fillMaxWidth().clickable(onClick = { viewModel.signOut(onSignedOut) }),
            )
        }
    }
}
