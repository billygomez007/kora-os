package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.CashReconciliationEntryDto
import com.realtegic.kora.core.model.CommissionReportEntryDto
import com.realtegic.kora.core.model.PaymentMethodEntryDto
import com.realtegic.kora.core.model.ReportsOverviewDto
import com.realtegic.kora.core.model.RevenueReportDto
import com.realtegic.kora.core.model.ServicePerformanceEntryDto
import com.realtegic.kora.core.model.StaffPerformanceEntryDto
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.ReportsApi
import com.realtegic.kora.core.network.safeApiCall
import com.squareup.moshi.Moshi

class ReportsRepository(
    private val reportsApi: ReportsApi,
    private val moshi: Moshi,
) {
    /** Callers must only invoke this for a workspace whose granted
     * permissions already include `reports.read` (docs task Phase 9:
     * "For users without reports.read: do not call the reports
     * endpoint") -- this repository performs no permission check of
     * its own, matching how every other Kora client call defers all
     * real authorization to the server. */
    suspend fun overview(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<ReportsOverviewDto> =
        safeApiCall(moshi) { reportsApi.overview(organizationId, from, to, branchId) }

    suspend fun revenue(organizationId: String, from: String, to: String, branchId: String? = null, timezone: String? = null): ApiResult<RevenueReportDto> =
        safeApiCall(moshi) { reportsApi.revenue(organizationId, from, to, branchId, timezone) }

    suspend fun staffPerformance(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<List<StaffPerformanceEntryDto>> =
        safeApiCall(moshi) { reportsApi.staffPerformance(organizationId, from, to, branchId) }

    suspend fun services(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<List<ServicePerformanceEntryDto>> =
        safeApiCall(moshi) { reportsApi.services(organizationId, from, to, branchId) }

    suspend fun paymentMethods(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<List<PaymentMethodEntryDto>> =
        safeApiCall(moshi) { reportsApi.paymentMethods(organizationId, from, to, branchId) }

    suspend fun commissions(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<List<CommissionReportEntryDto>> =
        safeApiCall(moshi) { reportsApi.commissions(organizationId, from, to, branchId) }

    suspend fun cashReconciliation(organizationId: String, from: String, to: String, branchId: String? = null): ApiResult<List<CashReconciliationEntryDto>> =
        safeApiCall(moshi) { reportsApi.cashReconciliation(organizationId, from, to, branchId) }
}
