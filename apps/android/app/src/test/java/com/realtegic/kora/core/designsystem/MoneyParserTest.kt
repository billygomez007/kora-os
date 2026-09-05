package com.realtegic.kora.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MoneyParserTest {

    @Test
    fun `parses a plain decimal amount into minor units for a 2-decimal currency`() {
        assertEquals(2550L, MoneyParser.parseMinorUnits("25.50", "GHS"))
    }

    @Test
    fun `parses a whole-number amount with no decimal point`() {
        assertEquals(3000L, MoneyParser.parseMinorUnits("30", "GHS"))
    }

    @Test
    fun `rounds half-up for a value with more precision than the currency supports`() {
        assertEquals(1001L, MoneyParser.parseMinorUnits("10.005", "GHS"))
    }

    @Test
    fun `respects a zero-decimal currency such as JPY`() {
        assertEquals(500L, MoneyParser.parseMinorUnits("500", "JPY"))
    }

    @Test
    fun `respects a 3-decimal currency such as KWD`() {
        assertEquals(25500L, MoneyParser.parseMinorUnits("25.5", "KWD"))
    }

    @Test
    fun `zero is a valid amount`() {
        assertEquals(0L, MoneyParser.parseMinorUnits("0", "GHS"))
    }

    @Test
    fun `rejects a negative amount`() {
        assertNull(MoneyParser.parseMinorUnits("-5.00", "GHS"))
    }

    @Test
    fun `rejects text that is not a number`() {
        assertNull(MoneyParser.parseMinorUnits("not a number", "GHS"))
    }

    @Test
    fun `rejects an empty string`() {
        assertNull(MoneyParser.parseMinorUnits("", "GHS"))
    }

    @Test
    fun `falls back to 2 decimal digits for an unrecognized currency code`() {
        assertEquals(1250L, MoneyParser.parseMinorUnits("12.50", "NOTACODE"))
    }
}
