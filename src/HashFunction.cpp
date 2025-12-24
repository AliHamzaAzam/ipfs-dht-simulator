#include "HashFunction.h"
#include <fstream>
#include <sstream>
#include <functional>

BigInt HashFunction::hash(const std::string& input, int bits) {
    // Use std::hash for initial 64-bit hash, then extend for larger spaces
    std::hash<std::string> hasher;
    
    if (bits <= 64) {
        // For small spaces, use simple polynomial rolling hash
        uint64_t modValue = (bits < 64) ? (1ULL << bits) : 0xFFFFFFFFFFFFFFFFULL;
        uint64_t hashValue = 0;
        
        for (char c : input) {
            hashValue = ((hashValue * 31ULL) % modValue + static_cast<unsigned char>(c)) % modValue;
        }
        
        return BigInt(hashValue, bits);
    } else {
        // For large spaces (like 160-bit), combine multiple hashes
        // This simulates SHA-1's distribution without implementing SHA-1
        uint64_t h1 = hasher(input);
        uint64_t h2 = hasher(input + "salt1");
        uint64_t h3 = hasher(input + "salt2");
        
        BigInt result;
        result.setBits(bits);
        
        // Combine into a BigInt (simplified approach)
        // In reality, you'd want a proper SHA-1 implementation
        BigInt part1(h1, bits);
        BigInt part2(h2 << 32 | (h2 >> 32), bits);  // Mix bits
        BigInt part3(h3, bits);
        
        // XOR-like combination using addition (mod 2^bits)
        result = part1 + part2 + part3;
        
        return result;
    }
}

BigInt HashFunction::hashFileContent(const std::string& filepath, int bits) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        // If file cannot be opened, hash the filepath itself
        return hash(filepath, bits);
    }
    
    std::stringstream buffer;
    buffer << file.rdbuf();
    return hash(buffer.str(), bits);
}
