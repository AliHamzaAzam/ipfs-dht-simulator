#include "RoutingTable.h"
#include "Machine.h"
#include <iomanip>

RoutingTable::RoutingTable(const BigInt& machineId, int bits)
    : head(nullptr), tail(nullptr), size(0), 
      ownerMachineId(machineId) {
    (void)bits;  // Unused parameter
}

RoutingTable::~RoutingTable() {
    clear();
}

void RoutingTable::addEntry(int index, const BigInt& startId, const BigInt& targetId, Machine* ptr) {
    RoutingEntry* entry = new RoutingEntry(index, startId, targetId, ptr);
    
    if (head == nullptr) {
        head = tail = entry;
    } else {
        tail->next = entry;
        entry->prev = tail;
        tail = entry;
    }
    size++;
}

void RoutingTable::clear() {
    RoutingEntry* current = head;
    while (current != nullptr) {
        RoutingEntry* next = current->next;
        delete current;
        current = next;
    }
    head = tail = nullptr;
    size = 0;
}

Machine* RoutingTable::getNextHop(const BigInt& key) {
    // Find the largest finger that precedes key
    // Traverse from tail (largest finger) to head (smallest)
    
    RoutingEntry* current = tail;
    
    while (current != nullptr) {
        BigInt fingerId = current->targetId;
        
        // Check if finger is between owner and key (in circular space)
        bool fingerInRange;
        
        if (ownerMachineId < key) {
            // Normal case: owner < key
            fingerInRange = (ownerMachineId < fingerId && fingerId <= key);
        } else if (ownerMachineId > key) {
            // Wrap around case: key is after 0
            fingerInRange = (fingerId > ownerMachineId || fingerId <= key);
        } else {
            fingerInRange = false;
        }
        
        if (fingerInRange) {
            return current->machinePtr;
        }
        
        current = current->prev;
    }
    
    // If no suitable finger found, return the first finger (successor)
    if (head != nullptr) {
        return head->machinePtr;
    }
    
    return nullptr;
}

RoutingEntry* RoutingTable::getEntry(int index) {
    RoutingEntry* current = head;
    while (current != nullptr) {
        if (current->index == index) {
            return current;
        }
        current = current->next;
    }
    return nullptr;
}

void RoutingTable::print() {
    std::cout << "Routing Table for Machine " << ownerMachineId.toString() << ":" << std::endl;
    std::cout << "  " << std::setw(5) << "i" 
              << std::setw(20) << "start" 
              << std::setw(20) << "succ" << std::endl;
    std::cout << "  " << std::string(45, '-') << std::endl;
    
    RoutingEntry* current = head;
    while (current != nullptr) {
        std::cout << "  " << std::setw(5) << current->index
                  << std::setw(20) << current->startId.toString()
                  << std::setw(20) << current->targetId.toString() << std::endl;
        current = current->next;
    }
}
