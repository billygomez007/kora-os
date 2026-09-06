package com.realtegic.kora.feature.workspace

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Storefront
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.EmptyStateView
import com.realtegic.kora.core.designsystem.ErrorStateView
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextButton
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.model.WorkspaceOrganizationDto

object WorkspaceChooserScreenTestTags {
    const val CUSTOMER_ROW = "workspace_chooser_customer_row"
    const val CONTINUE_BUTTON = "workspace_chooser_continue_button"
    const val SIGN_IN_DIFFERENT_EMAIL = "workspace_chooser_sign_in_different_email"
}

/**
 * Matches `docs/design/mobile-auth/kora-auth-workspace-selection-reference.png`
 * (docs task Phase 6). Every row comes straight from the server's own
 * `GET /v1/me/workspaces` response -- there is no hardcoded organization
 * name, role, location, or logo anywhere here, unlike the sample data
 * shown in the reference image itself. Tapping a row only highlights it;
 * the separate "Continue to workspace" tap is what actually persists the
 * selection and navigates, so a selection is never applied by accident.
 */
@Composable
fun WorkspaceChooserScreen(
    viewModel: WorkspaceViewModel,
    onCustomerSelected: () -> Unit,
    onOrganizationSelected: (String) -> Unit,
    onCreateBusiness: () -> Unit,
    onSignInDifferentEmail: () -> Unit,
) {
    val screenState by viewModel.state.collectAsState()
    val selectedRow by viewModel.selectedRow.collectAsState()

    Scaffold { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
            when (val state = screenState) {
                is ScreenState.Loading, ScreenState.Initial -> LoadingStateView()
                is ScreenState.Error -> ErrorStateView(error = state.error, onRetry = viewModel::load)
                is ScreenState.Content -> {
                    val workspaces = state.data
                    if (workspaces.organizations.isEmpty() && !workspaces.customerWorkspaceAvailable) {
                        EmptyStateView(
                            title = "No workspaces available",
                            subtitle = "Contact your organization owner for access, or create your own business.",
                            action = { KoraPrimaryButton(text = "Create a business", onClick = onCreateBusiness) },
                        )
                    } else {
                        WorkspaceChooserContent(
                            workspaces = workspaces,
                            selectedRow = selectedRow,
                            onRowSelected = viewModel::selectRow,
                            onContinue = { viewModel.confirmSelection(onCustomer = onCustomerSelected, onOrganization = onOrganizationSelected) },
                            onCreateBusiness = onCreateBusiness,
                            onSignInDifferentEmail = { viewModel.signOut(onSignInDifferentEmail) },
                        )
                    }
                }
                ScreenState.Empty, ScreenState.AuthenticationExpired -> Unit
            }
        }
    }
}

@Composable
private fun WorkspaceChooserContent(
    workspaces: MyWorkspacesDto,
    selectedRow: SelectedWorkspaceRow?,
    onRowSelected: (SelectedWorkspaceRow) -> Unit,
    onContinue: () -> Unit,
    onCreateBusiness: () -> Unit,
    onSignInDifferentEmail: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .statusBarsPadding()
                .displayCutoutPadding()
                .padding(horizontal = 24.dp, vertical = 16.dp),
        ) {
            Row {
                Image(painter = painterResource(R.drawable.kora_logo), contentDescription = null, modifier = Modifier.size(32.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("KORA", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onBackground)
                Text(" OS", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = "Choose a workspace",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Select where you want to continue.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (workspaces.customerWorkspaceAvailable) {
                item {
                    CustomerWorkspaceRow(
                        isSelected = selectedRow == SelectedWorkspaceRow.Customer,
                        onClick = { onRowSelected(SelectedWorkspaceRow.Customer) },
                    )
                }
            }
            if (workspaces.organizations.isNotEmpty()) {
                item {
                    Text(
                        text = "Business workspaces",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 4.dp),
                    )
                }
            }
            items(workspaces.organizations) { org: WorkspaceOrganizationDto ->
                BusinessWorkspaceRow(
                    organization = org,
                    isSelected = selectedRow == SelectedWorkspaceRow.Organization(org.organizationId),
                    onClick = { onRowSelected(SelectedWorkspaceRow.Organization(org.organizationId)) },
                )
            }
        }

        Column(
            modifier = Modifier
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            KoraPrimaryButton(
                text = "Continue to workspace",
                onClick = onContinue,
                enabled = selectedRow != null,
                modifier = Modifier.fillMaxWidth().testTag(WorkspaceChooserScreenTestTags.CONTINUE_BUTTON),
            )
            KoraTextButton(
                text = "Sign in with a different email",
                onClick = onSignInDifferentEmail,
                modifier = Modifier.testTag(WorkspaceChooserScreenTestTags.SIGN_IN_DIFFERENT_EMAIL),
            )
            KoraTextButton(text = "Create a new business", onClick = onCreateBusiness)
        }
    }
}

@Composable
private fun CustomerWorkspaceRow(isSelected: Boolean, onClick: () -> Unit) {
    WorkspaceRowCard(isSelected = isSelected, onClick = onClick, modifier = Modifier.testTag(WorkspaceChooserScreenTestTags.CUSTOMER_ROW)) {
        WorkspaceRowIcon(icon = Icons.Default.Person)
        Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Customer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Spacer(modifier = Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .padding(horizontal = 10.dp, vertical = 2.dp),
                ) {
                    Text("Personal", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
            Text("Find and book services", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        SelectionIndicator(isSelected = isSelected)
    }
}

@Composable
private fun BusinessWorkspaceRow(organization: WorkspaceOrganizationDto, isSelected: Boolean, onClick: () -> Unit) {
    WorkspaceRowCard(isSelected = isSelected, onClick = onClick) {
        if (organization.logoUrl != null) {
            AsyncImage(
                model = organization.logoUrl,
                contentDescription = null,
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)),
            )
        } else {
            WorkspaceRowIcon(icon = Icons.Default.Storefront)
        }
        Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
            Text(organization.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            val role = organization.roleCodes.firstOrNull()?.replaceFirstChar(Char::uppercase)
            val branch = organization.branches.firstOrNull()?.name
            val subtitle = listOfNotNull(role, branch).joinToString(" • ")
            if (subtitle.isNotEmpty()) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        SelectionIndicator(isSelected = isSelected)
    }
}

@Composable
private fun WorkspaceRowCard(
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = if (isSelected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, content = content)
    }
}

@Composable
private fun WorkspaceRowIcon(icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Box(
        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
private fun SelectionIndicator(isSelected: Boolean) {
    if (isSelected) {
        Box(
            modifier = Modifier.size(24.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.Check, contentDescription = "Selected", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
        }
    } else {
        Box(modifier = Modifier.size(24.dp).clip(CircleShape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape))
    }
}
