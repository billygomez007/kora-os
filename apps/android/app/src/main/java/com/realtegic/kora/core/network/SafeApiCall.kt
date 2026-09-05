package com.realtegic.kora.core.network

import com.realtegic.kora.core.model.ApiErrorEnvelope
import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.realtegic.kora.core.model.PageInfo
import com.squareup.moshi.Moshi
import java.io.IOException
import kotlinx.coroutines.CancellationException
import retrofit2.Response

/**
 * Wraps one Retrofit call returning the standard success envelope into
 * an [ApiResult], translating a non-2xx response's error envelope into
 * a typed [DomainError] (docs task Phase 2: "structured error mapping").
 * [CancellationException] is always rethrown, never converted into a
 * [DomainError.Unknown] -- coroutine cancellation must propagate
 * (docs task Phase 2: "cancellation support").
 */
suspend fun <T> safeApiCall(
    errorAdapter: Moshi,
    block: suspend () -> Response<ApiSuccessEnvelope<T>>,
): ApiResult<T> {
    return try {
        val response = block()
        if (response.isSuccessful) {
            val body = response.body()
            if (body == null) {
                ApiResult.Failure(DomainError.Unknown("Empty response from server."))
            } else {
                ApiResult.Success(body.data, body.page)
            }
        } else {
            ApiResult.Failure(mapHttpError(response.code(), errorAdapter, response.errorBody()?.string()))
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (io: IOException) {
        ApiResult.Failure(DomainError.NetworkUnavailable)
    } catch (unexpected: Exception) {
        ApiResult.Failure(DomainError.Unknown(unexpected.message ?: "Something went wrong."))
    }
}

/**
 * Some endpoints' data legitimately may be absent at the JSON level
 * (e.g. a business profile no organization has configured yet, returned
 * as `"data": null` rather than a 404) -- Moshi's codegen for the
 * shared generic [ApiSuccessEnvelope] cannot express a nullable `T` at
 * one call site (it enforces non-null from the class's own unbound
 * type-parameter declaration regardless of how a caller instantiates
 * it), so callers use a concrete, purpose-built envelope class with a
 * directly nullable `data` field instead of [ApiSuccessEnvelope].
 */
suspend fun <TEnvelope, T> safeNullableApiCall(
    errorAdapter: Moshi,
    extractData: (TEnvelope) -> T?,
    extractPage: (TEnvelope) -> PageInfo?,
    block: suspend () -> Response<TEnvelope>,
): ApiResult<T?> {
    return try {
        val response = block()
        if (response.isSuccessful) {
            val body = response.body()
            if (body == null) {
                ApiResult.Failure(DomainError.Unknown("Empty response from server."))
            } else {
                ApiResult.Success(extractData(body), extractPage(body))
            }
        } else {
            ApiResult.Failure(mapHttpError(response.code(), errorAdapter, response.errorBody()?.string()))
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (io: IOException) {
        ApiResult.Failure(DomainError.NetworkUnavailable)
    } catch (unexpected: Exception) {
        ApiResult.Failure(DomainError.Unknown(unexpected.message ?: "Something went wrong."))
    }
}

/** For a 204 No Content endpoint (logout, logout-all, revoke-session)
 * where there is no envelope body to parse at all -- only the HTTP
 * status and, on failure, the error envelope matter. */
suspend fun safeUnitApiCall(
    errorAdapter: Moshi,
    block: suspend () -> Response<Unit>,
): ApiResult<Unit> {
    return try {
        val response = block()
        if (response.isSuccessful) {
            ApiResult.Success(Unit)
        } else {
            ApiResult.Failure(mapHttpError(response.code(), errorAdapter, response.errorBody()?.string()))
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (io: IOException) {
        ApiResult.Failure(DomainError.NetworkUnavailable)
    } catch (unexpected: Exception) {
        ApiResult.Failure(DomainError.Unknown(unexpected.message ?: "Something went wrong."))
    }
}

private fun mapHttpError(httpStatus: Int, moshi: Moshi, rawErrorBody: String?): DomainError {
    val parsed = rawErrorBody?.let {
        try {
            moshi.adapter(ApiErrorEnvelope::class.java).fromJson(it)
        } catch (_: Exception) {
            null
        }
    }
    val code = parsed?.error?.code ?: "UNKNOWN"
    val message = parsed?.error?.message ?: "Something went wrong. Please try again."

    return when {
        code == "SLOT_UNAVAILABLE" -> DomainError.SlotUnavailable
        code == "SUBSCRIPTION_UNAVAILABLE" -> DomainError.SubscriptionBlocked
        // The email-OTP verify endpoint deliberately collapses incorrect,
        // expired, consumed, invalidated, and locked challenges into one
        // generic 401 (anti-enumeration -- never reveal which specific
        // reason applied). Left to the generic `httpStatus == 401` branch
        // below, this would show "Your session has expired," which is
        // wrong and confusing before any session has ever existed.
        code == "OTP_INVALID" -> DomainError.Validation(message)
        httpStatus == 400 || code == "VALIDATION_FAILED" -> DomainError.Validation(message)
        httpStatus == 401 -> DomainError.Unauthorized
        httpStatus == 403 -> DomainError.Forbidden(code = parsed?.error?.code, details = message)
        httpStatus == 404 -> DomainError.NotFound
        httpStatus == 409 -> DomainError.Conflict(code, message)
        httpStatus == 429 -> DomainError.RateLimited
        httpStatus >= 500 -> DomainError.ServerUnavailable
        else -> DomainError.Unknown(message)
    }
}
