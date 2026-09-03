package com.example.ui.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.model.LineItem
import com.example.data.model.QueueEntry
import com.example.data.model.Service
import com.example.data.model.Staff
import com.example.ui.components.PaymentMethodBadge
import com.example.ui.theme.GoldPrimary
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutDialog(
    queueEntry: QueueEntry?,
    allServices: List<Service>,
    allStaff: List<Staff>,
    currentCashier: Staff?,
    onDismiss: () -> Unit,
    onConfirmPayment: (customerId: String, customerName: String, staff: Staff, cashier: Staff, items: List<LineItem>, paymentMethod: String, queueEntryId: String?) -> Unit
) {
    var customerName by remember { mutableStateOf(queueEntry?.customerName ?: "") }
    var customerPhone by remember { mutableStateOf(queueEntry?.customerPhone ?: "") }
    var selectedStaff by remember {
        mutableStateOf(allStaff.find { it.id == queueEntry?.staffId } ?: allStaff.firstOrNull())
    }
    var selectedPaymentMethod by remember { mutableStateOf("Cash") }
    var serviceDropdownExpanded by remember { mutableStateOf(false) }

    val lineItems = remember {
        mutableStateListOf<LineItem>().apply {
            if (queueEntry != null) {
                val svc = allServices.find { it.id == queueEntry.serviceId }
                add(
                    LineItem(
                        serviceId = queueEntry.serviceId,
                        serviceName = queueEntry.serviceName,
                        price = svc?.price ?: queueEntry.price
                    )
                )
            } else if (allServices.isNotEmpty()) {
                val first = allServices.first()
                add(LineItem(first.id, first.name, first.price))
            }
        }
    }

    val totalAmount = lineItems.sumOf { it.price }
    val paymentMethods = listOf("Cash", "MTN MoMo", "Vodafone Cash", "AT Money", "Card", "Other")

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Checkout & POS",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Record payment for staff confirmation",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(imageVector = Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Customer info
                    item {
                        OutlinedTextField(
                            value = customerName,
                            onValueChange = { customerName = it },
                            label = { Text("Customer Name") },
                            placeholder = { Text("e.g. Kwame Mensah") },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("checkout_customer_name")
                        )
                    }

                    // Staff who did the work
                    item {
                        Text(
                            text = "Staff who performed the service:",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            allStaff.forEach { staff ->
                                val isSelected = selectedStaff?.id == staff.id
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) GoldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable { selectedStaff = staff }
                                        .testTag("checkout_staff_${staff.id}")
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 8.dp, horizontal = 6.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(
                                            text = staff.name.substringBefore(" "),
                                            color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp
                                        )
                                        Text(
                                            text = "${staff.commissionPercent.toInt()}% comm.",
                                            color = if (isSelected) Color.White.copy(alpha = 0.85f) else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontSize = 11.sp
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Line Items
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Services / Items:",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            // Add Service dropdown
                            ExposedDropdownMenuBox(
                                expanded = serviceDropdownExpanded,
                                onExpandedChange = { serviceDropdownExpanded = it }
                            ) {
                                Surface(
                                    color = GoldPrimary.copy(alpha = 0.15f),
                                    shape = RoundedCornerShape(6.dp),
                                    modifier = Modifier
                                        .menuAnchor()
                                        .clip(RoundedCornerShape(6.dp))
                                        .clickable { serviceDropdownExpanded = true }
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Icon(Icons.Default.Add, contentDescription = null, tint = GoldPrimary, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("+ Add Item", color = GoldPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                                ExposedDropdownMenu(
                                    expanded = serviceDropdownExpanded,
                                    onDismissRequest = { serviceDropdownExpanded = false }
                                ) {
                                    allServices.filter { it.active }.forEach { svc ->
                                        DropdownMenuItem(
                                            text = { Text("${svc.name} — GH₵${String.format(Locale.US, "%.2f", svc.price)}") },
                                            onClick = {
                                                lineItems.add(LineItem(svc.id, svc.name, svc.price))
                                                serviceDropdownExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    items(lineItems) { item ->
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                                    .fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = item.serviceName,
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.sp
                                )
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "GH₵ ${String.format(Locale.US, "%.2f", item.price)}",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = GoldPrimary
                                    )
                                    if (lineItems.size > 1) {
                                        IconButton(
                                            onClick = { lineItems.remove(item) },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Delete,
                                                contentDescription = "Remove",
                                                tint = Color.Gray,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Payment Method selector (Ghana realities: Cash / MoMo / etc)
                    item {
                        Text(
                            text = "Payment Method:",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf("Cash", "MTN MoMo", "Vodafone Cash").forEach { method ->
                                    val isSelected = selectedPaymentMethod == method
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isSelected) GoldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { selectedPaymentMethod = method }
                                            .testTag("pay_method_$method")
                                    ) {
                                        Box(
                                            contentAlignment = Alignment.Center,
                                            modifier = Modifier.padding(vertical = 10.dp)
                                        ) {
                                            Text(
                                                text = method,
                                                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf("AT Money", "Card", "Other").forEach { method ->
                                    val isSelected = selectedPaymentMethod == method
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isSelected) GoldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { selectedPaymentMethod = method }
                                            .testTag("pay_method_$method")
                                    ) {
                                        Box(
                                            contentAlignment = Alignment.Center,
                                            modifier = Modifier.padding(vertical = 10.dp)
                                        ) {
                                            Text(
                                                text = method,
                                                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Total & Commission preview note
                    item {
                        Surface(
                            color = Color(0xFFFEF3DE),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Info,
                                    contentDescription = null,
                                    tint = GoldPrimary,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                val commAmt = totalAmount * ((selectedStaff?.commissionPercent ?: 30.0) / 100.0)
                                Text(
                                    text = "This sets status to PAYMENT RECORDED. ${selectedStaff?.name ?: "Staff"} will get notified to confirm GH₵${String.format(Locale.US, "%.2f", commAmt)} commission.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF78350F),
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Total Bar & Submit
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(text = "Total to Collect", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            text = "GH₵ ${String.format(Locale.US, "%.2f", totalAmount)}",
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Button(
                        onClick = {
                            val staff = selectedStaff ?: allStaff.firstOrNull() ?: return@Button
                            val cashier = currentCashier ?: staff
                            onConfirmPayment(
                                queueEntry?.customerId ?: "cust_${System.currentTimeMillis()}",
                                customerName.ifBlank { "Walk-in Customer" },
                                staff,
                                cashier,
                                lineItems.toList(),
                                selectedPaymentMethod,
                                queueEntry?.id
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .height(48.dp)
                            .testTag("submit_record_payment")
                    ) {
                        Text(
                            text = "Record Payment",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                }
            }
        }
    }
}
