package com.realtegic.kora.feature.business.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BusinessProfileVisibility

@Composable
fun BusinessProfileScreen(viewModel: BusinessProfileViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Business profile", onBack = onBack) }) { padding ->
        when (val profile = state.profile) {
            ScreenState.Initial, ScreenState.Loading -> LoadingStateView(modifier = Modifier.padding(padding))
            is ScreenState.Error -> ErrorStateView(error = profile.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is ScreenState.Content -> {
                val currentVisibility = profile.data?.visibility ?: BusinessProfileVisibility.PRIVATE
                val isPublished = profile.data?.publishedAt != null
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (profile.data == null) {
                        Text(
                            "Your business profile has not been configured yet. Customers cannot find your business until you save and publish it.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    KoraTextField(value = state.displayName, onValueChange = { viewModel.onFieldsChanged(displayName = it) }, label = "Public display name")
                    KoraTextField(
                        value = state.description,
                        onValueChange = { viewModel.onFieldsChanged(description = it) },
                        label = "Description",
                        singleLine = false,
                    )
                    state.saveError?.let { Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    KoraPrimaryButton(text = "Save", onClick = viewModel::save, isLoading = state.isSaving, modifier = Modifier.fillMaxWidth())

                    if (profile.data != null) {
                        Text("Visibility", style = MaterialTheme.typography.titleMedium)
                        VisibilityOption(
                            label = "Private -- not visible to customers",
                            selected = currentVisibility == BusinessProfileVisibility.PRIVATE,
                            onSelect = { viewModel.setVisibility(BusinessProfileVisibility.PRIVATE) },
                        )
                        VisibilityOption(
                            label = "Link only -- reachable only by direct link, never in search",
                            selected = currentVisibility == BusinessProfileVisibility.LINK_ONLY,
                            onSelect = { viewModel.setVisibility(BusinessProfileVisibility.LINK_ONLY) },
                        )
                        VisibilityOption(
                            label = "Public -- searchable by customers",
                            selected = currentVisibility == BusinessProfileVisibility.PUBLIC,
                            onSelect = { viewModel.setVisibility(BusinessProfileVisibility.PUBLIC) },
                        )

                        Text(
                            if (isPublished) "Published" else "Not published",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        state.publishError?.let {
                            Text(it.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                        if (isPublished) {
                            KoraSecondaryButton(text = "Unpublish", onClick = viewModel::unpublish, enabled = !state.isPublishing, modifier = Modifier.fillMaxWidth())
                        } else {
                            KoraSecondaryButton(text = "Publish", onClick = viewModel::publish, enabled = !state.isPublishing, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
            ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
        }
    }
}

@Composable
private fun VisibilityOption(label: String, selected: Boolean, onSelect: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}
