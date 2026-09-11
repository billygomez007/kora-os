/**
 * Guards an async action so a second call while the first is still
 * running is dropped rather than started — closes the gap between a
 * fast double click/double-submit and React committing a `disabled`
 * state, since that gap is exactly wide enough for a second `onSubmit`
 * to fire before the button visually disables (docs task Part A3: "one
 * button click → one request").
 */
export function createSingleFlightGuard() {
  let inFlight = false;

  return {
    get isInFlight(): boolean {
      return inFlight;
    },
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (inFlight) return undefined;
      inFlight = true;
      try {
        return await action();
      } finally {
        inFlight = false;
      }
    },
  };
}
