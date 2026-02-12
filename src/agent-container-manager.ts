/**
 * AgentContainerManager
 *
 * Orchestrates multiple isolated almostnode runtimes for agent workloads.
 *
 * Design goals:
 * - One runtime per container (Worker/Sandbox/Main-thread)
 * - Deterministic lifecycle states
 * - Per-container serialized operation queue
 * - Timeouts and abort support for managed operations
 * - Basic events + metrics for observability
 */

import { VirtualFS } from './virtual-fs';
import { PackageManager } from './npm';
import type { InstallOptions, InstallResult } from './npm';
import {
  createRuntime,
  WorkerRuntime,
  SandboxRuntime,
} from './create-runtime';
import type {
  CreateRuntimeOptions,
  IExecuteResult,
  IRuntime,
  VFSSnapshot,
} from './runtime-interface';
import { EventEmitter } from './shims/events';

export type AgentContainerStatus =
  | 'creating'
  | 'ready'
  | 'busy'
  | 'errored'
  | 'terminating'
  | 'terminated';

export type AgentContainerRuntimeMode = 'worker' | 'sandbox' | 'main-thread';

export interface AgentContainerManagerOptions {
  /** Maximum simultaneously managed containers */
  maxContainers?: number;
  /** Default timeout for managed operations */
  defaultExecutionTimeoutMs?: number;
  /** Default runtime options applied to every spawned container */
  runtime?: CreateRuntimeOptions;
  /** Optional idle eviction threshold (ms). 0/undefined disables eviction. */
  idleTtlMs?: number;
  /** Prefix used by the default ID generator */
  idPrefix?: string;
  /** Custom ID generator */
  idGenerator?: () => string;
  /** Clock hook for tests */
  now?: () => number;
}

export interface AgentContainerSpawnOptions {
  id?: string;
  cwd?: string;
  env?: Record<string, string>;
  runtime?: CreateRuntimeOptions;
  npmCwd?: string;
  metadata?: Record<string, unknown>;
  vfsSnapshot?: VFSSnapshot;
  files?: Record<string, string | Uint8Array>;
}

export interface AgentContainerOperationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentContainerInfo {
  id: string;
  status: AgentContainerStatus;
  runtimeMode: AgentContainerRuntimeMode;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  activeOperations: number;
  pendingOperations: number;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentContainerManagerMetrics {
  containersCreated: number;
  containersTerminated: number;
  operationsStarted: number;
  operationsSucceeded: number;
  operationsFailed: number;
  operationTimeouts: number;
  operationAborted: number;
  activeContainers: number;
  activeOperations: number;
}

interface ManagedContainer {
  id: string;
  status: AgentContainerStatus;
  runtimeMode: AgentContainerRuntimeMode;
  runtimeOptions: CreateRuntimeOptions;
  vfs: VirtualFS;
  runtime: IRuntime | null;
  npm: PackageManager | null;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  activeOperations: number;
  pendingOperations: number;
  queue: Promise<void>;
  lastError?: string;
}

type OperationName = 'execute' | 'runFile' | 'install';

const DEFAULT_TIMEOUT_MS = 30_000;

export class OperationTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'OperationTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class OperationAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationAbortedError';
  }
}

/**
 * Manager for isolated runtime containers.
 */
export class AgentContainerManager extends EventEmitter {
  private readonly containers = new Map<string, ManagedContainer>();
  private readonly maxContainers: number;
  private readonly defaultExecutionTimeoutMs: number;
  private readonly defaultRuntimeOptions: CreateRuntimeOptions;
  private readonly now: () => number;
  private readonly idGenerator: () => string;
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private idleSweepRunning = false;

  private metricsBase: Omit<
    AgentContainerManagerMetrics,
    'activeContainers' | 'activeOperations'
  > = {
    containersCreated: 0,
    containersTerminated: 0,
    operationsStarted: 0,
    operationsSucceeded: 0,
    operationsFailed: 0,
    operationTimeouts: 0,
    operationAborted: 0,
  };

  constructor(options: AgentContainerManagerOptions = {}) {
    super();

    this.maxContainers = options.maxContainers ?? Number.POSITIVE_INFINITY;
    this.defaultExecutionTimeoutMs = options.defaultExecutionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());

    this.defaultRuntimeOptions = {
      ...(options.runtime ?? {}),
    };

    // Worker-first default for agent workloads. If workers are unavailable,
    // createRuntime() can fallback to main-thread when useWorker='auto'.
    if (!this.defaultRuntimeOptions.sandbox && this.defaultRuntimeOptions.useWorker === undefined) {
      this.defaultRuntimeOptions.useWorker = 'auto';
    }

    // Ensure same-origin mode is explicitly allowed when sandbox is not set.
    if (!this.defaultRuntimeOptions.sandbox && !this.defaultRuntimeOptions.dangerouslyAllowSameOrigin) {
      this.defaultRuntimeOptions.dangerouslyAllowSameOrigin = true;
    }

    if (options.idGenerator) {
      this.idGenerator = options.idGenerator;
    } else {
      const prefix = options.idPrefix ?? 'container';
      let seq = 0;
      this.idGenerator = () => `${prefix}-${++seq}`;
    }

    if ((options.idleTtlMs ?? 0) > 0) {
      const idleTtlMs = options.idleTtlMs ?? 0;
      const sweepMs = Math.max(2_000, Math.min(30_000, Math.floor(idleTtlMs / 2)));
      this.idleSweepTimer = setInterval(() => {
        void this.evictIdleContainers(idleTtlMs);
      }, sweepMs);
      const timerWithUnref = this.idleSweepTimer as ReturnType<typeof setInterval> & {
        unref?: () => void;
      };
      timerWithUnref.unref?.();
    }
  }

  /**
   * Spawn a new managed container/runtime.
   */
  async spawn(options: AgentContainerSpawnOptions = {}): Promise<AgentContainerInfo> {
    if (this.containers.size >= this.maxContainers) {
      throw new Error(
        `AgentContainerManager capacity reached (${this.maxContainers}). ` +
        'Terminate idle containers or raise maxContainers.'
      );
    }

    const id = options.id ?? this.idGenerator();
    if (this.containers.has(id)) {
      throw new Error(`Container '${id}' already exists`);
    }

    const now = this.now();
    const vfs = options.vfsSnapshot
      ? VirtualFS.fromSnapshot(options.vfsSnapshot)
      : new VirtualFS();

    if (options.files) {
      for (const [path, content] of Object.entries(options.files)) {
        vfs.writeFileSync(path, content);
      }
    }

    const runtimeOptions = this.resolveRuntimeOptions(options);

    const container: ManagedContainer = {
      id,
      status: 'creating',
      runtimeMode: 'main-thread',
      runtimeOptions,
      vfs,
      runtime: null,
      npm: null,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      activeOperations: 0,
      pendingOperations: 0,
      queue: Promise.resolve(),
    };

    this.containers.set(id, container);
    this.metricsBase.containersCreated += 1;
    this.emit('container-created', this.toInfo(container));

    try {
      const runtime = await createRuntime(vfs, runtimeOptions);
      container.runtime = runtime;
      container.runtimeMode = this.detectRuntimeMode(runtime);
      container.npm = new PackageManager(vfs, {
        cwd: options.npmCwd ?? runtimeOptions.cwd ?? '/',
      });

      this.setStatus(container, 'ready');
      this.emit('container-ready', this.toInfo(container));
      return this.toInfo(container);
    } catch (error) {
      container.lastError = errorToMessage(error);
      this.setStatus(container, 'errored', container.lastError);
      this.emit('container-error', {
        id: container.id,
        phase: 'spawn',
        error: container.lastError,
      });

      try {
        container.runtime?.terminate?.();
      } finally {
        this.containers.delete(container.id);
      }

      throw error;
    }
  }

  /**
   * Get one container by ID.
   */
  get(containerId: string): AgentContainerInfo | undefined {
    const container = this.containers.get(containerId);
    return container ? this.toInfo(container) : undefined;
  }

  /**
   * List all active containers.
   */
  list(): AgentContainerInfo[] {
    return [...this.containers.values()]
      .map((container) => this.toInfo(container))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Execute code in the selected container.
   */
  async execute(
    containerId: string,
    code: string,
    filename?: string,
    options: AgentContainerOperationOptions = {}
  ): Promise<IExecuteResult> {
    const container = this.requireContainer(containerId);

    return this.enqueue(container, 'execute', () => {
      const runtime = this.requireRuntime(container);
      return runtime.execute(code, filename);
    }, options);
  }

  /**
   * Run a file in the selected container.
   */
  async runFile(
    containerId: string,
    filename: string,
    options: AgentContainerOperationOptions = {}
  ): Promise<IExecuteResult> {
    const container = this.requireContainer(containerId);

    return this.enqueue(container, 'runFile', () => {
      const runtime = this.requireRuntime(container);
      return runtime.runFile(filename);
    }, options);
  }

  /**
   * Install an npm package in the selected container.
   */
  async install(
    containerId: string,
    packageSpec: string,
    installOptions: InstallOptions = {},
    operationOptions: AgentContainerOperationOptions = {}
  ): Promise<InstallResult> {
    const container = this.requireContainer(containerId);

    return this.enqueue(container, 'install', async () => {
      const npmManager = this.requireNpm(container);
      return npmManager.install(packageSpec, installOptions);
    }, operationOptions);
  }

  /**
   * Snapshot a container's VFS.
   */
  snapshot(containerId: string): VFSSnapshot {
    const container = this.requireContainer(containerId);
    container.lastUsedAt = this.now();
    container.updatedAt = this.now();
    return container.vfs.toSnapshot();
  }

  /**
   * Clone a container by snapshotting and spawning a new runtime.
   */
  async clone(
    containerId: string,
    options: Omit<AgentContainerSpawnOptions, 'vfsSnapshot'> = {}
  ): Promise<AgentContainerInfo> {
    const source = this.requireContainer(containerId);

    return this.spawn({
      ...options,
      cwd: options.cwd ?? source.runtimeOptions.cwd,
      env: options.env ?? source.runtimeOptions.env,
      runtime: options.runtime ?? source.runtimeOptions,
      metadata: options.metadata ?? source.metadata,
      vfsSnapshot: source.vfs.toSnapshot(),
    });
  }

  /**
   * Terminate one container. Returns true if a container existed.
   */
  async terminate(containerId: string): Promise<boolean> {
    const container = this.containers.get(containerId);
    if (!container) return false;

    if (container.status === 'terminating') {
      await container.queue;
      return !this.containers.has(containerId);
    }

    if (container.status === 'terminated') {
      this.containers.delete(containerId);
      return true;
    }

    this.setStatus(container, 'terminating');

    const finalize = async (): Promise<void> => {
      try {
        container.runtime?.terminate?.();
      } catch (error) {
        container.lastError = errorToMessage(error);
        this.emit('container-error', {
          id: container.id,
          phase: 'terminate',
          error: container.lastError,
        });
      } finally {
        this.setStatus(container, 'terminated');
        this.metricsBase.containersTerminated += 1;
        this.emit('container-terminated', {
          id: container.id,
          info: this.toInfo(container),
        });
        this.containers.delete(container.id);
      }
    };

    const terminationTask = container.queue.then(finalize, finalize);
    container.queue = terminationTask.then(() => undefined, () => undefined);
    await terminationTask;
    return true;
  }

  /**
   * Terminate all containers.
   */
  async terminateAll(): Promise<void> {
    const ids = [...this.containers.keys()];
    await Promise.all(ids.map((id) => this.terminate(id)));
  }

  /**
   * Dispose manager resources and terminate all managed containers.
   */
  async dispose(): Promise<void> {
    if (this.idleSweepTimer) {
      clearInterval(this.idleSweepTimer);
      this.idleSweepTimer = null;
    }
    await this.terminateAll();
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): AgentContainerManagerMetrics {
    const activeOperations = [...this.containers.values()]
      .reduce((sum, c) => sum + c.activeOperations, 0);

    return {
      ...this.metricsBase,
      activeContainers: this.containers.size,
      activeOperations,
    };
  }

  private resolveRuntimeOptions(options: AgentContainerSpawnOptions): CreateRuntimeOptions {
    const runtimeOverrides = options.runtime ?? {};

    const merged: CreateRuntimeOptions = {
      ...this.defaultRuntimeOptions,
      ...runtimeOverrides,
    };

    merged.cwd = runtimeOverrides.cwd ?? options.cwd ?? this.defaultRuntimeOptions.cwd;
    merged.env = {
      ...(this.defaultRuntimeOptions.env ?? {}),
      ...(options.env ?? {}),
      ...(runtimeOverrides.env ?? {}),
    };

    // Keep console callback from override if present, otherwise default.
    merged.onConsole = runtimeOverrides.onConsole ?? this.defaultRuntimeOptions.onConsole;

    // If sandbox is not used, explicitly allow same-origin mode.
    if (!merged.sandbox && !merged.dangerouslyAllowSameOrigin) {
      merged.dangerouslyAllowSameOrigin = true;
    }

    if (!merged.sandbox && merged.useWorker === undefined) {
      merged.useWorker = 'auto';
    }

    return merged;
  }

  private detectRuntimeMode(runtime: IRuntime): AgentContainerRuntimeMode {
    if (runtime instanceof SandboxRuntime) return 'sandbox';
    if (runtime instanceof WorkerRuntime) return 'worker';
    return 'main-thread';
  }

  private requireContainer(containerId: string): ManagedContainer {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error(`Container '${containerId}' not found`);
    }

    if (container.status === 'terminated' || container.status === 'terminating') {
      throw new Error(`Container '${containerId}' is ${container.status}`);
    }

    return container;
  }

  private requireRuntime(container: ManagedContainer): IRuntime {
    if (!container.runtime) {
      throw new Error(`Container '${container.id}' runtime is not initialized`);
    }
    return container.runtime;
  }

  private requireNpm(container: ManagedContainer): PackageManager {
    if (!container.npm) {
      throw new Error(`Container '${container.id}' npm manager is not initialized`);
    }
    return container.npm;
  }

  private setStatus(
    container: ManagedContainer,
    status: AgentContainerStatus,
    reason?: string
  ): void {
    if (container.status === status) return;

    const previous = container.status;
    container.status = status;
    container.updatedAt = this.now();

    this.emit('container-status', {
      id: container.id,
      previous,
      next: status,
      reason,
      at: container.updatedAt,
    });
  }

  private enqueue<T>(
    container: ManagedContainer,
    operation: OperationName,
    task: () => Promise<T>,
    options: AgentContainerOperationOptions
  ): Promise<T> {
    container.pendingOperations += 1;

    const run = async (): Promise<T> => {
      if (container.status === 'terminating' || container.status === 'terminated') {
        throw new Error(`Container '${container.id}' is ${container.status}`);
      }

      const startedAt = this.now();
      const queueDepth = Math.max(0, container.pendingOperations - 1);
      container.activeOperations += 1;
      container.lastUsedAt = startedAt;
      this.setStatus(container, 'busy');

      this.metricsBase.operationsStarted += 1;
      this.emit('operation-start', {
        id: container.id,
        operation,
        queueDepth,
        at: startedAt,
      });

      let failure: unknown = null;

      try {
        const result = await this.runWithControls(
          task,
          options,
          `${operation} on container '${container.id}'`
        );
        this.metricsBase.operationsSucceeded += 1;
        return result;
      } catch (error) {
        failure = error;
        this.metricsBase.operationsFailed += 1;

        if (error instanceof OperationTimeoutError) {
          this.metricsBase.operationTimeouts += 1;
        }
        if (error instanceof OperationAbortedError) {
          this.metricsBase.operationAborted += 1;
        }

        container.lastError = errorToMessage(error);
        throw error;
      } finally {
        const endedAt = this.now();
        const durationMs = Math.max(0, endedAt - startedAt);

        container.activeOperations = Math.max(0, container.activeOperations - 1);
        container.pendingOperations = Math.max(0, container.pendingOperations - 1);
        container.lastUsedAt = endedAt;

        if (!isFinalizingStatus(container.status)) {
          this.setStatus(container, container.activeOperations > 0 ? 'busy' : 'ready');
        }

        this.emit('operation-end', {
          id: container.id,
          operation,
          durationMs,
          success: failure === null,
          error: failure ? errorToMessage(failure) : undefined,
          at: endedAt,
        });
      }
    };

    const opPromise = container.queue.then(run, run);
    container.queue = opPromise.then(() => undefined, () => undefined);
    return opPromise;
  }

  private async runWithControls<T>(
    task: () => Promise<T>,
    options: AgentContainerOperationOptions,
    context: string
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.defaultExecutionTimeoutMs;
    const signal = options.signal;

    if (signal?.aborted) {
      throw new OperationAbortedError(`${context} aborted before start`);
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const settleResolve = (value: T): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const onAbort = (): void => {
        settleReject(new OperationAbortedError(`${context} aborted`));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          settleReject(new OperationTimeoutError(
            `${context} timed out after ${timeoutMs}ms`,
            timeoutMs
          ));
        }, timeoutMs);
      }

      Promise.resolve()
        .then(task)
        .then(settleResolve)
        .catch(settleReject);
    });
  }

  private toInfo(container: ManagedContainer): AgentContainerInfo {
    return {
      id: container.id,
      status: container.status,
      runtimeMode: container.runtimeMode,
      createdAt: container.createdAt,
      updatedAt: container.updatedAt,
      lastUsedAt: container.lastUsedAt,
      activeOperations: container.activeOperations,
      pendingOperations: container.pendingOperations,
      lastError: container.lastError,
      metadata: container.metadata,
    };
  }

  private async evictIdleContainers(idleTtlMs: number): Promise<void> {
    if (this.idleSweepRunning) return;
    this.idleSweepRunning = true;

    try {
      const now = this.now();
      const idleCandidates = [...this.containers.values()]
        .filter((container) =>
          container.status === 'ready' &&
          container.activeOperations === 0 &&
          container.pendingOperations === 0 &&
          (now - container.lastUsedAt) >= idleTtlMs
        )
        .map((container) => container.id);

      for (const id of idleCandidates) {
        const terminated = await this.terminate(id);
        if (terminated) {
          this.emit('container-evicted', { id, reason: 'idle-ttl' });
        }
      }
    } finally {
      this.idleSweepRunning = false;
    }
  }
}

function isFinalizingStatus(status: AgentContainerStatus): boolean {
  return status === 'terminating' || status === 'terminated';
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default AgentContainerManager;
