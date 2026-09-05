package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class BusinessCategoryDto(
    val code: String,
    val name: String,
)

@JsonClass(generateAdapter = true)
data class DiscoveryBusinessSummaryDto(
    val organizationId: String,
    val slug: String,
    val displayName: String,
    val description: String?,
    val logoImageUrl: String?,
    val coverImageUrl: String?,
    val verificationStatus: String,
    val categories: List<String>,
)

@JsonClass(generateAdapter = true)
data class DiscoveryBranchSummaryDto(
    val branchId: String,
    val name: String,
    val city: String?,
    val region: String?,
    val countryCode: String,
    val latitude: Double?,
    val longitude: Double?,
    val publicPhone: String?,
    val publicEmail: String?,
    val openingHoursNote: String?,
)

@JsonClass(generateAdapter = true)
data class PublicServiceSummaryDto(
    val id: String,
    val name: String,
    val description: String?,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val pricingType: String,
    val serviceCategoryId: String?,
)

@JsonClass(generateAdapter = true)
data class PublicProviderSummaryDto(
    val staffProfileId: String,
    val displayName: String,
)

@JsonClass(generateAdapter = true)
data class AvailabilityResultDto(
    val branchTimeZone: String,
    val currency: String,
    val totalPriceMinor: Long,
    val items: List<AvailabilityItemDto>,
    val eligibleProviderIds: List<String>,
    val days: List<AvailabilityDayDto>,
)

@JsonClass(generateAdapter = true)
data class AvailabilityItemDto(
    val serviceId: String,
    val name: String,
    val durationMinutes: Int,
    val priceMinor: Long,
    val currency: String,
    val isBookableByCustomer: Boolean,
)

@JsonClass(generateAdapter = true)
data class AvailabilityDayDto(
    val date: String,
    val slots: List<AvailabilitySlotDto>,
)

@JsonClass(generateAdapter = true)
data class AvailabilitySlotDto(
    val startAt: String,
    val endAt: String,
    val staffProfileId: String,
)
