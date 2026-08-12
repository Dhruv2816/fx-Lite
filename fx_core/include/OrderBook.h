// ============================================================
//  OrderBook.h  —  Order Matching Engine class declaration
//  FX-Core: Bare-Metal C++ Order Matching Engine
// ============================================================
#pragma once

#include "MaxHeap.h"  // Bid (Buy) side  — highest price on top
#include "MinHeap.h"  // Ask (Sell) side — lowest price on top

// ------------------------------------------------------------
// MatchResult — returned by process_order() for each fill event
// ------------------------------------------------------------
struct MatchResult {
    int    fill_qty;     // how many units were matched in this fill
    double fill_price;   // price at which the fill occurred
    int    buyer_id;     // order_id of the buy-side participant
    int    seller_id;    // order_id of the sell-side participant
    bool   is_match;     // false means the order was queued (no fill)
    long   latency_us;   // microseconds from call entry to this fill
};

// ------------------------------------------------------------
// OrderBook — the core matching engine.
//
// Holds two bare-metal heaps and applies price-time priority
// matching with support for partial fills.
//
// process_order() is NOT thread-safe on its own.
// Thread safety is provided by TradeEngine (Day 3).
// ------------------------------------------------------------
class OrderBook {
public:
    OrderBook()  = default;
    ~OrderBook() = default;

    // Disable copy (heaps are not copyable)
    OrderBook(const OrderBook&)            = delete;
    OrderBook& operator=(const OrderBook&) = delete;

    // --------------------------------------------------------
    // process_order(new_order)
    //
    // Core matching algorithm with partial fills.
    // Results are printed directly to stdout (IPC protocol).
    // Latency of the call is printed to stderr.
    //
    // Returns number of fill events that occurred (0 if queued).
    // --------------------------------------------------------
    int process_order(Order new_order);

    // --------------------------------------------------------
    // Depth queries — useful for test_engine and debugging
    // --------------------------------------------------------
    int bid_depth() const { return bid_heap_.size(); }
    int ask_depth() const { return ask_heap_.size(); }

private:
    MaxHeap bid_heap_;   // Buyers  — max-heap by price
    MinHeap ask_heap_;   // Sellers — min-heap by price
};
