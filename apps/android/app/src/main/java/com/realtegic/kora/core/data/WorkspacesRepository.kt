package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.MyWorkspacesDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.WorkspacesApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class WorkspacesRepository(
    private val workspacesApi: WorkspacesApi,
    private val moshi: Moshi,
) {
    /** Always revalidated fresh from the server -- never trust a
     * locally cached workspace list to decide access (docs task Phase
     * 4: "never allow a stale locally selected organization to bypass
     * membership checks"). */
    suspend fun getMyWorkspaces(): ApiResult<MyWorkspacesDto> = safeApiCall(moshi) { workspacesApi.getMyWorkspaces() }
}
