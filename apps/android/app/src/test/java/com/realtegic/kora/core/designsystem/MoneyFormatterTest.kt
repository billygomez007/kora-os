package com.realtegic.kora.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyFormatterTest {

    @Test
    fun `formats a 2-decimal currency from integer minor units`() {
        assertEquals("GHS 25.00", MoneyFormatter.format(2500, "GHS"))
    }

    @Test
    fun `never loses precision for an odd amount`() {
        assertEquals("GHS 25.01", MoneyFormatter.format(2501, "GHS"))
    }

    @Test
    fun `does not assume every currency has 2 fraction digits -- zero-decimal currency`() {
        // JPY has zero minor units in real-world usage.
        assertEquals("JPY 2500", MoneyFormatter.format(2500, "JPY"))
    }

    @Test
    fun `three-decimal currency is formatted with three decimal places`() {
        // KWD (Kuwaiti Dinar) has 3 fraction digits.
        assertEquals("KWD 2.500", MoneyFormatter.format(2500, "KWD"))
    }

    @Test
    fun `an unrecognized currency code falls back to 2 decimal places rather than crashing`() {
        assertEquals("NOTACODE 25.00", MoneyFormatter.format(2500, "NOTACODE"))
    }

    @Test
    fun `zero is formatted correctly`() {
        assertEquals("GHS 0.00", MoneyFormatter.format(0, "GHS"))
    }
}
