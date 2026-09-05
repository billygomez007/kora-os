package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.CashPolicyDto
import com.realtegic.kora.core.model.UpdateCashPolicyRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.CashPolicyApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class CashPolicyRepository(
    private val api: CashPolicyApi,
    private val moshi: Moshi,
) {
    suspend fun get(organizationId: String, branchId: String): ApiResult<CashPolicyDto> =
        safeApiCall(moshi) { api.get(organizationId, branchId) }

    suspend fun update(organizationId: String, branchId: String, mode: String): ApiResult<CashPolicyDto> =
        safeApiCall(moshi) { api.update(organizationId, branchId, UpdateCashPolicyRequest(mode)) }
}
