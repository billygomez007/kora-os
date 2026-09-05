package com.realtegic.kora.core.network

/** The thin seam between the network layer and [com.realtegic.kora.core.session.SessionManager] --
 * kept as an interface so `core.network` never needs a concrete
 * dependency on `core.session`'s implementation details. */
interface AccessTokenProvider {
    fun currentAccessToken(): String?
}
