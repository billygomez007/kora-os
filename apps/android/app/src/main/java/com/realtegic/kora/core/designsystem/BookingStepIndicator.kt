package com.realtegic.kora.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

/** A shared "step N of totalSteps" progress bar for the customer booking
 * wizard (docs task Customer Marketplace Design Batch 02: every step
 * reference shows this same bar across Choose services/Choose a
 * professional/Choose date & time/Review booking). */
@Composable
fun BookingStepIndicator(step: Int, totalSteps: Int, label: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(modifier = Modifier.fillMaxWidth().height(4.dp)) {
            repeat(totalSteps) { index ->
                val filled = index < step
                androidx.compose.foundation.layout.Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp)
                        .padding(horizontal = 2.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (filled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
                )
            }
        }
        Text(
            text = "Step $step of $totalSteps • $label",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
