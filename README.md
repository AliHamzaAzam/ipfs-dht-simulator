# IPFS DHT Simulator

A Ring-based Distributed Hash Table simulator implementing content-addressable file storage with O(log N) routing using finger tables.

> Originally developed in 2023 as a Data Structures course project. Rebuilt and modernized for GitHub publication.

## Features

- Circular ring topology for machine organization
- Finger tables for efficient O(log N) routing
- B-tree local file indexing per machine
- Dynamic machine join/leave with automatic file redistribution
- Configurable identifier space (4-bit to 160-bit)

## Building

```bash
mkdir build && cd build
cmake ..
make
```

## Usage

```bash
./ipfs_dht
```

### Commands

| Command | Description |
|---------|-------------|
| `INIT <machines> <bits>` | Initialize DHT with N machines and B-bit space |
| `ASSIGN <name> <id>` | Manually assign ID to a new machine |
| `INSERT <file_path> <machine_id>` | Insert file starting from machine |
| `SEARCH <key> <machine_id>` | Search for file by hash key |
| `DELETE <key> <machine_id>` | Delete file by hash key (prints updated B-tree) |
| `ADD_MACHINE <name> [id]` | Add new machine to ring (auto-assigns ID if omitted) |
| `REMOVE_MACHINE <id>` | Remove machine from ring |
| `PRINT_RT <machine_id>` | Print routing table (finger table) |
| `PRINT_BTREE <machine_id>` | Print B-tree contents |
| `STATUS` | Show all machines and ID ranges |
| `RING` | Visualize the ring topology |
| `EXIT` | Quit simulator |

## Example

```
> INIT 5 4
Initialized DHT with 5 machines in 4-bit space (0-15)

> INSERT data/sample.txt 1
Path: 1 → 4 → 9 (stored at machine 9)

> SEARCH 9 1
Path: 1 → 4 → 9 (found: data/sample.txt)
```

## Technical Details

- **Routing**: Uses Chord-style finger tables where entry i points to succ(p + 2^(i-1))
- **Hashing**: Polynomial rolling hash for file content identification
- **Storage**: B-tree (order 5) for local key-value indexing

## License

[MIT License](LICENSE)
