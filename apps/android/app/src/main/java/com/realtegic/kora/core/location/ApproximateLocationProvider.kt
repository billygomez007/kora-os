package com.realtegic.kora.core.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlin.coroutines.resume
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

private const val DEFAULT_TIMEOUT_MS = 10_000L

sealed class LocationLookupResult {
    data class Success(val latitude: Double, val longitude: Double) : LocationLookupResult()
    data object PermissionDenied : LocationLookupResult()
    data object ServiceUnavailable : LocationLookupResult()
    data object Timeout : LocationLookupResult()
    data class Unknown(val message: String) : LocationLookupResult()
}

/**
 * Approximate-only location, fetched only on demand -- never on app
 * startup, never continuously tracked, never background (docs task
 * Phase 6). Uses `PRIORITY_BALANCED_POWER_ACCURACY` deliberately, never
 * `PRIORITY_HIGH_ACCURACY`, since the backend's own proximity search is
 * itself only an approximate bounding-box filter -- requesting
 * fine-grained precision here would promise more than either side of
 * the system can actually deliver.
 */
class ApproximateLocationProvider(private val context: Context) {
    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)

    suspend fun getApproximateLocation(timeoutMs: Long = DEFAULT_TIMEOUT_MS): LocationLookupResult {
        if (!hasCoarseLocationPermission()) {
            return LocationLookupResult.PermissionDenied
        }
        return try {
            withTimeout(timeoutMs) { requestLocation() }
        } catch (timeout: TimeoutCancellationException) {
            LocationLookupResult.Timeout
        } catch (security: SecurityException) {
            LocationLookupResult.PermissionDenied
        }
    }

    private fun hasCoarseLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    // Lint cannot see that the only caller (getApproximateLocation) already
    // checked hasCoarseLocationPermission() before reaching this method, and
    // a SecurityException is caught defensively there regardless.
    @SuppressLint("MissingPermission")
    private suspend fun requestLocation(): LocationLookupResult = suspendCancellableCoroutine { continuation ->
        val cancellationSource = CancellationTokenSource()
        continuation.invokeOnCancellation { cancellationSource.cancel() }
        fusedClient.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancellationSource.token)
            .addOnSuccessListener { location ->
                val result = if (location != null) {
                    LocationLookupResult.Success(location.latitude, location.longitude)
                } else {
                    LocationLookupResult.ServiceUnavailable
                }
                if (continuation.isActive) continuation.resume(result)
            }
            .addOnFailureListener { error ->
                if (continuation.isActive) {
                    continuation.resume(LocationLookupResult.Unknown(error.message ?: "Location lookup failed"))
                }
            }
    }
}
