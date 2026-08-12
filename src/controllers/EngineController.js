'use strict';
// ============================================================
//  EngineController.js  —  HTTP ↔ EngineService translation
//  FX-Core: Bare-Metal C++ Order Matching Engine
// ============================================================

const engineService = require('../services/EngineService');
const asyncHandler  = require('../utils/asyncHandler');
const ApiError      = require('../utils/ApiError');
const db            = require('../config/db');

// ────────────────────────────────────────────────────────────
//  POST /api/engine/order
//
//  Body:
//    {
//      "order_id": 1001,
//      "price":    83.50,       ← user-supplied limit price (raw, not from Frankfurter)
//      "quantity": 100,
//      "is_buy":   true,
//      "userId":   "101"        ← optional: for ledger write-back
//    }
//
//  Response:
//    {
//      "success": true,
//      "data": {
//        "engine_result": "MATCHED_100_@_83.5000_BUY1001_SELL1002",
//        "latency_us": 3,
//        "wall_ms": 2,
//        "ledger_logged": true
//      }
//    }
// ────────────────────────────────────────────────────────────
const submitOrder = asyncHandler(async (req, res) => {
    const { order_id, price, quantity, is_buy, userId } = req.body;

    // ── Input Validation ─────────────────────────────────────
    if (order_id === undefined || price === undefined ||
        quantity === undefined || is_buy === undefined) {
        throw new ApiError(400, 'Missing required fields: order_id, price, quantity, is_buy');
    }
    if (typeof price !== 'number' || price <= 0) {
        throw new ApiError(400, 'price must be a positive number');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'quantity must be a positive integer');
    }
    if (!engineService.isReady()) {
        throw new ApiError(503, 'C++ engine not ready. Server may still be starting.');
    }

    // ── Send to C++ engine via IPC ───────────────────────────
    const { result, latency_us, wall_ms } = await engineService.sendOrder({
        order_id,
        price,
        quantity,
        is_buy,
    });

    // ── Async SQLite Write-back ──────────────────────────────
    // Only log MATCHED events to ledger (QUEUED orders are resting
    // in the in-memory C++ heap — no DB entry until they fill).
    let ledger_logged = false;

    if (result && result.startsWith('MATCHED') && userId) {
        // Parse: MATCHED_<qty>_@_<price>_BUY<bid_id>_SELL<ask_id>
        const m = result.match(/MATCHED_(\d+)_@_([\d.]+)_BUY(\d+)_SELL(\d+)/);
        if (m) {
            const fill_qty   = parseInt(m[1], 10);
            const fill_price = parseFloat(m[2]);

            // Async — we do NOT await this. Matching latency is decoupled from
            // DB write latency. Node.js event loop handles this in the background.
            setImmediate(() => {
                try {
                    const { v4: uuidv4 } = require('crypto');
                    const txId = require('crypto').randomUUID();
                    const insert = db.prepare(`
                        INSERT INTO transactions
                            (transactionId, userId, fromCurrency, toCurrency,
                             amountDeducted, exchangeRate, amountCredited)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);
                    // For FX context: deduct base units, credit quote units
                    insert.run(
                        txId,
                        userId,
                        is_buy ? 'QUOTE' : 'BASE',
                        is_buy ? 'BASE'  : 'QUOTE',
                        fill_qty,
                        fill_price,
                        parseFloat((fill_qty * fill_price).toFixed(4))
                    );
                } catch (dbErr) {
                    // Non-fatal — matching already succeeded, DB write is best-effort
                    console.error('[EngineController] Ledger write error:', dbErr.message);
                }
            });
            ledger_logged = true;
        }
    }

    // ── HTTP Response ────────────────────────────────────────
    res.status(200).json({
        success: true,
        data: {
            engine_result: result,
            latency_us,
            wall_ms,
            ledger_logged,
        },
    });
});

// ────────────────────────────────────────────────────────────
//  GET /api/engine/status
//  Returns current bid/ask depth and engine health
// ────────────────────────────────────────────────────────────
const getStatus = asyncHandler(async (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            engine_ready: engineService.isReady(),
            message: engineService.isReady()
                ? 'FX-Core C++ engine is running'
                : 'Engine not ready — run npm run build-engine then restart server',
        },
    });
});

module.exports = { submitOrder, getStatus };
