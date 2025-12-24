#include "Machine.h"
#include "RingDHT.h"
#include <iostream>

Machine::Machine(int id, const std::string& name, int bits)
    : id(id), name(name), next(nullptr), identifierBits(bits) {
    routingTable = new RoutingTable(id, bits);
    btree = new BTree(5);  // Order 5 B-tree
}

Machine::~Machine() {
    delete routingTable;
    delete btree;
}

void Machine::initializeRoutingTable(RingDHT* dht) {
    routingTable->clear();
    
    int identifierSpace = 1 << identifierBits;  // 2^bits
    
    // Create finger table entries
    // Entry i points to succ(id + 2^(i-1)) for i = 1 to identifierBits
    for (int i = 1; i <= identifierBits; i++) {
        int start = (id + (1 << (i - 1))) % identifierSpace;
        Machine* successor = dht->findSuccessor(start);
        
        if (successor != nullptr) {
            routingTable->addEntry(i, start, successor->getId(), successor);
        }
    }
}

void Machine::updateRoutingTable(RingDHT* dht) {
    // Simply rebuild the routing table
    initializeRoutingTable(dht);
}

void Machine::insertLocal(int key, const std::string& value) {
    btree->insert(key, value);
}

std::string Machine::searchLocal(int key) {
    return btree->search(key);
}

bool Machine::deleteLocal(int key) {
    return btree->remove(key);
}

std::vector<std::pair<int, std::string>> Machine::getAllFiles() {
    return btree->getAllEntries();
}

void Machine::print() {
    std::cout << "Machine " << id << " (" << name << ")";
}

void Machine::printRoutingTable() {
    routingTable->print();
}

void Machine::printBTree() {
    std::cout << "B-Tree for Machine " << id << ":" << std::endl;
    btree->print();
}
