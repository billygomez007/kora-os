export interface AllocationLine {
  lineId: string;
  grossAmountMinor: number;
  displayOrder: number;
}

/**
 * Allocates a Transaction's signed `adjustmentTotalMinor` proportionally
 * across every line item by gross amount, using the largest-remainder
 * (Hamilton apportionment) method, so the resulting NET amounts always
 * sum to *exactly* `sum(gross) + adjustmentTotalMinor` — the posted
 * Transaction's own `totalMinor` (docs task Phase 2: "The allocated line
 * amounts must add up exactly to the posted transaction net total").
 * Works identically for a negative (net discount) or positive (net
 * surcharge) `adjustmentTotalMinor`. Ties in the remainder ranking break
 * by `displayOrder` ascending — deterministic regardless of array order.
 *
 * Returns a map from `lineId` to its NET amount (gross plus this line's
 * allocated adjustment share), not the share alone — this is what
 * `basisAmountMinor` is set to for a NET_LINE_AFTER_ADJUSTMENTS-basis
 * accrual.
 */
export function allocateAdjustmentsAcrossLines(
  lines: readonly AllocationLine[],
  adjustmentTotalMinor: number,
): Map<string, number> {
  if (lines.length === 0) {
    return new Map();
  }

  const totalGrossMinor = lines.reduce((sum, line) => sum + line.grossAmountMinor, 0);
  if (totalGrossMinor === 0) {
    // Nothing to proportion against — unreachable in practice, since a
    // zero-total Checkout is rejected outright at creation time, but
    // handled defensively rather than dividing by zero.
    return new Map(lines.map((line) => [line.lineId, line.grossAmountMinor]));
  }

  const totalGross = BigInt(totalGrossMinor);
  const adjustmentTotal = BigInt(adjustmentTotalMinor);

  const shares = lines.map((line) => {
    const numerator = BigInt(line.grossAmountMinor) * adjustmentTotal;
    const floorShare = bigIntFloorDiv(numerator, totalGross);
    // Always in [0, totalGross) by the definition of floor division.
    const remainder = numerator - floorShare * totalGross;
    return { line, floorShare, remainder };
  });

  const totalFloored = shares.reduce((sum, share) => sum + share.floorShare, 0n);
  // Provably a non-negative integer strictly less than lines.length: each
  // remainder_i in [0, totalGross) and sum(remainder_i) = (adjustmentTotal
  // - totalFloored) * totalGross, so (adjustmentTotal - totalFloored) in
  // [0, lines.length).
  const remainingUnits = Number(adjustmentTotal - totalFloored);

  const ranked = [...shares].sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return a.remainder > b.remainder ? -1 : 1;
    }
    return a.line.displayOrder - b.line.displayOrder;
  });

  const allocatedAdjustment = new Map<string, bigint>();
  for (const share of shares) {
    allocatedAdjustment.set(share.line.lineId, share.floorShare);
  }
  for (let i = 0; i < remainingUnits; i += 1) {
    const target = ranked[i];
    allocatedAdjustment.set(target.line.lineId, allocatedAdjustment.get(target.line.lineId)! + 1n);
  }

  const netAmounts = new Map<string, number>();
  for (const line of lines) {
    netAmounts.set(line.lineId, line.grossAmountMinor + Number(allocatedAdjustment.get(line.lineId)!));
  }
  return netAmounts;
}

/** Mathematical floor division for BigInt — plain `/` truncates toward
 * zero in JavaScript, which is wrong for a negative numerator (the
 * discount case). `b` is always positive here (a sum of positive line
 * amounts). */
function bigIntFloorDiv(a: bigint, b: bigint): bigint {
  const quotient = a / b;
  const remainder = a % b;
  return remainder !== 0n && (remainder < 0n) !== (b < 0n) ? quotient - 1n : quotient;
}
