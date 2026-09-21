// Test-only wall clock. Timers and performance.now remain real.
export function installFixedClock(iso: string) {
  const original = Date;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) throw Error("Invalid test clock");
  globalThis.Date = new Proxy(original, {
    construct(target, args) {
      return Reflect.construct(target, args.length ? args : [timestamp]);
    },
    apply() {
      return new original(timestamp).toString();
    },
    get(target, key, receiver) {
      return key === "now"
        ? () => timestamp
        : Reflect.get(target, key, receiver);
    },
  });
  return () => {
    globalThis.Date = original;
  };
}
if (process.env.LC_TEST_NOW) installFixedClock(process.env.LC_TEST_NOW);
