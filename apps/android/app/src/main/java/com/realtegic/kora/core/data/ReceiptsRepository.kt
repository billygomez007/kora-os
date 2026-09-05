package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.ReceiptDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.ReceiptsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/** Every receipt is an immutable server snapshot -- this app never
 * recalculates a total, and never renders one as a statutory tax
 * invoice (docs task Phase 11). Business-side and customer-side
 * receipts are separate endpoints, never merged into one call. */
class ReceiptsRepository(
    private val api: ReceiptsApi,
    private val moshi: Moshi,
) {
    suspend fun list(organizationId: String, branchId: String? = null, customerRecordId: String? = null, transactionId: String? = null): ApiResult<List<ReceiptDto>> =
        safeApiCall(moshi) { api.list(organizationId, branchId, customerRecordId, transactionId) }

    suspend fun get(organizationId: String, receiptId: String): ApiResult<ReceiptDto> =
        safeApiCall(moshi) { api.get(organizationId, receiptId) }

    /** Looks up the (at most one, DB-unique) receipt for a specific
     * posted Transaction (docs task Phase 11: Transaction detail's
     * "Receipt link"). */
    suspend fun findForTransaction(organizationId: String, transactionId: String): ApiResult<ReceiptDto?> =
        when (val result = list(organizationId, transactionId = transactionId)) {
            is ApiResult.Success -> ApiResult.Success(result.value.firstOrNull())
            is ApiResult.Failure -> result
        }

    suspend fun listMine(): ApiResult<List<ReceiptDto>> = safeApiCall(moshi) { api.listMine() }

    suspend fun getMine(receiptId: String): ApiResult<ReceiptDto> = safeApiCall(moshi) { api.getMine(receiptId) }
}
