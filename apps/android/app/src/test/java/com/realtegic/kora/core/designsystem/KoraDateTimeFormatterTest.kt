package com.realtegic.kora.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Test

class KoraDateTimeFormatterTest {

    @Test
    fun `formats a UTC instant in a zero-offset branch timezone -- Africa Accra has no DST`() {
        // 2026-09-05T14:30:00Z, Africa/Accra has no UTC offset year-round.
        assertEquals("2:30 PM", KoraDateTimeFormatter.formatTime("2026-09-05T14:30:00Z", "Africa/Accra"))
        assertEquals("Sat, Sep 5", KoraDateTimeFormatter.formatDay("2026-09-05T14:30:00Z", "Africa/Accra"))
    }

    @Test
    fun `never reinterprets the UTC instant using a different zone -- same instant, different branch zone, different local time`() {
        val utcInstant = "2026-09-05T14:30:00Z"
        assertEquals("2:30 PM", KoraDateTimeFormatter.formatTime(utcInstant, "Africa/Accra")) // UTC+0
        assertEquals("10:30 AM", KoraDateTimeFormatter.formatTime(utcInstant, "America/New_York")) // UTC-4 in September (EDT)
    }

    @Test
    fun `handles a DST-observing zone correctly in summer (DST active)`() {
        // 2026-07-01T12:00:00Z -- America/New_York is in EDT (UTC-4) in July.
        assertEquals("8:00 AM", KoraDateTimeFormatter.formatTime("2026-07-01T12:00:00Z", "America/New_York"))
    }

    @Test
    fun `handles the same DST-observing zone correctly in winter (DST inactive)`() {
        // 2026-01-01T12:00:00Z -- America/New_York is in EST (UTC-5) in January.
        assertEquals("7:00 AM", KoraDateTimeFormatter.formatTime("2026-01-01T12:00:00Z", "America/New_York"))
    }

    @Test
    fun `dayTimeWithZone includes the explicit IANA zone id to remove ambiguity`() {
        val formatted = KoraDateTimeFormatter.formatDayTimeWithZone("2026-09-05T14:30:00Z", "Africa/Accra")
        assertEquals("Sat, Sep 5 at 2:30 PM (Africa/Accra)", formatted)
    }

    @Test
    fun `zone short name resolves to a real abbreviation`() {
        assertEquals("GMT", KoraDateTimeFormatter.zoneShortName("Africa/Accra"))
    }
}
