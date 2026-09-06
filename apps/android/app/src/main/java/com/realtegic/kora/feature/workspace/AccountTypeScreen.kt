package com.realtegic.kora.feature.workspace

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.KoraAuthBackground
import com.realtegic.kora.core.designsystem.KoraPrimaryButton

object AccountTypeScreenTestTags {
    const val CUSTOMER_CARD = "account_type_customer_card"
    const val BUSINESS_CARD = "account_type_business_card"
    const val CONTINUE_BUTTON = "account_type_continue_button"
}

/**
 * Matches `docs/design/mobile-auth/kora-auth-account-type-reference.png`.
 * Shown only for a genuinely undecided, membership-less account (docs
 * task Phase 5: "Show this only when the authenticated user genuinely
 * needs to choose how to begin") -- wired from `KoraNavHost`'s
 * [com.realtegic.kora.feature.workspace.WorkspaceDecision.ShowAccountTypeChoice]
 * branch, which only fires when the server's own workspace list has zero
 * organizations and no locally remembered workspace preference exists
 * yet. A pending staff invitation always takes priority over this screen
 * and is never routed through it.
 */
@Composable
fun AccountTypeScreen(
    viewModel: AccountTypeViewModel,
    onCustomerContinue: () -> Unit,
    onBusinessContinue: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        KoraAuthBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .displayCutoutPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(24.dp))
            Image(painter = painterResource(R.drawable.kora_logo), contentDescription = null, modifier = Modifier.size(72.dp))
            Spacer(modifier = Modifier.height(12.dp))
            Row {
                Text("KORA", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onBackground)
                Text(" OS", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)
            }

            Spacer(modifier = Modifier.height(28.dp))
            Text(
                text = "How will you use Kora?",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Choose where you'd like to begin. You can add another workspace later.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(28.dp))
            AccountTypeCard(
                title = "I'm a customer",
                subtitle = "Discover businesses and book services near you.",
                primaryIcon = Icons.Default.Person,
                badgeIcon = Icons.Default.Search,
                isSelected = state.selected == AccountType.CUSTOMER,
                onClick = { viewModel.select(AccountType.CUSTOMER) },
                modifier = Modifier.testTag(AccountTypeScreenTestTags.CUSTOMER_CARD),
            )
            Spacer(modifier = Modifier.height(16.dp))
            AccountTypeCard(
                title = "I run or work for a business",
                subtitle = "Manage bookings, staff, payments and daily operations.",
                primaryIcon = Icons.Default.Storefront,
                badgeIcon = Icons.Default.Person,
                isSelected = state.selected == AccountType.BUSINESS,
                onClick = { viewModel.select(AccountType.BUSINESS) },
                modifier = Modifier.testTag(AccountTypeScreenTestTags.BUSINESS_CARD),
            )

            Spacer(modifier = Modifier.height(28.dp))
            KoraPrimaryButton(
                text = "Continue",
                onClick = { if (state.selected == AccountType.CUSTOMER) onCustomerContinue() else onBusinessContinue() },
                modifier = Modifier.fillMaxWidth().testTag(AccountTypeScreenTestTags.CONTINUE_BUTTON),
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "You can switch workspaces anytime.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun AccountTypeCard(
    title: String,
    subtitle: String,
    primaryIcon: ImageVector,
    badgeIcon: ImageVector,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = if (isSelected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                Icon(primaryIcon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(badgeIcon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                }
            }
            Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(
                Icons.AutoMirrored.Filled.ArrowForwardIos,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}
