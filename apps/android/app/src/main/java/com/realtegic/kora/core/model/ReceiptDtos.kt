package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

object ReceiptKind {
    const val SALE_RECEIPT = "SALE_RECEIPT"
    const val REFUND_RECEIPT = "REFUND_RECEIPT"
    const val REVERSAL_RECORD = "REVERSAL_RECORD"
}

/** Exact shape of `ReceiptView` -- an immutable, point-in-time server
 * snapshot, never a live join back to Branch/CustomerRecord/
 * PaymentRecord (docs task Phase 11: "receipts are immutable server
 * snapshots"). Deliberately not a statutory tax invoice -- no VAT/TIN
 * field exists here, and none should ever be added client-side. */
@JsonClass(generateAdapter = true)
data class ReceiptDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val transactionId: String,
    val customerRecordId: String?,
    val receiptNumber: String,
    val sequenceNumber: Int,
    val kind: String,
    val originalReceiptId: String?,
    val originalReceiptNumber: String?,
    val originalTransactionReference: String?,
    val correctionReason: String?,
    val remainingRefundableMinor: Long?,
    val businessName: String,
    val branchName: String,
    val branchPhone: String?,
    val branchAddress: String?,
    val customerName: String?,
    val currency: String,
    val subtotalMinor: Long,
    val adjustmentTotalMinor: Long,
    val totalMinor: Long,
    val issuedAt: String,
    val issuedByMembershipId: String,
    val lineItems: List<ReceiptLineItemDto>,
    val paymentSummaries: List<ReceiptPaymentSummaryDto>,
)

@JsonClass(generateAdapter = true)
data class ReceiptLineItemDto(
    val id: String,
    val serviceName: String,
    val quantity: Int,
    val unitPriceMinor: Long,
    val lineTotalMinor: Long,
    val currency: String,
    val displayOrder: Int,
)

/** [safeReference] is already redacted server-side -- never a full
 * external payment reference (docs task locked rules). */
@JsonClass(generateAdapter = true)
data class ReceiptPaymentSummaryDto(
    val id: String,
    val method: String,
    val amountMinor: Long,
    val currency: String,
    val safeReference: String?,
)
