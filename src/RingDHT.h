#ifndef RING_DHT_H
#define RING_DHT_H

#include <string>
#include <vector>
#include "Machine.h"

// Ring-based Distributed Hash Table
class RingDHT {
private:
    int identifierBits;      // Number of bits in identifier space
    int identifierSpace;     // 2^identifierBits
    int numMachines;
    Machine* head;           // First machine in ring
    bool verbose;            // Verbose logging mode

public:
    explicit RingDHT(int bits = 4);
    ~RingDHT();
    
    // Initialization
    void initialize(int numMachines);
    
    // Machine management
    bool insertMachine(const std::string& name, int id = -1);  // -1 = auto-assign
    bool removeMachine(int id);
    Machine* findMachine(int id);
    Machine* findSuccessor(int id);  // Find machine responsible for id
    Machine* findPredecessor(int id);
    
    // Update all routing tables (after topology change)
    void updateAllRoutingTables();
    
    // File operations with routing
    bool insertFile(const std::string& filepath, int startMachineId);
    std::string searchFile(int key, int startMachineId);
    bool deleteFile(int key, int startMachineId);
    
    // Hash function
    int calculateHash(const std::string& input);
    
    // Getters
    int getIdentifierBits() const { return identifierBits; }
    int getIdentifierSpace() const { return identifierSpace; }
    int getNumMachines() const { return numMachines; }
    
    // Verbose mode
    void setVerbose(bool v) { verbose = v; }
    bool isVerbose() const { return verbose; }
    
    // Display functions
    void printStatus();
    void printRoutingTable(int machineId);
    void printBTree(int machineId);
    void printRing();  // ASCII visualization

private:
    // Helper for routing
    std::vector<int> routeToKey(int key, int startMachineId, Machine*& destination);
    
    // Check if id is in range (start, end] in circular space
    bool inRange(int id, int start, int end);
};

#endif // RING_DHT_H
