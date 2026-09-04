import { describe, expect, it } from 'vitest';
import { allocateAdjustmentsAcrossLines, type AllocationLine } from './commission-adjustment-allocation.util.js';

function sumNet(lines: AllocationLine[], netAmounts: Map<string, number>): number {
  return lines.reduce((sum, line) => sum + netAmounts.get(line.lineId)!, 0);
}

describe('allocateAdjustmentsAcrossLines', () => {
  it('returns an empty map for no lines', () => {
    expect(allocateAdjustmentsAcrossLines([], 100)).toEqual(new Map());
  });

  it('applies a zero adjustment as a no-op', () => {
    const lines: AllocationLine[] = [{ lineId: 'a', grossAmountMinor: 1000, displayOrder: 0 }];
    const result = allocateAdjustmentsAcrossLines(lines, 0);
    expect(result.get('a')).toBe(1000);
  });

  it('allocates a discount proportionally across two equal lines evenly', () => {
    const lines: AllocationLine[] = [
      { lineId: 'a', grossAmountMinor: 1000, displayOrder: 0 },
      { lineId: 'b', grossAmountMinor: 1000, displayOrder: 1 },
    ];
    const result = allocateAdjustmentsAcrossLines(lines, -200);
    expect(result.get('a')).toBe(900);
    expect(result.get('b')).toBe(900);
    expect(sumNet(lines, result)).toBe(1800);
  });

  it('allocates a surcharge proportionally, conserving the exact total', () => {
    const lines: AllocationLine[] = [
      { lineId: 'a', grossAmountMinor: 3000, displayOrder: 0 },
      { lineId: 'b', grossAmountMinor: 1000, displayOrder: 1 },
    ];
    const result = allocateAdjustmentsAcrossLines(lines, 100);
    expect(sumNet(lines, result)).toBe(4100);
    // 3:1 gross ratio -> 75/25 split of the 100 surcharge
    expect(result.get('a')).toBe(3075);
    expect(result.get('b')).toBe(1025);
  });

  it('uses the largest-remainder method to distribute an indivisible discount, breaking ties by displayOrder', () => {
    // 3 equal lines of 100 each (gross 300), discount of -100: exact
    // share per line is -33.33..., floor is -34 each (since floorDiv of
    // a negative numerator), totaling -102 -- 2 units too much removed,
    // so 2 lines get bumped back by +1. Remainders are identical across
    // all three lines, so displayOrder breaks the tie deterministically.
    const lines: AllocationLine[] = [
      { lineId: 'a', grossAmountMinor: 100, displayOrder: 0 },
      { lineId: 'b', grossAmountMinor: 100, displayOrder: 1 },
      { lineId: 'c', grossAmountMinor: 100, displayOrder: 2 },
    ];
    const result = allocateAdjustmentsAcrossLines(lines, -100);
    expect(sumNet(lines, result)).toBe(200);
    // Deterministic: same inputs always produce the same allocation.
    const result2 = allocateAdjustmentsAcrossLines(lines, -100);
    expect(result).toEqual(result2);
  });

  it('conserves the exact total across many unevenly-priced lines', () => {
    const lines: AllocationLine[] = [
      { lineId: 'a', grossAmountMinor: 4999, displayOrder: 0 },
      { lineId: 'b', grossAmountMinor: 2501, displayOrder: 1 },
      { lineId: 'c', grossAmountMinor: 1, displayOrder: 2 },
      { lineId: 'd', grossAmountMinor: 12_345, displayOrder: 3 },
    ];
    const totalGross = lines.reduce((sum, l) => sum + l.grossAmountMinor, 0);
    for (const adjustment of [-1, 0, 1, -999, 999, -totalGross + 1, totalGross]) {
      const result = allocateAdjustmentsAcrossLines(lines, adjustment);
      expect(sumNet(lines, result)).toBe(totalGross + adjustment);
    }
  });

  it('handles a single line — the entire adjustment goes to it', () => {
    const lines: AllocationLine[] = [{ lineId: 'a', grossAmountMinor: 5000, displayOrder: 0 }];
    const result = allocateAdjustmentsAcrossLines(lines, -750);
    expect(result.get('a')).toBe(4250);
  });

  it('is deterministic regardless of input array order (ties still resolve by displayOrder)', () => {
    const linesA: AllocationLine[] = [
      { lineId: 'x', grossAmountMinor: 100, displayOrder: 5 },
      { lineId: 'y', grossAmountMinor: 100, displayOrder: 1 },
    ];
    const linesB = [...linesA].reverse();
    const resultA = allocateAdjustmentsAcrossLines(linesA, -1);
    const resultB = allocateAdjustmentsAcrossLines(linesB, -1);
    expect(resultA).toEqual(resultB);
    expect(sumNet(linesA, resultA)).toBe(199);
    // Equal gross, so both floor to the same -1 share with a tied
    // remainder; the tie-break ranks the lower displayOrder ("y") first,
    // and being ranked first means absorbing the single leftover +1
    // correction (bringing its adjustment from -1 back to 0) — so "y"
    // ends up with the *smaller* discount (higher net amount) than "x".
    expect(resultA.get('y')).toBe(100);
    expect(resultA.get('x')).toBe(99);
  });
});
