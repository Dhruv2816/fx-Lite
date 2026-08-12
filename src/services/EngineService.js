'use strict';
// ============================================================
//  EngineService.js  —  Node.js ↔ C++ IPC Bridge
//  FX-Core: Bare-Metal C++ Order Matching Engine
//
//  Spawns the fx_core binary as a long-lived child process
//  (singleton — one process for the lifetime of the server).
//  Sends orders via stdin, reads results from stdout.
//
//  Design choice: persistent process (not per-request spawn)
//  because spawning a new C++ process per HTTP request would
//  add ~50ms OS overhead vs the <10µs engine latency.
// ============================================================

const { spawn }     = require('child_process');
const path          = require('path');
const EventEmitter  = require('events');

// Absolute path to the compiled C++ binary
const ENGINE_BIN = path.join(__dirname, '../../fx_core/fx_core');

class EngineService extends EventEmitter {
    constructor() {
        super();
        this._process   = null;
        this._buffer    = '';       // accumulates partial stdout lines
        this._pending   = [];       // queue of { resolve, reject } for in-flight requests
        this._ready     = false;
        this._latencyMs = null;     // last measured latency from stderr
    }

    // --------------------------------------------------------
    // init() — spawn the C++ engine process.
    // Called once from server.js on startup.
    // --------------------------------------------------------
    async init() {
        return new Promise((resolve, reject) => {
            try {
                this._process = spawn(ENGINE_BIN, [], {
                    stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr all piped
                });
            } catch (err) {
                return reject(new Error(
                    `Failed to spawn fx_core — did you run 'npm run build-engine'? Error: ${err.message}`
                ));
            }

            // ── stdout: results from the engine (IPC channel) ──
            // Lines arrive as: MATCHED_50_@_83.4500_BUY1001_SELL1002
            // or QUEUED_BUY_... / QUEUED_SELL_...
            this._process.stdout.on('data', (chunk) => {
                this._buffer += chunk.toString();
                const lines = this._buffer.split('\n');
                this._buffer = lines.pop();     // keep incomplete last line

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    this._handleEngineLine(trimmed);
                }
            });

            // ── stderr: latency metrics (NOT the IPC channel) ──
            // Format: LATENCY_US:3 ORDER_ID:1001 FILLS:1 BID_DEPTH:0 ASK_DEPTH:0
            this._process.stderr.on('data', (chunk) => {
                const text = chunk.toString().trim();
                // Parse LATENCY_US from the metric line
                const match = text.match(/LATENCY_US:(\d+)/);
                if (match) {
                    this._latencyUs = parseInt(match[1], 10);
                }
                // Optionally forward to server logs
                process.stderr.write(`[FX-CORE] ${text}\n`);
            });

            // ── Process exits ────────────────────────────────────
            this._process.on('exit', (code) => {
                console.error(`[EngineService] fx_core exited with code ${code}`);
                this._ready = false;
                // Reject all pending requests
                for (const { reject: rej } of this._pending) {
                    rej(new Error(`C++ engine exited unexpectedly (code ${code})`));
                }
                this._pending = [];
            });

            this._process.on('error', (err) => {
                reject(new Error(`fx_core spawn error: ${err.message}. Run 'npm run build-engine' first.`));
            });

            // Give the engine 500ms to start before marking ready
            setTimeout(() => {
                if (this._process && !this._process.killed) {
                    this._ready = true;
                    console.log('[EngineService] ✅ fx_core engine ready');
                    resolve();
                } else {
                    reject(new Error('fx_core did not start in time'));
                }
            }, 500);
        });
    }

    // --------------------------------------------------------
    // sendOrder(orderData) → Promise<{ result, latency_us, ... }>
    //
    // Builds the wire-format string, writes to engine stdin,
    // and waits for a result line on stdout.
    //
    // Wire format sent to engine:
    //   BUY 1001 83.5000 100 1723480000000000
    // --------------------------------------------------------
    sendOrder(orderData) {
        return new Promise((resolve, reject) => {
            if (!this._ready || !this._process) {
                return reject(new Error('Engine not ready. Call init() first.'));
            }

            const { order_id, price, quantity, is_buy } = orderData;
            // Use epoch microseconds for timestamp (high-res tie-breaking)
            const timestamp_us = BigInt(Date.now()) * 1000n;

            const side = is_buy ? 'BUY' : 'SELL';
            // Wire format: "<SIDE> <id> <price> <qty> <timestamp_us>"
            const line = `${side} ${order_id} ${price.toFixed(4)} ${quantity} ${timestamp_us}\n`;

            // Capture latency BEFORE write so we get the metric that
            // corresponds to THIS order (engine emits latency on stderr
            // right after processing)
            const startMs = Date.now();

            this._pending.push({
                resolve: (result) => {
                    resolve({
                        result,
                        latency_us: this._latencyUs ?? null,
                        wall_ms: Date.now() - startMs,
                    });
                },
                reject,
            });

            this._process.stdin.write(line);
        });
    }

    // --------------------------------------------------------
    // _handleEngineLine(line) — called for each stdout line from C++
    //
    // Routes the line to the oldest pending promise.
    // --------------------------------------------------------
    _handleEngineLine(line) {
        if (this._pending.length === 0) {
            // Unexpected output — log but don't crash
            console.warn(`[EngineService] Unexpected engine output: ${line}`);
            return;
        }
        const { resolve } = this._pending.shift();
        resolve(line);
    }

    // --------------------------------------------------------
    // shutdown() — gracefully close the engine process
    // Called from SIGTERM / server shutdown handler
    // --------------------------------------------------------
    shutdown() {
        if (this._process && !this._process.killed) {
            this._process.stdin.end();   // sends EOF → C++ fgets() returns null → exits cleanly
            this._ready = false;
            console.log('[EngineService] fx_core engine shut down');
        }
    }

    isReady() { return this._ready; }
}

// Singleton — one instance for the entire Node.js process lifetime
const engineService = new EngineService();
module.exports = engineService;
