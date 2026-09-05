package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.BusinessProfileDto
import com.realtegic.kora.core.model.UpdateBranchDiscoveryRequest
import com.realtegic.kora.core.model.UpsertBusinessProfileRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.BusinessProfileApi
import com.realtegic.kora.core.network.safeNullableApiCall
import com.realtegic.kora.core.network.safeUnitApiCall
import com.squareup.moshi.Moshi

class BusinessProfileRepository(
    private val businessProfileApi: BusinessProfileApi,
    private val moshi: Moshi,
) {
    /** `null` means the organization has not configured a profile yet
     * -- the server returns this as a null `data` field, not a 404. */
    suspend fun get(organizationId: String): ApiResult<BusinessProfileDto?> =
        safeNullableApiCall(moshi, { it.data }, { it.page }) { businessProfileApi.get(organizationId) }

    suspend fun upsert(organizationId: String, request: UpsertBusinessProfileRequest): ApiResult<BusinessProfileDto?> =
        safeNullableApiCall(moshi, { it.data }, { it.page }) { businessProfileApi.upsert(organizationId, request) }

    suspend fun publish(organizationId: String): ApiResult<BusinessProfileDto?> =
        safeNullableApiCall(moshi, { it.data }, { it.page }) { businessProfileApi.publish(organizationId) }

    suspend fun unpublish(organizationId: String): ApiResult<BusinessProfileDto?> =
        safeNullableApiCall(moshi, { it.data }, { it.page }) { businessProfileApi.unpublish(organizationId) }

    suspend fun updateBranchDiscovery(
        organizationId: String,
        branchId: String,
        request: UpdateBranchDiscoveryRequest,
    ): ApiResult<Unit> = safeUnitApiCall(moshi) { businessProfileApi.updateBranchDiscovery(organizationId, branchId, request) }
}
