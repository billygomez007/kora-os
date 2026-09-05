package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.TransactionDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.TransactionsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

/** Read-only -- there is no create/update/delete endpoint anywhere for
 * a Transaction (docs task locked rules: "only a POSTED Transaction
 * counts as revenue"; posting is fully server-internal). */
class TransactionsRepository(
    private val api: TransactionsApi,
    private val moshi: Moshi,
) {
    suspend fun list(
        organizationId: String,
        branchId: String? = null,
        assignedStaffProfileId: String? = null,
        customerRecordId: String? = null,
    ): ApiResult<List<TransactionDto>> = safeApiCall(moshi) { api.list(organizationId, branchId, assignedStaffProfileId, customerRecordId) }

    suspend fun get(organizationId: String, transactionId: String): ApiResult<TransactionDto> =
        safeApiCall(moshi) { api.get(organizationId, transactionId) }
}
