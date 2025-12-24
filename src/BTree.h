#ifndef BTREE_H
#define BTREE_H

#include <string>
#include <vector>
#include <iostream>

// B-tree node for storing key-value pairs
class BTreeNode {
public:
    std::vector<int> keys;
    std::vector<std::string> values;
    std::vector<BTreeNode*> children;
    bool isLeaf;
    int order;  // Maximum number of children

    BTreeNode(int order, bool isLeaf);
    ~BTreeNode();

    // Insert key-value when node is not full
    void insertNonFull(int key, const std::string& value);
    
    // Split child at index
    void splitChild(int index);
    
    // Search for key, returns value or empty string
    std::string search(int key);
    
    // Remove key from tree
    bool remove(int key);
    
    // Find index of first key >= given key
    int findKey(int key);
    
    // Get all key-value pairs for redistribution
    void getAllEntries(std::vector<std::pair<int, std::string>>& entries);
    
    // Print tree structure
    void print(int level = 0);

private:
    // Helper functions for removal
    void removeFromLeaf(int idx);
    void removeFromNonLeaf(int idx);
    int getPredecessor(int idx);
    int getSuccessor(int idx);
    void fill(int idx);
    void borrowFromPrev(int idx);
    void borrowFromNext(int idx);
    void merge(int idx);
    
    // Get predecessor/successor values
    std::string getPredecessorValue(int idx);
    std::string getSuccessorValue(int idx);
};

// B-tree for local file indexing
class BTree {
private:
    BTreeNode* root;
    int order;  // Minimum degree (order 5 = min 2, max 4 keys per node)

public:
    explicit BTree(int order = 5);
    ~BTree();

    // Insert key-value pair
    void insert(int key, const std::string& value);
    
    // Search for key, returns value or empty string if not found
    std::string search(int key);
    
    // Remove key from tree
    bool remove(int key);
    
    // Get all entries (for redistribution during machine join/leave)
    std::vector<std::pair<int, std::string>> getAllEntries();
    
    // Check if tree is empty
    bool isEmpty() const;
    
    // Print tree structure
    void print();
};

#endif // BTREE_H
