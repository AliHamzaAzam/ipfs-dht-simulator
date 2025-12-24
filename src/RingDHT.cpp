#include "RingDHT.h"
#include "HashFunction.h"
#include <iostream>
#include <algorithm>
#include <iomanip>

RingDHT::RingDHT(int bits)
    : identifierBits(bits), numMachines(0), head(nullptr), verbose(true) {}

RingDHT::~RingDHT() {
    if (head == nullptr) return;
    
    Machine* current = head;
    Machine* last = head;
    while (last->getNext() != head) {
        last = last->getNext();
    }
    last->setNext(nullptr);
    
    while (current != nullptr) {
        Machine* next = current->getNext();
        delete current;
        current = next;
    }
}

void RingDHT::initialize(int numMachines) {
    if (head != nullptr) {
        Machine* current = head;
        Machine* last = head;
        while (last->getNext() != head) {
            last = last->getNext();
        }
        last->setNext(nullptr);
        
        while (current != nullptr) {
            Machine* next = current->getNext();
            delete current;
            current = next;
        }
        head = nullptr;
        this->numMachines = 0;
    }
    
    // Generate evenly distributed IDs
    uint64_t spacing = (1ULL << std::min(identifierBits, 63)) / numMachines;
    
    for (int i = 0; i < numMachines; i++) {
        uint64_t idVal = (static_cast<uint64_t>(i) * spacing);
        BigInt id(idVal, identifierBits);
        std::string name = "Machine_" + id.toString();
        insertMachine(name, id);
    }
    
    updateAllRoutingTables();
    
    if (verbose) {
        std::cout << "Initialized DHT with " << this->numMachines 
                  << " machines in " << identifierBits << "-bit space" << std::endl;
    }
}

bool RingDHT::insertMachine(const std::string& name, int id) {
    if (id == -1) {
        return insertMachine(name, calculateHash(name));
    }
    return insertMachine(name, BigInt(static_cast<uint64_t>(id), identifierBits));
}

bool RingDHT::insertMachine(const std::string& name, const BigInt& id) {
    if (findMachine(id) != nullptr) {
        if (verbose) {
            std::cout << "Error: Machine with ID " << id.toString() << " already exists" << std::endl;
        }
        return false;
    }
    
    Machine* newMachine = new Machine(id, name, identifierBits);
    
    if (head == nullptr) {
        head = newMachine;
        newMachine->setNext(newMachine);
    } else {
        Machine* last = head;
        while (last->getNext() != head) {
            last = last->getNext();
        }
        
        if (id < head->getId()) {
            last->setNext(newMachine);
            newMachine->setNext(head);
            head = newMachine;
        } else {
            Machine* prev = head;
            Machine* current = head->getNext();
            
            while (current != head && current->getId() < id) {
                prev = current;
                current = current->getNext();
            }
            
            prev->setNext(newMachine);
            newMachine->setNext(current);
        }
    }
    
    numMachines++;
    
    if (verbose) {
        std::cout << "Added machine: " << name << " (ID: " << id.toString() << ")" << std::endl;
    }
    
    return true;
}

bool RingDHT::removeMachine(const BigInt& id) {
    if (head == nullptr) {
        if (verbose) std::cout << "Error: Ring is empty" << std::endl;
        return false;
    }
    
    Machine* toRemove = findMachine(id);
    if (toRemove == nullptr) {
        if (verbose) std::cout << "Error: Machine " << id.toString() << " not found" << std::endl;
        return false;
    }
    
    Machine* successor = toRemove->getNext();
    
    if (successor != toRemove) {
        auto files = toRemove->getAllFiles();
        for (const auto& [key, value] : files) {
            successor->insertLocal(key, value);
        }
        if (verbose && !files.empty()) {
            std::cout << "Redistributed " << files.size() << " files to machine " 
                      << successor->getId().toString() << std::endl;
        }
    }
    
    if (numMachines == 1) {
        head = nullptr;
    } else {
        Machine* pred = head;
        while (pred->getNext() != toRemove) {
            pred = pred->getNext();
        }
        
        pred->setNext(toRemove->getNext());
        
        if (toRemove == head) {
            head = toRemove->getNext();
        }
    }
    
    if (verbose) {
        std::cout << "Removed machine " << id.toString() << std::endl;
    }
    
    delete toRemove;
    numMachines--;
    
    if (numMachines > 0) {
        updateAllRoutingTables();
    }
    
    return true;
}

Machine* RingDHT::findMachine(const BigInt& id) {
    if (head == nullptr) return nullptr;
    
    Machine* current = head;
    do {
        if (current->getId() == id) {
            return current;
        }
        current = current->getNext();
    } while (current != head);
    
    return nullptr;
}

Machine* RingDHT::findSuccessor(const BigInt& id) {
    if (head == nullptr) return nullptr;
    
    Machine* candidate = nullptr;
    Machine* current = head;
    
    do {
        if (current->getId() >= id) {
            if (candidate == nullptr || current->getId() < candidate->getId()) {
                candidate = current;
            }
        }
        current = current->getNext();
    } while (current != head);
    
    if (candidate == nullptr) {
        return head;
    }
    
    return candidate;
}

Machine* RingDHT::findPredecessor(const BigInt& id) {
    if (head == nullptr) return nullptr;
    
    Machine* predecessor = nullptr;
    Machine* current = head;
    
    do {
        if (current->getId() < id) {
            if (predecessor == nullptr || current->getId() > predecessor->getId()) {
                predecessor = current;
            }
        }
        current = current->getNext();
    } while (current != head);
    
    if (predecessor == nullptr) {
        current = head;
        do {
            if (predecessor == nullptr || current->getId() > predecessor->getId()) {
                predecessor = current;
            }
            current = current->getNext();
        } while (current != head);
    }
    
    return predecessor;
}

void RingDHT::updateAllRoutingTables() {
    if (head == nullptr) return;
    
    Machine* current = head;
    do {
        current->initializeRoutingTable(this);
        current = current->getNext();
    } while (current != head);
}

std::vector<BigInt> RingDHT::routeToKey(const BigInt& key, const BigInt& startMachineId, Machine*& destination) {
    std::vector<BigInt> path;
    
    Machine* current = findMachine(startMachineId);
    if (current == nullptr) {
        destination = nullptr;
        return path;
    }
    
    path.push_back(current->getId());
    
    Machine* successor = findSuccessor(key);
    
    while (current != successor) {
        Machine* nextHop = current->getRoutingTable()->getNextHop(key);
        
        if (nextHop == nullptr || nextHop == current) {
            nextHop = current->getNext();
        }
        
        current = nextHop;
        path.push_back(current->getId());
        
        if (path.size() > static_cast<size_t>(numMachines + 1)) {
            break;
        }
    }
    
    destination = current;
    return path;
}

bool RingDHT::insertFile(const std::string& filepath, const BigInt& startMachineId) {
    BigInt key = HashFunction::hashFileContent(filepath, identifierBits);
    
    Machine* destination = nullptr;
    std::vector<BigInt> path = routeToKey(key, startMachineId, destination);
    
    if (destination == nullptr) {
        if (verbose) std::cout << "Error: Could not route to destination" << std::endl;
        return false;
    }
    
    destination->insertLocal(key, filepath);
    
    if (verbose) {
        std::cout << "File hash: " << key.toString() << std::endl;
        std::cout << "Path: ";
        for (size_t i = 0; i < path.size(); i++) {
            if (i > 0) std::cout << " → ";
            std::cout << path[i].toString();
        }
        std::cout << " (stored at machine " << destination->getId().toString() << ")" << std::endl;
    }
    
    return true;
}

std::string RingDHT::searchFile(const BigInt& key, const BigInt& startMachineId) {
    Machine* destination = nullptr;
    std::vector<BigInt> path = routeToKey(key, startMachineId, destination);
    
    if (destination == nullptr) {
        if (verbose) std::cout << "Error: Could not route to destination" << std::endl;
        return "";
    }
    
    std::string result = destination->searchLocal(key);
    
    if (verbose) {
        std::cout << "Path: ";
        for (size_t i = 0; i < path.size(); i++) {
            if (i > 0) std::cout << " → ";
            std::cout << path[i].toString();
        }
        
        if (!result.empty()) {
            std::cout << " (found: " << result << ")" << std::endl;
        } else {
            std::cout << " (not found)" << std::endl;
        }
    }
    
    return result;
}

bool RingDHT::deleteFile(const BigInt& key, const BigInt& startMachineId) {
    Machine* destination = nullptr;
    std::vector<BigInt> path = routeToKey(key, startMachineId, destination);
    
    if (destination == nullptr) {
        if (verbose) std::cout << "Error: Could not route to destination" << std::endl;
        return false;
    }
    
    std::string value = destination->searchLocal(key);
    bool result = destination->deleteLocal(key);
    
    if (verbose) {
        std::cout << "Path: ";
        for (size_t i = 0; i < path.size(); i++) {
            if (i > 0) std::cout << " → ";
            std::cout << path[i].toString();
        }
        
        if (result) {
            std::cout << " (key " << key.toString() << " deleted from machine " << destination->getId().toString() << ")" << std::endl;
            std::cout << "Removed value: " << value << std::endl;
            std::cout << "\nUpdated B-Tree for Machine " << destination->getId().toString() << ":" << std::endl;
            destination->getBTree()->print();
        } else {
            std::cout << " (key " << key.toString() << " not found)" << std::endl;
        }
    }
    
    return result;
}

BigInt RingDHT::calculateHash(const std::string& input) {
    return HashFunction::hash(input, identifierBits);
}

void RingDHT::printStatus() {
    std::cout << "\n=== DHT Status ===" << std::endl;
    std::cout << "Identifier Space: " << identifierBits << " bits" << std::endl;
    std::cout << "Number of Machines: " << numMachines << std::endl;
    
    if (head == nullptr) {
        std::cout << "Ring is empty" << std::endl;
        return;
    }
    
    std::cout << "\nMachines:" << std::endl;
    std::cout << std::setw(15) << "ID" << std::setw(20) << "Name" << std::endl;
    std::cout << std::string(35, '-') << std::endl;
    
    Machine* current = head;
    do {
        std::cout << std::setw(15) << current->getId().toString() 
                  << std::setw(20) << current->getName() << std::endl;
        current = current->getNext();
    } while (current != head);
    
    std::cout << std::endl;
}

void RingDHT::printRoutingTable(const BigInt& machineId) {
    Machine* machine = findMachine(machineId);
    if (machine == nullptr) {
        std::cout << "Error: Machine " << machineId.toString() << " not found" << std::endl;
        return;
    }
    
    machine->printRoutingTable();
}

void RingDHT::printBTree(const BigInt& machineId) {
    Machine* machine = findMachine(machineId);
    if (machine == nullptr) {
        std::cout << "Error: Machine " << machineId.toString() << " not found" << std::endl;
        return;
    }
    
    machine->printBTree();
}

void RingDHT::printRing() {
    if (head == nullptr) {
        std::cout << "Ring is empty" << std::endl;
        return;
    }
    
    std::cout << "\n=== Ring Visualization ===" << std::endl;
    
    Machine* current = head;
    std::cout << "  ";
    do {
        std::cout << "[" << current->getId().toString() << "]";
        if (current->getNext() != head) {
            std::cout << " → ";
        }
        current = current->getNext();
    } while (current != head);
    std::cout << " → (back to " << head->getId().toString() << ")" << std::endl;
    std::cout << std::endl;
}
