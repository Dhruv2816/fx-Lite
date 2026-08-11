'use strict';

/**
 * FX-Lite API Test Suite
 * ──────────────────────────────────────────────────────────────────────
 * A self-contained integration test runner that exercises every endpoint,
 * every happy-path, and every expected error case.
 *
 * Usage:
 *   npm test            (server must already be running on PORT 3000)
 *   npm run test:full   (script auto-starts + auto-kills the server)
 *
 * Depends only on `axios` (already in dependencies) and Node built-ins.
 * Zero extra test-framework installs needed.
 */

const axios   = require('axios');
const { execSync, spawn } = require('child_process');
const path    = require('path');

// ── Config ────────────────────────────────────────────────────────────
const BASE_URL   = `http://localhost:${process.env.PORT || 3000}/api`;
const HEALTH_URL = `http://localhost:${process.env.PORT || 3000}/health`;
const DEMO_USER  = '101';

// ── ANSI colour helpers ───────────────────────────────────────────────
const c = {
  reset : '\x1b[0m',
  bold  : '\x1b[1m',
  dim   : '\x1b[2m',
  green : '\x1b[32m',
  red   : '\x1b[31m',
  yellow: '\x1b[33m',
  cyan  : '\x1b[36m',
  white : '\x1b[37m',
  bg_green: '\x1b[42m',
  bg_red  : '\x1b[41m',
};

const ok   = (msg) => `${c.green}✔${c.reset} ${msg}`;
const fail = (msg) => `${c.red}✘${c.reset} ${msg}`;
const info = (msg) => `${c.cyan}ℹ${c.reset} ${c.dim}${msg}${c.reset}`;
const head = (msg) => `\n${c.bold}${c.yellow}▶ ${msg}${c.reset}`;

// ── Helpers ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pings /health up to `attempts` times. Exits the process with a
 * helpful message if the server never responds — avoids 25 cryptic
 * ECONNREFUSED lines when someone forgets to start the server.
 */
async function waitForServer(attempts = 5, delayMs = 800) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await axios.get(HEALTH_URL, { timeout: 2000, validateStatus: () => true });
      return; // server is up
    } catch {
      if (i === attempts) {
        console.error(
          `\n${c.red}${c.bold}[ERROR]${c.reset} Cannot reach the server at ${HEALTH_URL}.\n` +
          `       Please start it first:\n` +
          `         ${c.cyan}npm run dev${c.reset}   (in a separate terminal)\n` +
          `       OR run everything in one shot:\n` +
          `         ${c.cyan}npm run test:full${c.reset}\n`
        );
        process.exit(1);
      }
      console.log(info(`Server not ready yet, retrying (${i}/${attempts})…`));
      await sleep(delayMs);
    }
  }
}

// ── Test state ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

// ── Core assertion helpers ────────────────────────────────────────────

/**
 * Makes an HTTP request and runs a set of assertions on the response.
 *
 * @param {string} label    - Human-readable test name shown in output
 * @param {object} reqOpts  - { method, url, data?, headers? }
 * @param {Array}  checks   - Array of { assert(response), description }
 */
async function test(label, reqOpts, checks) {
  let res;
  try {
    res = await axios({
      method  : reqOpts.method || 'GET',
      url     : reqOpts.url,
      data    : reqOpts.data,
      headers : reqOpts.headers || { 'Content-Type': 'application/json' },
      // Never throw on non-2xx — we want to assert on error responses too.
      validateStatus: () => true,
    });
  } catch (err) {
    // Network-level error (server not running etc.)
    console.log(fail(`[NETWORK ERROR] ${label}: ${err.message}`));
    failed++;
    failures.push({ label, reason: `Network error: ${err.message}` });
    return;
  }

  let allPassed = true;
  const lines   = [];

  for (const check of checks) {
    try {
      check.assert(res);
      lines.push(`  ${ok(check.description)}`);
    } catch (err) {
      allPassed = false;
      lines.push(`  ${fail(check.description)} ${c.red}→ ${err.message}${c.reset}`);
    }
  }

  if (allPassed) {
    console.log(ok(`${c.bold}${label}${c.reset}`));
    passed++;
  } else {
    console.log(fail(`${c.bold}${label}${c.reset}`));
    failed++;
    failures.push({ label, lines });
  }

  lines.forEach((l) => console.log(l));
}

// Shorthand assertion builders
const assert = {
  status : (code)        => ({
    description: `HTTP ${code}`,
    assert: (r) => { if (r.status !== code) throw new Error(`got ${r.status}`); },
  }),
  bodyHas: (keyPath, val) => ({
    description: `body.${keyPath} === ${JSON.stringify(val)}`,
    assert: (r) => {
      const actual = keyPath.split('.').reduce((o, k) => o?.[k], r.data);
      if (JSON.stringify(actual) !== JSON.stringify(val))
        throw new Error(`got ${JSON.stringify(actual)}`);
    },
  }),
  bodyContains: (keyPath) => ({
    description: `body.${keyPath} exists`,
    assert: (r) => {
      const actual = keyPath.split('.').reduce((o, k) => o?.[k], r.data);
      if (actual === undefined || actual === null)
        throw new Error(`key "${keyPath}" missing or null`);
    },
  }),
  arrayLengthGte: (keyPath, min) => ({
    description: `body.${keyPath}.length >= ${min}`,
    assert: (r) => {
      const arr = keyPath.split('.').reduce((o, k) => o?.[k], r.data);
      if (!Array.isArray(arr) || arr.length < min)
        throw new Error(`got length ${Array.isArray(arr) ? arr.length : 'N/A'}`);
    },
  }),
  fieldEquals: (keyPath, pred, predDesc) => ({
    description: predDesc,
    assert: (r) => {
      const val = keyPath.split('.').reduce((o, k) => o?.[k], r.data);
      if (!pred(val)) throw new Error(`assertion failed for value: ${JSON.stringify(val)}`);
    },
  }),
};

// ── Main test suite ───────────────────────────────────────────────────
async function runSuite() {
  console.log(`\n${c.bold}${c.cyan}╔════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║     FX-Lite  API  Test  Suite          ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════╝${c.reset}`);
  console.log(info(`Target: ${BASE_URL}`));

  // ── Abort early with a clear message if the server is not running ───
  await waitForServer();

  // ── Re-seed the DB so every test run starts from a known state ──────
  console.log(head('0. Pre-test: Resetting database to clean seed state'));
  try {
    execSync('node scripts/initDb.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    });
    console.log(ok('Database re-seeded (userId=101: 1000 USD, 50000 INR)'));
  } catch (e) {
    console.log(fail(`Could not seed DB: ${e.message}`));
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('1. Health Check'));

  await test('GET /health → 200 ok', { url: HEALTH_URL }, [
    assert.status(200),
    assert.bodyHas('success', true),
    assert.bodyHas('status', 'ok'),
    assert.bodyContains('timestamp'),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 2. WALLET ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('2. Wallet Endpoints'));

  await test('GET /api/wallet/101 → 200 with seeded balances', {
    url: `${BASE_URL}/wallet/${DEMO_USER}`,
  }, [
    assert.status(200),
    assert.bodyHas('success', true),
    assert.bodyHas('data.userId', DEMO_USER),
    assert.arrayLengthGte('data.wallets', 2),
    assert.fieldEquals(
      'data.wallets',
      (ws) => ws.some((w) => w.currency === 'USD' && w.balance === 1000),
      'USD balance is 1000'
    ),
    assert.fieldEquals(
      'data.wallets',
      (ws) => ws.some((w) => w.currency === 'INR' && w.balance === 50000),
      'INR balance is 50000'
    ),
  ]);

  await test('GET /api/wallet/nonexistent → 404 not found', {
    url: `${BASE_URL}/wallet/ghost_user_xyz`,
  }, [
    assert.status(404),
    assert.bodyHas('success', false),
    assert.bodyContains('error.message'),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 3. RATE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('3. Exchange Rate Endpoints'));

  await test('GET /api/rates?base=USD&target=INR → 200 with live rate', {
    url: `${BASE_URL}/rates?base=USD&target=INR`,
  }, [
    assert.status(200),
    assert.bodyHas('success', true),
    assert.bodyHas('data.base', 'USD'),
    assert.bodyHas('data.target', 'INR'),
    assert.fieldEquals('data.rate', (r) => typeof r === 'number' && r > 0, 'rate is a positive number'),
    assert.bodyContains('data.date'),
  ]);

  await test('GET /api/rates?base=EUR&target=GBP → 200 with live rate', {
    url: `${BASE_URL}/rates?base=EUR&target=GBP`,
  }, [
    assert.status(200),
    assert.bodyHas('data.base', 'EUR'),
    assert.bodyHas('data.target', 'GBP'),
    assert.fieldEquals('data.rate', (r) => typeof r === 'number' && r > 0, 'EUR→GBP rate is positive'),
  ]);

  await test('GET /api/rates?base=USD&target=USD → 1:1 short-circuit (no API call)', {
    url: `${BASE_URL}/rates?base=USD&target=USD`,
  }, [
    assert.status(200),
    assert.bodyHas('data.rate', 1),
  ]);

  await test('GET /api/rates (missing params) → 400 bad request', {
    url: `${BASE_URL}/rates`,
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
    assert.bodyContains('error.message'),
  ]);

  await test('GET /api/rates?base=USD (missing target) → 400 bad request', {
    url: `${BASE_URL}/rates?base=USD`,
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('GET /api/rates?base=FAKE&target=ZZZ → 400 unsupported pair', {
    url: `${BASE_URL}/rates?base=FAKE&target=ZZZ`,
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 4. TRANSACTION / CONVERSION ENDPOINT — Happy Path
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('4. Transaction — Happy Path'));

  // Brief cooldown so Frankfurter doesn't throttle us after 3 rapid
  // calls in section 3 (USD/INR, EUR/GBP, FAKE/ZZZ).
  await sleep(600);

  let savedTxnId = null;

  // Retry once on 502: a single transient upstream blip shouldn't fail
  // the suite. Unlike a blind probe, we run the actual test() and inspect
  // its side-effect on the `failed` counter to decide whether to retry.
  const convertPayload = { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'INR', amount: 100 };
  const convertChecks = [
    assert.status(201),
    assert.bodyHas('success', true),
    assert.bodyHas('data.userId', DEMO_USER),
    assert.bodyHas('data.fromCurrency', 'USD'),
    assert.bodyHas('data.toCurrency', 'INR'),
    assert.bodyHas('data.amountDeducted', 100),
    assert.fieldEquals('data.exchangeRate', (r) => typeof r === 'number' && r > 0, 'exchangeRate is positive'),
    assert.fieldEquals('data.amountCredited', (a) => typeof a === 'number' && a > 0, 'amountCredited is positive'),
    assert.bodyContains('data.transactionId'),
    assert.bodyContains('data.timestamp'),
    {
      description: 'captures transactionId for history check',
      assert: (r) => { savedTxnId = r.data?.data?.transactionId; },
    },
  ];

  const beforeFailed = failed;
  await test('POST /api/transaction/convert USD→INR → 201 + ledger entry', {
    method: 'POST', url: `${BASE_URL}/transaction/convert`, data: convertPayload,
  }, convertChecks);

  // If it failed due to a 502 (transient upstream), undo the fail count,
  // re-seed to restore the 100 USD that may have been lost, then retry.
  if (failed > beforeFailed) {
    const lastRes = await axios({
      method: 'POST', url: `${BASE_URL}/transaction/convert`, data: convertPayload,
      validateStatus: () => true,
    }).catch(() => null);
    if (lastRes && lastRes.status === 502) {
      console.log(info('First attempt was 502 — re-seeding DB and retrying once after 1s…'));
      execSync('node scripts/initDb.js', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
      failed--;
      failures.pop();
      await sleep(1000);
      await test('POST /api/transaction/convert USD→INR → 201 + ledger entry', {
        method: 'POST', url: `${BASE_URL}/transaction/convert`, data: convertPayload,
      }, convertChecks);
    }
  }

  // After 100 USD converted → balances should update
  await test('GET /api/wallet/101 → balances reflect after conversion (900 USD)', {
    url: `${BASE_URL}/wallet/${DEMO_USER}`,
  }, [
    assert.status(200),
    assert.fieldEquals(
      'data.wallets',
      (ws) => ws.some((w) => w.currency === 'USD' && w.balance === 900),
      'USD balance is now 900 (deducted 100)'
    ),
    assert.fieldEquals(
      'data.wallets',
      (ws) => ws.some((w) => w.currency === 'INR' && w.balance > 50000),
      'INR balance increased from 50000'
    ),
  ]);

  await test('POST /api/transaction/convert USD→EUR → auto-creates EUR wallet', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'EUR', amount: 50 },
  }, [
    assert.status(201),
    assert.bodyHas('data.toCurrency', 'EUR'),
    assert.fieldEquals('data.amountCredited', (a) => a > 0, 'EUR credited > 0'),
  ]);

  await test('GET /api/wallet/101 → now has 3 currencies (USD, INR, EUR)', {
    url: `${BASE_URL}/wallet/${DEMO_USER}`,
  }, [
    assert.status(200),
    assert.arrayLengthGte('data.wallets', 3),
    assert.fieldEquals(
      'data.wallets',
      (ws) => ws.some((w) => w.currency === 'EUR'),
      'EUR wallet exists after first conversion into it'
    ),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 5. TRANSACTION — Error Cases
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('5. Transaction — Error Cases'));

  await test('POST /convert → Insufficient Funds → 400 with details', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'INR', amount: 999999 },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
    assert.bodyHas('error.message', 'Insufficient Funds'),
    assert.bodyContains('error.details.available'),
    assert.bodyContains('error.details.requested'),
    assert.fieldEquals('error.details.available', (a) => a < 999999, 'available < requested'),
  ]);

  await test('POST /convert → same fromCurrency & toCurrency → 400', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'USD', amount: 10 },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('POST /convert → missing userId → 400', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { fromCurrency: 'USD', toCurrency: 'INR', amount: 10 },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('POST /convert → missing fromCurrency → 400', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, toCurrency: 'INR', amount: 10 },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('POST /convert → amount = 0 → 400', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'INR', amount: 0 },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('POST /convert → negative amount → 400', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'INR', amount: -50 },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('POST /convert → amount is a string → 400', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'USD', toCurrency: 'INR', amount: 'hundred' },
  }, [
    assert.status(400),
    assert.bodyHas('success', false),
  ]);

  await test('POST /convert → lowercase currencies auto-normalised → 201', {
    method: 'POST',
    url   : `${BASE_URL}/transaction/convert`,
    data  : { userId: DEMO_USER, fromCurrency: 'usd', toCurrency: 'inr', amount: 10 },
  }, [
    assert.status(201),
    assert.bodyHas('data.fromCurrency', 'USD'),
    assert.bodyHas('data.toCurrency', 'INR'),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 6. TRANSACTION HISTORY
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('6. Transaction History'));

  await test(`GET /api/transaction/${DEMO_USER} → list of ledger entries`, {
    url: `${BASE_URL}/transaction/${DEMO_USER}`,
  }, [
    assert.status(200),
    assert.bodyHas('success', true),
    assert.arrayLengthGte('data', 1),
    assert.fieldEquals(
      'data',
      (rows) => rows[0]?.transactionId !== undefined,
      'each entry has a transactionId'
    ),
    assert.fieldEquals(
      'data',
      (rows) => rows[0]?.timestamp !== undefined,
      'each entry has a timestamp'
    ),
    {
      description: `history includes the transactionId ${savedTxnId?.slice(0, 8)}…`,
      assert: (r) => {
        if (!savedTxnId) return; // skip if capture failed earlier
        const found = r.data.data.some((row) => row.transactionId === savedTxnId);
        if (!found) throw new Error(`transactionId ${savedTxnId} not found in history`);
      },
    },
  ]);

  await test(`GET /api/transaction/${DEMO_USER}?limit=1 → honours limit param`, {
    url: `${BASE_URL}/transaction/${DEMO_USER}?limit=1`,
  }, [
    assert.status(200),
    assert.fieldEquals('data', (d) => Array.isArray(d) && d.length === 1, 'exactly 1 entry returned'),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // 7. 404 & UNKNOWN ROUTES
  // ═══════════════════════════════════════════════════════════════════
  console.log(head('7. Unknown Routes & Edge Cases'));

  await test('GET /api/nonexistent → 404 with error body', {
    url: `${BASE_URL}/nonexistent`,
  }, [
    assert.status(404),
    assert.bodyHas('success', false),
    assert.bodyContains('error.message'),
  ]);

  await test('GET /api/wallet (no userId) → 404', {
    url: `${BASE_URL}/wallet`,
  }, [
    assert.status(404),
    assert.bodyHas('success', false),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  const total = passed + failed;
  const allGood = failed === 0;

  console.log(`\n${c.bold}${'─'.repeat(48)}${c.reset}`);

  if (allGood) {
    console.log(
      `${c.bg_green}${c.bold}  ALL TESTS PASSED  ${c.reset}  ` +
      `${c.green}${c.bold}${passed}/${total}${c.reset} checks passed.`
    );
  } else {
    console.log(
      `${c.bg_red}${c.bold}  SOME TESTS FAILED  ${c.reset}  ` +
      `${c.red}${c.bold}${failed} failed${c.reset}, ${c.green}${passed} passed${c.reset} / ${total} total.`
    );
    console.log(`\n${c.bold}${c.red}Failed tests:${c.reset}`);
    failures.forEach(({ label, reason, lines }) => {
      console.log(`  ${c.red}✘${c.reset} ${label}`);
      if (reason) console.log(`      ${c.dim}${reason}${c.reset}`);
      if (lines) lines.forEach((l) => console.log(`  ${l}`));
    });
  }

  console.log(`${'─'.repeat(48)}\n`);
  process.exit(allGood ? 0 : 1);
}

runSuite().catch((err) => {
  console.error(`\n${c.red}[FATAL]${c.reset} Test runner crashed:`, err.message);
  process.exit(1);
});
