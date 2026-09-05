package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.MyEarningsLineDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.MyEarningsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/** The server always resolves the caller's own StaffProfile -- this
 * repository never accepts or forwards a staffProfileId, so a staff
 * member can never see (or be shown) another staff member's earnings
 * (docs task Phase 12). */
class MyEarningsRepository(
    private val api: MyEarningsApi,
    private val moshi: Moshi,
) {
    suspend fun list(organizationId: String, from: String? = null, to: String? = null): ApiResult<List<MyEarningsLineDto>> =
        safeApiCall(moshi) { api.list(organizationId, from, to) }

    /** Currency-separated earned/refunded/reversed/net totals, computed
     * server-side from the same CommissionAccrual rows as [list] --
     * never summed client-side from paged lines (docs task locked
     * rules: never calculate authoritative totals on the client). */
    suspend fun summary(organizationId: String, from: String? = null, to: String? = null): ApiResult<CommissionReportEntryDto> =
        safeApiCall(moshi) { api.summary(organizationId, from, to) }
}
