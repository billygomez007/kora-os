package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class ServiceCategoryDto(
    val id: String,
    val organizationId: String,
    val name: String,
    val description: String?,
    val sortOrder: Int,
    val archivedAt: String?,
)

@JsonClass(generateAdapter = true)
data class CreateServiceCategoryRequest(
    val name: String,
    val description: String? = null,
    val sortOrder: Int? = null,
)

/** Owner-facing service record -- the organization-wide default price
 * and duration. A branch may override either (see [BranchServiceDto]);
 * this value is never assumed to be what a customer actually pays. */
@JsonClass(generateAdapter = true)
data class ServiceDto(
    val id: String,
    val organizationId: String,
    val serviceCategoryId: String?,
    val name: String,
    val description: String?,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val pricingType: String,
    val isBookableByCustomer: Boolean,
    val sortOrder: Int,
    val archivedAt: String?,
)

@JsonClass(generateAdapter = true)
data class CreateServiceRequest(
    val serviceCategoryId: String? = null,
    val name: String,
    val description: String? = null,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val pricingType: String? = null,
    val isBookableByCustomer: Boolean? = null,
    val sortOrder: Int? = null,
)

/** `priceOverrideMinor`/`durationOverrideMinutes` are null when this
 * branch has not overridden the organization default -- the effective
 * value a customer sees is always resolved server-side; this app never
 * recomputes it as an authoritative figure, only displays "override" vs
 * "organization default" for an owner/manager's own visibility. */
@JsonClass(generateAdapter = true)
data class BranchServiceDto(
    val branchId: String,
    val serviceId: String,
    val isEnabled: Boolean,
    val priceOverrideMinor: Long?,
    val durationOverrideMinutes: Int?,
    val isBookableByCustomerOverride: Boolean?,
    val service: ServiceDto,
)

@JsonClass(generateAdapter = true)
data class UpsertBranchServiceRequest(
    val isEnabled: Boolean? = null,
    val priceOverrideMinor: Long? = null,
    val durationOverrideMinutes: Int? = null,
    val isBookableByCustomerOverride: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class StaffServiceAssignmentDto(
    val staffProfileId: String,
    val branchId: String,
    val serviceId: String,
    val isBookable: Boolean,
    val durationOverrideMinutes: Int?,
)

@JsonClass(generateAdapter = true)
data class AssignStaffServiceRequest(
    val staffProfileId: String,
    val durationOverrideMinutes: Int? = null,
)
