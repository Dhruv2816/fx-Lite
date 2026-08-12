// ============================================================
//  TradeEngine.h  —  Thread-safe wrapper around OrderBook
//  FX-Core: Bare-Metal C++ Order Matching Engine
//
//  Producer-Consumer architecture:
//    • Main thread (producer): calls submit(Order) to push
//      incoming orders into a shared queue.
//    • Worker thread (consumer): drains the queue and calls
//      OrderBook::process_order() under mutex protection.
//
//  OS Concepts demonstrated:
//    • std::mutex        — wraps pthread_mutex_t
//    • std::condition_variable — wraps pthread_cond_t
//    • std::thread       — wraps pthread_create
//    • std::lock_guard   — RAII scoped lock (critical section)
//    • std::unique_lock  — needed for condition_variable::wait()
// ============================================================
#pragma once

#include <queue>
#include <mutex>
#include <condition_variable>
#include <thread>
#include "OrderBook.h"

class TradeEngine {
public:
    TradeEngine();
    ~TradeEngine();

    // Disable copy — contains non-copyable mutex and thread
    TradeEngine(const TradeEngine&)            = delete;
    TradeEngine& operator=(const TradeEngine&) = delete;

    // --------------------------------------------------------
    // start() — spawns the consumer worker thread.
    // Must be called before submit().
    // --------------------------------------------------------
    void start();

    // --------------------------------------------------------
    // submit(Order o) — Producer-side call (thread-safe).
    //
    // Acquires the mutex, pushes to pending_queue_, releases
    // the mutex, then notifies the sleeping consumer.
    // --------------------------------------------------------
    void submit(const Order& o);

    // --------------------------------------------------------
    // shutdown() — signals consumer to stop, joins the thread.
    // MUST be called before destruction to avoid joining a
    // thread that's waiting forever on condition_variable.
    // --------------------------------------------------------
    void shutdown();

private:
    OrderBook  book_;             // The core matching engine (NOT thread-safe alone)
    std::queue<Order> pending_;   // Shared order queue between producer and consumer
    std::mutex        mtx_;       // Guards pending_ and stop_ flag
    std::condition_variable cv_;  // Consumer sleeps here when queue is empty
    std::thread       worker_;    // The consumer thread handle
    bool              stop_;      // Signals consumer to exit its loop

    // --------------------------------------------------------
    // consume_loop() — runs on worker_ thread.
    //
    // Waits for cv_ notification. When woken:
    //   1. Acquires lock (std::unique_lock keeps it held)
    //   2. Drains entire queue: calls book_.process_order()
    //      for each order  ← CRITICAL SECTION (heap mutation)
    //   3. Releases lock (unique_lock destructor)
    //   4. Goes back to wait
    // --------------------------------------------------------
    void consume_loop();
};
