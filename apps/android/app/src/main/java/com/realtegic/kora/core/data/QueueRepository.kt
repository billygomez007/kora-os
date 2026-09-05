package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.AssignQueueStaffRequest
import com.realtegic.kora.core.model.CancelQueueEntryRequest
import com.realtegic.kora.core.model.CreateWalkInRequest
import com.realtegic.kora.core.model.QueueEntryDto
import com.realtegic.kora.core.model.QueueListDto
import com.realtegic.kora.core.model.ServiceSessionDto
import com.realtegic.kora.core.model.StartServiceSessionRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.QueueApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/**
 * Walk-in intake and every queue-entry command (docs task Phases 4-6).
 * `status`/`ticketNumber`/`revision` are always read back from the
 * server response after a command -- this repository never lets a
 * caller construct or mutate a [QueueEntryDto] locally as if it were
 * authoritative.
 */
class QueueRepository(
    private val api: QueueApi,
    private val moshi: Moshi,
) {
    suspend fun createWalkIn(
        organizationId: String,
        branchId: String,
        idempotencyKey: String,
        request: CreateWalkInRequest,
    ): ApiResult<QueueEntryDto> = safeApiCall(moshi) { api.createWalkIn(organizationId, branchId, idempotencyKey, request) }

    suspend fun getQueue(
        organizationId: String,
        branchId: String,
        businessDate: String? = null,
        status: String? = null,
        assignedStaffProfileId: String? = null,
    ): ApiResult<QueueListDto> = safeApiCall(moshi) { api.getQueue(organizationId, branchId, businessDate, status, assignedStaffProfileId) }

    suspend fun getQueueEntry(organizationId: String, queueEntryId: String): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.getQueueEntry(organizationId, queueEntryId) }

    suspend fun call(organizationId: String, queueEntryId: String): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.call(organizationId, queueEntryId) }

    suspend fun returnToWaiting(organizationId: String, queueEntryId: String): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.returnToWaiting(organizationId, queueEntryId) }

    suspend fun assign(organizationId: String, queueEntryId: String, staffProfileId: String): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.assign(organizationId, queueEntryId, AssignQueueStaffRequest(staffProfileId)) }

    suspend fun cancelEntry(organizationId: String, queueEntryId: String, reason: String?): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.cancelEntry(organizationId, queueEntryId, CancelQueueEntryRequest(reason)) }

    suspend fun noShowEntry(organizationId: String, queueEntryId: String): ApiResult<QueueEntryDto> =
        safeApiCall(moshi) { api.noShowEntry(organizationId, queueEntryId) }

    suspend fun startService(organizationId: String, queueEntryId: String, staffProfileId: String?): ApiResult<ServiceSessionDto> =
        safeApiCall(moshi) { api.startService(organizationId, queueEntryId, StartServiceSessionRequest(staffProfileId)) }
}
