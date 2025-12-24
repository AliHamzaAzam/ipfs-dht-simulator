#ifndef HASH_FUNCTION_H
#define HASH_FUNCTION_H

#include <string>
#include "BigInt.h"

class HashFunction {
public:
    // Calculate hash of input string within identifier space
    // bits: number of bits in identifier space (e.g., 4, 160)
    static BigInt hash(const std::string& input, int bits);
    
    // Hash file content for content-addressable storage
    static BigInt hashFileContent(const std::string& filepath, int bits);
};

#endif // HASH_FUNCTION_H
