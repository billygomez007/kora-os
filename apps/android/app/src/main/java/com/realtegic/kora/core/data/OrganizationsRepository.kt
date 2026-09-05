package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.CreateOrganizationRequest
import com.realtegic.kora.core.model.OnboardOrganizationResponseDto
import com.realtegic.kora.core.model.OrganizationDto
import com.realtegic.kora.core.model.OrganizationSetupStatusDto
import com.realtegic.kora.core.model.OrganizationSummaryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.OrganizationsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/**
 * Organization creation requires a caller-supplied idempotency key
 * (docs task "Business Onboarding Contract") -- ownership of that key's
 * lifecycle (generate once per attempt, reuse across retries, replace
 * only on a terminal outcome) belongs to the onboarding ViewModel, the
 * same pattern `BookingViewModel` already established for appointment
 * booking, not this repository.
 */
class OrganizationsRepository(
    private val organizationsApi: OrganizationsApi,
    private val moshi: Moshi,
) {
    suspend fun create(request: CreateOrganizationRequest, idempotencyKey: String): ApiResult<OnboardOrganizationResponseDto> =
        safeApiCall(moshi) { organizationsApi.create(idempotencyKey, request) }

    suspend fun list(): ApiResult<List<OrganizationSummaryDto>> = safeApiCall(moshi) { organizationsApi.list() }

    suspend fun get(organizationId: String): ApiResult<OrganizationDto> =
        safeApiCall(moshi) { organizationsApi.get(organizationId) }

    suspend fun getSetupStatus(organizationId: String): ApiResult<OrganizationSetupStatusDto> =
        safeApiCall(moshi) { organizationsApi.getSetupStatus(organizationId) }
}
