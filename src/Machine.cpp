#include "Machine.h"
#include "RingDHT.h"
#include <iostream>

Machine::Machine(const BigInt& id, const std::string& name, int bits)
    : id(id), name(name), next(nullptr), identifierBits(bits) {
    routingTable = new RoutingTable(id, bits);
    btree = new BTree(5);
}

Machine::~Machine() {
    delete routingTable;
    delete btree;
}

void Machine::initializeRoutingTable(RingDHT* dht) {
    routingTable->clear();
    
    for (int i = 1; i <= identifierBits; i++) {
        BigInt offset = BigInt::powerOf2(i - 1, identifierBits);
        BigInt start = id + offset;
        Machine* successor = dht->findSuccessor(start);
        
        if (successor != nullptr) {
            routingTable->addEntry(i, start, successor->getId(), successor);
        }
    }
}

void Machine::updateRoutingTable(RingDHT* dht) {
    initializeRoutingTable(dht);
}

void Machine::insertLocal(const BigInt& key, const std::string& value) {
    btree->insert(key, value);
}

std::string Machine::searchLocal(const BigInt& key) {
    return btree->search(key);
}

bool Machine::deleteLocal(const BigInt& key) {
    return btree->remove(key);
}

std::vector<std::pair<BigInt, std::string>> Machine::getAllFiles() {
    return btree->getAllEntries();
}

void Machine::print() {
    std::cout << "Machine " << id.toString() << " (" << name << ")";
}

void Machine::printRoutingTable() {
    routingTable->print();
}

void Machine::printBTree() {
    std::cout << "B-Tree for Machine " << id.toString() << ":" << std::endl;
    btree->print();
}
