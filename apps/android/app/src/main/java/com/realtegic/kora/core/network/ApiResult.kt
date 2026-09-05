package com.realtegic.kora.core.network

import com.realtegic.kora.core.model.PageInfo

/** The outcome of one API call, never a thrown exception a ViewModel
 * must remember to catch -- every repository method returns this. */
sealed class ApiResult<out T> {
    data class Success<out T>(val value: T, val page: PageInfo? = null) : ApiResult<T>()
    data class Failure(val error: DomainError) : ApiResult<Nothing>()
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(value), page)
    is ApiResult.Failure -> this
}

inline fun <T> ApiResult<T>.onSuccess(action: (T) -> Unit): ApiResult<T> {
    if (this is ApiResult.Success) action(value)
    return this
}

inline fun <T> ApiResult<T>.onFailure(action: (DomainError) -> Unit): ApiResult<T> {
    if (this is ApiResult.Failure) action(error)
    return this
}
