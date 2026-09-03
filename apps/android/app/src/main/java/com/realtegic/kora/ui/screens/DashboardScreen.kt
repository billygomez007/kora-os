package com.realtegic.kora.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.realtegic.kora.data.model.Organization
import com.realtegic.kora.data.model.QueueEntry
import com.realtegic.kora.data.model.Staff
import com.realtegic.kora.data.model.Transaction
import com.realtegic.kora.data.model.TransactionStatus
import com.realtegic.kora.ui.components.PaymentMethodBadge
import com.realtegic.kora.ui.components.StatCard
import com.realtegic.kora.ui.components.TransactionStatusBadge
import com.realtegic.kora.ui.theme.GoldContainer
import com.realtegic.kora.ui.theme.GoldPrimary
import com.realtegic.kora.ui.theme.StatusAmber
import com.realtegic.kora.ui.theme.StatusAmberBg
import com.realtegic.kora.ui.theme.StatusBlue
import com.realtegic.kora.ui.theme.StatusGreen
import com.realtegic.kora.ui.theme.StatusGreenBg
import com.realtegic.kora.ui.theme.StatusRed
import com.realtegic.kora.ui.theme.StatusRedBg
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DashboardScreen(
    organization: Organization?,
    staffList: List<Staff>,
    queueList: List<QueueEntry>,
    transactionsList: List<Transaction>,
    currentStaffUser: Staff?,
    onNavigateToQueue: () -> Unit,
    onNavigateToConfirmations: () -> Unit,
    onViewReceipt: (Transaction) -> Unit,
    onResolveDispute: (Transaction) -> Unit,
    onStartCheckout: () -> Unit,
    onAddWalkIn: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Calculations: Confirmed revenue only!
    val confirmedTransactions = transactionsList.filter { it.status == TransactionStatus.CONFIRMED.name }
    val todayRevenue = confirmedTransactions.sumOf { it.totalAmount }
    val disputedTransactions = transactionsList.filter { it.status == TransactionStatus.DISPUTED.name }
    val pendingTransactions = transactionsList.filter { it.status == TransactionStatus.PAYMENT_RECORDED.name }

    val waitingQueueCount = queueList.count { it.status == "WAITING" }
    val inServiceQueueCount = queueList.count { it.status == "IN_SERVICE" }
    val completedQueueCount = queueList.count { it.status == "COMPLETED" }
    val todayCustomerCount = (transactionsList.map { it.customerId } + queueList.map { it.customerId }).distinct().size

    val isOwner = currentStaffUser?.role.equals("owner", ignoreCase = true)

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 80.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Quick Actions Row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onAddWalkIn,
                    colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .testTag("dash_add_walkin_btn")
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("+ Add Walk-In", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }

                Button(
                    onClick = onStartCheckout,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .testTag("dash_pos_checkout_btn")
                ) {
                    Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("POS Checkout", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }

        // 1. Alert Banner: Disputed Transactions needing Owner attention
        if (disputedTransactions.isNotEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = StatusRedBg),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("disputed_alert_banner")
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = StatusRed,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "${disputedTransactions.size} Disputed Transaction(s) Need Attention",
                                color = StatusRed,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Staff reported payment discrepancy. Tap Resolve once verified with Cashier.",
                            fontSize = 12.sp,
                            color = Color(0xFF7F1D1D)
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        disputedTransactions.forEach { tx ->
                            Surface(
                                color = Color.White,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .padding(10.dp)
                                        .fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "GH₵ ${String.format(Locale.US, "%.2f", tx.totalAmount)} • ${tx.customerName}",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = Color(0xFF111827)
                                        )
                                        Text(
                                            text = "Staff: ${tx.staffName} • Cashier: ${tx.cashierName}",
                                            fontSize = 11.sp,
                                            color = Color(0xFF6B7280)
                                        )
                                        if (!tx.disputeReason.isNullOrBlank()) {
                                            Text(
                                                text = "Note: ${tx.disputeReason}",
                                                fontSize = 11.sp,
                                                color = StatusRed,
                                                fontWeight = FontWeight.Medium
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Button(
                                        onClick = { onResolveDispute(tx) },
                                        colors = ButtonDefaults.buttonColors(containerColor = StatusGreen),
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.height(36.dp).testTag("resolve_dispute_${tx.id}")
                                    ) {
                                        Text("Resolve", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Pending Confirmations Alert
        if (pendingTransactions.isNotEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = StatusAmberBg),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onNavigateToConfirmations() }
                        .testTag("pending_confirmations_banner")
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.HourglassEmpty,
                                contentDescription = null,
                                tint = StatusAmber,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = "${pendingTransactions.size} Payment(s) Awaiting Confirmation",
                                    color = Color(0xFF92400E),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp
                                )
                                Text(
                                    text = "Tap to review & verify payouts",
                                    fontSize = 11.sp,
                                    color = Color(0xFFB45309)
                                )
                            }
                        }
                        Icon(
                            imageVector = Icons.Default.KeyboardArrowRight,
                            contentDescription = null,
                            tint = Color(0xFF92400E)
                        )
                    }
                }
            }
        }

        // 3. Primary KPI Cards
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                StatCard(
                    title = "Today's Revenue",
                    value = "GH₵ ${String.format(Locale.US, "%.2f", todayRevenue)}",
                    subtitle = "Confirmed payouts only",
                    icon = Icons.Default.Payments,
                    accentColor = GoldPrimary,
                    modifier = Modifier.weight(1f)
                )

                StatCard(
                    title = "Customers Served",
                    value = "$todayCustomerCount",
                    subtitle = "$completedQueueCount completed today",
                    icon = Icons.Default.People,
                    accentColor = StatusGreen,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // 4. Live Queue Snapshot
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(14.dp),
                elevation = CardDefaults.cardElevation(1.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { onNavigateToQueue() }
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "LIVE QUEUE STATUS",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            letterSpacing = 0.5.sp
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "View Queue",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = GoldPrimary
                            )
                            Icon(
                                imageVector = Icons.Default.KeyboardArrowRight,
                                contentDescription = null,
                                tint = GoldPrimary,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Waiting
                        Surface(
                            color = StatusAmberBg,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = "$waitingQueueCount", fontSize = 20.sp, fontWeight = FontWeight.Black, color = StatusAmber)
                                Text(text = "Waiting", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = StatusAmber)
                            }
                        }

                        // In Service
                        Surface(
                            color = StatusBlue.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = "$inServiceQueueCount", fontSize = 20.sp, fontWeight = FontWeight.Black, color = StatusBlue)
                                Text(text = "In Service", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = StatusBlue)
                            }
                        }

                        // Completed
                        Surface(
                            color = StatusGreenBg,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = "$completedQueueCount", fontSize = 20.sp, fontWeight = FontWeight.Black, color = StatusGreen)
                                Text(text = "Completed", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = StatusGreen)
                            }
                        }
                    }
                }
            }
        }

        // 5. Staff Commission Breakdown (Today's Leaderboard)
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(14.dp),
                elevation = CardDefaults.cardElevation(1.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "STAFF COMMISSION SUMMARY",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    val staffWithoutOwner = staffList.filter { it.role != "owner" }
                    if (staffWithoutOwner.isEmpty()) {
                        Text(
                            text = "No staff members added yet.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        staffWithoutOwner.forEach { staff ->
                            val staffConfirmedTxs = confirmedTransactions.filter { it.staffId == staff.id }
                            val totalCommission = staffConfirmedTxs.sumOf { it.commissionAmount }
                            val jobsCount = staffConfirmedTxs.size

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(32.dp)
                                            .clip(CircleShape)
                                            .background(Color(staff.avatarColor).copy(alpha = 0.2f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = staff.name.take(1),
                                            color = Color(staff.avatarColor),
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column {
                                        Text(
                                            text = staff.name,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = "${staff.commissionPercent.toInt()}% commission rate • $jobsCount jobs",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }

                                Text(
                                    text = "GH₵ ${String.format(Locale.US, "%.2f", totalCommission)}",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 15.sp,
                                    color = GoldPrimary
                                )
                            }
                            HorizontalDivider(color = Color(0xFFF1F5F9), thickness = 1.dp)
                        }
                    }
                }
            }
        }

        // 6. Recent Transactions
        item {
            Text(
                text = "RECENT TRANSACTIONS",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 0.5.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        if (transactionsList.isEmpty()) {
            item {
                Text(
                    text = "No transactions recorded today.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }
        } else {
            items(transactionsList.take(5)) { tx ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    shape = RoundedCornerShape(12.dp),
                    elevation = CardDefaults.cardElevation(1.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onViewReceipt(tx) }
                        .testTag("tx_card_${tx.id}")
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = tx.customerName,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                PaymentMethodBadge(method = tx.paymentMethod)
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Staff: ${tx.staffName} • Cashier: ${tx.cashierName}",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            TransactionStatusBadge(status = tx.status)
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "GH₵ ${String.format(Locale.US, "%.2f", tx.totalAmount)}",
                                fontWeight = FontWeight.Black,
                                fontSize = 16.sp,
                                color = GoldPrimary
                            )
                            Text(
                                text = "Receipt ›",
                                fontSize = 11.sp,
                                color = GoldPrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }
}
