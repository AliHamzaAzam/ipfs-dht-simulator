# IPFS DHT Simulator

A Ring-based Distributed Hash Table simulator implementing content-addressable file storage with O(log N) routing using finger tables — with an interactive, in-browser Chord-ring visualizer.

> Originally developed in 2023 as a Data Structures course project. Rebuilt and modernized for GitHub publication.

**▶ Live visualizer: [dht.alihamzaazam.com](https://dht.alihamzaazam.com)**

---

## Live Visualizer

The visualizer is a faithful TypeScript reimplementation of the Chord ring, finger tables, and per-machine B-trees — the same algorithm as the C++ CLI (the small-space hash is ported exactly, so keys match). It runs entirely client-side, no install and no backend. In an adjustable 3–8-bit identifier space you can:

- **Build a ring** and add/remove machines, watching finger tables, successor arcs, and key redistribution update live
- **Route a key** and step through the hops one at a time, with the finger entry used at each hop highlighted
- **Insert / search / delete files** and see them land in (or leave) the responsible machine's B-tree
- **Inspect** any machine's finger table and stored files, and hash any string to its key

It shares the industrial-brutalist look of [my other projects](https://github.com/AliHamzaAzam), with its own magenta accent.

## Features

- Circular ring topology for machine organization
- Finger tables for efficient O(log N) routing
- B-tree local file indexing per machine
- Dynamic machine join/leave with automatic file redistribution
- Configurable identifier space (2-bit to 160-bit) using custom BigInt implementation

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

- **Routing**: Chord-style finger tables where entry i points to succ(p + 2^(i-1))
- **Hashing**: Polynomial rolling hash with std::hash extension for large spaces
- **Storage**: B-tree (order 5) for local key-value indexing
- **BigInt**: Custom 192-bit integer class for 160-bit identifier space support

## The Visualizer (`web/`)

The browser app is a Vite + TypeScript project. The Chord/B-tree logic is reimplemented in pure TypeScript and unit-tested against paths and finger tables captured from the C++ binary, so the engine builds with just Node:

```bash
cd web
npm install
npm test        # engine + UI tests, cross-checked against the C++ reference
npm run dev     # local playground at http://localhost:5173
npm run build   # production build → web/dist
```

Deployment is handled by Cloudflare Pages' Git integration (root directory `web/`, build command `npm run build`, output directory `dist`) — no secrets required.

## Project Structure

```
src/           C++ reference simulator + headers (RingDHT, Machine, RoutingTable, BTree, BigInt, HashFunction)
web/           Vite + TypeScript Chord-ring visualizer (faithful reimplementation)
data/          sample input files
CMakeLists.txt native build
```

## License

[MIT License](LICENSE)
