package com.realtegic.kora.feature.business.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.realtegic.kora.core.designsystem.KoraPrimaryButton
import com.realtegic.kora.core.designsystem.KoraSecondaryButton
import com.realtegic.kora.core.designsystem.KoraTextField
import com.realtegic.kora.core.designsystem.KoraTopBar
import com.realtegic.kora.core.designsystem.LoadingStateView
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.ui.theme.StatusGreen

private val DAY_NAMES = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

@Composable
fun OnboardingScreen(viewModel: OnboardingViewModel, onBack: () -> Unit, onDone: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(topBar = { KoraTopBar(title = "Create your business", onBack = onBack) }) { padding ->
        if (state.isResuming) {
            LoadingStateView(modifier = Modifier.padding(padding))
            return@Scaffold
        }
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            StepProgress(state.step)
            when (state.step) {
                OnboardingStep.BASICS -> BasicsStep(state, viewModel)
                OnboardingStep.SERVICES -> ServicesStep(state, viewModel)
                OnboardingStep.HOURS -> HoursStep(state, viewModel)
                OnboardingStep.TEAM -> TeamStep(state, viewModel)
                OnboardingStep.REVIEW -> ReviewStep(state, viewModel)
                OnboardingStep.COMPLETE -> CompleteStep(state, onDone)
            }
        }
    }
}

@Composable
private fun StepProgress(step: OnboardingStep) {
    if (step == OnboardingStep.COMPLETE) return
    val steps = listOf(OnboardingStep.BASICS, OnboardingStep.SERVICES, OnboardingStep.HOURS, OnboardingStep.TEAM, OnboardingStep.REVIEW)
    val labels = listOf("Business", "Services", "Hours", "Team", "Review")
    Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        steps.forEachIndexed { index, s ->
            val isCurrentOrDone = steps.indexOf(step) >= index
            Text(
                labels[index],
                style = MaterialTheme.typography.labelSmall,
                color = if (isCurrentOrDone) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun BasicsStep(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Tell us about your business", style = MaterialTheme.typography.titleLarge)
        KoraTextField(value = state.businessName, onValueChange = { viewModel.onBasicsChanged(businessName = it) }, label = "Business name")
        KoraTextField(
            value = state.slug,
            onValueChange = { viewModel.onBasicsChanged(slug = it) },
            label = "Web address (letters, numbers, hyphens)",
            supportingText = "kora.app/${state.slug.ifBlank { "your-business" }}",
        )
        KoraTextField(value = state.businessType, onValueChange = { viewModel.onBasicsChanged(businessType = it) }, label = "Business category (e.g. salon, barbershop, spa)")
        Text("First branch", style = MaterialTheme.typography.titleMedium)
        KoraTextField(value = state.branchName, onValueChange = { viewModel.onBasicsChanged(branchName = it) }, label = "Branch name")
        KoraTextField(value = state.branchCode, onValueChange = { viewModel.onBasicsChanged(branchCode = it) }, label = "Branch code (short, e.g. MAIN)")
        KoraTextField(value = state.countryCode, onValueChange = { viewModel.onBasicsChanged(countryCode = it.uppercase()) }, label = "Country code (2 letters)")
        KoraTextField(value = state.timeZone, onValueChange = { viewModel.onBasicsChanged(timeZone = it) }, label = "Time zone (e.g. Africa/Accra)")
        KoraTextField(value = state.defaultCurrency, onValueChange = { viewModel.onBasicsChanged(defaultCurrency = it.uppercase()) }, label = "Currency code (3 letters, e.g. GHS)")
        state.basicsError?.let { ErrorText(it.message) }
        KoraPrimaryButton(
            text = "Continue",
            onClick = viewModel::submitBasics,
            isLoading = state.isSubmittingBasics,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ServicesStep(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Add your services", style = MaterialTheme.typography.titleLarge)
        Text(
            "Add at least one service now, or skip and add services later from your business dashboard.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LazyColumn(modifier = Modifier.weight(1f)) {
            items(state.addedServices, key = ServiceDto::id) { service ->
                Surface(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(service.name, style = MaterialTheme.typography.bodyLarge)
                        Text("${service.durationMinutes} min", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        KoraTextField(value = state.newServiceName, onValueChange = { viewModel.onNewServiceChanged(name = it) }, label = "Service name")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KoraTextField(
                value = state.newServiceDurationMinutes,
                onValueChange = { viewModel.onNewServiceChanged(durationMinutes = it) },
                label = "Duration (min)",
                keyboardType = KeyboardType.Number,
                modifier = Modifier.weight(1f),
            )
            KoraTextField(
                value = state.newServicePriceMajor,
                onValueChange = { viewModel.onNewServiceChanged(priceMajor = it) },
                label = "Price (${state.defaultCurrency})",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }
        state.serviceError?.let { ErrorText(it.message) }
        KoraSecondaryButton(text = "Add service", onClick = viewModel::addService, enabled = !state.isSubmittingService, modifier = Modifier.fillMaxWidth())
        KoraPrimaryButton(text = "Continue", onClick = viewModel::proceedFromServices, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun HoursStep(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Set your business hours", style = MaterialTheme.typography.titleLarge)
        Text(
            "Optional -- you can configure hours later. Times are your branch's own local time.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        DAY_NAMES.forEachIndexed { day, name ->
            val hours = state.hours[day] ?: DayHoursForm()
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = hours.isOpen, onCheckedChange = { viewModel.onDayHoursChanged(day, hours.copy(isOpen = it)) })
                Text(name, modifier = Modifier.weight(1f))
                if (hours.isOpen) {
                    KoraTextField(
                        value = hours.startLocalTime,
                        onValueChange = { viewModel.onDayHoursChanged(day, hours.copy(startLocalTime = it)) },
                        label = "Open",
                        modifier = Modifier.weight(1f),
                    )
                    KoraTextField(
                        value = hours.endLocalTime,
                        onValueChange = { viewModel.onDayHoursChanged(day, hours.copy(endLocalTime = it)) },
                        label = "Close",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        state.hoursError?.let { ErrorText(it.message) }
        if (state.hoursSaved) {
            Text("Hours saved.", color = StatusGreen, style = MaterialTheme.typography.bodySmall)
        }
        KoraSecondaryButton(text = "Save hours", onClick = viewModel::saveHours, enabled = !state.isSavingHours, modifier = Modifier.fillMaxWidth())
        KoraPrimaryButton(text = "Continue", onClick = viewModel::proceedFromHours, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun TeamStep(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Invite your team", style = MaterialTheme.typography.titleLarge)
        Text(
            "Optional -- you can finish setup alone and invite staff later.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KoraTextField(value = state.inviteEmail, onValueChange = { viewModel.onInviteChanged(email = it) }, label = "Staff email", keyboardType = KeyboardType.Email)
        Text("Role", style = MaterialTheme.typography.labelLarge)
        state.assignableRoles.forEach { role ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = state.selectedRoleId == role.id, onCheckedChange = { viewModel.onInviteChanged(roleId = role.id) })
                Text(role.name)
            }
        }
        state.inviteError?.let { ErrorText(it.message) }
        if (state.lastInvitationSent) {
            Text("Invitation sent.", color = StatusGreen, style = MaterialTheme.typography.bodySmall)
        }
        KoraSecondaryButton(text = "Send invitation", onClick = viewModel::sendInvite, enabled = !state.isSendingInvite, modifier = Modifier.fillMaxWidth())
        KoraPrimaryButton(text = "Continue", onClick = viewModel::proceedFromTeam, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun ReviewStep(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Review", style = MaterialTheme.typography.titleLarge)
        Text(state.organizationName ?: "", style = MaterialTheme.typography.titleMedium)
        Text("${state.addedServices.size} service(s) added", style = MaterialTheme.typography.bodyMedium)
        Text(
            if (state.hoursSaved) "Business hours configured" else "Business hours not yet configured",
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            if (state.lastInvitationSent) "Team invitation sent" else "No staff invited yet",
            style = MaterialTheme.typography.bodyMedium,
        )
        KoraPrimaryButton(text = "Finish setup", onClick = viewModel::complete, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun CompleteStep(state: OnboardingUiState, onDone: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center) {
        Text("You're all set!", style = MaterialTheme.typography.headlineSmall)
        Text(
            "${state.organizationName} is ready. You can keep configuring your business anytime from its dashboard.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
        )
        KoraPrimaryButton(text = "Go to my business", onClick = onDone, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun ErrorText(message: String) {
    Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
}
