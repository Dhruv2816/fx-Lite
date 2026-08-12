// ============================================================
//  Order.h  —  Plain-Old-Data struct for a single limit order
//  FX-Core: Bare-Metal C++ Order Matching Engine
// ============================================================
#pragma once

#include <cstdio>   // printf / snprintf
#include <cstring>  // strlen

// ------------------------------------------------------------
// Order — the atomic unit flowing through the matching engine.
//
// Fields kept as primitives on purpose: no std::string, no
// heap allocations inside the struct itself.  This lets us
// store Orders directly in our raw pointer arrays inside the
// heaps without any extra indirection.
// ------------------------------------------------------------
struct Order {
    int    order_id;    // Unique numeric ID assigned by caller
    double price;       // Limit price (user-supplied, NOT a live market rate)
    int    quantity;    // Number of units; decremented on partial fill
    long   timestamp;   // Epoch microseconds — used for time-priority tie-breaking
    bool   is_buy;      // true = BUY (bid), false = SELL (ask)
};

// ------------------------------------------------------------
// Convenience: print one order to stdout in a readable format.
// Used in test_engine.cpp.
// ------------------------------------------------------------
inline void print_order(const Order& o) {
    printf("Order[id=%d %s price=%.4f qty=%d ts=%ld]\n",
           o.order_id,
           o.is_buy ? "BUY " : "SELL",
           o.price,
           o.quantity,
           o.timestamp);
}
