#ifndef HASH_FUNCTION_H
#define HASH_FUNCTION_H

#include <string>

class HashFunction {
public:
    // Calculate hash of input string within identifier space
    // bits: number of bits in identifier space (e.g., 4 for 0-15)
    static int hash(const std::string& input, int bits);
    
    // Hash file content for content-addressable storage
    static int hashFileContent(const std::string& filepath, int bits);
    
    // Get maximum value in identifier space
    static int getMaxValue(int bits);
};

#endif // HASH_FUNCTION_H
