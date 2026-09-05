package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.DiscoveryBusinessSummaryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.FavoritesApi
import com.realtegic.kora.core.network.map
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class FavoritesRepository(
    private val favoritesApi: FavoritesApi,
    private val moshi: Moshi,
) {
    suspend fun list(): ApiResult<List<DiscoveryBusinessSummaryDto>> = safeApiCall(moshi) { favoritesApi.list() }

    suspend fun add(organizationId: String): ApiResult<Boolean> =
        safeApiCall(moshi) { favoritesApi.add(organizationId) }.map { it.favorited }

    suspend fun remove(organizationId: String): ApiResult<Boolean> =
        safeApiCall(moshi) { favoritesApi.remove(organizationId) }.map { it.favorited }
}
