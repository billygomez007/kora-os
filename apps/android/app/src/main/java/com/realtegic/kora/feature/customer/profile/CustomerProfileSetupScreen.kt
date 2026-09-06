package com.realtegic.kora.feature.customer.profile

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.realtegic.kora.R
import com.realtegic.kora.core.designsystem.KoraAuthBackground
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraTextField

object CustomerProfileSetupScreenTestTags {
    const val FULL_NAME_FIELD = "customer_profile_full_name_field"
    const val COUNTRY_CODE_FIELD = "customer_profile_country_code_field"
    const val PHONE_FIELD = "customer_profile_phone_field"
    const val AREA_FIELD = "customer_profile_area_field"
    const val CITY_FIELD = "customer_profile_city_field"
    const val LOCATION_CHECKBOX = "customer_profile_location_checkbox"
    const val SAVE_BUTTON = "customer_profile_save_button"
}

/**
 * Matches `docs/design/mobile-auth/kora-auth-customer-profile-reference.png`,
 * with two deliberate departures from that mockup (docs task Phase 7):
 * the reference's photo-upload control is replaced with a plain, static
 * avatar -- no photo/avatar field or upload endpoint exists anywhere in
 * the customer-profile backend contract, so a tappable control here would
 * only pretend to work -- and its combined "Location" text row is instead
 * two real backend fields (area, city), since that is what
 * `UpdateCustomerProfileRequest` actually accepts. Every field is
 * optional; "Save and continue" never blocks on a blank field, only on a
 * malformed phone number.
 */
@Composable
fun CustomerProfileSetupScreen(
    viewModel: CustomerProfileSetupViewModel,
    onSaved: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    val locationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.onLocationPermissionGranted() else viewModel.onLocationDisabled()
    }

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
            Image(painter = painterResource(R.drawable.kora_logo), contentDescription = null, modifier = Modifier.size(56.dp))
            Spacer(modifier = Modifier.height(8.dp))
            Row {
                Text("KORA", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onBackground)
                Text(" OS", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)
            }

            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Set up your profile",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Tell us a little about you so businesses can prepare for your bookings.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(24.dp))
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(48.dp),
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
            KoraTextField(
                value = state.fullName,
                onValueChange = viewModel::onFullNameChanged,
                label = "Full name",
                capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Words,
                modifier = Modifier.testTag(CustomerProfileSetupScreenTestTags.FULL_NAME_FIELD),
            )

            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Phone number",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(start = 4.dp, bottom = 4.dp),
            )
            Row(modifier = Modifier.fillMaxWidth()) {
                KoraTextField(
                    value = state.countryCode,
                    onValueChange = viewModel::onCountryCodeChanged,
                    label = "Code",
                    keyboardType = KeyboardType.Phone,
                    modifier = Modifier.width(96.dp).testTag(CustomerProfileSetupScreenTestTags.COUNTRY_CODE_FIELD),
                )
                Spacer(modifier = Modifier.width(12.dp))
                KoraTextField(
                    value = state.phoneLocalNumber,
                    onValueChange = viewModel::onPhoneChanged,
                    label = "Phone number",
                    placeholder = "24 123 4567",
                    keyboardType = KeyboardType.Phone,
                    isError = state.error is com.realtegic.kora.core.network.DomainError.Validation,
                    modifier = Modifier.weight(1f).testTag(CustomerProfileSetupScreenTestTags.PHONE_FIELD),
                )
            }
            Text(
                text = "Used only for booking updates.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp),
            )

            Spacer(modifier = Modifier.height(12.dp))
            KoraTextField(
                value = state.area,
                onValueChange = viewModel::onAreaChanged,
                label = "Area",
                placeholder = "East Legon",
                capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Words,
                modifier = Modifier.testTag(CustomerProfileSetupScreenTestTags.AREA_FIELD),
            )
            Spacer(modifier = Modifier.height(12.dp))
            KoraTextField(
                value = state.city,
                onValueChange = viewModel::onCityChanged,
                label = "City",
                placeholder = "Accra",
                capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Words,
                modifier = Modifier.testTag(CustomerProfileSetupScreenTestTags.CITY_FIELD),
            )

            Spacer(modifier = Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = state.locationEnabled,
                    onCheckedChange = { checked ->
                        if (checked) {
                            locationPermissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                        } else {
                            viewModel.onLocationDisabled()
                        }
                    },
                    modifier = Modifier.testTag(CustomerProfileSetupScreenTestTags.LOCATION_CHECKBOX),
                )
                Text(
                    text = "Use my location to show nearby businesses",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (state.isResolvingLocation) {
                    Spacer(modifier = Modifier.width(8.dp))
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                }
            }

            if (state.error != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = state.error?.message.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
            KoraPrimaryButton(
                text = "Save and continue",
                onClick = { viewModel.save(onSaved) },
                isLoading = state.isSaving,
                modifier = Modifier.fillMaxWidth().testTag(CustomerProfileSetupScreenTestTags.SAVE_BUTTON),
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "You can update these details later.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
