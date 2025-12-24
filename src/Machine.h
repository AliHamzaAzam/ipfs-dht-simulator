#ifndef MACHINE_H
#define MACHINE_H

#include <string>
#include "BTree.h"
#include "RoutingTable.h"

// Forward declaration
class RingDHT;

// Machine node in the circular DHT ring
class Machine {
private:
    int id;
    std::string name;
    Machine* next;           // Next in circular linked list
    RoutingTable* routingTable;
    BTree* btree;            // Local file storage
    int identifierBits;

public:
    Machine(int id, const std::string& name, int bits);
    ~Machine();
    
    // Getters
    int getId() const { return id; }
    std::string getName() const { return name; }
    Machine* getNext() const { return next; }
    RoutingTable* getRoutingTable() const { return routingTable; }
    BTree* getBTree() const { return btree; }
    
    // Setters
    void setNext(Machine* machine) { next = machine; }
    
    // Initialize routing table based on current ring state
    void initializeRoutingTable(RingDHT* dht);
    
    // Update routing table after ring changes
    void updateRoutingTable(RingDHT* dht);
    
    // Local B-tree operations
    void insertLocal(int key, const std::string& value);
    std::string searchLocal(int key);
    bool deleteLocal(int key);
    
    // Get all files (for redistribution)
    std::vector<std::pair<int, std::string>> getAllFiles();
    
    // Print machine info
    void print();
    void printRoutingTable();
    void printBTree();
};

#endif // MACHINE_H
