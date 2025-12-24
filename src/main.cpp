#include <iostream>
#include <sstream>
#include <string>
#include <algorithm>
#include "RingDHT.h"
#include "HashFunction.h"

void printHelp() {
    std::cout << "\n=== IPFS DHT Simulator Commands ===" << std::endl;
    std::cout << "  INIT <num_machines> <identifier_bits>" << std::endl;
    std::cout << "      Initialize DHT (bits: 2-160)" << std::endl;
    std::cout << "  ASSIGN <machine_name> <id>" << std::endl;
    std::cout << "      Manually assign ID to a new machine" << std::endl;
    std::cout << "  INSERT <file_path> <start_machine_id>" << std::endl;
    std::cout << "      Insert file starting from specified machine" << std::endl;
    std::cout << "  SEARCH <key> <start_machine_id>" << std::endl;
    std::cout << "      Search for file by hash key" << std::endl;
    std::cout << "  DELETE <key> <start_machine_id>" << std::endl;
    std::cout << "      Delete file by hash key" << std::endl;
    std::cout << "  PRINT_RT <machine_id>" << std::endl;
    std::cout << "      Print routing table of specified machine" << std::endl;
    std::cout << "  ADD_MACHINE <machine_name> [id]" << std::endl;
    std::cout << "      Add new machine (auto-assign ID if not specified)" << std::endl;
    std::cout << "  REMOVE_MACHINE <machine_id>" << std::endl;
    std::cout << "      Remove machine from ring" << std::endl;
    std::cout << "  PRINT_BTREE <machine_id>" << std::endl;
    std::cout << "      Print B-tree of specified machine" << std::endl;
    std::cout << "  STATUS" << std::endl;
    std::cout << "      Show all machines" << std::endl;
    std::cout << "  RING" << std::endl;
    std::cout << "      Visualize the ring topology" << std::endl;
    std::cout << "  HASH <string>" << std::endl;
    std::cout << "      Calculate hash of a string" << std::endl;
    std::cout << "  VERBOSE [on|off]" << std::endl;
    std::cout << "      Toggle or set verbose mode" << std::endl;
    std::cout << "  HELP" << std::endl;
    std::cout << "      Show this help message" << std::endl;
    std::cout << "  EXIT" << std::endl;
    std::cout << "      Exit the simulator" << std::endl;
    std::cout << std::endl;
}

std::string toUpper(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(), ::toupper);
    return result;
}

int main() {
    std::cout << "╔═══════════════════════════════════════════╗" << std::endl;
    std::cout << "║  IPFS DHT Simulator (160-bit supported)   ║" << std::endl;
    std::cout << "║     Type 'HELP' for available commands    ║" << std::endl;
    std::cout << "╚═══════════════════════════════════════════╝" << std::endl;
    
    RingDHT* dht = nullptr;
    std::string line;
    
    while (true) {
        std::cout << "> ";
        if (!std::getline(std::cin, line)) {
            break;
        }
        
        if (line.empty()) continue;
        
        std::istringstream iss(line);
        std::string command;
        iss >> command;
        command = toUpper(command);
        
        if (command == "EXIT" || command == "QUIT") {
            std::cout << "Goodbye!" << std::endl;
            break;
        }
        
        if (command == "HELP") {
            printHelp();
        }
        else if (command == "INIT") {
            int numMachines, bits;
            if (!(iss >> numMachines >> bits)) {
                std::cout << "Usage: INIT <num_machines> <identifier_bits>" << std::endl;
                continue;
            }
            
            if (bits < 2 || bits > 160) {
                std::cout << "Error: identifier_bits must be between 2 and 160" << std::endl;
                continue;
            }
            
            delete dht;
            dht = new RingDHT(bits);
            dht->initialize(numMachines);
        }
        else if (command == "STATUS") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            dht->printStatus();
        }
        else if (command == "RING") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            dht->printRing();
        }
        else if (command == "INSERT") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            std::string filepath;
            int startId;
            if (!(iss >> filepath >> startId)) {
                std::cout << "Usage: INSERT <file_path> <start_machine_id>" << std::endl;
                continue;
            }
            
            dht->insertFile(filepath, BigInt(static_cast<uint64_t>(startId), dht->getIdentifierBits()));
        }
        else if (command == "SEARCH") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            int key, startId;
            if (!(iss >> key >> startId)) {
                std::cout << "Usage: SEARCH <key> <start_machine_id>" << std::endl;
                continue;
            }
            
            dht->searchFile(BigInt(static_cast<uint64_t>(key), dht->getIdentifierBits()), 
                           BigInt(static_cast<uint64_t>(startId), dht->getIdentifierBits()));
        }
        else if (command == "DELETE") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            int key, startId;
            if (!(iss >> key >> startId)) {
                std::cout << "Usage: DELETE <key> <start_machine_id>" << std::endl;
                continue;
            }
            
            dht->deleteFile(BigInt(static_cast<uint64_t>(key), dht->getIdentifierBits()),
                           BigInt(static_cast<uint64_t>(startId), dht->getIdentifierBits()));
        }
        else if (command == "PRINT_RT") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            int machineId;
            if (!(iss >> machineId)) {
                std::cout << "Usage: PRINT_RT <machine_id>" << std::endl;
                continue;
            }
            
            dht->printRoutingTable(BigInt(static_cast<uint64_t>(machineId), dht->getIdentifierBits()));
        }
        else if (command == "PRINT_BTREE") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            int machineId;
            if (!(iss >> machineId)) {
                std::cout << "Usage: PRINT_BTREE <machine_id>" << std::endl;
                continue;
            }
            
            dht->printBTree(BigInt(static_cast<uint64_t>(machineId), dht->getIdentifierBits()));
        }
        else if (command == "ADD_MACHINE") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            std::string name;
            int id = -1;
            if (!(iss >> name)) {
                std::cout << "Usage: ADD_MACHINE <machine_name> [id]" << std::endl;
                continue;
            }
            iss >> id;
            
            if (dht->insertMachine(name, id)) {
                dht->updateAllRoutingTables();
            }
        }
        else if (command == "ASSIGN") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            std::string name;
            int id;
            if (!(iss >> name >> id)) {
                std::cout << "Usage: ASSIGN <machine_name> <id>" << std::endl;
                continue;
            }
            
            if (dht->insertMachine(name, id)) {
                dht->updateAllRoutingTables();
            }
        }
        else if (command == "REMOVE_MACHINE") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            int machineId;
            if (!(iss >> machineId)) {
                std::cout << "Usage: REMOVE_MACHINE <machine_id>" << std::endl;
                continue;
            }
            
            dht->removeMachine(BigInt(static_cast<uint64_t>(machineId), dht->getIdentifierBits()));
        }
        else if (command == "HASH") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            std::string input;
            if (!(iss >> input)) {
                std::cout << "Usage: HASH <string>" << std::endl;
                continue;
            }
            
            BigInt hash = dht->calculateHash(input);
            std::cout << "Hash of \"" << input << "\": " << hash.toString() << std::endl;
        }
        else if (command == "VERBOSE") {
            if (dht == nullptr) {
                std::cout << "Error: DHT not initialized. Use INIT first." << std::endl;
                continue;
            }
            
            std::string mode;
            if (iss >> mode) {
                mode = toUpper(mode);
                if (mode == "ON") {
                    dht->setVerbose(true);
                    std::cout << "Verbose mode: ON" << std::endl;
                } else if (mode == "OFF") {
                    dht->setVerbose(false);
                    std::cout << "Verbose mode: OFF" << std::endl;
                }
            } else {
                dht->setVerbose(!dht->isVerbose());
                std::cout << "Verbose mode: " << (dht->isVerbose() ? "ON" : "OFF") << std::endl;
            }
        }
        else {
            std::cout << "Unknown command: " << command << std::endl;
            std::cout << "Type 'HELP' for available commands." << std::endl;
        }
    }
    
    delete dht;
    return 0;
}
