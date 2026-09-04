import { describe, it, expect } from 'vitest';
import { IntervalRunner } from '../../worker/backpressure';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('IntervalRunner', () => {
  it('runs the task on a single tick', async () => {
    let ran = 0;
    const runner = new IntervalRunner({
      label: 'x',
      intervalMs: 1000,
      task: async () => {
        ran++;
      },
    });
    await runner.tick();
    expect(ran).toBe(1);
  });

  it('skips a tick that arrives while the previous one is still running, and logs the gap', async () => {
    const d = deferred();
    let runs = 0;
    const skips: number[] = [];
    const runner = new IntervalRunner({
      label: 'slow',
      intervalMs: 1000,
      task: async () => {
        runs++;
        await d.promise;
      },
      onSkip: (_label, skipped) => skips.push(skipped),
    });

    const first = runner.tick(); // starts, blocks on d.promise
    await runner.tick(); // should skip immediately (still running)
    await runner.tick(); // should skip again

    expect(skips).toEqual([1, 2]);
    expect(runs).toBe(1); // never a second concurrent run queued

    d.resolve();
    await first;
    expect(runs).toBe(1);
  });

  it('reports caught-up with the total skipped count once the task finishes', async () => {
    const d = deferred();
    const caughtUp: number[] = [];
    const runner = new IntervalRunner({
      label: 'slow',
      intervalMs: 1000,
      task: async () => {
        await d.promise;
      },
      onCaughtUp: (_label, total) => caughtUp.push(total),
    });

    const first = runner.tick();
    await runner.tick();
    await runner.tick();
    d.resolve();
    await first;

    expect(caughtUp).toEqual([2]);
  });

  it('does not let a thrown task error escape or break subsequent ticks', async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const runner = new IntervalRunner({
      label: 'flaky',
      intervalMs: 1000,
      task: async () => {
        calls++;
        throw new Error('boom');
      },
      onError: (_label, err) => errors.push(err),
    });

    await runner.tick();
    await runner.tick();

    expect(calls).toBe(2);
    expect(errors).toHaveLength(2);
  });
});
