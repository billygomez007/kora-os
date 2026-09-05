package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.BookingPolicyDto
import com.realtegic.kora.core.model.BranchScheduleExceptionDto
import com.realtegic.kora.core.model.BusinessHoursIntervalDto
import com.realtegic.kora.core.model.CreateBranchScheduleExceptionRequest
import com.realtegic.kora.core.model.ReplaceBusinessHoursRequest
import com.realtegic.kora.core.model.UpsertBookingPolicyRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.SchedulingApi
import com.realtegic.kora.core.network.safeApiCall
import com.realtegic.kora.core.network.safeUnitApiCall
import com.squareup.moshi.Moshi

/**
 * Every interval is a branch-local wall-clock "HH:mm" string -- this
 * repository never converts it through the phone's own timezone, and
 * `replaceBusinessHours` is a full replace (not incremental), matching
 * the server's own semantics exactly (docs task "Branch Schedule and
 * Booking Policy").
 */
class SchedulingRepository(
    private val api: SchedulingApi,
    private val moshi: Moshi,
) {
    suspend fun getBusinessHours(organizationId: String, branchId: String): ApiResult<List<BusinessHoursIntervalDto>> =
        safeApiCall(moshi) { api.getBusinessHours(organizationId, branchId) }

    suspend fun replaceBusinessHours(
        organizationId: String,
        branchId: String,
        intervals: List<BusinessHoursIntervalDto>,
    ): ApiResult<List<BusinessHoursIntervalDto>> =
        safeApiCall(moshi) { api.replaceBusinessHours(organizationId, branchId, ReplaceBusinessHoursRequest(intervals)) }

    suspend fun getScheduleExceptions(
        organizationId: String,
        branchId: String,
        from: String,
        to: String,
    ): ApiResult<List<BranchScheduleExceptionDto>> = safeApiCall(moshi) { api.getScheduleExceptions(organizationId, branchId, from, to) }

    suspend fun createScheduleException(
        organizationId: String,
        branchId: String,
        request: CreateBranchScheduleExceptionRequest,
    ): ApiResult<BranchScheduleExceptionDto> = safeApiCall(moshi) { api.createScheduleException(organizationId, branchId, request) }

    suspend fun deleteScheduleException(organizationId: String, branchId: String, exceptionId: String): ApiResult<Unit> =
        safeUnitApiCall(moshi) { api.deleteScheduleException(organizationId, branchId, exceptionId) }

    suspend fun getBookingPolicy(organizationId: String, branchId: String): ApiResult<BookingPolicyDto> =
        safeApiCall(moshi) { api.getBookingPolicy(organizationId, branchId) }

    suspend fun upsertBookingPolicy(
        organizationId: String,
        branchId: String,
        request: UpsertBookingPolicyRequest,
    ): ApiResult<BookingPolicyDto> = safeApiCall(moshi) { api.upsertBookingPolicy(organizationId, branchId, request) }
}
