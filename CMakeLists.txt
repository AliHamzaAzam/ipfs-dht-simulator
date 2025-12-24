cmake_minimum_required(VERSION 3.15)
project(IPFS_DHT_Simulator)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Add executable
add_executable(ipfs_dht
    src/main.cpp
    src/RingDHT.cpp
    src/Machine.cpp
    src/RoutingTable.cpp
    src/BTree.cpp
    src/HashFunction.cpp
    src/BigInt.cpp
)

target_include_directories(ipfs_dht PRIVATE src)

# Enable warnings
target_compile_options(ipfs_dht PRIVATE -Wall -Wextra -Wpedantic)
