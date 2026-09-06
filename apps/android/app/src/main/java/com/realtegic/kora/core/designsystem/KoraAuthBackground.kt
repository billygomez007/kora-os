package com.realtegic.kora.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * The shared decorative treatment across every screen in the Kora Mobile
 * Authentication Design Batch (splash, email entry, account type,
 * workspace selection, customer profile) -- a soft gold dot grid in the
 * top-left corner (and, when [bottomRightDotGrid] is true, mirrored in
 * the bottom-right corner), plus two large gold glow circles bleeding
 * off the top-right and bottom-left corners. Recreated entirely with
 * theme-token gradients and a `Canvas`, never the reference PNGs
 * themselves (docs task: "must not be displayed as a full-screen
 * background image"). None of it carries semantics, so TalkBack skips
 * straight past it to the real content.
 *
 * The already-shipped OTP verification screen keeps its own private
 * copy of this same treatment from the prior stage -- deliberately not
 * migrated to this shared component, since that screen's implementation
 * is complete and must be preserved untouched.
 */
@Composable
fun BoxScope.KoraAuthBackground(bottomRightDotGrid: Boolean = true) {
    val gold = MaterialTheme.colorScheme.primary

    Box(
        modifier = Modifier
            .size(260.dp)
            .align(Alignment.TopEnd)
            .offset(x = 90.dp, y = (-90).dp)
            .clip(CircleShape)
            .background(Brush.radialGradient(colors = listOf(gold.copy(alpha = 0.28f), Color.Transparent))),
    )
    Box(
        modifier = Modifier
            .size(260.dp)
            .align(Alignment.BottomStart)
            .offset(x = (-90).dp, y = 90.dp)
            .clip(CircleShape)
            .background(Brush.radialGradient(colors = listOf(gold.copy(alpha = 0.28f), Color.Transparent))),
    )
    Canvas(
        modifier = Modifier
            .size(96.dp)
            .align(Alignment.TopStart)
            .statusBarsPadding()
            .padding(top = 16.dp, start = 16.dp),
    ) {
        drawDotGrid(gold)
    }
    if (bottomRightDotGrid) {
        Canvas(modifier = Modifier.size(96.dp).align(Alignment.BottomEnd).padding(bottom = 16.dp, end = 16.dp)) {
            drawDotGrid(gold, fromBottomEnd = true)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawDotGrid(gold: Color, fromBottomEnd: Boolean = false) {
    val spacing = 14.dp.toPx()
    val radius = 2.dp.toPx()
    for (row in 0 until 5) {
        for (column in 0 until 5) {
            if (column > row) continue
            val x = if (fromBottomEnd) size.width - column * spacing else column * spacing
            val y = if (fromBottomEnd) size.height - row * spacing else row * spacing
            drawCircle(color = gold.copy(alpha = 0.35f), radius = radius, center = Offset(x = x, y = y))
        }
    }
}
