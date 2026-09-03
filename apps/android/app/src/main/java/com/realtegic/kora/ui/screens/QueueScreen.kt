package com.realtegic.kora.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.realtegic.kora.data.model.QueueEntry
import com.realtegic.kora.data.model.QueueStatus
import com.realtegic.kora.data.model.Staff
import com.realtegic.kora.ui.components.QueueStatusBadge
import com.realtegic.kora.ui.theme.GoldPrimary
import com.realtegic.kora.ui.theme.StatusBlue
import com.realtegic.kora.ui.theme.StatusGreen
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun QueueScreen(
    queueList: List<QueueEntry>,
    currentStaffUser: Staff?,
    onUpdateStatus: (QueueEntry, QueueStatus) -> Unit,
    onCheckout: (QueueEntry) -> Unit,
    onRemove: (String) -> Unit,
    onAddWalkIn: () -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedFilter by remember { mutableStateOf("ALL") } // ALL, WAITING, IN_SERVICE, COMPLETED

    val filteredList = when (selectedFilter) {
        "WAITING" -> queueList.filter { it.status == "WAITING" }
        "IN_SERVICE" -> queueList.filter { it.status == "IN_SERVICE" }
        "COMPLETED" -> queueList.filter { it.status == "COMPLETED" }
        else -> queueList
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = onAddWalkIn,
                containerColor = GoldPrimary,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .padding(bottom = 70.dp)
                    .testTag("fab_add_walkin")
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add Walk-In")
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Add Walk-In", fontWeight = FontWeight.Bold)
                }
            }
        },
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
        ) {
            Spacer(modifier = Modifier.height(8.dp))

            // Filter Tabs
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf(
                    Pair("ALL", "All (${queueList.size})"),
                    Pair("WAITING", "Waiting (${queueList.count { it.status == "WAITING" }})"),
                    Pair("IN_SERVICE", "In Service (${queueList.count { it.status == "IN_SERVICE" }})"),
                    Pair("COMPLETED", "Done (${queueList.count { it.status == "COMPLETED" }})")
                ).forEach { (key, label) ->
                    val isSelected = selectedFilter == key
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (isSelected) GoldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(20.dp))
                            .clickable { selectedFilter = key }
                            .testTag("filter_queue_$key")
                    ) {
                        Text(
                            text = label,
                            color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(vertical = 8.dp, horizontal = 2.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.ContentCut,
                            contentDescription = null,
                            tint = Color.LightGray,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "No customers in this queue state",
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(onClick = onAddWalkIn) {
                            Text("+ Add First Walk-In")
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 120.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(filteredList) { entry ->
                        QueueItemCard(
                            entry = entry,
                            currentStaffUser = currentStaffUser,
                            onUpdateStatus = onUpdateStatus,
                            onCheckout = onCheckout,
                            onRemove = onRemove
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun QueueItemCard(
    entry: QueueEntry,
    currentStaffUser: Staff?,
    onUpdateStatus: (QueueEntry, QueueStatus) -> Unit,
    onCheckout: (QueueEntry) -> Unit,
    onRemove: (String) -> Unit
) {
    val sdf = SimpleDateFormat("hh:mm a", Locale.getDefault())
    val timeStr = sdf.format(Date(entry.createdAt))

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(1.dp),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("queue_card_${entry.id}")
    ) {
        Column(
            modifier = Modifier
                .padding(14.dp)
                .fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = entry.customerName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (entry.customerPhone.isNotBlank()) {
                        Text(
                            text = " • ${entry.customerPhone}",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                QueueStatusBadge(status = entry.status)
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Service: ${entry.serviceName}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Stylist: ${entry.staffName} • In queue: $timeStr",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (entry.notes.isNotBlank()) {
                        Text(
                            text = "Note: ${entry.notes}",
                            fontSize = 11.sp,
                            color = GoldPrimary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                if (entry.price > 0) {
                    Text(
                        text = "GH₵ ${String.format(Locale.US, "%.2f", entry.price)}",
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp,
                        color = GoldPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Action Buttons based on status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                when (entry.status) {
                    "WAITING" -> {
                        Button(
                            onClick = { onUpdateStatus(entry, QueueStatus.IN_SERVICE) },
                            colors = ButtonDefaults.buttonColors(containerColor = StatusBlue),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .testTag("btn_start_service_${entry.id}")
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Start Service", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                    "IN_SERVICE" -> {
                        Button(
                            onClick = { onUpdateStatus(entry, QueueStatus.COMPLETED) },
                            colors = ButtonDefaults.buttonColors(containerColor = StatusGreen),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .testTag("btn_complete_service_${entry.id}")
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Mark Completed", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                    "COMPLETED" -> {
                        Button(
                            onClick = { onCheckout(entry) },
                            colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .testTag("btn_checkout_${entry.id}")
                        ) {
                            Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("POS Checkout & Pay", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }

                IconButton(
                    onClick = { onRemove(entry.id) },
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Cancel/Remove",
                        tint = Color.Gray,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
