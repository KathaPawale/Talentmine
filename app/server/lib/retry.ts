import { sleep } from "./with-timeout";

export async function retry<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (err: unknown) => boolean;
    signal?: AbortSignal;
    label?: string;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 15_000;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts.retryOn && !opts.retryOn(err)) throw err;
      if (i < attempts - 1) {
        const delay = Math.min(max, base * 2 ** i) * (0.75 + Math.random() * 0.5);
        await sleep(delay, opts.signal);
      }
    }
  }
  throw lastErr;
}
