package com.realtegic.kora.feature.workspace

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class AccountType { CUSTOMER, BUSINESS }

data class AccountTypeUiState(val selected: AccountType = AccountType.CUSTOMER)

/**
 * Holds only which card is currently highlighted (docs task Phase 5:
 * "account-type selection"). Deliberately calls no repository and
 * touches no session/membership state at all -- this choice is pure
 * navigation intent, never an authorization decision. It can never
 * create an owner role, grant a membership, grant a permission, bypass
 * an invitation, or bypass subscription enforcement, because nothing
 * here does anything but remember which of two cards the user tapped;
 * the actual "customer" or "business" destination is resolved entirely
 * by the existing workspace/onboarding/invitation architecture once the
 * caller acts on [state].
 */
class AccountTypeViewModel : ViewModel() {
    private val _state = MutableStateFlow(AccountTypeUiState())
    val state: StateFlow<AccountTypeUiState> = _state.asStateFlow()

    fun select(type: AccountType) {
        _state.value = _state.value.copy(selected = type)
    }
}
