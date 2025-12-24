#ifndef MACHINE_H
#define MACHINE_H

#include <string>
#include "BigInt.h"
#include "BTree.h"
#include "RoutingTable.h"

class RingDHT;

class Machine {
private:
    BigInt id;
    std::string name;
    Machine* next;
    RoutingTable* routingTable;
    BTree* btree;
    int identifierBits;

public:
    Machine(const BigInt& id, const std::string& name, int bits);
    ~Machine();
    
    BigInt getId() const { return id; }
    std::string getName() const { return name; }
    Machine* getNext() const { return next; }
    RoutingTable* getRoutingTable() const { return routingTable; }
    BTree* getBTree() const { return btree; }
    
    void setNext(Machine* machine) { next = machine; }
    
    void initializeRoutingTable(RingDHT* dht);
    void updateRoutingTable(RingDHT* dht);
    
    void insertLocal(const BigInt& key, const std::string& value);
    std::string searchLocal(const BigInt& key);
    bool deleteLocal(const BigInt& key);
    
    std::vector<std::pair<BigInt, std::string>> getAllFiles();
    
    void print();
    void printRoutingTable();
    void printBTree();
};

#endif // MACHINE_H
