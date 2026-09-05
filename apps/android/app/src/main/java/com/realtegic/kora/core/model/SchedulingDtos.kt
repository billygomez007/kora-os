package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

/** `dayOfWeek` matches the backend's own convention: 0 = Sunday .. 6 =
 * Saturday (JS `Date#getDay()`), never a different indexing. Times are
 * 24-hour "HH:mm" wall-clock strings interpreted under the branch's own
 * timeZone -- never converted through the phone's local time. */
@JsonClass(generateAdapter = true)
data class BusinessHoursIntervalDto(
    val dayOfWeek: Int,
    val startLocalTime: String,
    val endLocalTime: String,
)

@JsonClass(generateAdapter = true)
data class ReplaceBusinessHoursRequest(
    val intervals: List<BusinessHoursIntervalDto>,
)

@JsonClass(generateAdapter = true)
data class ScheduleExceptionIntervalDto(
    val startLocalTime: String,
    val endLocalTime: String,
)

@JsonClass(generateAdapter = true)
data class BranchScheduleExceptionDto(
    val id: String,
    val branchId: String,
    val date: String,
    val type: String,
    val intervals: List<ScheduleExceptionIntervalDto>,
    val reason: String?,
)

@JsonClass(generateAdapter = true)
data class CreateBranchScheduleExceptionRequest(
    val date: String,
    val type: String,
    val intervals: List<ScheduleExceptionIntervalDto>? = null,
    val reason: String? = null,
)

@JsonClass(generateAdapter = true)
data class BookingPolicyDto(
    val slotIntervalMinutes: Int,
    val minBookingLeadTimeMinutes: Int,
    val maxBookingHorizonDays: Int,
    val bufferBeforeMinutes: Int,
    val bufferAfterMinutes: Int,
    val cancellationCutoffMinutes: Int,
    val allowCustomerProviderSelection: Boolean,
    val allowAnyProvider: Boolean,
)

@JsonClass(generateAdapter = true)
data class UpsertBookingPolicyRequest(
    val slotIntervalMinutes: Int? = null,
    val minBookingLeadTimeMinutes: Int? = null,
    val maxBookingHorizonDays: Int? = null,
    val bufferBeforeMinutes: Int? = null,
    val bufferAfterMinutes: Int? = null,
    val cancellationCutoffMinutes: Int? = null,
    val allowCustomerProviderSelection: Boolean? = null,
    val allowAnyProvider: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class StaffAvailabilityRuleIntervalDto(
    val dayOfWeek: Int,
    val startLocalTime: String,
    val endLocalTime: String,
    val effectiveFrom: String? = null,
    val effectiveUntil: String? = null,
)

@JsonClass(generateAdapter = true)
data class ReplaceStaffAvailabilityRulesRequest(
    val intervals: List<StaffAvailabilityRuleIntervalDto>,
)

@JsonClass(generateAdapter = true)
data class StaffAvailabilityExceptionDto(
    val id: String,
    val staffProfileId: String,
    val date: String,
    val type: String,
    val isFullDay: Boolean,
    val startLocalTime: String?,
    val endLocalTime: String?,
    val reason: String?,
)

@JsonClass(generateAdapter = true)
data class CreateStaffAvailabilityExceptionRequest(
    val date: String,
    val type: String,
    val isFullDay: Boolean? = null,
    val startLocalTime: String? = null,
    val endLocalTime: String? = null,
    val reason: String? = null,
)
