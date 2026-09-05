package com.realtegic.kora.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: androidx.datastore.core.DataStore<Preferences> by preferencesDataStore(name = "kora_preferences")

private val SELECTED_WORKSPACE_KEY = stringPreferencesKey("selected_workspace_id")
private const val CUSTOMER_SENTINEL = "__customer__"

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
 */
class LocalPreferences(context: Context) {
    private val dataStore = context.dataStore

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
}
