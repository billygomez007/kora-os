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
