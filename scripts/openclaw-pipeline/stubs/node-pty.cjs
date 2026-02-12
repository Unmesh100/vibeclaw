/**
 * node-pty stub for almostnode containers
 *
 * Replaces native PTY spawning with an EventEmitter-based shim that
 * delegates to the almostnode child_process shim (just-bash).
 *
 * OpenClaw uses node-pty to create agent terminal sessions. This stub
 * makes those sessions work against the VFS + just-bash runtime instead
 * of real OS PTYs.
 */
'use strict';

const { EventEmitter } = require('events');
const { spawn: cpSpawn } = require('child_process');

class PtyProcess extends EventEmitter {
  constructor(file, args, options) {
    super();

    this.process = file;
    this.pid = Math.floor(Math.random() * 30000) + 1000;
    this.cols = (options && options.cols) || 80;
    this.rows = (options && options.rows) || 24;
    this.handleFlowControl = false;

    this._file = file;
    this._args = args || [];
    this._options = options || {};
    this._alive = true;
    this._exitCode = null;

    // Internal buffer for write() calls
    this._inputQueue = [];

    // Defer start so caller can attach listeners
    process.nextTick(() => this._start());
  }

  _start() {
    if (!this._alive) return;

    // Build the command string
    const cmd = [this._file, ...this._args].join(' ');
    const cwd = this._options.cwd || process.cwd();
    const env = { ...process.env, ...(this._options.env || {}) };

    // Set TERM so programs know they have a terminal
    env.TERM = env.TERM || 'xterm-256color';
    env.COLUMNS = String(this.cols);
    env.LINES = String(this.rows);

    const child = cpSpawn(cmd, {
      cwd,
      env,
      shell: true,
    });

    this._child = child;

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        if (this._alive) {
          const str = typeof data === 'string' ? data : data.toString('utf-8');
          this.emit('data', str);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        if (this._alive) {
          const str = typeof data === 'string' ? data : data.toString('utf-8');
          this.emit('data', str);
        }
      });
    }

    child.on('exit', (code, signal) => {
      this._alive = false;
      this._exitCode = code ?? 0;
      this.emit('exit', this._exitCode, signal || 0);
    });

    child.on('error', (err) => {
      this.emit('data', `\r\npty-stub error: ${err.message}\r\n`);
      if (this._alive) {
        this._alive = false;
        this._exitCode = 1;
        this.emit('exit', 1, 0);
      }
    });

    // Drain any input that arrived before _start()
    for (const chunk of this._inputQueue) {
      this._writeToChild(chunk);
    }
    this._inputQueue = [];
  }

  /** Write data to the pty (stdin of the child). */
  write(data) {
    if (!this._alive) return;
    if (!this._child) {
      this._inputQueue.push(data);
      return;
    }
    this._writeToChild(data);
  }

  _writeToChild(data) {
    if (this._child && this._child.stdin) {
      try {
        this._child.stdin.write(data);
      } catch {
        // stdin may already be closed
      }
    }
  }

  /** Resize the terminal. */
  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    // In a real PTY this sends SIGWINCH; here we just record it.
  }

  /** Pause output. */
  pause() {}

  /** Resume output. */
  resume() {}

  /** Kill the process. */
  kill(signal) {
    if (!this._alive) return;
    this._alive = false;
    if (this._child) {
      try { this._child.kill(signal); } catch {}
    }
    this._exitCode = this._exitCode ?? 143;
    this.emit('exit', this._exitCode, signal || 'SIGTERM');
  }

  /** Destroy the pty. */
  destroy() {
    this.kill('SIGKILL');
  }

  /** Clear the internal buffer. */
  clear() {}

  /** Compatibility getters */
  get exitCode() { return this._exitCode; }
}

/**
 * Spawn a new PTY process.
 * API-compatible with @lydell/node-pty's `spawn()`.
 */
function spawn(file, args, options) {
  return new PtyProcess(file, args, options);
}

module.exports = { spawn };
module.exports.spawn = spawn;
module.exports.default = { spawn };
