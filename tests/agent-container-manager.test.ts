import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentContainerManager,
  OperationAbortedError,
  OperationTimeoutError,
} from '../src/agent-container-manager';
import type { IExecuteResult } from '../src/runtime-interface';

const trustedRuntime = {
  dangerouslyAllowSameOrigin: true,
  useWorker: false as const,
};

function fakeResult(exportsValue: unknown): IExecuteResult {
  return {
    exports: exportsValue,
    module: {
      id: '/fake.js',
      filename: '/fake.js',
      exports: exportsValue,
      loaded: true,
      children: [],
      paths: [],
    },
  };
}

describe('AgentContainerManager', () => {
  let manager: AgentContainerManager | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.dispose();
      manager = null;
    }
    vi.useRealTimers();
  });

  it('spawns a container and executes code', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const container = await manager.spawn({
      files: {
        '/project/app.js': 'module.exports = 40 + 2;',
      },
      cwd: '/project',
    });

    const result = await manager.runFile(container.id, '/project/app.js');
    expect(result.exports).toBe(42);

    const listed = manager.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe('ready');
  });

  it('supports get/list/terminate lifecycle', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const a = await manager.spawn();
    const b = await manager.spawn();

    expect(manager.get(a.id)?.id).toBe(a.id);
    expect(manager.list().map((item) => item.id)).toEqual([a.id, b.id]);

    const terminated = await manager.terminate(a.id);
    expect(terminated).toBe(true);
    expect(manager.get(a.id)).toBeUndefined();
    expect(manager.list().map((item) => item.id)).toEqual([b.id]);

    const missing = await manager.terminate('does-not-exist');
    expect(missing).toBe(false);
  });

  it('enforces maxContainers', async () => {
    manager = new AgentContainerManager({
      runtime: trustedRuntime,
      maxContainers: 1,
    });

    await manager.spawn({ id: 'one' });

    await expect(manager.spawn({ id: 'two' })).rejects.toThrow(
      /capacity reached/i
    );
  });

  it('clones containers using snapshots with file isolation', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const source = await manager.spawn({
      files: {
        '/project/value.js': 'module.exports = 1;',
      },
      cwd: '/project',
    });

    const clone = await manager.clone(source.id, { id: 'clone-1' });

    const cloneResult = await manager.execute(
      clone.id,
      `
      const fs = require('fs');
      fs.writeFileSync('/project/value.js', 'module.exports = 2;');
      module.exports = require('/project/value.js');
      `,
      '/project/mutate.js'
    );

    expect(cloneResult.exports).toBe(2);

    const sourceResult = await manager.runFile(source.id, '/project/value.js');
    expect(sourceResult.exports).toBe(1);
  });

  it('serializes operations per container', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });
    const container = await manager.spawn();

    const internal = (manager as any).containers.get(container.id);
    expect(internal).toBeTruthy();

    let active = 0;
    let maxActive = 0;

    internal.runtime.execute = async (code: string): Promise<IExecuteResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return fakeResult(Number(code));
    };

    const [a, b, c] = await Promise.all([
      manager.execute(container.id, '1', '/1.js'),
      manager.execute(container.id, '2', '/2.js'),
      manager.execute(container.id, '3', '/3.js'),
    ]);

    expect([a.exports, b.exports, c.exports]).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });

  it('allows operations on different containers concurrently', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const first = await manager.spawn({ id: 'first' });
    const second = await manager.spawn({ id: 'second' });

    const firstInternal = (manager as any).containers.get(first.id);
    const secondInternal = (manager as any).containers.get(second.id);

    const started: string[] = [];
    let releaseGate: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    firstInternal.runtime.execute = async (): Promise<IExecuteResult> => {
      started.push('first');
      await gate;
      return fakeResult('first');
    };

    secondInternal.runtime.execute = async (): Promise<IExecuteResult> => {
      started.push('second');
      await gate;
      return fakeResult('second');
    };

    const firstOp = manager.execute(first.id, 'module.exports = 1', '/first.js');
    const secondOp = manager.execute(second.id, 'module.exports = 2', '/second.js');

    // Allow both queued operations to start.
    await Promise.resolve();
    await Promise.resolve();

    expect(started.sort()).toEqual(['first', 'second']);

    releaseGate?.();

    const [firstResult, secondResult] = await Promise.all([firstOp, secondOp]);
    expect(firstResult.exports).toBe('first');
    expect(secondResult.exports).toBe('second');
  });

  it('supports aborting managed operations before start', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const container = await manager.spawn();
    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.execute(container.id, 'module.exports = 1;', '/index.js', {
        signal: controller.signal,
      })
    ).rejects.toBeInstanceOf(OperationAbortedError);
  });

  it('times out long-running managed operations and tracks timeout metrics', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const container = await manager.spawn();
    const internal = (manager as any).containers.get(container.id);

    internal.runtime.execute = async (): Promise<IExecuteResult> => {
      await new Promise(() => {
        // never resolves
      });
      return fakeResult('never');
    };

    await expect(
      manager.execute(container.id, 'module.exports = 1', '/slow.js', {
        timeoutMs: 25,
      })
    ).rejects.toBeInstanceOf(OperationTimeoutError);

    const metrics = manager.getMetrics();
    expect(metrics.operationsFailed).toBe(1);
    expect(metrics.operationTimeouts).toBe(1);
  });

  it('evicts idle containers when idleTtlMs is configured', async () => {
    vi.useFakeTimers();
    manager = new AgentContainerManager({
      runtime: trustedRuntime,
      idleTtlMs: 1_000,
    });

    const container = await manager.spawn({ id: 'idle' });
    expect(manager.get(container.id)).toBeDefined();

    await vi.advanceTimersByTimeAsync(2_100);
    await Promise.resolve();

    expect(manager.get(container.id)).toBeUndefined();
  });

  it('emits lifecycle and operation events', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const events: string[] = [];
    manager.on('container-created', () => events.push('container-created'));
    manager.on('container-ready', () => events.push('container-ready'));
    manager.on('operation-start', () => events.push('operation-start'));
    manager.on('operation-end', () => events.push('operation-end'));
    manager.on('container-terminated', () => events.push('container-terminated'));

    const container = await manager.spawn({ id: 'events' });
    await manager.execute(container.id, 'module.exports = 123;', '/events.js');
    await manager.terminate(container.id);

    expect(events).toContain('container-created');
    expect(events).toContain('container-ready');
    expect(events).toContain('operation-start');
    expect(events).toContain('operation-end');
    expect(events).toContain('container-terminated');
  });

  it('tracks operation metrics', async () => {
    manager = new AgentContainerManager({ runtime: trustedRuntime });

    const container = await manager.spawn();

    await manager.execute(container.id, 'module.exports = 123;', '/ok.js');

    await expect(
      manager.execute(container.id, 'throw new Error("boom")', '/fail.js')
    ).rejects.toThrow('boom');

    const metrics = manager.getMetrics();
    expect(metrics.containersCreated).toBe(1);
    expect(metrics.operationsStarted).toBe(2);
    expect(metrics.operationsSucceeded).toBe(1);
    expect(metrics.operationsFailed).toBe(1);
    expect(metrics.activeContainers).toBe(1);
    expect(metrics.activeOperations).toBe(0);
  });
});
