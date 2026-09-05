package com.realtegic.kora.feature.customer.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.session.AuthRepository
import com.realtegic.kora.core.session.SessionState
import kotlinx.coroutines.launch

class ProfileViewModel(private val authRepository: AuthRepository) : ViewModel() {
    val sessionState = authRepository.sessionState

    fun signOut(onSignedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onSignedOut()
        }
    }
}

fun SessionState.displayNameOrDefault(): String = (this as? SessionState.SignedIn)?.displayName ?: "Kora customer"
fun SessionState.emailOrNull(): String? = (this as? SessionState.SignedIn)?.email
