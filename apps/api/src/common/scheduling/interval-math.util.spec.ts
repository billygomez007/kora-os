import {
  intersectLocalIntervals,
  mergeLocalIntervals,
  subtractLocalIntervals,
} from './interval-math.util.js';

describe('interval-math.util', () => {
  it('intersects two overlapping intervals', () => {
    expect(
      intersectLocalIntervals(
        [{ startLocalTime: '09:00', endLocalTime: '17:00' }],
        [{ startLocalTime: '10:00', endLocalTime: '15:00' }],
      ),
    ).toEqual([{ startLocalTime: '10:00', endLocalTime: '15:00' }]);
  });

  it('returns nothing for disjoint intervals', () => {
    expect(
      intersectLocalIntervals(
        [{ startLocalTime: '09:00', endLocalTime: '11:00' }],
        [{ startLocalTime: '12:00', endLocalTime: '14:00' }],
      ),
    ).toEqual([]);
  });

  it('intersects across multiple branch/staff intervals correctly', () => {
    const branchOpen = [
      { startLocalTime: '09:00', endLocalTime: '12:00' },
      { startLocalTime: '13:00', endLocalTime: '18:00' },
    ];
    const staffAvailable = [{ startLocalTime: '11:00', endLocalTime: '16:00' }];
    expect(intersectLocalIntervals(branchOpen, staffAvailable)).toEqual([
      { startLocalTime: '11:00', endLocalTime: '12:00' },
      { startLocalTime: '13:00', endLocalTime: '16:00' },
    ]);
  });

  it('merges touching and overlapping intervals into their minimal form', () => {
    expect(
      mergeLocalIntervals([
        { startLocalTime: '09:00', endLocalTime: '11:00' },
        { startLocalTime: '11:00', endLocalTime: '13:00' },
        { startLocalTime: '15:00', endLocalTime: '16:00' },
      ]),
    ).toEqual([
      { startLocalTime: '09:00', endLocalTime: '13:00' },
      { startLocalTime: '15:00', endLocalTime: '16:00' },
    ]);
  });

  it('adds a special-availability window on top of the recurring rule', () => {
    const rule = [{ startLocalTime: '09:00', endLocalTime: '12:00' }];
    const specialAvailability = [{ startLocalTime: '17:00', endLocalTime: '19:00' }];
    expect(mergeLocalIntervals(rule, specialAvailability)).toEqual([
      { startLocalTime: '09:00', endLocalTime: '12:00' },
      { startLocalTime: '17:00', endLocalTime: '19:00' },
    ]);
  });

  it('subtracts a full-day time-off window, leaving nothing', () => {
    const rule = [{ startLocalTime: '09:00', endLocalTime: '17:00' }];
    expect(subtractLocalIntervals(rule, [{ startLocalTime: '00:00', endLocalTime: '23:59' }])).toEqual([]);
  });

  it('subtracts a partial time-off window from the middle of a rule, splitting it in two', () => {
    const rule = [{ startLocalTime: '09:00', endLocalTime: '17:00' }];
    expect(
      subtractLocalIntervals(rule, [{ startLocalTime: '12:00', endLocalTime: '13:00' }]),
    ).toEqual([
      { startLocalTime: '09:00', endLocalTime: '12:00' },
      { startLocalTime: '13:00', endLocalTime: '17:00' },
    ]);
  });

  it('subtracts a window overlapping only the start of a rule', () => {
    const rule = [{ startLocalTime: '09:00', endLocalTime: '17:00' }];
    expect(
      subtractLocalIntervals(rule, [{ startLocalTime: '08:00', endLocalTime: '10:00' }]),
    ).toEqual([{ startLocalTime: '10:00', endLocalTime: '17:00' }]);
  });

  it('leaves a rule untouched when the removed window does not overlap it', () => {
    const rule = [{ startLocalTime: '09:00', endLocalTime: '12:00' }];
    expect(
      subtractLocalIntervals(rule, [{ startLocalTime: '13:00', endLocalTime: '14:00' }]),
    ).toEqual(rule);
  });
});
