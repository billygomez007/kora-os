package com.realtegic.kora.core.network

/**
 * Every error a Kora screen can meaningfully react to, mapped from the
 * standard API error envelope (docs task Phase 2: "typed domain errors").
 * Never surfaces a raw server stack trace or infrastructure detail --
 * [message] is always the server's own safe, user-facing message (or a
 * safe local fallback for network-layer failures the server never saw).
 *
 * [SubscriptionReadOnly] is rarely constructed directly from an HTTP
 * response, since a plain 403 from `TenantAccessGuard` carries no
 * distinguishing code today -- the UI is expected to derive read-only
 * state proactively from the cached workspace `accessMode`
 * (`GET /v1/me/workspaces`) and hide write actions before ever
 * attempting them, rather than reacting to this after the fact. It is
 * kept as a real, distinct case so a rare write attempt racing a
 * subscription downgrade still has somewhere honest to land.
 */
sealed class DomainError(val message: String) {
    data class Validation(val details: String) : DomainError(details)
    data object Unauthorized : DomainError("Your session has expired. Please sign in again.")

    /** [code] is present whenever the server sent one alongside its 403
     * (e.g. `PAYMENT_SELF_CONFIRMATION_FORBIDDEN`/`PAYMENT_CONFIRMATION_FORBIDDEN`
     * -- docs task Phase 9), so a screen can react to a specific
     * forbidden reason rather than only a generic denial; `null` for an
     * ordinary bare-message 403 (e.g. a missing RBAC permission). */
    data class Forbidden(val code: String? = null, val details: String = "You do not have permission to do that.") : DomainError(details)
    data object SubscriptionReadOnly : DomainError("This workspace is in read-only mode.")
    data object SubscriptionBlocked : DomainError("This workspace's subscription is not active.")
    data object RateLimited : DomainError("Too many attempts. Please wait and try again.")
    data object NotFound : DomainError("We couldn't find that.")
    data class Conflict(val code: String, val details: String) : DomainError(details)
    data object SlotUnavailable : DomainError("This time is no longer available. Please choose another slot.")
    data object ServerUnavailable : DomainError("Kora is temporarily unavailable. Please try again shortly.")
    data object NetworkUnavailable : DomainError("You appear to be offline. Check your connection and try again.")
    data class Unknown(val details: String) : DomainError(details)
}
