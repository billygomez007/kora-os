package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.SubscriptionDetailDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.SubscriptionApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class SubscriptionRepository(
    private val subscriptionApi: SubscriptionApi,
    private val moshi: Moshi,
) {
    suspend fun get(organizationId: String): ApiResult<SubscriptionDetailDto> =
        safeApiCall(moshi) { subscriptionApi.get(organizationId) }
}
