package com.realtegic.kora.feature.auth

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DomainError
import com.realtegic.kora.core.session.AuthRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val RESEND_COOLDOWN_SECONDS = 30

enum class AuthStep { EMAIL_ENTRY, OTP_VERIFY }

data class AuthScreenState(
    val step: AuthStep = AuthStep.EMAIL_ENTRY,
    val email: String = "",
    val otpCode: String = "",
    val challengeId: String? = null,
    val isSubmitting: Boolean = false,
    val error: DomainError? = null,
    val resendAvailableInSeconds: Int = 0,
    val signedIn: Boolean = false,
)

/**
 * One ViewModel spans the whole email-entry -> OTP-verify flow, shared
 * across both screens via nav-graph-scoped `viewModel()` construction
 * (docs task Phase 3). The code is never written anywhere but this
 * in-memory [_state] -- never Room, DataStore, or a log line -- and is
 * always cleared on a terminal outcome ([submitCode]'s failure and
 * success paths both clear it).
 */
class AuthViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _state = MutableStateFlow(AuthScreenState())
    val state: StateFlow<AuthScreenState> = _state.asStateFlow()

    private var countdownJob: Job? = null

    fun onEmailChanged(email: String) {
        _state.value = _state.value.copy(email = email, error = null)
    }

    fun onCodeChanged(code: String) {
        val digitsOnly = code.filter { it.isDigit() }.take(10)
        _state.value = _state.value.copy(otpCode = digitsOnly, error = null)
    }

    fun submitEmail() {
        val email = _state.value.email.trim()
        if (email.isEmpty() || !email.contains("@")) {
            _state.value = _state.value.copy(error = DomainError.Validation("Enter a valid email address."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            when (val result = authRepository.requestOtp(email)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(
                        step = AuthStep.OTP_VERIFY,
                        challengeId = result.value.challengeId,
                        otpCode = "",
                        isSubmitting = false,
                    )
                    startResendCountdown()
                }
                is ApiResult.Failure -> {
                    _state.value = _state.value.copy(isSubmitting = false, error = result.error)
                }
            }
        }
    }

    fun resendCode() {
        if (_state.value.resendAvailableInSeconds > 0) return
        submitEmail()
    }

    fun submitCode() {
        val current = _state.value
        val challengeId = current.challengeId ?: return
        if (current.otpCode.length < 4) {
            _state.value = current.copy(error = DomainError.Validation("Enter the code from your email."))
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            val deviceLabel = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(120)
            when (val result = authRepository.verifyOtp(challengeId, current.otpCode, deviceLabel)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isSubmitting = false, otpCode = "", signedIn = true)
                }
                is ApiResult.Failure -> {
                    // A terminal failure (invalid/expired/consumed/locked
                    // code) always clears the field rather than leaving a
                    // guessed code sitting in view (docs task Phase 3).
                    _state.value = _state.value.copy(isSubmitting = false, otpCode = "", error = result.error)
                }
            }
        }
    }

    fun changeEmail() {
        countdownJob?.cancel()
        _state.value = AuthScreenState(email = _state.value.email)
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    private fun startResendCountdown() {
        countdownJob?.cancel()
        countdownJob = viewModelScope.launch {
            for (remaining in RESEND_COOLDOWN_SECONDS downTo 0) {
                _state.value = _state.value.copy(resendAvailableInSeconds = remaining)
                if (remaining > 0) delay(1000)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        countdownJob?.cancel()
    }
}
