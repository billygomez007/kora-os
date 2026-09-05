package com.realtegic.kora.core.network

import com.realtegic.kora.core.model.ApiSuccessEnvelope
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET

@JsonClass(generateAdapter = true)
data class TestPayload(val value: String)

interface TestApi {
    @GET("thing")
    suspend fun get(): Response<ApiSuccessEnvelope<TestPayload>>
}

/** Exercises [safeApiCall] end to end against a real (loopback)
 * MockWebServer -- envelope parsing, every mapped [DomainError], the
 * `x-request-id` header, and genuine network-unreachable handling (docs
 * task Phase 12: "response-envelope parsing", "error-envelope mapping",
 * "request ID header"). */
class SafeApiCallTest {
    private lateinit var server: MockWebServer
    private lateinit var api: TestApi
    private val moshi = Moshi.Builder().build()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val client = OkHttpClient.Builder().addInterceptor(RequestIdInterceptor()).build()
        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
        api = retrofit.create(TestApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `parses a success envelope into the typed payload`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"data":{"value":"hello"},"meta":{"requestId":"abc"}}"""))

        val result = safeApiCall(moshi) { api.get() }

        assertTrue(result is ApiResult.Success)
        assertEquals("hello", (result as ApiResult.Success).value.value)
    }

    @Test
    fun `every outgoing request carries an x-request-id header`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"data":{"value":"hi"},"meta":{"requestId":"x"}}"""))

        safeApiCall(moshi) { api.get() }

        val recorded = server.takeRequest()
        assertNotNull(recorded.getHeader(REQUEST_ID_HEADER))
        assertTrue(recorded.getHeader(REQUEST_ID_HEADER)!!.isNotBlank())
    }

    @Test
    fun `maps 400 to Validation`() = runTest {
        enqueueError(400, "BAD_REQUEST", "Request validation failed")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.Validation)
    }

    @Test
    fun `maps 401 to Unauthorized`() = runTest {
        enqueueError(401, "UNAUTHORIZED", "Authentication is required")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.Unauthorized)
    }

    @Test
    fun `maps 403 to Forbidden`() = runTest {
        enqueueError(403, "FORBIDDEN", "You do not have access")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.Forbidden)
    }

    @Test
    fun `maps 404 to NotFound`() = runTest {
        enqueueError(404, "NOT_FOUND", "Not found")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.NotFound)
    }

    @Test
    fun `maps a generic 409 to Conflict, preserving the server code`() = runTest {
        enqueueError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different request.")
        val result = safeApiCall(moshi) { api.get() }
        val error = (result as ApiResult.Failure).error as DomainError.Conflict
        assertEquals("IDEMPOTENCY_KEY_REUSED", error.code)
    }

    @Test
    fun `maps 409 SLOT_UNAVAILABLE to the dedicated SlotUnavailable case`() = runTest {
        enqueueError(409, "SLOT_UNAVAILABLE", "This time is no longer available.")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.SlotUnavailable)
    }

    @Test
    fun `maps 429 to RateLimited`() = runTest {
        enqueueError(429, "RATE_LIMITED", "Too many requests")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.RateLimited)
    }

    @Test
    fun `maps 500 to ServerUnavailable`() = runTest {
        enqueueError(500, "INTERNAL_SERVER_ERROR", "Something broke")
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.ServerUnavailable)
    }

    @Test
    fun `a malformed error body still maps safely rather than throwing`() = runTest {
        server.enqueue(MockResponse().setResponseCode(500).setBody("not json at all"))
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.ServerUnavailable)
    }

    @Test
    fun `an unreachable server maps to NetworkUnavailable, never a raw exception`() = runTest {
        server.shutdown()
        val result = safeApiCall(moshi) { api.get() }
        assertTrue((result as ApiResult.Failure).error is DomainError.NetworkUnavailable)
    }

    private fun enqueueError(status: Int, code: String, message: String) {
        server.enqueue(
            MockResponse()
                .setResponseCode(status)
                .setBody("""{"error":{"code":"$code","message":"$message","retryable":false},"meta":{"requestId":"x"}}"""),
        )
    }
}
