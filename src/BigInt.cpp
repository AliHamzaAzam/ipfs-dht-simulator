#include "BigInt.h"
#include <sstream>
#include <iomanip>
#include <algorithm>

BigInt::BigInt() : numBits(64) {
    for (int i = 0; i < MAX_WORDS; i++) {
        words[i] = 0;
    }
}

BigInt::BigInt(uint64_t value, int bits) : numBits(bits) {
    words[0] = value;
    for (int i = 1; i < MAX_WORDS; i++) {
        words[i] = 0;
    }
    normalize();
}

BigInt::BigInt(const std::string& hexStr, int bits) : numBits(bits) {
    for (int i = 0; i < MAX_WORDS; i++) {
        words[i] = 0;
    }
    
    // Parse hex string (may have 0x prefix)
    std::string hex = hexStr;
    if (hex.substr(0, 2) == "0x" || hex.substr(0, 2) == "0X") {
        hex = hex.substr(2);
    }
    
    // Process 16 hex chars (64 bits) at a time, from right to left
    int wordIdx = 0;
    while (!hex.empty() && wordIdx < MAX_WORDS) {
        size_t len = std::min(static_cast<size_t>(16), hex.length());
        std::string chunk = hex.substr(hex.length() - len);
        hex = hex.substr(0, hex.length() - len);
        
        words[wordIdx++] = std::stoull(chunk, nullptr, 16);
    }
    
    normalize();
}

void BigInt::normalize() {
    // Apply modulo 2^numBits
    if (numBits <= 0) return;
    
    int fullWords = numBits / 64;
    int remainingBits = numBits % 64;
    
    // Zero out words beyond our bit limit
    for (int i = fullWords + (remainingBits > 0 ? 1 : 0); i < MAX_WORDS; i++) {
        words[i] = 0;
    }
    
    // Mask the partial word
    if (remainingBits > 0 && fullWords < MAX_WORDS) {
        uint64_t mask = (1ULL << remainingBits) - 1;
        words[fullWords] &= mask;
    }
}

BigInt BigInt::operator+(const BigInt& other) const {
    BigInt result;
    result.numBits = numBits;
    
    uint64_t carry = 0;
    for (int i = 0; i < MAX_WORDS; i++) {
        uint64_t sum = words[i] + other.words[i] + carry;
        // Check for overflow
        carry = (sum < words[i] || (carry && sum == words[i])) ? 1 : 0;
        result.words[i] = sum;
    }
    
    result.normalize();
    return result;
}

BigInt BigInt::operator-(const BigInt& other) const {
    BigInt result;
    result.numBits = numBits;
    
    uint64_t borrow = 0;
    for (int i = 0; i < MAX_WORDS; i++) {
        uint64_t diff = words[i] - other.words[i] - borrow;
        borrow = (words[i] < other.words[i] + borrow) ? 1 : 0;
        result.words[i] = diff;
    }
    
    result.normalize();
    return result;
}

BigInt& BigInt::operator+=(const BigInt& other) {
    *this = *this + other;
    return *this;
}

bool BigInt::operator==(const BigInt& other) const {
    for (int i = 0; i < MAX_WORDS; i++) {
        if (words[i] != other.words[i]) return false;
    }
    return true;
}

bool BigInt::operator!=(const BigInt& other) const {
    return !(*this == other);
}

bool BigInt::operator<(const BigInt& other) const {
    for (int i = MAX_WORDS - 1; i >= 0; i--) {
        if (words[i] < other.words[i]) return true;
        if (words[i] > other.words[i]) return false;
    }
    return false;  // Equal
}

bool BigInt::operator<=(const BigInt& other) const {
    return *this < other || *this == other;
}

bool BigInt::operator>(const BigInt& other) const {
    return !(*this <= other);
}

bool BigInt::operator>=(const BigInt& other) const {
    return !(*this < other);
}

BigInt BigInt::powerOf2(int exponent, int bits) {
    BigInt result;
    result.numBits = bits;
    
    if (exponent < 0) return result;
    
    int wordIdx = exponent / 64;
    int bitPos = exponent % 64;
    
    if (wordIdx < MAX_WORDS) {
        result.words[wordIdx] = 1ULL << bitPos;
    }
    
    result.normalize();
    return result;
}

int BigInt::toInt() const {
    return static_cast<int>(words[0]);
}

std::string BigInt::toHex() const {
    std::ostringstream oss;
    bool started = false;
    
    for (int i = MAX_WORDS - 1; i >= 0; i--) {
        if (words[i] != 0 || started || i == 0) {
            if (started) {
                oss << std::setfill('0') << std::setw(16);
            }
            oss << std::hex << words[i];
            started = true;
        }
    }
    
    return oss.str();
}

std::string BigInt::toString() const {
    // For small values, use decimal
    if (fitsIn64Bits()) {
        return std::to_string(words[0]);
    }
    // For large values, use hex
    return "0x" + toHex();
}

bool BigInt::fitsIn64Bits() const {
    for (int i = 1; i < MAX_WORDS; i++) {
        if (words[i] != 0) return false;
    }
    return true;
}
