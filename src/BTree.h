#ifndef BTREE_H
#define BTREE_H

#include <string>
#include <vector>
#include <iostream>
#include "BigInt.h"

// B-tree node for storing key-value pairs
class BTreeNode {
public:
    std::vector<BigInt> keys;
    std::vector<std::string> values;
    std::vector<BTreeNode*> children;
    bool isLeaf;
    int order;  // Maximum number of children

    BTreeNode(int order, bool isLeaf);
    ~BTreeNode();

    // Insert key-value when node is not full
    void insertNonFull(const BigInt& key, const std::string& value);
    
    // Split child at index
    void splitChild(int index);
    
    // Search for key, returns value or empty string
    std::string search(const BigInt& key);
    
    // Remove key from tree
    bool remove(const BigInt& key);
    
    // Find index of first key >= given key
    int findKey(const BigInt& key);
    
    // Get all key-value pairs for redistribution
    void getAllEntries(std::vector<std::pair<BigInt, std::string>>& entries);
    
    // Print tree structure
    void print(int level = 0);

private:
    void removeFromLeaf(int idx);
    void removeFromNonLeaf(int idx);
    BigInt getPredecessor(int idx);
    BigInt getSuccessor(int idx);
    void fill(int idx);
    void borrowFromPrev(int idx);
    void borrowFromNext(int idx);
    void merge(int idx);
    std::string getPredecessorValue(int idx);
    std::string getSuccessorValue(int idx);
};

// B-tree for local file indexing
class BTree {
private:
    BTreeNode* root;
    int order;

public:
    explicit BTree(int order = 5);
    ~BTree();

    void insert(const BigInt& key, const std::string& value);
    std::string search(const BigInt& key);
    bool remove(const BigInt& key);
    std::vector<std::pair<BigInt, std::string>> getAllEntries();
    bool isEmpty() const;
    void print();
};

#endif // BTREE_H
