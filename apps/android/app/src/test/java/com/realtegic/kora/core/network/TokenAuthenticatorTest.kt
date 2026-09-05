package com.realtegic.kora.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private class FakeRefreshCoordinator(private val result: String?) : RefreshCoordinator {
    var callCount = 0
    var lastFailedToken: String? = null

    override suspend fun refreshIfNeeded(failedAccessToken: String?): String? {
        callCount++
        lastFailedToken = failedAccessToken
        return result
    }
}

private fun request(path: String, bearerToken: String? = "old-access-token"): Request {
    val builder = Request.Builder().url("http://10.0.2.2:3000/v1/$path")
    if (bearerToken != null) builder.header("Authorization", "Bearer $bearerToken")
    return builder.build()
}

private fun response(request: Request, prior: Response? = null): Response =
    Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(401)
        .message("Unauthorized")
        .apply { if (prior != null) priorResponse(prior) }
        .build()

/**
 * `retry an original request at most once` and `never create a refresh
 * loop` (docs task Phase 3). The single-flight refresh coordination
 * itself is covered by SessionManagerTest -- this class only proves
 * [TokenAuthenticator] extracts the right failed token, rebuilds the
 * request correctly, and refuses to ever touch the auth endpoints or
 * retry a second time.
 */
class TokenAuthenticatorTest {

    @Test
    fun `on a 401, extracts the failed bearer token and retries with the refreshed one`() = runTest {
        val coordinator = FakeRefreshCoordinator(result = "new-access-token")
        val authenticator = TokenAuthenticator(coordinator)
        val req = request("me")

        val retried = authenticator.authenticate(null, response(req))

        assertEquals("old-access-token", coordinator.lastFailedToken)
        assertEquals("Bearer new-access-token", retried?.header("Authorization"))
    }

    @Test
    fun `gives up (returns null) when refresh fails, never retrying`() = runTest {
        val coordinator = FakeRefreshCoordinator(result = null)
        val authenticator = TokenAuthenticator(coordinator)

        val retried = authenticator.authenticate(null, response(request("me")))

        assertNull(retried)
    }

    @Test
    fun `never retries a request a second time`() = runTest {
        val coordinator = FakeRefreshCoordinator(result = "new-access-token")
        val authenticator = TokenAuthenticator(coordinator)
        val req = request("me")
        val firstFailure = response(req)
        val secondFailure = response(req, prior = firstFailure)

        val retried = authenticator.authenticate(null, secondFailure)

        assertNull(retried)
        assertEquals(0, coordinator.callCount)
    }

    @Test
    fun `never intercepts the auth endpoints themselves, preventing a refresh loop`() = runTest {
        val coordinator = FakeRefreshCoordinator(result = "new-access-token")
        val authenticator = TokenAuthenticator(coordinator)

        val retried = authenticator.authenticate(null, response(request("auth/refresh")))

        assertNull(retried)
        assertEquals(0, coordinator.callCount)
    }

    @Test
    fun `still refuses auth endpoints even when the request carried no Authorization header`() = runTest {
        val coordinator = FakeRefreshCoordinator(result = "new-access-token")
        val authenticator = TokenAuthenticator(coordinator)

        val retried = authenticator.authenticate(null, response(request("auth/email-otp/verify", bearerToken = null)))

        assertNull(retried)
        assertEquals(0, coordinator.callCount)
    }
}
