package com.realtegic.kora.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private const val PREFERENCES_FILE_NAME = "kora_preferences"

private val SELECTED_WORKSPACE_KEY = stringPreferencesKey("selected_workspace_id")
private const val CUSTOMER_SENTINEL = "__customer__"
private val ONBOARDING_ORGANIZATION_ID_KEY = stringPreferencesKey("onboarding_organization_id")

/** A `null`/absent DataStore value is genuinely ambiguous between "never
 * chosen yet" and "explicitly chose Customer" -- this sealed type makes
 * that distinction explicit rather than overloading `null` for both, so
 * cold-start routing can tell "nothing to restore, run the normal
 * decision" apart from "restore straight to Customer" (docs task Phase
 * 4). */
sealed class SelectedWorkspacePreference {
    data object NeverChosen : SelectedWorkspacePreference()
    data object Customer : SelectedWorkspacePreference()
    data class Organization(val organizationId: String) : SelectedWorkspacePreference()
}

/**
 * Only ever a non-sensitive UX convenience -- which workspace was last
 * selected, so a cold start can jump straight back there. Never trusted
 * as an access decision on its own: every read is followed by
 * revalidating against a fresh `GET /v1/me/workspaces` call before
 * anything protected is shown (docs task Phase 4: "never allow a stale
 * locally selected organization to bypass membership checks").
 *
 * Deliberately builds its own [androidx.datastore.core.DataStore]
 * instance via [PreferenceDataStoreFactory] in the constructor, rather
 * than the more common `by preferencesDataStore(name = ...)` top-level
 * singleton-property-delegate pattern: that delegate caches its
 * instance for the lifetime of the classloader, keyed only by the file
 * name -- harmless in production, where [AppContainer] constructs
 * exactly one [LocalPreferences], but it caused genuine test hangs
 * under Robolectric (each test method gets a fresh `Application`, but
 * the cached delegate kept resolving to the first test's now-torn-down
 * instance). A factory-created, per-instance DataStore has no such
 * cross-instance state to leak.
 */
class LocalPreferences(context: Context) {
    private val dataStore = PreferenceDataStoreFactory.create(
        produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE_NAME) },
    )

    val selectedWorkspace: Flow<SelectedWorkspacePreference> = dataStore.data.map { prefs ->
        when (val raw = prefs[SELECTED_WORKSPACE_KEY]) {
            null -> SelectedWorkspacePreference.NeverChosen
            CUSTOMER_SENTINEL -> SelectedWorkspacePreference.Customer
            else -> SelectedWorkspacePreference.Organization(raw)
        }
    }

    suspend fun setSelectedCustomerWorkspace() {
        dataStore.edit { it[SELECTED_WORKSPACE_KEY] = CUSTOMER_SENTINEL }
    }

    suspend fun setSelectedOrganizationWorkspace(organizationId: String) {
        dataStore.edit { it[SELECTED_WORKSPACE_KEY] = organizationId }
    }

    suspend fun clearSelectedWorkspace() {
        dataStore.edit { it.remove(SELECTED_WORKSPACE_KEY) }
    }

    suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    /** Only an id, never a credential -- lets a resumable onboarding
     * wizard reopen against the same organization instead of starting a
     * fresh one, but the server's own `setup-status` response remains
     * the sole authority on what has actually been configured (docs
     * task "Business Onboarding Contract": "revalidate server state
     * when reopening"). */
    val onboardingOrganizationId: Flow<String?> = dataStore.data.map { it[ONBOARDING_ORGANIZATION_ID_KEY] }

    suspend fun setOnboardingOrganizationId(organizationId: String) {
        dataStore.edit { it[ONBOARDING_ORGANIZATION_ID_KEY] = organizationId }
    }

    suspend fun clearOnboardingOrganizationId() {
        dataStore.edit { it.remove(ONBOARDING_ORGANIZATION_ID_KEY) }
    }
}
