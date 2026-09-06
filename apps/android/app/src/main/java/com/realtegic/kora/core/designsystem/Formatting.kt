package com.realtegic.kora.core.designsystem

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Currency
import java.util.Locale

/**
 * Money is always formatted from an integer minor-units amount plus its
 * own currency code -- never a Double/Float, and never an assumption
 * that every currency has 2 fraction digits (docs task Phase 7).
 * Prefixes with the ISO currency code rather than a locale-guessed
 * symbol glyph (which the JVM's ICU data may not even have for GHS),
 * so every amount is unambiguous regardless of device locale.
 */
object MoneyFormatter {
    fun format(amountMinor: Long, currencyCode: String): String {
        val fractionDigits = runCatching { Currency.getInstance(currencyCode).defaultFractionDigits }
            .getOrNull()
            ?.takeIf { it >= 0 }
            ?: 2
        val major = BigDecimal(amountMinor).movePointLeft(fractionDigits)
        return "$currencyCode ${major.toPlainString()}"
    }
}

/**
 * The inverse of [MoneyFormatter] for a form field: converts what a
 * business owner typed as a decimal major-unit string (e.g. "25.50")
 * into an exact integer minor-units amount for the given currency --
 * never a Double/Float for the authoritative value itself, only
 * [BigDecimal] arithmetic (docs task "Money values must use integer
 * minor units"). Returns `null` for anything that is not a valid
 * non-negative decimal number.
 */
object MoneyParser {
    fun parseMinorUnits(majorAmountText: String, currencyCode: String): Long? {
        val amount = try {
            BigDecimal(majorAmountText.trim())
        } catch (_: NumberFormatException) {
            return null
        }
        if (amount.signum() < 0) return null
        val fractionDigits = runCatching { Currency.getInstance(currencyCode).defaultFractionDigits }
            .getOrNull()
            ?.takeIf { it >= 0 }
            ?: 2
        return try {
            amount.movePointRight(fractionDigits).setScale(0, RoundingMode.HALF_UP).longValueExact()
        } catch (_: ArithmeticException) {
            null
        }
    }
}

/**
 * Every availability/appointment timestamp from the API is a UTC ISO
 * instant; every display here converts it into the *branch's own* IANA
 * timezone, never the phone's local timezone (docs task Phase 7: "do
 * not reinterpret UTC timestamps using the phone timezone"). Backed by
 * `java.time`, which resolves real IANA tzdata transitions (including
 * DST) correctly without any hand-rolled offset math.
 */
object KoraDateTimeFormatter {
    private val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
    private val dayFormatter = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US)
    private val shortDayFormatter = DateTimeFormatter.ofPattern("EEE", Locale.US)
    private val dayNumberFormatter = DateTimeFormatter.ofPattern("d", Locale.US)

    fun formatTime(utcIso: String, ianaTimeZone: String): String =
        toZoned(utcIso, ianaTimeZone).format(timeFormatter)

    fun formatDay(utcIso: String, ianaTimeZone: String): String =
        toZoned(utcIso, ianaTimeZone).format(dayFormatter)

    /** e.g. "Tue" -- the weekday abbreviation for a compact date chip. */
    fun formatShortDay(utcIso: String, ianaTimeZone: String): String =
        toZoned(utcIso, ianaTimeZone).format(shortDayFormatter)

    /** e.g. "8" -- the bare day-of-month number for a compact date chip. */
    fun formatDayNumber(utcIso: String, ianaTimeZone: String): String =
        toZoned(utcIso, ianaTimeZone).format(dayNumberFormatter)

    /** e.g. "Thu, Sep 3 at 2:30 PM (Africa/Accra)" -- the explicit zone
     * suffix removes any ambiguity about which timezone a time is
     * expressed in, matching "show the branch timezone or location
     * context where ambiguity exists". */
    fun formatDayTimeWithZone(utcIso: String, ianaTimeZone: String): String {
        val zoned = toZoned(utcIso, ianaTimeZone)
        return "${zoned.format(dayFormatter)} at ${zoned.format(timeFormatter)} ($ianaTimeZone)"
    }

    fun zoneShortName(ianaTimeZone: String): String =
        ZoneId.of(ianaTimeZone).getDisplayName(TextStyle.SHORT, Locale.US)

    private fun toZoned(utcIso: String, ianaTimeZone: String) =
        Instant.parse(utcIso).atZone(ZoneId.of(ianaTimeZone))
}
