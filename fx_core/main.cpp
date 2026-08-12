// ============================================================
//  main.cpp  —  stdin/stdout IPC loop
//  FX-Core: Bare-Metal C++ Order Matching Engine
//
//  This is the entry point when Node.js spawns the binary.
//  It reads one order per line from stdin, parses it,
//  submits to the TradeEngine, and flushes stdout for Node.js.
//
//  Wire format (stdin, one line per order):
//    <is_buy:BUY|SELL> <order_id> <price> <quantity> <timestamp_us>
//
//  Example:
//    BUY 1001 83.5000 100 1723480000000000
//    SELL 1002 83.4500 50 1723480000001000
//
//  stdout (read by Node.js EngineService):
//    MATCHED_50_@_83.4500_BUY1001_SELL1002
//    QUEUED_BUY_1001_qty_50_@_83.5000
//    (or QUEUED_SELL_... if no match)
//
//  stderr (latency metrics, not read by Node.js):
//    LATENCY_US:3 ORDER_ID:1001 FILLS:1 BID_DEPTH:1 ASK_DEPTH:0
// ============================================================
#include <cstdio>
#include <cstring>
#include "include/TradeEngine.h"

int main() {
    // Disable stdio buffering so every printf() immediately reaches Node.js.
    // Without this, output would buffer until the program exits.
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);

    // Spin up the consumer worker thread
    TradeEngine engine;
    engine.start();

    char    line[256];
    char    side[8];
    int     order_id;
    double  price;
    int     quantity;
    long    timestamp;

    // ── Main stdin read loop ─────────────────────────────────
    // Blocks on fgets() waiting for Node.js to send a line.
    // Each line is one order. EOF (or SIGTERM from Node.js) exits.
    while (fgets(line, sizeof(line), stdin) != nullptr) {
        // Strip trailing newline
        int len = (int)strlen(line);
        if (len > 0 && line[len - 1] == '\n') line[len - 1] = '\0';
        if (len > 0 && line[len - 2] == '\r') line[len - 2] = '\0';

        // Skip empty lines
        if (line[0] == '\0') continue;

        // Parse the wire format
        int parsed = sscanf(line, "%7s %d %lf %d %ld",
                            side, &order_id, &price, &quantity, &timestamp);

        if (parsed != 5) {
            fprintf(stderr, "PARSE_ERROR: '%s'\n", line);
            printf("ERROR_PARSE\n");
            fflush(stdout);
            continue;
        }

        // Build the Order struct
        Order o;
        o.order_id  = order_id;
        o.price     = price;
        o.quantity  = quantity;
        o.timestamp = timestamp;
        o.is_buy    = (strcmp(side, "BUY") == 0);

        // Submit to the engine (producer push + cv notify)
        engine.submit(o);

        // Small yield to let consumer process before next line arrives
        // In production this would be replaced with a sync protocol,
        // but for stdin-based IPC this is sufficient.
        // The latency logging on stderr captures actual processing time.
    }

    // ── Clean shutdown ───────────────────────────────────────
    // Drain any remaining orders and join the worker thread
    engine.shutdown();

    return 0;
}
