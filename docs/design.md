# IPFS DHT Simulator - Technical Design

## Overview

This simulator implements a Ring-based Distributed Hash Table (DHT) inspired by the Chord protocol, demonstrating content-addressable file storage with O(log N) routing efficiency.

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              RingDHT                    │
                    │  - Manages circular linked list         │
                    │  - Coordinates file operations          │
                    │  - Updates routing tables               │
                    └───────────────────┬─────────────────────┘
                                        │
            ┌───────────────────────────┼────────────────────────────┐
            │                           │                            │
    ┌───────▼───────┐           ┌───────▼───────┐           ┌────────▼──────┐
    │   Machine 0   │──────────▶│   Machine 3   │──────────▶│   Machine 6   │
    │  ┌──────────┐ │           │  ┌──────────┐ │           │  ┌──────────┐ │
    │  │ RoutingT │ │           │  │ RoutingT │ │           │  │ RoutingT │ │
    │  └──────────┘ │           │  └──────────┘ │           │  └──────────┘ │
    │  ┌──────────┐ │           │  ┌──────────┐ │           │  ┌──────────┐ │
    │  │  B-Tree  │ │           │  │  B-Tree  │ │           │  │  B-Tree  │ │
    │  └──────────┘ │           │  └──────────┘ │           │  └──────────┘ │
    └───────────────┘           └───────────────┘           └───────────────┘
            ▲                                                        │
            └────────────────────────────────────────────────────────┘
                              (Circular Link)
```

## Data Structures

### 1. Circular Singly Linked List (Ring)
- **Purpose**: Organize machines in sorted order by ID
- **Operations**: O(n) insertion/deletion, O(n) search
- **Implementation**: `Machine` nodes with `next` pointer

### 2. Doubly Linked List (Routing Table)
- **Purpose**: Finger table for O(log N) routing
- **Entries**: For machine p, entry i points to succ(p + 2^(i-1))
- **Size**: O(log N) entries per machine

### 3. B-Tree (Local Storage)
- **Purpose**: Index files stored on each machine
- **Order**: 5 (min 2, max 4 keys per node)
- **Key**: File hash, **Value**: File path

### 4. BigInt (160-bit Support)
- **Purpose**: Support identifier spaces up to 160 bits
- **Implementation**: Array of 3 × 64-bit words (192 bits total)
- **Operations**: Addition, subtraction, comparison, power of 2

## Key Algorithms

### Finger Table Initialization
```
For machine p with m-bit identifier space:
  For i = 1 to m:
    FT[i].start = (p + 2^(i-1)) mod 2^m
    FT[i].succ = successor(FT[i].start)
```

### Routing Algorithm (O(log N))
```
route(key, current_machine):
  if current_machine is responsible for key:
    return current_machine
  
  # Find largest finger < key
  for i = m down to 1:
    if FT[i].succ is between (current, key):
      return route(key, FT[i].succ)
  
  # Fallback to immediate successor
  return route(key, current.next)
```

### File Responsibility
Machine m is responsible for key k if:
- k is in range (predecessor(m), m]
- Handles circular wraparound at 2^bits

## Complexity Analysis

| Operation | Time Complexity |
|-----------|-----------------|
| File Insert/Search/Delete | O(log N) routing + O(log F) B-tree |
| Machine Join | O(N) routing table updates |
| Machine Leave | O(N) routing table updates |
| Finger Table Lookup | O(log N) |

Where N = number of machines, F = files per machine

## File Structure

```
src/
├── main.cpp          # CLI interface
├── RingDHT.h/cpp     # DHT manager
├── Machine.h/cpp     # Ring node
├── RoutingTable.h/cpp # Finger table
├── BTree.h/cpp       # Local index
└── HashFunction.h/cpp # Hashing
```

## Hash Function

Polynomial rolling hash:
```cpp
hash = 0
for each character c in input:
    hash = (hash * 31 + c) mod 2^bits
```

## Example Session

```
> INIT 5 4
Initialized DHT with 5 machines in 4-bit space (0-15)

> RING
[0] → [3] → [6] → [9] → [12] → (back to 0)

> INSERT sample.txt 0
File hash: 10
Path: 0 → 9 → 12 (stored at machine 12)

> SEARCH 10 3
Path: 3 → 6 → 9 → 12 (found: sample.txt)
```
