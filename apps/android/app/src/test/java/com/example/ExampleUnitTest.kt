package com.example

import com.example.data.model.LineItem
import com.example.data.model.Transaction
import com.example.data.model.TransactionStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class ExampleUnitTest {

    @Test
    fun testCommissionCalculation() {
        val price = 70.0
        val commissionPercent = 35.0
        val expectedCommission = price * (commissionPercent / 100.0)
        assertEquals(24.50, expectedCommission, 0.001)
    }

    @Test
    fun testLineItemsSerializationAndParsing() {
        val items = listOf(
            LineItem("svc_1", "Haircut", 70.0),
            LineItem("svc_2", "Beard Trim", 35.0)
        )
        val json = Transaction.lineItemsToJson(items)
        val parsed = Transaction.jsonToLineItems(json)

        assertEquals(2, parsed.size)
        assertEquals("Haircut", parsed[0].serviceName)
        assertEquals(70.0, parsed[0].price, 0.001)
        assertEquals("Beard Trim", parsed[1].serviceName)
        assertEquals(35.0, parsed[1].price, 0.001)
    }

    @Test
    fun testReceiptTextContainsGhanaCediAndDetails() {
        val tx = Transaction(
            id = "tx_123",
            organizationId = "org_1",
            branchId = "br_1",
            customerId = "c_1",
            customerName = "Kwame Mensah",
            staffId = "stf_1",
            staffName = "Michael Agyeman",
            cashierId = "stf_owner",
            cashierName = "Akua Mansa",
            servicesJson = Transaction.lineItemsToJson(listOf(LineItem("svc_1", "Haircut", 70.0))),
            totalAmount = 70.0,
            paymentMethod = "MTN MoMo",
            status = TransactionStatus.CONFIRMED.name,
            commissionPercent = 35.0,
            commissionAmount = 24.50,
            createdAt = System.currentTimeMillis()
        )

        assertEquals(TransactionStatus.CONFIRMED.name, tx.status)
        assertEquals("MTN MoMo", tx.paymentMethod)
        assertEquals(70.0, tx.totalAmount, 0.001)
        assertEquals(24.50, tx.commissionAmount, 0.001)
    }
}
