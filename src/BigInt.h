#ifndef BIGINT_H
#define BIGINT_H

#include <string>
#include <vector>
#include <cstdint>

// Simple BigInt class to support up to 160-bit identifiers
// Stores value as array of 64-bit words (little-endian: words[0] is least significant)
class BigInt {
private:
    static const int MAX_WORDS = 3;  // 3 * 64 = 192 bits (enough for 160)
    uint64_t words[MAX_WORDS];
    int numBits;  // Identifier space size

public:
    BigInt();
    BigInt(uint64_t value, int bits = 64);
    BigInt(const std::string& hexStr, int bits);
    
    // Set identifier space size
    void setBits(int bits) { numBits = bits; }
    int getBits() const { return numBits; }
    
    // Arithmetic operations (mod 2^numBits)
    BigInt operator+(const BigInt& other) const;
    BigInt operator-(const BigInt& other) const;
    BigInt& operator+=(const BigInt& other);
    
    // Comparison operators
    bool operator==(const BigInt& other) const;
    bool operator!=(const BigInt& other) const;
    bool operator<(const BigInt& other) const;
    bool operator<=(const BigInt& other) const;
    bool operator>(const BigInt& other) const;
    bool operator>=(const BigInt& other) const;
    
    // Power of 2
    static BigInt powerOf2(int exponent, int bits);
    
    // Convert to int (for small values)
    int toInt() const;
    
    // Convert to hex string
    std::string toHex() const;
    
    // Convert to decimal string (for display)
    std::string toString() const;
    
    // Check if value fits in 64 bits
    bool fitsIn64Bits() const;
    
    // Get raw 64-bit value (for small spaces)
    uint64_t getLow64() const { return words[0]; }
    
private:
    void normalize();  // Apply modulo 2^numBits
};

#endif // BIGINT_H
