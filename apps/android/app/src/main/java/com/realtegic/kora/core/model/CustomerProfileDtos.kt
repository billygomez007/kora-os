package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Exact shape of `CustomerProfileView` (docs task Phase 7). A fresh
 * profile is auto-created empty on first access, so [phoneE164] being
 * `null` is the one real signal available for "has this account ever
 * completed customer-profile setup" -- no separate onboarding-completed
 * flag exists on the backend, and this stage adds none, since a null
 * phone is both a genuine, honestly-derived signal and one the backend
 * already exposes today. */
@JsonClass(generateAdapter = true)
data class CustomerProfileDto(
    val id: String,
    val displayName: String,
    val email: String?,
    val phoneE164: String?,
    val city: String?,
    val area: String?,
    val latitude: Double?,
    val longitude: Double?,
    val locationConsentedAt: String?,
)

/** Only latitude/longitude are ever both-or-neither (docs task Phase 7:
 * "only when the customer has explicitly provided them") -- the server
 * itself rejects one without the other, so this app never sends one
 * alone either. */
@JsonClass(generateAdapter = true)
data class UpdateCustomerProfileRequest(
    val displayName: String? = null,
    val phoneE164: String? = null,
    val city: String? = null,
    val area: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)
