package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.CancelServiceSessionRequest
import com.realtegic.kora.core.model.ReplaceServiceSessionItemsRequest
import com.realtegic.kora.core.model.ServiceSessionDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.ServiceSessionsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class ServiceSessionsRepository(
    private val api: ServiceSessionsApi,
    private val moshi: Moshi,
) {
    suspend fun list(
        organizationId: String,
        branchId: String? = null,
        status: String? = null,
        assignedStaffProfileId: String? = null,
    ): ApiResult<List<ServiceSessionDto>> = safeApiCall(moshi) { api.list(organizationId, branchId, status, assignedStaffProfileId) }

    suspend fun get(organizationId: String, serviceSessionId: String): ApiResult<ServiceSessionDto> =
        safeApiCall(moshi) { api.get(organizationId, serviceSessionId) }

    suspend fun replaceItems(organizationId: String, serviceSessionId: String, serviceIds: List<String>): ApiResult<ServiceSessionDto> =
        safeApiCall(moshi) { api.replaceItems(organizationId, serviceSessionId, ReplaceServiceSessionItemsRequest(serviceIds)) }

    suspend fun complete(organizationId: String, serviceSessionId: String): ApiResult<ServiceSessionDto> =
        safeApiCall(moshi) { api.complete(organizationId, serviceSessionId) }

    suspend fun cancel(organizationId: String, serviceSessionId: String, reason: String, disposition: String): ApiResult<ServiceSessionDto> =
        safeApiCall(moshi) { api.cancel(organizationId, serviceSessionId, CancelServiceSessionRequest(reason, disposition)) }
}
