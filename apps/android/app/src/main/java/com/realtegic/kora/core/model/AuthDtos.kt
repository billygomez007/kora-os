package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RequestEmailOtpRequest(val email: String)

@JsonClass(generateAdapter = true)
data class RequestEmailOtpResponse(
    val challengeId: String,
    val expiresAt: String,
)

@JsonClass(generateAdapter = true)
data class VerifyEmailOtpRequest(
    val challengeId: String,
    val code: String,
    val deviceLabel: String? = null,
)

@JsonClass(generateAdapter = true)
data class RefreshRequest(val refreshToken: String)

/** Exact shape of `AuthResult` -- identical for both verify and refresh
 * (docs task Phase 3). Field names are asymmetric on purpose: access
 * token expiry is a relative duration, refresh/session expiry is an
 * absolute timestamp -- mirror both exactly, never assume one implies
 * the other. */
@JsonClass(generateAdapter = true)
data class AuthResultDto(
    val user: AuthUserDto,
    val accessToken: String,
    val accessTokenExpiresInSeconds: Long,
    val refreshToken: String,
    val session: AuthSessionDto,
)

@JsonClass(generateAdapter = true)
data class AuthUserDto(
    val id: String,
    val email: String?,
    val displayName: String,
)

@JsonClass(generateAdapter = true)
data class AuthSessionDto(
    val id: String,
    val expiresAt: String,
)

@JsonClass(generateAdapter = true)
data class MeDto(
    val id: String,
    val email: String?,
    val displayName: String,
    val status: String,
)

@JsonClass(generateAdapter = true)
data class SessionSummaryDto(
    val id: String,
    val deviceLabel: String?,
    val userAgent: String?,
    val createdAt: String,
    val lastUsedAt: String,
    val expiresAt: String,
    val isCurrent: Boolean,
)
