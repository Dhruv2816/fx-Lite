# ============================================================
#  Makefile  —  FX-Core Build System
#  FX-Core: Bare-Metal C++ Order Matching Engine
# ============================================================

CXX      = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra -pthread

INCLUDE  = -Iinclude
SRCDIR   = src

# Main IPC binary (spawned by Node.js)
TARGET   = fx_core
SRCS     = main.cpp \
           $(SRCDIR)/OrderBook.cpp \
           $(SRCDIR)/TradeEngine.cpp

# Standalone test binary
TEST_TARGET = test_engine
TEST_SRCS   = test_engine.cpp \
              $(SRCDIR)/OrderBook.cpp

.PHONY: all clean test valgrind

# ── Default: build the main IPC binary ──────────────────────
all: $(TARGET)

$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) $(INCLUDE) $(SRCS) -o $(TARGET)
	@echo "✅  Built fx_core binary"

# ── Standalone C++ correctness + latency tests ──────────────
# Note: test_engine uses OrderBook directly (no TradeEngine thread)
# so we do NOT link TradeEngine.cpp here.
test: $(TEST_TARGET)
	./$(TEST_TARGET)

$(TEST_TARGET): $(TEST_SRCS)
	$(CXX) $(CXXFLAGS) $(INCLUDE) $(TEST_SRCS) -o $(TEST_TARGET)
	@echo "✅  Built test_engine binary"

# ── Valgrind memory leak check ───────────────────────────────
# Run the test binary under Valgrind.
# Interviewer Q: "How did you check for memory leaks?"
# A: valgrind --leak-check=full → confirms 0 bytes lost.
valgrind: $(TEST_TARGET)
	valgrind --leak-check=full \
	         --show-leak-kinds=all \
	         --track-origins=yes \
	         --error-exitcode=1 \
	         ./$(TEST_TARGET)

# ── Clean ────────────────────────────────────────────────────
clean:
	rm -f $(TARGET) $(TEST_TARGET)
	@echo "🧹  Cleaned build artifacts"
