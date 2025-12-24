#include "BTree.h"
#include <algorithm>

// ==================== BTreeNode Implementation ====================

BTreeNode::BTreeNode(int order, bool isLeaf) : isLeaf(isLeaf), order(order) {
    keys.reserve(order - 1);
    values.reserve(order - 1);
    children.reserve(order);
}

BTreeNode::~BTreeNode() {
    for (auto* child : children) {
        delete child;
    }
}

int BTreeNode::findKey(int key) {
    int idx = 0;
    while (idx < static_cast<int>(keys.size()) && keys[idx] < key) {
        ++idx;
    }
    return idx;
}

std::string BTreeNode::search(int key) {
    int idx = findKey(key);
    
    if (idx < static_cast<int>(keys.size()) && keys[idx] == key) {
        return values[idx];
    }
    
    if (isLeaf) {
        return "";  // Key not found
    }
    
    return children[idx]->search(key);
}

void BTreeNode::insertNonFull(int key, const std::string& value) {
    int idx = static_cast<int>(keys.size()) - 1;
    
    if (isLeaf) {
        // Find position and insert
        keys.push_back(0);
        values.push_back("");
        
        while (idx >= 0 && keys[idx] > key) {
            keys[idx + 1] = keys[idx];
            values[idx + 1] = values[idx];
            idx--;
        }
        
        keys[idx + 1] = key;
        values[idx + 1] = value;
    } else {
        // Find child to insert into
        while (idx >= 0 && keys[idx] > key) {
            idx--;
        }
        idx++;
        
        // Check if child is full
        if (static_cast<int>(children[idx]->keys.size()) == order - 1) {
            splitChild(idx);
            
            if (keys[idx] < key) {
                idx++;
            }
        }
        
        children[idx]->insertNonFull(key, value);
    }
}

void BTreeNode::splitChild(int idx) {
    BTreeNode* child = children[idx];
    int mid = (order - 1) / 2;
    
    // Create new node for right half
    BTreeNode* newNode = new BTreeNode(order, child->isLeaf);
    
    // Move keys and values to new node
    for (int j = mid + 1; j < static_cast<int>(child->keys.size()); j++) {
        newNode->keys.push_back(child->keys[j]);
        newNode->values.push_back(child->values[j]);
    }
    
    // Move children if not leaf
    if (!child->isLeaf) {
        for (int j = mid + 1; j < static_cast<int>(child->children.size()); j++) {
            newNode->children.push_back(child->children[j]);
        }
        child->children.resize(mid + 1);
    }
    
    // Get middle key/value to promote
    int midKey = child->keys[mid];
    std::string midValue = child->values[mid];
    
    // Resize original child
    child->keys.resize(mid);
    child->values.resize(mid);
    
    // Insert new node into parent's children
    children.insert(children.begin() + idx + 1, newNode);
    
    // Insert middle key/value into parent
    keys.insert(keys.begin() + idx, midKey);
    values.insert(values.begin() + idx, midValue);
}

void BTreeNode::removeFromLeaf(int idx) {
    keys.erase(keys.begin() + idx);
    values.erase(values.begin() + idx);
}

void BTreeNode::removeFromNonLeaf(int idx) {
    int key = keys[idx];
    
    int minKeys = (order - 1) / 2;
    
    if (static_cast<int>(children[idx]->keys.size()) > minKeys) {
        // Get predecessor
        keys[idx] = getPredecessor(idx);
        values[idx] = getPredecessorValue(idx);
        children[idx]->remove(keys[idx]);
    } else if (static_cast<int>(children[idx + 1]->keys.size()) > minKeys) {
        // Get successor
        keys[idx] = getSuccessor(idx);
        values[idx] = getSuccessorValue(idx);
        children[idx + 1]->remove(keys[idx]);
    } else {
        // Merge children
        merge(idx);
        children[idx]->remove(key);
    }
}

int BTreeNode::getPredecessor(int idx) {
    BTreeNode* cur = children[idx];
    while (!cur->isLeaf) {
        cur = cur->children[cur->children.size() - 1];
    }
    return cur->keys[cur->keys.size() - 1];
}

std::string BTreeNode::getPredecessorValue(int idx) {
    BTreeNode* cur = children[idx];
    while (!cur->isLeaf) {
        cur = cur->children[cur->children.size() - 1];
    }
    return cur->values[cur->values.size() - 1];
}

int BTreeNode::getSuccessor(int idx) {
    BTreeNode* cur = children[idx + 1];
    while (!cur->isLeaf) {
        cur = cur->children[0];
    }
    return cur->keys[0];
}

std::string BTreeNode::getSuccessorValue(int idx) {
    BTreeNode* cur = children[idx + 1];
    while (!cur->isLeaf) {
        cur = cur->children[0];
    }
    return cur->values[0];
}

void BTreeNode::fill(int idx) {
    int minKeys = (order - 1) / 2;
    
    if (idx != 0 && static_cast<int>(children[idx - 1]->keys.size()) > minKeys) {
        borrowFromPrev(idx);
    } else if (idx != static_cast<int>(children.size()) - 1 && 
               static_cast<int>(children[idx + 1]->keys.size()) > minKeys) {
        borrowFromNext(idx);
    } else {
        if (idx != static_cast<int>(children.size()) - 1) {
            merge(idx);
        } else {
            merge(idx - 1);
        }
    }
}

void BTreeNode::borrowFromPrev(int idx) {
    BTreeNode* child = children[idx];
    BTreeNode* sibling = children[idx - 1];
    
    // Shift all keys/values in child one step ahead
    child->keys.insert(child->keys.begin(), keys[idx - 1]);
    child->values.insert(child->values.begin(), values[idx - 1]);
    
    // Move parent key down
    keys[idx - 1] = sibling->keys.back();
    values[idx - 1] = sibling->values.back();
    
    // Move sibling's last child to child
    if (!child->isLeaf) {
        child->children.insert(child->children.begin(), sibling->children.back());
        sibling->children.pop_back();
    }
    
    sibling->keys.pop_back();
    sibling->values.pop_back();
}

void BTreeNode::borrowFromNext(int idx) {
    BTreeNode* child = children[idx];
    BTreeNode* sibling = children[idx + 1];
    
    // Move parent key to child
    child->keys.push_back(keys[idx]);
    child->values.push_back(values[idx]);
    
    // Move sibling's first key to parent
    keys[idx] = sibling->keys[0];
    values[idx] = sibling->values[0];
    
    // Move sibling's first child to child
    if (!child->isLeaf) {
        child->children.push_back(sibling->children[0]);
        sibling->children.erase(sibling->children.begin());
    }
    
    sibling->keys.erase(sibling->keys.begin());
    sibling->values.erase(sibling->values.begin());
}

void BTreeNode::merge(int idx) {
    BTreeNode* child = children[idx];
    BTreeNode* sibling = children[idx + 1];
    
    // Pull key from parent
    child->keys.push_back(keys[idx]);
    child->values.push_back(values[idx]);
    
    // Copy sibling's keys/values
    for (size_t i = 0; i < sibling->keys.size(); i++) {
        child->keys.push_back(sibling->keys[i]);
        child->values.push_back(sibling->values[i]);
    }
    
    // Copy sibling's children
    if (!child->isLeaf) {
        for (auto* c : sibling->children) {
            child->children.push_back(c);
        }
        sibling->children.clear();  // Prevent double-free
    }
    
    // Remove key and sibling from parent
    keys.erase(keys.begin() + idx);
    values.erase(values.begin() + idx);
    
    delete sibling;
    children.erase(children.begin() + idx + 1);
}

bool BTreeNode::remove(int key) {
    int idx = findKey(key);
    int minKeys = (order - 1) / 2;
    
    if (idx < static_cast<int>(keys.size()) && keys[idx] == key) {
        if (isLeaf) {
            removeFromLeaf(idx);
        } else {
            removeFromNonLeaf(idx);
        }
        return true;
    } else {
        if (isLeaf) {
            return false;  // Key not found
        }
        
        bool isLast = (idx == static_cast<int>(keys.size()));
        
        if (static_cast<int>(children[idx]->keys.size()) <= minKeys) {
            fill(idx);
        }
        
        if (isLast && idx > static_cast<int>(keys.size())) {
            return children[idx - 1]->remove(key);
        } else {
            return children[idx]->remove(key);
        }
    }
}

void BTreeNode::getAllEntries(std::vector<std::pair<int, std::string>>& entries) {
    size_t i;
    for (i = 0; i < keys.size(); i++) {
        if (!isLeaf) {
            children[i]->getAllEntries(entries);
        }
        entries.push_back({keys[i], values[i]});
    }
    
    if (!isLeaf) {
        children[i]->getAllEntries(entries);
    }
}

void BTreeNode::print(int level) {
    std::string indent(level * 4, ' ');
    
    std::cout << indent << "[";
    for (size_t i = 0; i < keys.size(); i++) {
        if (i > 0) std::cout << ", ";
        std::cout << keys[i];
    }
    std::cout << "]" << std::endl;
    
    if (!isLeaf) {
        for (auto* child : children) {
            child->print(level + 1);
        }
    }
}

// ==================== BTree Implementation ====================

BTree::BTree(int order) : root(nullptr), order(order) {}

BTree::~BTree() {
    delete root;
}

void BTree::insert(int key, const std::string& value) {
    if (root == nullptr) {
        root = new BTreeNode(order, true);
        root->keys.push_back(key);
        root->values.push_back(value);
        return;
    }
    
    // Check if key already exists - update value
    std::string existing = search(key);
    if (!existing.empty()) {
        remove(key);
    }
    
    if (static_cast<int>(root->keys.size()) == order - 1) {
        // Root is full, create new root
        BTreeNode* newRoot = new BTreeNode(order, false);
        newRoot->children.push_back(root);
        newRoot->splitChild(0);
        
        // Insert into appropriate child
        int i = (newRoot->keys[0] < key) ? 1 : 0;
        newRoot->children[i]->insertNonFull(key, value);
        
        root = newRoot;
    } else {
        root->insertNonFull(key, value);
    }
}

std::string BTree::search(int key) {
    if (root == nullptr) {
        return "";
    }
    return root->search(key);
}

bool BTree::remove(int key) {
    if (root == nullptr) {
        return false;
    }
    
    bool result = root->remove(key);
    
    // If root has no keys, make first child new root
    if (root->keys.empty()) {
        BTreeNode* oldRoot = root;
        if (root->isLeaf) {
            root = nullptr;
        } else {
            root = root->children[0];
            oldRoot->children.clear();  // Prevent double-free
        }
        delete oldRoot;
    }
    
    return result;
}

std::vector<std::pair<int, std::string>> BTree::getAllEntries() {
    std::vector<std::pair<int, std::string>> entries;
    if (root != nullptr) {
        root->getAllEntries(entries);
    }
    return entries;
}

bool BTree::isEmpty() const {
    return root == nullptr;
}

void BTree::print() {
    if (root == nullptr) {
        std::cout << "  (empty)" << std::endl;
    } else {
        root->print(1);
    }
}
