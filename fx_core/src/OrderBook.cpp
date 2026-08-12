// ============================================================
//  OrderBook.cpp  —  Core price-time priority matching logic
//  FX-Core: Bare-Metal C++ Order Matching Engine
//
//  This is the "brain" of the engine.  process_order() runs
//  the matching loop, handles partial fills, and emits results
//  to stdout (Node.js reads this via IPC).
// ============================================================
#include "../include/OrderBook.h"
#include <cstdio>       // printf / fprintf
#include <algorithm>    // std::min
#include <chrono>       // high_resolution_clock for latency measurement

// ------------------------------------------------------------
// process_order(new_order)
//
// Matching algorithm:
//
//   BUY order:
//     While ask_heap not empty
//       AND new_order.price >= ask_heap.peek().price
//       AND new_order.quantity > 0:
//         fill_qty = min(new_order.qty, best_ask.qty)
//         emit MATCHED line to stdout
//         decrement quantities
//         if best_ask fully consumed → extract_top() from heap
//     If quantity remains → insert into bid_heap (resting limit order)
//
//   SELL order: symmetric with bid_heap / MaxHeap
//
// Time complexity per call: O(k log n)
//   k = number of fills executed (usually 1 for normal flow)
//   n = current depth of the heap
// ------------------------------------------------------------
int OrderBook::process_order(Order new_order) {
    // ── Latency measurement starts HERE ─────────────────────
    auto t_start = std::chrono::high_resolution_clock::now();

    int fills = 0;  // count of fill events this call

    if (new_order.is_buy) {
        // ── BUY order: match against cheapest seller (ask_heap) ──
        while (!ask_heap_.empty() &&
               new_order.quantity > 0 &&
               new_order.price >= ask_heap_.peek().price)
        {
            Order& best_ask = ask_heap_.peek();  // mutable ref — O(1)

            // How many units can be filled right now?
            int fill_qty = std::min(new_order.quantity, best_ask.quantity);

            // Emit fill event on stdout — Node.js reads this line
            // Format: MATCHED_<qty>_@_<price>_BUY<buyerId>_SELL<sellerId>
            printf("MATCHED_%d_@_%.4f_BUY%d_SELL%d\n",
                   fill_qty,
                   best_ask.price,   // fill price = seller's limit (aggressive buyer pays ask)
                   new_order.order_id,
                   best_ask.order_id);
            fflush(stdout);  // critical: Node.js child_process.spawn needs \n flush

            // ── Partial Fill Logic ───────────────────────────────
            new_order.quantity -= fill_qty;
            best_ask.quantity  -= fill_qty;

            if (best_ask.quantity == 0) {
                // Seller fully consumed → remove from heap — O(log n)
                ask_heap_.extract_top();
            }
            // If seller has remaining quantity, it stays in heap at root
            // with updated quantity (we mutated via the mutable peek() ref).
            // The buyer re-evaluates next iteration.

            ++fills;
        }

        // Remaining buy quantity becomes a resting limit order in bid_heap
        if (new_order.quantity > 0) {
            bid_heap_.insert(new_order);   // O(log n)
            printf("QUEUED_BUY_%d_qty_%d_@_%.4f\n",
                   new_order.order_id, new_order.quantity, new_order.price);
            fflush(stdout);
        }

    } else {
        // ── SELL order: match against highest bidder (bid_heap) ──
        while (!bid_heap_.empty() &&
               new_order.quantity > 0 &&
               new_order.price <= bid_heap_.peek().price)
        {
            Order& best_bid = bid_heap_.peek();  // mutable ref — O(1)

            int fill_qty = std::min(new_order.quantity, best_bid.quantity);

            // Fill price = buyer's limit (aggressive seller accepts best bid)
            printf("MATCHED_%d_@_%.4f_BUY%d_SELL%d\n",
                   fill_qty,
                   best_bid.price,
                   best_bid.order_id,
                   new_order.order_id);
            fflush(stdout);

            new_order.quantity -= fill_qty;
            best_bid.quantity  -= fill_qty;

            if (best_bid.quantity == 0) {
                bid_heap_.extract_top();   // O(log n)
            }

            ++fills;
        }

        // Remaining sell quantity rests in ask_heap
        if (new_order.quantity > 0) {
            ask_heap_.insert(new_order);   // O(log n)
            printf("QUEUED_SELL_%d_qty_%d_@_%.4f\n",
                   new_order.order_id, new_order.quantity, new_order.price);
            fflush(stdout);
        }
    }

    // ── Latency measurement ends HERE ───────────────────────
    auto t_end  = std::chrono::high_resolution_clock::now();
    long lat_us = std::chrono::duration_cast<std::chrono::microseconds>(
                      t_end - t_start).count();

    // Emit to STDERR so it doesn't pollute stdout IPC channel
    // Node.js EngineService reads stderr separately for metrics
    fprintf(stderr, "LATENCY_US:%ld ORDER_ID:%d FILLS:%d BID_DEPTH:%d ASK_DEPTH:%d\n",
            lat_us, new_order.order_id, fills,
            bid_heap_.size(), ask_heap_.size());

    return fills;
}
