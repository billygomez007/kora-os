package com.realtegic.kora.core.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class FavoriteToggleResponseDto(val favorited: Boolean)
