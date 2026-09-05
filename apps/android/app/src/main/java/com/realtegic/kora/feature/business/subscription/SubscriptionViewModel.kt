package com.realtegic.kora.feature.business.subscription

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.data.SubscriptionRepository
import com.realtegic.kora.core.designsystem.ScreenState
import com.realtegic.kora.core.model.SubscriptionDetailDto
import com.realtegic.kora.core.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Every figure here is computed server-side on every call -- this
 * screen never determines authorization from a locally cached plan
 * value, and shows no price or payment button (docs task
 * "Subscription-Aware Setup": subscription checkout is out of scope
 * this stage). */
class SubscriptionViewModel(
    private val organizationId: String,
    private val subscriptionRepository: SubscriptionRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<SubscriptionDetailDto>>(ScreenState.Loading)
    val state: StateFlow<ScreenState<SubscriptionDetailDto>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = ScreenState.Loading
            _state.value = when (val result = subscriptionRepository.get(organizationId)) {
                is ApiResult.Success -> ScreenState.Content(result.value)
                is ApiResult.Failure -> ScreenState.Error(result.error)
            }
        }
    }
}
