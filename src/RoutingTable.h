#ifndef ROUTING_TABLE_H
#define ROUTING_TABLE_H

#include <iostream>

// Forward declaration
class Machine;

// Routing table entry (finger table entry)
struct RoutingEntry {
    int index;           // i (1-indexed)
    int startId;         // p + 2^(i-1) mod 2^m
    int targetId;        // succ(startId)
    Machine* machinePtr; // Pointer to target machine
    RoutingEntry* prev;
    RoutingEntry* next;
    
    RoutingEntry(int idx, int start, int target, Machine* ptr)
        : index(idx), startId(start), targetId(target), machinePtr(ptr),
          prev(nullptr), next(nullptr) {}
};

// Doubly linked list of routing entries (finger table)
class RoutingTable {
private:
    RoutingEntry* head;
    RoutingEntry* tail;
    int size;
    int ownerMachineId;
    int identifierBits;

public:
    RoutingTable(int machineId, int bits);
    ~RoutingTable();
    
    // Add entry to the table
    void addEntry(int index, int startId, int targetId, Machine* ptr);
    
    // Clear all entries (for rebuilding)
    void clear();
    
    // Get next hop for routing to a key
    // Returns the machine pointer for the best next hop
    Machine* getNextHop(int key, int identifierSpace);
    
    // Get entry at index (1-indexed)
    RoutingEntry* getEntry(int index);
    
    // Get size
    int getSize() const { return size; }
    
    // Print routing table
    void print();
};

#endif // ROUTING_TABLE_H
