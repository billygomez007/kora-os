package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.AvailabilityResultDto
import com.realtegic.kora.core.model.BusinessCategoryDto
import com.realtegic.kora.core.model.DiscoveryBranchSummaryDto
import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.model.PublicProviderSummaryDto
import com.realtegic.kora.core.model.PublicServiceSummaryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.DiscoveryApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class DiscoveryRepository(
    private val discoveryApi: DiscoveryApi,
    private val moshi: Moshi,
) {
    suspend fun categories(): ApiResult<List<BusinessCategoryDto>> = safeApiCall(moshi) { discoveryApi.categories() }

    suspend fun search(
        text: String? = null,
        category: String? = null,
        nearLat: Double? = null,
        nearLng: Double? = null,
        radiusKm: Int? = null,
        cursor: String? = null,
        limit: Int? = null,
    ): ApiResult<List<DiscoveryBusinessSummaryDto>> = safeApiCall(moshi) {
        discoveryApi.searchBusinesses(
            text = text?.ifBlank { null },
            category = category,
            nearLat = nearLat,
            nearLng = nearLng,
            radiusKm = radiusKm,
            cursor = cursor,
            limit = limit,
        )
    }

    suspend fun getBusiness(slug: String): ApiResult<DiscoveryBusinessSummaryDto> =
        safeApiCall(moshi) { discoveryApi.getBusiness(slug) }

    suspend fun getBranches(slug: String): ApiResult<List<DiscoveryBranchSummaryDto>> =
        safeApiCall(moshi) { discoveryApi.getBranches(slug) }

    suspend fun getServices(slug: String, branchId: String): ApiResult<List<PublicServiceSummaryDto>> =
        safeApiCall(moshi) { discoveryApi.getServices(slug, branchId) }

    suspend fun getProviders(slug: String, branchId: String, serviceId: String): ApiResult<List<PublicProviderSummaryDto>> =
        safeApiCall(moshi) { discoveryApi.getProviders(slug, branchId, serviceId) }

    suspend fun getAvailability(
        slug: String,
        branchId: String,
        serviceIds: List<String>,
        staffProfileId: String? = null,
        date: String? = null,
        fromDate: String? = null,
        toDate: String? = null,
    ): ApiResult<AvailabilityResultDto> = safeApiCall(moshi) {
        discoveryApi.getAvailability(
            slug = slug,
            branchId = branchId,
            serviceIds = serviceIds.joinToString(","),
            staffProfileId = staffProfileId,
            date = date,
            fromDate = fromDate,
            toDate = toDate,
        )
    }
}
