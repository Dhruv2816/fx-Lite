// ============================================================
//  MinHeap.h  —  Manual Min-Heap for the ASK (Sell) side
//  FX-Core: Bare-Metal C++ Order Matching Engine
//
//  Mirror of MaxHeap.h with ONE difference:
//    has_lower_priority()  →  lower price wins (min-heap).
//  Everything else — resize(), sift_up(), sift_down(),
//  delete[] in destructor — is structurally identical.
// ============================================================
#pragma once

#include "Order.h"
#include <stdexcept>

class MinHeap {
public:
    explicit MinHeap(int initial_capacity = 16)
        : data_(new Order[initial_capacity]),
          size_(0),
          capacity_(initial_capacity) {}

    ~MinHeap() {
        delete[] data_;
        data_    = nullptr;
        size_    = 0;
        capacity_ = 0;
    }

    // No copy — same raw pointer ownership reasoning as MaxHeap
    MinHeap(const MinHeap&)            = delete;
    MinHeap& operator=(const MinHeap&) = delete;

    // --------------------------------------------------------
    // insert(Order o)  —  O(log n)
    // --------------------------------------------------------
    void insert(const Order& o) {
        if (size_ == capacity_) {
            resize();
        }
        data_[size_] = o;
        sift_up(size_);
        ++size_;
    }

    // --------------------------------------------------------
    // extract_top()  —  O(log n)
    // Returns and removes the lowest-priced ask (cheapest seller).
    // --------------------------------------------------------
    Order extract_top() {
        if (size_ == 0) {
            throw std::runtime_error("MinHeap::extract_top() called on empty heap");
        }
        Order top = data_[0];
        --size_;
        if (size_ > 0) {
            data_[0] = data_[size_];
            sift_down(0);
        }
        return top;
    }

    // --------------------------------------------------------
    // peek()  —  O(1) mutable ref for partial-fill quantity update
    // --------------------------------------------------------
    Order& peek() {
        if (size_ == 0) {
            throw std::runtime_error("MinHeap::peek() called on empty heap");
        }
        return data_[0];
    }

    bool empty() const { return size_ == 0; }
    int  size()  const { return size_; }

private:
    Order* data_;
    int    size_;
    int    capacity_;

    // --------------------------------------------------------
    // sift_up(idx)  —  O(log n)
    // Walks newly inserted node UP while it is LESS than parent.
    // Priority comparison for ASK (Sell) side Min-Heap:
    //   Primary:   lower price wins (cheapest seller on top)
    //   Secondary: earlier timestamp wins (FIFO tie-break)
    // --------------------------------------------------------
    void sift_up(int idx) {
        while (idx > 0) {
            int parent = (idx - 1) / 2;
            if (has_higher_priority(data_[idx], data_[parent])) {
                swap_orders(idx, parent);
                idx = parent;
            } else {
                break;
            }
        }
    }

    // --------------------------------------------------------
    // sift_down(idx)  —  O(log n)
    // Sinks the replacement root down to restore min invariant.
    // --------------------------------------------------------
    void sift_down(int idx) {
        while (true) {
            int left   = 2 * idx + 1;
            int right  = 2 * idx + 2;
            int smallest = idx;

            if (left < size_ && has_higher_priority(data_[left], data_[smallest])) {
                smallest = left;
            }
            if (right < size_ && has_higher_priority(data_[right], data_[smallest])) {
                smallest = right;
            }
            if (smallest == idx) break;

            swap_orders(idx, smallest);
            idx = smallest;
        }
    }

    // --------------------------------------------------------
    // resize()  —  O(n)  — same doubling strategy as MaxHeap
    // --------------------------------------------------------
    void resize() {
        int new_capacity = capacity_ * 2;
        Order* new_data  = new Order[new_capacity];
        for (int i = 0; i < size_; ++i) {
            new_data[i] = data_[i];
        }
        delete[] data_;
        data_     = new_data;
        capacity_ = new_capacity;
    }

    // --------------------------------------------------------
    // Priority for Min-Heap: lower price = higher priority.
    // Tie-break: earlier timestamp = FIFO (price-time priority).
    // --------------------------------------------------------
    static bool has_higher_priority(const Order& a, const Order& b) {
        if (a.price != b.price) return a.price < b.price;
        return a.timestamp < b.timestamp;
    }

    void swap_orders(int i, int j) {
        Order tmp  = data_[i];
        data_[i]   = data_[j];
        data_[j]   = tmp;
    }
};
