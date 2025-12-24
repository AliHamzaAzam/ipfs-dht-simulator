#ifndef RING_DHT_H
#define RING_DHT_H

#include <string>
#include <vector>
#include "BigInt.h"
#include "Machine.h"

class RingDHT {
private:
    int identifierBits;
    int numMachines;
    Machine* head;
    bool verbose;

public:
    explicit RingDHT(int bits = 4);
    ~RingDHT();
    
    void initialize(int numMachines);
    
    bool insertMachine(const std::string& name, const BigInt& id);
    bool insertMachine(const std::string& name, int id = -1);
    bool removeMachine(const BigInt& id);
    Machine* findMachine(const BigInt& id);
    Machine* findSuccessor(const BigInt& id);
    Machine* findPredecessor(const BigInt& id);
    
    void updateAllRoutingTables();
    
    bool insertFile(const std::string& filepath, const BigInt& startMachineId);
    std::string searchFile(const BigInt& key, const BigInt& startMachineId);
    bool deleteFile(const BigInt& key, const BigInt& startMachineId);
    
    BigInt calculateHash(const std::string& input);
    
    int getIdentifierBits() const { return identifierBits; }
    int getNumMachines() const { return numMachines; }
    
    void setVerbose(bool v) { verbose = v; }
    bool isVerbose() const { return verbose; }
    
    void printStatus();
    void printRoutingTable(const BigInt& machineId);
    void printBTree(const BigInt& machineId);
    void printRing();

private:
    std::vector<BigInt> routeToKey(const BigInt& key, const BigInt& startMachineId, Machine*& destination);
};

#endif // RING_DHT_H
