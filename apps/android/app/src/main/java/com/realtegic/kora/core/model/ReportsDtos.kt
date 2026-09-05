package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** Exact shape of the owner/manager overview report response (docs task
 * Phase 9) -- legacy SALE-only fields are kept alongside the newer
 * explicit gross/refund/reversal/net split; neither redefines the
 * other. */
@JsonClass(generateAdapter = true)
data class ReportsOverviewDto(
    val from: String,
    val to: String,
    val branchId: String?,
    val postedRevenue: List<CurrencyAmountDto>,
    val transactionCount: Int,
    val averageTransactionValue: List<CurrencyAmountDto>,
    val completedServiceCount: Int,
    val commissionAccrued: List<CurrencyAmountDto>,
    val pendingPaymentClaimCount: Int,
    val disputedPaymentClaimCount: Int,
    val grossPostedSales: List<CurrencyAmountDto>,
    val refundAmount: List<CurrencyAmountDto>,
    val reversalAmount: List<CurrencyAmountDto>,
    val netPostedRevenue: List<CurrencyAmountDto>,
    val refundTransactionCount: Int,
    val reversalTransactionCount: Int,
)

/** `revenue` is the one report endpoint returning a single resource
 * (`{from,to,branchId,timeZone,buckets}`), not a paginated list -- the
 * other five below return a plain paginated array of their entry type,
 * since the backend's own response interceptor hoists a returned
 * `{data:[...], page:{...}}` shape to the envelope's top level,
 * silently dropping the service's own from/to/branchId echo. */
@JsonClass(generateAdapter = true)
data class RevenueReportDto(
    val from: String,
    val to: String,
    val branchId: String?,
    val timeZone: String,
    val buckets: List<DailyRevenueBucketDto>,
)

@JsonClass(generateAdapter = true)
data class DailyRevenueBucketDto(
    val date: String,
    val currency: String,
    val totalMinor: Long,
    val transactionCount: Int,
)

@JsonClass(generateAdapter = true)
data class StaffPerformanceEntryDto(
    val staffProfileId: String,
    val revenue: List<CurrencyAmountDto>,
    val refundedRevenue: List<CurrencyAmountDto>,
    val reversedRevenue: List<CurrencyAmountDto>,
    val netRevenue: List<CurrencyAmountDto>,
    val serviceCount: Int,
    val commissionAccrued: List<CurrencyAmountDto>,
    val commissionRefunded: List<CurrencyAmountDto>,
    val commissionReversed: List<CurrencyAmountDto>,
    val netCommission: List<CurrencyAmountDto>,
)

@JsonClass(generateAdapter = true)
data class ServicePerformanceEntryDto(
    val serviceId: String,
    val serviceName: String,
    val revenue: List<CurrencyAmountDto>,
    val refundedAmount: List<CurrencyAmountDto>,
    val reversedAmount: List<CurrencyAmountDto>,
    val netAmount: List<CurrencyAmountDto>,
    val serviceCount: Int,
)

@JsonClass(generateAdapter = true)
data class PaymentMethodEntryDto(
    val method: String,
    val total: List<CurrencyAmountDto>,
    val count: Int,
    val returnedTotal: List<CurrencyAmountDto>,
    val returnedCount: Int,
    val netTotal: List<CurrencyAmountDto>,
)

@JsonClass(generateAdapter = true)
data class CommissionReportEntryDto(
    val staffProfileId: String,
    val policyAccrued: List<CurrencyAmountDto>,
    val noPolicyAccrued: List<CurrencyAmountDto>,
    val refunded: List<CurrencyAmountDto>,
    val reversed: List<CurrencyAmountDto>,
    val net: List<CurrencyAmountDto>,
)

/** Physical drawer custody only -- never revenue (docs task locked
 * rules: "never treat CashLedgerEntry totals as revenue"). */
@JsonClass(generateAdapter = true)
data class CashReconciliationEntryDto(
    val cashSessionId: String,
    val registerId: String,
    val registerCode: String,
    val registerName: String,
    val currency: String,
    val status: String,
    val openingFloatMinor: Long,
    val paymentReceivedMinor: Long,
    val cashInMinor: Long,
    val cashOutMinor: Long,
    val safeDropMinor: Long,
    val cashRefundMinor: Long,
    val expectedClosingCashMinor: Long,
    val countedCashMinor: Long?,
    val varianceMinor: Long?,
    val reviewOutcome: String?,
)
