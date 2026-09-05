package com.realtegic.kora.core.session

/** Every state the app's authentication can be in -- deliberately
 * distinct from a generic loading/error pair so navigation and the
 * splash screen can react precisely (docs task Phase 1: "Every screen
 * must expose explicit states"). */
sealed class SessionState {
    /** Not yet determined -- before [SessionManager.restoreSession] has
     * resolved for the first time this process. */
    data object Unknown : SessionState()

    data object SignedOut : SessionState()

    /** A locally cached session exists, but the app could not verify it
     * with the server right now (e.g. offline) -- distinct from
     * [SignedOut], since the stored refresh token was deliberately left
     * intact rather than discarded over a transient connectivity
     * problem. [cachedDisplayName] lets the splash screen greet the
     * person by name while offering a retry. */
    data class RestorationFailed(val cachedDisplayName: String) : SessionState()

    data class SignedIn(
        val userId: String,
        val displayName: String,
        val email: String?,
    ) : SessionState()
}
