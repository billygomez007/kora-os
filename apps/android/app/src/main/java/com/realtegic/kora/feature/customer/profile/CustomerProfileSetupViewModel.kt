package com.realtegic.kora.feature.customer.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.CustomerProfileRepository
import com.realtegic.kora.core.location.ApproximateLocationProvider
import com.realtegic.kora.core.location.LocationLookupResult
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.session.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val DEFAULT_COUNTRY_CODE = "+233"
private val E164_PATTERN = Regex("^\\+[1-9]\\d{6,14}$")

data class CustomerProfileSetupUiState(
    val fullName: String = "",
    val countryCode: String = DEFAULT_COUNTRY_CODE,
    val phoneLocalNumber: String = "",
    val city: String = "",
    val area: String = "",
    val locationEnabled: Boolean = false,
    val isResolvingLocation: Boolean = false,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val isSaving: Boolean = false,
    val error: DomainError? = null,
)

/**
 * Backs `kora-auth-customer-profile-reference.png` (docs task Phase 7).
 * Every field maps to a real `UpdateCustomerProfileRequest` property --
 * there is no separate client-only "onboarding complete" flag anywhere in
 * this class, since [phoneE164] being non-null on the saved server record
 * is itself the one real, honestly-derived signal this stage relies on.
 */
class CustomerProfileSetupViewModel(
    private val customerProfileRepository: CustomerProfileRepository,
    private val locationProvider: ApproximateLocationProvider,
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(CustomerProfileSetupUiState())
    val state: StateFlow<CustomerProfileSetupUiState> = _state.asStateFlow()

    fun onFullNameChanged(value: String) {
        _state.value = _state.value.copy(fullName = value.take(160), error = null)
    }

    fun onCountryCodeChanged(value: String) {
        val sanitized = "+" + value.filter(Char::isDigit)
        _state.value = _state.value.copy(countryCode = sanitized.take(5), error = null)
    }

    fun onPhoneChanged(value: String) {
        _state.value = _state.value.copy(phoneLocalNumber = value.filter(Char::isDigit).take(14), error = null)
    }

    fun onCityChanged(value: String) {
        _state.value = _state.value.copy(city = value.take(120), error = null)
    }

    fun onAreaChanged(value: String) {
        _state.value = _state.value.copy(area = value.take(120), error = null)
    }

    /** The system permission dialog has already been shown by the caller
     * by this point -- this only ever runs after a real grant, never
     * speculatively (docs task Phase 7: "explicitly requested and
     * optional, never automatic at startup"). */
    fun onLocationPermissionGranted() {
        _state.value = _state.value.copy(locationEnabled = true, isResolvingLocation = true)
        viewModelScope.launch {
            val result = locationProvider.getApproximateLocation()
            _state.value = when (result) {
                is LocationLookupResult.Success -> _state.value.copy(
                    isResolvingLocation = false,
                    latitude = result.latitude,
                    longitude = result.longitude,
                )
                // A denial, timeout, or lookup failure here must not block
                // account use -- the checkbox simply settles back to
                // unchecked and the rest of the form remains usable.
                else -> _state.value.copy(isResolvingLocation = false, locationEnabled = false)
            }
        }
    }

    fun onLocationDisabled() {
        _state.value = _state.value.copy(locationEnabled = false, latitude = null, longitude = null)
    }

    fun save(onSaved: () -> Unit) {
        val current = _state.value
        if (current.isSaving) return

        val phoneE164 = if (current.phoneLocalNumber.isBlank()) {
            null
        } else {
            "${current.countryCode}${current.phoneLocalNumber}".takeIf(E164_PATTERN::matches)
        }
        if (current.phoneLocalNumber.isNotBlank() && phoneE164 == null) {
            _state.value = current.copy(error = DomainError.Validation("Enter a valid phone number."))
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, error = null)
            val result = customerProfileRepository.update(
                displayName = current.fullName.trim().ifBlank { null },
                phoneE164 = phoneE164,
                city = current.city.trim().ifBlank { null },
                area = current.area.trim().ifBlank { null },
                latitude = current.latitude,
                longitude = current.longitude,
            )
            when (result) {
                is ApiResult.Success -> {
                    // Keeps the cached session in sync with the server's
                    // authoritative name so screens reading the session
                    // directly (e.g. Profile) reflect the change immediately,
                    // instead of showing the name captured at last sign-in
                    // until the next full session restoration.
                    authRepository.updateDisplayName(result.value.displayName)
                    onSaved()
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(isSaving = false, error = result.error)
            }
        }
    }
}
