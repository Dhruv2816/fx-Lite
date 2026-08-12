// ============================================================
//  TradeEngine.cpp  —  Producer-Consumer threading implementation
//  FX-Core: Bare-Metal C++ Order Matching Engine
// ============================================================
#include "../include/TradeEngine.h"
#include <cstdio>   // fprintf for debug

// ------------------------------------------------------------
// Constructor / Destructor
// ------------------------------------------------------------
TradeEngine::TradeEngine() : stop_(false) {}

TradeEngine::~TradeEngine() {
    // Safety net: if caller forgot to call shutdown() before
    // destruction, we do it here to avoid a dangling thread.
    if (worker_.joinable()) {
        shutdown();
    }
}

// ------------------------------------------------------------
// start() — spawns the consumer worker thread
// ------------------------------------------------------------
void TradeEngine::start() {
    stop_   = false;
    worker_ = std::thread(&TradeEngine::consume_loop, this);
}

// ------------------------------------------------------------
// submit(Order o) — PRODUCER side (called by main thread / stdin loop)
//
// CRITICAL SECTION: std::lock_guard acquires mtx_ on construction,
// releases on destruction (RAII).  No explicit unlock needed.
// This prevents two concurrent submit() calls from corrupting
// the shared pending_ queue.
// ------------------------------------------------------------
void TradeEngine::submit(const Order& o) {
    {
        // Lock scope starts — any other submit() or consume_loop()
        // trying to acquire mtx_ will BLOCK here until we exit this block.
        std::lock_guard<std::mutex> lock(mtx_);
        pending_.push(o);
    }
    // Lock released.  Now wake the sleeping consumer.
    cv_.notify_one();
}

// ------------------------------------------------------------
// shutdown() — signals the consumer to exit and joins the thread
// ------------------------------------------------------------
void TradeEngine::shutdown() {
    {
        std::lock_guard<std::mutex> lock(mtx_);
        stop_ = true;
    }
    cv_.notify_one();       // wake consumer so it can see stop_ == true
    if (worker_.joinable()) {
        worker_.join();     // wait for consumer to finish its last batch
    }
}

// ------------------------------------------------------------
// consume_loop() — CONSUMER side (runs on worker_ thread)
//
// This is where heap mutation happens.  The critical section
// covers BOTH the queue drain AND the OrderBook::process_order()
// call, because the heaps inside OrderBook are not thread-safe
// on their own.
//
// Flow:
//   1. unique_lock acquires mtx_ (needed for cv_.wait())
//   2. cv_.wait() atomically releases the lock and sleeps.
//      It wakes when cv_.notify_one() is called AND the
//      lambda predicate returns true (non-empty queue OR stop).
//   3. On wake, the lock is RE-ACQUIRED before the lambda runs.
//   4. We drain the entire queue while holding the lock.
//      → Race condition prevented: producer cannot push while
//        we are calling book_.process_order() on the same heaps.
//   5. Lock released at end of while loop body (unique_lock
//      destructor at scope end).
// ------------------------------------------------------------
void TradeEngine::consume_loop() {
    while (true) {
        std::unique_lock<std::mutex> lock(mtx_);

        // Sleep until there's work to do OR we're shutting down.
        // cv_.wait() atomically releases the lock while sleeping.
        cv_.wait(lock, [this] {
            return !pending_.empty() || stop_;
        });

        // ── CRITICAL SECTION (lock is HELD here) ────────────
        // Drain the entire queue before releasing the lock.
        while (!pending_.empty()) {
            Order o = pending_.front();
            pending_.pop();

            // Heap mutation happens HERE — fully inside the lock.
            // No other thread can call submit() or process_order()
            // while this block executes.
            book_.process_order(o);
        }
        // ────────────────────────────────────────────────────

        if (stop_ && pending_.empty()) {
            break;  // clean shutdown: queue drained and stop requested
        }
        // unique_lock destructor releases mtx_ → loop restarts
    }
}
