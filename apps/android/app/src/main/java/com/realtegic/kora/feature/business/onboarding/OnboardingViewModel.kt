package com.realtegic.kora.feature.business.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.OrganizationsRepository
import com.realtegic.kora.core.data.SchedulingRepository
import com.realtegic.kora.core.data.ServiceCatalogueRepository
import com.realtegic.kora.core.data.StaffRepository
import com.realtegic.kora.core.designsystem.MoneyParser
import com.realtegic.kora.core.model.AssignableRoleDto
import com.realtegic.kora.core.model.BusinessHoursIntervalDto
import com.realtegic.kora.core.model.CreateOrganizationRequest
import com.realtegic.kora.core.model.CreatePrimaryBranchRequest
import com.realtegic.kora.core.model.CreateServiceRequest
import com.realtegic.kora.core.model.CreateStaffInvitationRequest
import com.realtegic.kora.core.model.OrganizationSetupStatusDto
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.preferences.LocalPreferences
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class OnboardingStep { BASICS, SERVICES, HOURS, TEAM, REVIEW, COMPLETE }

data class DayHoursForm(
    val isOpen: Boolean = false,
    val startLocalTime: String = "09:00",
    val endLocalTime: String = "17:00",
)

data class OnboardingUiState(
    val isResuming: Boolean = true,
    val step: OnboardingStep = OnboardingStep.BASICS,

    // Basics + first branch (submitted together, atomically).
    val businessName: String = "",
    val slug: String = "",
    val businessType: String = "",
    val defaultCurrency: String = "GHS",
    val timeZone: String = "Africa/Accra",
    val countryCode: String = "GH",
    val branchName: String = "Main Branch",
    val branchCode: String = "MAIN",
    val isSubmittingBasics: Boolean = false,
    val basicsError: DomainError? = null,

    val organizationId: String? = null,
    val organizationName: String? = null,
    val primaryBranchId: String? = null,

    // Services.
    val newServiceName: String = "",
    val newServiceDurationMinutes: String = "30",
    val newServicePriceMajor: String = "",
    val addedServices: List<ServiceDto> = emptyList(),
    val isSubmittingService: Boolean = false,
    val serviceError: DomainError? = null,

    // Hours.
    val hours: Map<Int, DayHoursForm> = defaultWeek(),
    val isSavingHours: Boolean = false,
    val hoursError: DomainError? = null,
    val hoursSaved: Boolean = false,

    // Team (optional).
    val assignableRoles: List<AssignableRoleDto> = emptyList(),
    val inviteEmail: String = "",
    val selectedRoleId: String? = null,
    val isSendingInvite: Boolean = false,
    val inviteError: DomainError? = null,
    val lastInvitationSent: Boolean = false,
    /** Shown once right after creation, same as `TeamViewModel`'s
     * equivalent field -- never persisted, cleared on dismissal. */
    val pendingInvitationLink: String? = null,

    val setupStatus: OrganizationSetupStatusDto? = null,
)

private fun defaultWeek(): Map<Int, DayHoursForm> =
    (0..6).associateWith { day -> DayHoursForm(isOpen = day in 1..6) } // closed Sunday by default, open Mon-Sat

/**
 * A resumable, multi-step business onboarding wizard (docs task
 * "Business Owner Onboarding"). Business basics and the first branch
 * are submitted together as one atomic `POST /v1/organizations` call
 * (the backend itself creates the organization, owner membership, and
 * primary branch inside a single transaction) -- there is no separate
 * "create branch" step because none exists server-side yet for a first
 * branch. Every later step (services, hours, team) operates against the
 * now-created organization through its own already-existing endpoint.
 *
 * Resumability: [LocalPreferences.onboardingOrganizationId] is a
 * non-sensitive UX convenience only, remembered purely so reopening this
 * screen does not create a second organization -- the actual step shown
 * is always recomputed from the server's own `setup-status` response,
 * never from a locally cached flag.
 */
class OnboardingViewModel(
    private val organizationsRepository: OrganizationsRepository,
    private val serviceCatalogueRepository: ServiceCatalogueRepository,
    private val schedulingRepository: SchedulingRepository,
    private val staffRepository: StaffRepository,
    private val localPreferences: LocalPreferences,
) : ViewModel() {
    private val _state = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = _state.asStateFlow()

    private var basicsIdempotencyKey: String? = null
    private var basicsSnapshot: String? = null

    init {
        resume()
    }

    private fun resume() {
        viewModelScope.launch {
            val organizationId = localPreferences.onboardingOrganizationId.first()
            if (organizationId == null) {
                _state.value = _state.value.copy(isResuming = false)
                return@launch
            }
            when (val orgResult = organizationsRepository.get(organizationId)) {
                is ApiResult.Success -> {
                    val statusResult = organizationsRepository.getSetupStatus(organizationId)
                    val status = (statusResult as? ApiResult.Success)?.value
                    val branchesResult = organizationsRepository.listBranches(organizationId)
                    val primaryBranchId = (branchesResult as? ApiResult.Success)?.value?.firstOrNull()?.id
                    _state.value = _state.value.copy(
                        isResuming = false,
                        organizationId = organizationId,
                        organizationName = orgResult.value.name,
                        setupStatus = status,
                        primaryBranchId = primaryBranchId,
                        step = status?.let(::stepForStatus) ?: OnboardingStep.BASICS,
                    )
                    if (status != null) loadServicesIfNeeded(organizationId)
                }
                is ApiResult.Failure -> {
                    // The remembered organization is no longer reachable
                    // (deleted, or this account lost access) -- fall back
                    // to starting fresh rather than getting stuck.
                    localPreferences.clearOnboardingOrganizationId()
                    _state.value = _state.value.copy(isResuming = false)
                }
            }
        }
    }

    private fun stepForStatus(status: OrganizationSetupStatusDto): OnboardingStep = when {
        !status.serviceCreated -> OnboardingStep.SERVICES
        !status.branchHoursConfigured -> OnboardingStep.HOURS
        !status.staffInvitationSent -> OnboardingStep.TEAM
        else -> OnboardingStep.REVIEW
    }

    private suspend fun loadServicesIfNeeded(organizationId: String) {
        when (val result = serviceCatalogueRepository.listServices(organizationId)) {
            is ApiResult.Success -> _state.value = _state.value.copy(addedServices = result.value)
            is ApiResult.Failure -> Unit
        }
    }

    // ---- Step 1: business basics + first branch ----

    fun onBasicsChanged(
        businessName: String = _state.value.businessName,
        slug: String = _state.value.slug,
        businessType: String = _state.value.businessType,
        defaultCurrency: String = _state.value.defaultCurrency,
        timeZone: String = _state.value.timeZone,
        countryCode: String = _state.value.countryCode,
        branchName: String = _state.value.branchName,
        branchCode: String = _state.value.branchCode,
    ) {
        _state.value = _state.value.copy(
            businessName = businessName,
            slug = slug,
            businessType = businessType,
            defaultCurrency = defaultCurrency,
            timeZone = timeZone,
            countryCode = countryCode,
            branchName = branchName,
            branchCode = branchCode,
            basicsError = null,
        )
    }

    fun submitBasics() {
        val current = _state.value
        if (current.isSubmittingBasics) return
        if (current.businessName.isBlank() || current.slug.isBlank() || current.branchName.isBlank() || current.branchCode.isBlank()) {
            _state.value = current.copy(basicsError = DomainError.Validation("Fill in every required field."))
            return
        }
        val request = CreateOrganizationRequest(
            name = current.businessName.trim(),
            slug = current.slug.trim().lowercase(),
            businessType = current.businessType.ifBlank { "service_business" },
            defaultCurrency = current.defaultCurrency,
            timeZone = current.timeZone,
            countryCode = current.countryCode,
            primaryBranch = CreatePrimaryBranchRequest(name = current.branchName.trim(), code = current.branchCode.trim().uppercase()),
        )
        val snapshot = request.toString()
        if (basicsIdempotencyKey == null || basicsSnapshot != snapshot) {
            basicsIdempotencyKey = UUID.randomUUID().toString()
            basicsSnapshot = snapshot
        }
        val key = requireNotNull(basicsIdempotencyKey)

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmittingBasics = true, basicsError = null)
            when (val result = organizationsRepository.create(request, key)) {
                is ApiResult.Success -> {
                    val organizationId = result.value.organization.id
                    _state.value = _state.value.copy(
                        isSubmittingBasics = false,
                        organizationId = organizationId,
                        organizationName = result.value.organization.name,
                        primaryBranchId = result.value.primaryBranch.id,
                        step = OnboardingStep.SERVICES,
                    )
                    // Persisted after the state update, not before: this
                    // is a resumability convenience only, and the caller
                    // (and every test) should see the wizard advance
                    // immediately rather than waiting on a local disk
                    // write it does not otherwise depend on.
                    localPreferences.setOnboardingOrganizationId(organizationId)
                }
                is ApiResult.Failure -> {
                    // A slug conflict can never succeed unchanged -- the
                    // user must pick a different one, so a resubmission
                    // is necessarily a different request and needs a
                    // fresh key. Any other failure (network/server)
                    // keeps the same key so a retry safely replays.
                    if (result.error is DomainError.Conflict && (result.error as DomainError.Conflict).code == "ORGANIZATION_SLUG_TAKEN") {
                        basicsIdempotencyKey = null
                    }
                    _state.value = _state.value.copy(isSubmittingBasics = false, basicsError = result.error)
                }
            }
        }
    }

    // ---- Step 2: services (optional) ----

    fun onNewServiceChanged(name: String = _state.value.newServiceName, durationMinutes: String = _state.value.newServiceDurationMinutes, priceMajor: String = _state.value.newServicePriceMajor) {
        _state.value = _state.value.copy(newServiceName = name, newServiceDurationMinutes = durationMinutes, newServicePriceMajor = priceMajor, serviceError = null)
    }

    fun addService() {
        val organizationId = _state.value.organizationId ?: return
        val current = _state.value
        val durationMinutes = current.newServiceDurationMinutes.toIntOrNull()
        val priceMinor = MoneyParser.parseMinorUnits(current.newServicePriceMajor, current.defaultCurrency)
        if (current.newServiceName.isBlank() || durationMinutes == null || durationMinutes <= 0 || priceMinor == null) {
            _state.value = current.copy(serviceError = DomainError.Validation("Enter a name, a duration in minutes, and a price."))
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmittingService = true, serviceError = null)
            val request = CreateServiceRequest(
                name = current.newServiceName.trim(),
                durationMinutes = durationMinutes,
                priceMinor = priceMinor,
                currency = current.defaultCurrency,
            )
            when (val result = serviceCatalogueRepository.createService(organizationId, request)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(
                        isSubmittingService = false,
                        addedServices = _state.value.addedServices + result.value,
                        newServiceName = "",
                        newServiceDurationMinutes = "30",
                        newServicePriceMajor = "",
                    )
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isSubmittingService = false, serviceError = result.error)
            }
        }
    }

    fun proceedFromServices() {
        _state.value = _state.value.copy(step = OnboardingStep.HOURS)
    }

    // ---- Step 3: business hours (optional) ----

    fun onDayHoursChanged(dayOfWeek: Int, hours: DayHoursForm) {
        _state.value = _state.value.copy(hours = _state.value.hours + (dayOfWeek to hours), hoursSaved = false, hoursError = null)
    }

    fun saveHours() {
        val organizationId = _state.value.organizationId ?: return
        val branchId = _state.value.primaryBranchId ?: return
        val intervals = _state.value.hours.filterValues { it.isOpen }.map { (day, hours) ->
            BusinessHoursIntervalDto(dayOfWeek = day, startLocalTime = hours.startLocalTime, endLocalTime = hours.endLocalTime)
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSavingHours = true, hoursError = null)
            when (val result = schedulingRepository.replaceBusinessHours(organizationId, branchId, intervals)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSavingHours = false, hoursSaved = true)
                is ApiResult.Failure -> _state.value = _state.value.copy(isSavingHours = false, hoursError = result.error)
            }
        }
    }

    fun proceedFromHours() {
        _state.value = _state.value.copy(step = OnboardingStep.TEAM)
        loadAssignableRoles()
    }

    // ---- Step 4: invite staff (optional) ----

    private fun loadAssignableRoles() {
        val organizationId = _state.value.organizationId ?: return
        viewModelScope.launch {
            when (val result = staffRepository.getAssignableRoles(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    assignableRoles = result.value,
                    selectedRoleId = _state.value.selectedRoleId ?: result.value.firstOrNull { it.code == "manager" }?.id,
                )
                is ApiResult.Failure -> Unit
            }
        }
    }

    fun onInviteChanged(email: String = _state.value.inviteEmail, roleId: String? = _state.value.selectedRoleId) {
        _state.value = _state.value.copy(inviteEmail = email, selectedRoleId = roleId, inviteError = null)
    }

    fun sendInvite() {
        val organizationId = _state.value.organizationId ?: return
        val current = _state.value
        val roleId = current.selectedRoleId
        if (current.inviteEmail.isBlank() || roleId == null) {
            _state.value = current.copy(inviteError = DomainError.Validation("Enter an email and choose a role."))
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSendingInvite = true, inviteError = null)
            val request = CreateStaffInvitationRequest(email = current.inviteEmail.trim(), roleId = roleId, branchId = current.primaryBranchId)
            when (val result = staffRepository.createInvitation(organizationId, request)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    isSendingInvite = false,
                    lastInvitationSent = true,
                    inviteEmail = "",
                    pendingInvitationLink = "kora://invite/${result.value.rawToken}",
                )
                is ApiResult.Failure -> _state.value = _state.value.copy(isSendingInvite = false, inviteError = result.error)
            }
        }
    }

    fun dismissInvitationLink() {
        _state.value = _state.value.copy(pendingInvitationLink = null)
    }

    fun proceedFromTeam() {
        _state.value = _state.value.copy(step = OnboardingStep.REVIEW)
    }

    // ---- Step 5/6: review and complete ----

    fun complete() {
        viewModelScope.launch {
            localPreferences.clearOnboardingOrganizationId()
            _state.value = _state.value.copy(step = OnboardingStep.COMPLETE)
        }
    }
}
