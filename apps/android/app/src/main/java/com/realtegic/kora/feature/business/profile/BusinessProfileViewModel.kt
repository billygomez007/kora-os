package com.realtegic.kora.feature.business.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.BusinessProfileRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.BusinessProfileDto
import com.realtegic.kora.core.model.BusinessProfileVisibility
import com.realtegic.kora.core.model.UpsertBusinessProfileRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BusinessProfileUiState(
    val profile: ScreenState<BusinessProfileDto?> = ScreenState.Loading,
    val displayName: String = "",
    val description: String = "",
    val isSaving: Boolean = false,
    val saveError: DomainError? = null,
    val isPublishing: Boolean = false,
    val publishError: DomainError? = null,
)

/**
 * A new business's profile is `PRIVATE` by default and simply does not
 * exist server-side until the first save (docs task "Business Profile
 * Management") -- `null` is a real, expected state here, not an error.
 * Publishing can fail with the server's own prerequisite message (e.g.
 * "no discoverable branch") -- that message is shown as-is rather than
 * re-derived client-side, since only the server knows every current
 * prerequisite.
 */
class BusinessProfileViewModel(
    private val organizationId: String,
    private val businessProfileRepository: BusinessProfileRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(BusinessProfileUiState())
    val state: StateFlow<BusinessProfileUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(profile = ScreenState.Loading)
            when (val result = businessProfileRepository.get(organizationId)) {
                is ApiResult.Success -> {
                    val profile = result.value
                    _state.value = _state.value.copy(
                        profile = ScreenState.Content(profile),
                        displayName = profile?.displayName ?: _state.value.displayName,
                        description = profile?.description ?: _state.value.description,
                    )
                }
                is ApiResult.Failure -> _state.value = _state.value.copy(profile = ScreenState.Error(result.error))
            }
        }
    }

    fun onFieldsChanged(displayName: String = _state.value.displayName, description: String = _state.value.description) {
        _state.value = _state.value.copy(displayName = displayName, description = description, saveError = null)
    }

    fun save() {
        val current = _state.value
        if (current.displayName.isBlank()) {
            _state.value = current.copy(saveError = DomainError.Validation("Enter a display name."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, saveError = null)
            val existingVisibility = (current.profile as? ScreenState.Content)?.data?.visibility
            val request = UpsertBusinessProfileRequest(
                displayName = current.displayName.trim(),
                description = current.description.trim().ifBlank { null },
                visibility = existingVisibility ?: BusinessProfileVisibility.PRIVATE,
            )
            when (val result = businessProfileRepository.upsert(organizationId, request)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSaving = false, profile = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isSaving = false, saveError = result.error)
            }
        }
    }

    fun publish() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isPublishing = true, publishError = null)
            when (val result = businessProfileRepository.publish(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isPublishing = false, profile = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isPublishing = false, publishError = result.error)
            }
        }
    }

    fun unpublish() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isPublishing = true, publishError = null)
            when (val result = businessProfileRepository.unpublish(organizationId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isPublishing = false, profile = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isPublishing = false, publishError = result.error)
            }
        }
    }

    fun setVisibility(visibility: String) {
        val organizationProfile = (_state.value.profile as? ScreenState.Content)?.data
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, saveError = null)
            val request = UpsertBusinessProfileRequest(
                displayName = organizationProfile?.displayName ?: _state.value.displayName.trim(),
                description = organizationProfile?.description ?: _state.value.description.trim().ifBlank { null },
                visibility = visibility,
            )
            when (val result = businessProfileRepository.upsert(organizationId, request)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSaving = false, profile = ScreenState.Content(result.value))
                is ApiResult.Failure -> _state.value = _state.value.copy(isSaving = false, saveError = result.error)
            }
        }
    }
}
