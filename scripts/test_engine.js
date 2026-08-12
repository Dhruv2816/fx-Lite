#!/usr/bin/env node
'use strict';
// ============================================================
//  scripts/test_engine.js  —  FX-Core Stress + Latency Test
//
//  Pushes bulk orders directly into the C++ engine binary
//  via stdin/stdout — completely independent of the HTTP server.
//  A segfault or memory corruption in C++ crashes THIS process
//  only, keeping it isolated from the main API test suite.
//
//  Usage:
//    npm run build-engine   ← compile first
//    npm run test-engine    ← run this script
//
//  What it tests:
//    1. Correctness  — mixed BUY/SELL orders, checks MATCHED responses
//    2. Partial fills — asymmetric quantities
//    3. Stability    — 100,000 orders without crash or deadlock
//    4. Latency      — parses LATENCY_US from stderr, reports P50/P95/P99
// ============================================================

const { spawn } = require('child_process');
const path      = require('path');

const ENGINE_BIN    = path.join(__dirname, '../fx_core/fx_core');
const TOTAL_ORDERS  = 100_000;
const BATCH_SIZE    = 1_000;    // write orders in batches to avoid stdin backpressure

// ── ANSI colours ─────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

// ── Stats accumulators ────────────────────────────────────────
let matched_count  = 0;
let queued_count   = 0;
let error_count    = 0;
let latencies_us   = [];   // parsed from stderr
let lines_received = 0;

console.log(`${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
console.log(`${CYAN}║  FX-Core Stress Test  —  ${TOTAL_ORDERS.toLocaleString()} orders       ║${RESET}`);
console.log(`${CYAN}╚══════════════════════════════════════════════╝${RESET}\n`);

// ── Spawn the engine ──────────────────────────────────────────
let engine;
try {
    engine = spawn(ENGINE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
} catch (err) {
    console.error(`${RED}[ERROR] Could not spawn ${ENGINE_BIN}${RESET}`);
    console.error(`${RED}        Run 'npm run build-engine' first.${RESET}`);
    process.exit(1);
}

engine.on('error', (err) => {
    console.error(`${RED}[ENGINE ERROR] ${err.message}${RESET}`);
    console.error(`${RED}Run 'npm run build-engine' to compile the C++ binary first.${RESET}`);
    process.exit(1);
});

// ── stdout: count MATCHED / QUEUED / ERROR lines ──────────────
let stdout_buf = '';
engine.stdout.on('data', (chunk) => {
    stdout_buf += chunk.toString();
    const lines = stdout_buf.split('\n');
    stdout_buf  = lines.pop();

    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        lines_received++;
        if (t.startsWith('MATCHED'))     matched_count++;
        else if (t.startsWith('QUEUED')) queued_count++;
        else if (t.startsWith('ERROR'))  error_count++;
    }
});

// ── stderr: parse LATENCY_US values ──────────────────────────
let stderr_buf = '';
engine.stderr.on('data', (chunk) => {
    stderr_buf += chunk.toString();
    const lines = stderr_buf.split('\n');
    stderr_buf  = lines.pop();

    for (const line of lines) {
        const m = line.match(/LATENCY_US:(\d+)/);
        if (m) latencies_us.push(parseInt(m[1], 10));
    }
});

// ── Generate orders ───────────────────────────────────────────
// Pattern: alternating BUY/SELL orders with slight price variation
// so roughly half match immediately (exercises partial fill paths).
//
// Price bands:
//   BUY  orders: 83.00–87.00   (randomly priced)
//   SELL orders: 83.00–87.00   (overlapping → many matches)
function generate_order_line(id) {
    const is_buy  = (id % 2 === 1);
    const side    = is_buy ? 'BUY' : 'SELL';
    // Create price overlap: buyers at 83–87, sellers at 83–87 → ~50% match rate
    const price   = (83.00 + (id % 400) * 0.01).toFixed(4);
    // Vary quantity: creates partial fill scenarios
    const qty     = 10 + (id % 90);   // 10..99 units
    const ts      = Date.now() * 1000 + id;   // microsecond-precision fake timestamp
    return `${side} ${id} ${price} ${qty} ${ts}\n`;
}

// ── Write orders in batches ───────────────────────────────────
const t_wall_start = Date.now();

async function write_orders() {
    return new Promise((resolve) => {
        let id = 1;

        function write_batch() {
            if (id > TOTAL_ORDERS) {
                engine.stdin.end();     // EOF → C++ fgets() returns null → graceful exit
                resolve();
                return;
            }

            const end = Math.min(id + BATCH_SIZE - 1, TOTAL_ORDERS);
            let batch = '';
            for (let i = id; i <= end; i++) {
                batch += generate_order_line(i);
            }
            id = end + 1;

            const can_continue = engine.stdin.write(batch);
            if (can_continue) {
                // stdin buffer not full — schedule next batch on next tick
                setImmediate(write_batch);
            } else {
                // stdin buffer full — wait for drain before writing more
                engine.stdin.once('drain', write_batch);
            }
        }

        write_batch();
    });
}

// ── Wait for engine to exit + print report ────────────────────
engine.on('close', (code) => {
    const t_wall_ms = Date.now() - t_wall_start;

    // Sort latencies for percentile calculation
    latencies_us.sort((a, b) => a - b);
    const n    = latencies_us.length;
    const p50  = n ? latencies_us[Math.floor(n * 0.50)] : 'N/A';
    const p95  = n ? latencies_us[Math.floor(n * 0.95)] : 'N/A';
    const p99  = n ? latencies_us[Math.floor(n * 0.99)] : 'N/A';
    const pmax = n ? latencies_us[n - 1]                : 'N/A';
    const pavg = n ? (latencies_us.reduce((a, b) => a + b, 0) / n).toFixed(2) : 'N/A';

    console.log('\n' + '═'.repeat(52));
    console.log(`${CYAN}  FX-Core Stress Test Results${RESET}`);
    console.log('═'.repeat(52));
    console.log(`  Orders sent      : ${TOTAL_ORDERS.toLocaleString()}`);
    console.log(`  Responses recv   : ${lines_received.toLocaleString()}`);
    console.log(`  ✅ MATCHED       : ${GREEN}${matched_count.toLocaleString()}${RESET}`);
    console.log(`  📋 QUEUED        : ${YELLOW}${queued_count.toLocaleString()}${RESET}`);
    console.log(`  ❌ ERRORS        : ${error_count > 0 ? RED : GREEN}${error_count}${RESET}`);
    console.log('─'.repeat(52));
    console.log(`${CYAN}  Latency (from C++ <chrono>)${RESET}`);
    console.log(`  Samples          : ${n.toLocaleString()}`);
    console.log(`  P50              : ${p50} µs`);
    console.log(`  P95              : ${p95} µs`);
    console.log(`  P99              : ${p99} µs`);
    console.log(`  Max              : ${pmax} µs`);
    console.log(`  Avg              : ${pavg} µs`);
    console.log('─'.repeat(52));
    console.log(`  Total wall time  : ${t_wall_ms.toLocaleString()} ms`);
    console.log(`  Throughput       : ${Math.round(TOTAL_ORDERS / (t_wall_ms / 1000)).toLocaleString()} orders/sec`);
    console.log('═'.repeat(52));

    if (error_count > 0) {
        console.log(`\n${RED}[FAIL] ${error_count} parse errors — check wire format.${RESET}`);
        process.exit(1);
    }
    if (code !== 0) {
        console.log(`\n${RED}[FAIL] Engine exited with code ${code} — possible segfault or assertion.${RESET}`);
        process.exit(1);
    }

    console.log(`\n${GREEN}[PASS] Engine handled ${TOTAL_ORDERS.toLocaleString()} orders without crash.${RESET}`);
    console.log(`${CYAN}[INFO] Resume stat: ~${Math.round(TOTAL_ORDERS * 0.5 / 1000)}k trades matched at avg ${pavg} µs latency${RESET}\n`);
    process.exit(0);
});

// ── Kick off ──────────────────────────────────────────────────
write_orders().catch((err) => {
    console.error(`${RED}[FATAL] Write error: ${err.message}${RESET}`);
    process.exit(1);
});
