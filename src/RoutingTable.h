#ifndef ROUTING_TABLE_H
#define ROUTING_TABLE_H

#include <iostream>
#include "BigInt.h"

// Forward declaration
class Machine;

// Routing table entry (finger table entry)
struct RoutingEntry {
    int index;           // i (1-indexed)
    BigInt startId;      // p + 2^(i-1) mod 2^m
    BigInt targetId;     // succ(startId)
    Machine* machinePtr; // Pointer to target machine
    RoutingEntry* prev;
    RoutingEntry* next;
    
    RoutingEntry(int idx, const BigInt& start, const BigInt& target, Machine* ptr)
        : index(idx), startId(start), targetId(target), machinePtr(ptr),
          prev(nullptr), next(nullptr) {}
};

// Doubly linked list of routing entries (finger table)
class RoutingTable {
private:
    RoutingEntry* head;
    RoutingEntry* tail;
    int size;
    BigInt ownerMachineId;

public:
    RoutingTable(const BigInt& machineId, int bits);
    ~RoutingTable();
    
    // Add entry to the table
    void addEntry(int index, const BigInt& startId, const BigInt& targetId, Machine* ptr);
    
    // Clear all entries (for rebuilding)
    void clear();
    
    // Get next hop for routing to a key
    Machine* getNextHop(const BigInt& key);
    
    // Get entry at index (1-indexed)
    RoutingEntry* getEntry(int index);
    
    // Get size
    int getSize() const { return size; }
    
    // Print routing table
    void print();
};

#endif // ROUTING_TABLE_H
