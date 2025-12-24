#include "RingDHT.h"
#include "HashFunction.h"
#include <iostream>
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;

RingDHT::RingDHT(int bits)
    : identifierBits(bits), numMachines(0), head(nullptr), verbose(true) {
    identifierSpace = 1 << bits;  // 2^bits
}

RingDHT::~RingDHT() {
    if (head == nullptr) return;
    
    // Break the circular link first
    Machine* current = head;
    Machine* last = head;
    while (last->getNext() != head) {
        last = last->getNext();
    }
    last->setNext(nullptr);
    
    // Now delete all machines
    while (current != nullptr) {
        Machine* next = current->getNext();
        delete current;
        current = next;
    }
}

void RingDHT::initialize(int numMachines) {
    // Clear existing machines
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
    
    // Generate evenly distributed machine IDs
    std::vector<int> machineIds;
    int spacing = identifierSpace / numMachines;
    
    for (int i = 0; i < numMachines; i++) {
        int id = (i * spacing) % identifierSpace;
        machineIds.push_back(id);
    }
    
    // Sort IDs for proper ring order
    std::sort(machineIds.begin(), machineIds.end());
    
    // Create machines
    for (int id : machineIds) {
        std::string name = "Machine_" + std::to_string(id);
        insertMachine(name, id);
    }
    
    // Initialize all routing tables
    updateAllRoutingTables();
    
    if (verbose) {
        std::cout << "Initialized DHT with " << this->numMachines 
                  << " machines in " << identifierBits << "-bit space (0-" 
                  << (identifierSpace - 1) << ")" << std::endl;
    }
}

bool RingDHT::insertMachine(const std::string& name, int id) {
    // Auto-assign ID if not specified
    if (id == -1) {
        id = calculateHash(name);
    }
    
    // Check if ID already exists
    if (findMachine(id) != nullptr) {
        if (verbose) {
            std::cout << "Error: Machine with ID " << id << " already exists" << std::endl;
        }
        return false;
    }
    
    // Create new machine
    Machine* newMachine = new Machine(id, name, identifierBits);
    
    if (head == nullptr) {
        // First machine
        head = newMachine;
        newMachine->setNext(newMachine);  // Point to self
    } else {
        // Find insertion point (maintain sorted order)
        Machine* current = head;
        Machine* prev = nullptr;
        
        // Find the last machine (to handle circular link)
        Machine* last = head;
        while (last->getNext() != head) {
            last = last->getNext();
        }
        
        // Find position to insert
        if (id < head->getId()) {
            // Insert before head
            last->setNext(newMachine);
            newMachine->setNext(head);
            head = newMachine;
        } else {
            // Find position in the ring
            prev = head;
            current = head->getNext();
            
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
        std::cout << "Added machine: " << name << " (ID: " << id << ")" << std::endl;
    }
    
    return true;
}

bool RingDHT::removeMachine(int id) {
    if (head == nullptr) {
        if (verbose) std::cout << "Error: Ring is empty" << std::endl;
        return false;
    }
    
    Machine* toRemove = findMachine(id);
    if (toRemove == nullptr) {
        if (verbose) std::cout << "Error: Machine " << id << " not found" << std::endl;
        return false;
    }
    
    // Get successor for file redistribution
    Machine* successor = toRemove->getNext();
    
    // Redistribute files to successor
    if (successor != toRemove) {  // More than one machine
        auto files = toRemove->getAllFiles();
        for (const auto& [key, value] : files) {
            successor->insertLocal(key, value);
        }
        if (verbose && !files.empty()) {
            std::cout << "Redistributed " << files.size() << " files to machine " 
                      << successor->getId() << std::endl;
        }
    }
    
    // Remove from ring
    if (numMachines == 1) {
        head = nullptr;
    } else {
        // Find predecessor
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
        std::cout << "Removed machine " << id << std::endl;
    }
    
    delete toRemove;
    numMachines--;
    
    // Update routing tables
    if (numMachines > 0) {
        updateAllRoutingTables();
    }
    
    return true;
}

Machine* RingDHT::findMachine(int id) {
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

Machine* RingDHT::findSuccessor(int id) {
    if (head == nullptr) return nullptr;
    
    Machine* current = head;
    Machine* candidate = head;  // Default to first machine
    
    do {
        if (current->getId() >= id) {
            // Found a machine with ID >= target
            if (candidate == head || current->getId() < candidate->getId() || 
                candidate->getId() < id) {
                candidate = current;
            }
        }
        current = current->getNext();
    } while (current != head);
    
    // If no machine found with ID >= target, wrap around
    // The successor is the smallest ID machine
    if (candidate->getId() < id) {
        // All machines have smaller IDs, return the smallest
        return head;
    }
    
    return candidate;
}

Machine* RingDHT::findPredecessor(int id) {
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
    
    // If no predecessor found, wrap around to largest ID
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

bool RingDHT::inRange(int id, int start, int end) {
    // Check if id is in range (start, end] in circular space
    if (start < end) {
        return id > start && id <= end;
    } else {
        // Wrap around
        return id > start || id <= end;
    }
}

std::vector<int> RingDHT::routeToKey(int key, int startMachineId, Machine*& destination) {
    std::vector<int> path;
    
    Machine* current = findMachine(startMachineId);
    if (current == nullptr) {
        destination = nullptr;
        return path;
    }
    
    path.push_back(current->getId());
    
    // Find the successor of the key
    Machine* successor = findSuccessor(key);
    
    while (current != successor) {
        // Use routing table to find next hop
        Machine* nextHop = current->getRoutingTable()->getNextHop(key, identifierSpace);
        
        if (nextHop == nullptr || nextHop == current) {
            // Safety: move to immediate successor
            nextHop = current->getNext();
        }
        
        current = nextHop;
        path.push_back(current->getId());
        
        // Safety check to prevent infinite loops
        if (path.size() > static_cast<size_t>(numMachines + 1)) {
            break;
        }
    }
    
    destination = current;
    return path;
}

bool RingDHT::insertFile(const std::string& filepath, int startMachineId) {
    // Calculate file hash
    int key = HashFunction::hashFileContent(filepath, identifierBits);
    
    // Route to destination
    Machine* destination = nullptr;
    std::vector<int> path = routeToKey(key, startMachineId, destination);
    
    if (destination == nullptr) {
        if (verbose) std::cout << "Error: Could not route to destination" << std::endl;
        return false;
    }
    
    // Store in destination's B-tree
    destination->insertLocal(key, filepath);
    
    // Print routing path
    if (verbose) {
        std::cout << "File hash: " << key << std::endl;
        std::cout << "Path: ";
        for (size_t i = 0; i < path.size(); i++) {
            if (i > 0) std::cout << " → ";
            std::cout << path[i];
        }
        std::cout << " (stored at machine " << destination->getId() << ")" << std::endl;
    }
    
    return true;
}

std::string RingDHT::searchFile(int key, int startMachineId) {
    // Route to destination
    Machine* destination = nullptr;
    std::vector<int> path = routeToKey(key, startMachineId, destination);
    
    if (destination == nullptr) {
        if (verbose) std::cout << "Error: Could not route to destination" << std::endl;
        return "";
    }
    
    // Search in destination's B-tree
    std::string result = destination->searchLocal(key);
    
    // Print routing path
    if (verbose) {
        std::cout << "Path: ";
        for (size_t i = 0; i < path.size(); i++) {
            if (i > 0) std::cout << " → ";
            std::cout << path[i];
        }
        
        if (!result.empty()) {
            std::cout << " (found: " << result << ")" << std::endl;
        } else {
            std::cout << " (not found)" << std::endl;
        }
    }
    
    return result;
}

bool RingDHT::deleteFile(int key, int startMachineId) {
    // Route to destination
    Machine* destination = nullptr;
    std::vector<int> path = routeToKey(key, startMachineId, destination);
    
    if (destination == nullptr) {
        if (verbose) std::cout << "Error: Could not route to destination" << std::endl;
        return false;
    }
    
    // Delete from destination's B-tree
    bool result = destination->deleteLocal(key);
    
    // Print routing path
    if (verbose) {
        std::cout << "Path: ";
        for (size_t i = 0; i < path.size(); i++) {
            if (i > 0) std::cout << " → ";
            std::cout << path[i];
        }
        
        if (result) {
            std::cout << " (deleted from machine " << destination->getId() << ")" << std::endl;
        } else {
            std::cout << " (key not found)" << std::endl;
        }
    }
    
    return result;
}

int RingDHT::calculateHash(const std::string& input) {
    return HashFunction::hash(input, identifierBits);
}

void RingDHT::printStatus() {
    std::cout << "\n=== DHT Status ===" << std::endl;
    std::cout << "Identifier Space: " << identifierBits << " bits (0-" 
              << (identifierSpace - 1) << ")" << std::endl;
    std::cout << "Number of Machines: " << numMachines << std::endl;
    
    if (head == nullptr) {
        std::cout << "Ring is empty" << std::endl;
        return;
    }
    
    std::cout << "\nMachines:" << std::endl;
    std::cout << std::setw(8) << "ID" << std::setw(20) << "Name" 
              << std::setw(15) << "Range" << std::endl;
    std::cout << std::string(43, '-') << std::endl;
    
    Machine* current = head;
    do {
        Machine* pred = findPredecessor(current->getId());
        int rangeStart = (pred->getId() + 1) % identifierSpace;
        int rangeEnd = current->getId();
        
        std::cout << std::setw(8) << current->getId() 
                  << std::setw(20) << current->getName()
                  << std::setw(7) << "(" << rangeStart << ", " << rangeEnd << "]" 
                  << std::endl;
        
        current = current->getNext();
    } while (current != head);
    
    std::cout << std::endl;
}

void RingDHT::printRoutingTable(int machineId) {
    Machine* machine = findMachine(machineId);
    if (machine == nullptr) {
        std::cout << "Error: Machine " << machineId << " not found" << std::endl;
        return;
    }
    
    machine->printRoutingTable();
}

void RingDHT::printBTree(int machineId) {
    Machine* machine = findMachine(machineId);
    if (machine == nullptr) {
        std::cout << "Error: Machine " << machineId << " not found" << std::endl;
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
    
    // Simple ASCII visualization
    Machine* current = head;
    std::cout << "  ";
    do {
        std::cout << "[" << current->getId() << "]";
        if (current->getNext() != head) {
            std::cout << " → ";
        }
        current = current->getNext();
    } while (current != head);
    std::cout << " → (back to " << head->getId() << ")" << std::endl;
    std::cout << std::endl;
}
