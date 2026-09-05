package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.ReportsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class ReportsRepository(
    private val reportsApi: ReportsApi,
    private val moshi: Moshi,
) {
    /** Callers must only invoke this for a workspace whose granted
     * permissions already include `reports.read` (docs task Phase 9:
     * "For users without reports.read: do not call the reports
     * endpoint") -- this repository performs no permission check of
     * its own, matching how every other Kora client call defers all
     * real authorization to the server. */
    suspend fun overview(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<ReportsOverviewDto> =
        safeApiCall(moshi) { reportsApi.overview(organizationId, from, to, branchId) }
}
