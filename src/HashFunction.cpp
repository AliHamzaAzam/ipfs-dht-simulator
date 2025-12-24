#include "HashFunction.h"
#include <fstream>
#include <sstream>

int HashFunction::hash(const std::string& input, int bits) {
    int maxValue = getMaxValue(bits);
    
    // Polynomial rolling hash
    long long hashValue = 0;
    for (char c : input) {
        hashValue = (hashValue * 31 + static_cast<unsigned char>(c)) % (maxValue + 1);
    }
    return static_cast<int>(hashValue);
}

int HashFunction::hashFileContent(const std::string& filepath, int bits) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        // If file cannot be opened, hash the filepath itself
        return hash(filepath, bits);
    }
    
    std::stringstream buffer;
    buffer << file.rdbuf();
    return hash(buffer.str(), bits);
}

int HashFunction::getMaxValue(int bits) {
    return (1 << bits) - 1;  // 2^bits - 1
}
