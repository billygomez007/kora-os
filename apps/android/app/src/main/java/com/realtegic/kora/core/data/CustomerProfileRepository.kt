package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.CustomerProfileDto
import com.realtegic.kora.core.model.UpdateCustomerProfileRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.CustomerProfileApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/** The customer-workspace self-service boundary (docs task Phase 7).
 * `get()` always returns the server's own auto-provisioned profile --
 * this app never fabricates a local placeholder while waiting for it. */
class CustomerProfileRepository(
    private val api: CustomerProfileApi,
    private val moshi: Moshi,
) {
    suspend fun get(): ApiResult<CustomerProfileDto> = safeApiCall(moshi) { api.get() }

    suspend fun update(
        displayName: String? = null,
        phoneE164: String? = null,
        city: String? = null,
        area: String? = null,
        latitude: Double? = null,
        longitude: Double? = null,
    ): ApiResult<CustomerProfileDto> = safeApiCall(moshi) {
        api.update(UpdateCustomerProfileRequest(displayName, phoneE164, city, area, latitude, longitude))
    }
}
