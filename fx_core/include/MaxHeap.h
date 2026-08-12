// ============================================================
//  MaxHeap.h  —  Manual Max-Heap for the BID (Buy) side
//  FX-Core: Bare-Metal C++ Order Matching Engine
//
//  DESIGN RULES (enforced):
//    • NO STL containers (no std::vector, no std::priority_queue)
//    • Memory managed exclusively via new[] / delete[]
//    • sift_up()  : O(log n)  — called after insert
//    • sift_down(): O(log n)  — called after extract_top
//    • resize()   : O(n)      — doubles capacity, like std::vector
//    • Destructor : delete[]  — Valgrind reports zero leaks
// ============================================================
#pragma once

#include "Order.h"
#include <stdexcept>    // std::runtime_error (single STL exception allowed)

class MaxHeap {
public:
    // --------------------------------------------------------
    // Constructor: allocate initial backing array
    // --------------------------------------------------------
    explicit MaxHeap(int initial_capacity = 16)
        : data_(new Order[initial_capacity]),
          size_(0),
          capacity_(initial_capacity) {}

    // --------------------------------------------------------
    // Destructor: MUST call delete[] to prevent memory leaks.
    // Valgrind will confirm "0 bytes definitely lost".
    // --------------------------------------------------------
    ~MaxHeap() {
        delete[] data_;
        data_    = nullptr;
        size_    = 0;
        capacity_ = 0;
    }

    // --------------------------------------------------------
    // Disable copy — raw pointer ownership; we never copy heaps.
    // --------------------------------------------------------
    MaxHeap(const MaxHeap&)            = delete;
    MaxHeap& operator=(const MaxHeap&) = delete;

    // --------------------------------------------------------
    // insert(Order o)  —  O(log n)
    // Appends to the end of the array, then sifts up to restore
    // the max-heap invariant (parent.price >= child.price).
    // --------------------------------------------------------
    void insert(const Order& o) {
        if (size_ == capacity_) {
            resize();           // double capacity before overflow
        }
        data_[size_] = o;
        sift_up(size_);
        ++size_;
    }

    // --------------------------------------------------------
    // extract_top()  —  O(log n)
    // Swaps root with last element, decrements size, sifts
    // the new root down to restore the max-heap invariant.
    // --------------------------------------------------------
    Order extract_top() {
        if (size_ == 0) {
            throw std::runtime_error("MaxHeap::extract_top() called on empty heap");
        }
        Order top = data_[0];
        --size_;
        if (size_ > 0) {
            data_[0] = data_[size_];   // move last element to root
            sift_down(0);
        }
        return top;
    }

    // --------------------------------------------------------
    // peek()  —  O(1)
    // Returns a mutable reference to the root so the matching
    // engine can decrement quantity in-place for partial fills
    // without a full extract + re-insert.
    // --------------------------------------------------------
    Order& peek() {
        if (size_ == 0) {
            throw std::runtime_error("MaxHeap::peek() called on empty heap");
        }
        return data_[0];
    }

    // --------------------------------------------------------
    // Accessors
    // --------------------------------------------------------
    bool empty() const { return size_ == 0; }
    int  size()  const { return size_; }

private:
    Order* data_;       // raw heap-allocated array
    int    size_;       // current number of elements
    int    capacity_;   // current allocated capacity

    // --------------------------------------------------------
    // sift_up(idx)  —  O(log n)
    // Walks a newly inserted node UP the tree while it is
    // greater than its parent (max-heap property).
    // Comparison: higher price = higher priority.
    // Tie-break: earlier timestamp = higher priority (FIFO).
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
    // After extracting the root, the replacement element at
    // idx=0 needs to sink DOWN until both children are smaller.
    // --------------------------------------------------------
    void sift_down(int idx) {
        while (true) {
            int left  = 2 * idx + 1;
            int right = 2 * idx + 2;
            int largest = idx;

            if (left < size_ && has_higher_priority(data_[left], data_[largest])) {
                largest = left;
            }
            if (right < size_ && has_higher_priority(data_[right], data_[largest])) {
                largest = right;
            }
            if (largest == idx) break;  // heap invariant restored

            swap_orders(idx, largest);
            idx = largest;
        }
    }

    // --------------------------------------------------------
    // resize()  —  O(n)
    // Doubles the backing array, exactly mirroring std::vector's
    // amortised growth strategy.  Old array is delete[]'d.
    // --------------------------------------------------------
    void resize() {
        int new_capacity = capacity_ * 2;
        Order* new_data  = new Order[new_capacity];

        // Manual copy — no memcpy to stay explicit and safe for non-trivial types
        for (int i = 0; i < size_; ++i) {
            new_data[i] = data_[i];
        }

        delete[] data_;         // free old allocation
        data_     = new_data;
        capacity_ = new_capacity;
    }

    // --------------------------------------------------------
    // Priority comparison for BID (Buy) side Max-Heap:
    //   Primary:   higher price wins
    //   Secondary: earlier timestamp wins (time priority / FIFO)
    // --------------------------------------------------------
    static bool has_higher_priority(const Order& a, const Order& b) {
        if (a.price != b.price) return a.price > b.price;
        return a.timestamp < b.timestamp;   // earlier order has priority
    }

    // --------------------------------------------------------
    // Swap two elements in the backing array
    // --------------------------------------------------------
    void swap_orders(int i, int j) {
        Order tmp  = data_[i];
        data_[i]   = data_[j];
        data_[j]   = tmp;
    }
};
