#include "RoutingTable.h"
#include "Machine.h"
#include <iomanip>

RoutingTable::RoutingTable(int machineId, int bits)
    : head(nullptr), tail(nullptr), size(0), 
      ownerMachineId(machineId), identifierBits(bits) {}

RoutingTable::~RoutingTable() {
    clear();
}

void RoutingTable::addEntry(int index, int startId, int targetId, Machine* ptr) {
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

Machine* RoutingTable::getNextHop(int key, int identifierSpace) {
    // Find the largest finger that precedes key
    // Traverse from tail (largest finger) to head (smallest)
    
    RoutingEntry* current = tail;
    
    while (current != nullptr) {
        int fingerId = current->targetId;
        
        // Check if finger is between owner and key (in circular space)
        // finger is in (owner, key) means it's a valid predecessor
        bool fingerInRange;
        
        if (ownerMachineId < key) {
            // Normal case: owner < key
            fingerInRange = (ownerMachineId < fingerId && fingerId <= key);
        } else if (ownerMachineId > key) {
            // Wrap around case: key is after 0
            fingerInRange = (fingerId > ownerMachineId || fingerId <= key);
        } else {
            // owner == key, shouldn't happen in search
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
    std::cout << "Routing Table for Machine " << ownerMachineId << ":" << std::endl;
    std::cout << "  " << std::setw(5) << "i" 
              << std::setw(12) << "start" 
              << std::setw(12) << "succ" << std::endl;
    std::cout << "  " << std::string(29, '-') << std::endl;
    
    RoutingEntry* current = head;
    while (current != nullptr) {
        std::cout << "  " << std::setw(5) << current->index
                  << std::setw(12) << current->startId
                  << std::setw(12) << current->targetId << std::endl;
        current = current->next;
    }
}
