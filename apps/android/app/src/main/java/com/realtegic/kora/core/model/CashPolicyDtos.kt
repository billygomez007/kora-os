package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

object CashPolicyMode {
    const val OPTIONAL = "OPTIONAL"
    const val REQUIRED = "REQUIRED"
}

@JsonClass(generateAdapter = true)
data class CashPolicyDto(
    val id: String,
    val organizationId: String,
    val branchId: String,
    val mode: String,
    val updatedByMembershipId: String,
    val createdAt: String,
    val updatedAt: String,
)

@JsonClass(generateAdapter = true)
data class UpdateCashPolicyRequest(val mode: String)
