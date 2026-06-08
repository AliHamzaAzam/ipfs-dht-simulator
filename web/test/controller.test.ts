/**
 * Tests for controller.ts — headless DHT state controller.
 *
 * Covers:
 *   - reset() produces the correct initial state
 *   - addNode / removeNode update state and notify subscribers
 *   - selectNode updates selectedId
 *   - startRoute sets animation with correct path and step=0
 *   - stepAnimation advances step and marks done at the end
 *   - finishAnimation jumps to done
 *   - insert commits to destination's files only when animation is done
 *   - delete commits only when animation is done
 *   - search reads value without mutating state
 *   - subscribe returns a working unsubscribe function
 *   - hashName delegates to the hash function
 */
import { describe, it, expect, vi } from "vitest";
import { DHTController } from "../src/controller.js";
import { hash } from "../src/hash.js";

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe("reset()", () => {
  it("produces N nodes with correct ids", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // bits=4, 5 nodes → ids 0,3,6,9,12
    const state = ctrl.getState();
    expect(state.bits).toBe(4);
    expect(state.nodes.map((n) => n.id)).toEqual([0, 3, 6, 9, 12]);
  });

  it("each node starts with empty files", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    for (const node of ctrl.getState().nodes) {
      expect(node.files).toEqual([]);
    }
  });

  it("clears animation and selectedId", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.selectNode(3);
    ctrl.startRoute(5, 0);
    ctrl.reset(4, 5);
    const state = ctrl.getState();
    expect(state.animation).toBeNull();
    expect(state.selectedId).toBeNull();
  });

  it("notifies subscribers", () => {
    const ctrl = new DHTController(4);
    const calls: number[] = [];
    ctrl.subscribe((s) => calls.push(s.nodes.length));
    ctrl.reset(4, 5);
    expect(calls).toContain(5);
  });
});

// ---------------------------------------------------------------------------
// addNode / removeNode
// ---------------------------------------------------------------------------

describe("addNode()", () => {
  it("adds a node and notifies subscribers", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const snapshots: number[] = [];
    ctrl.subscribe((s) => snapshots.push(s.nodes.length));
    const ok = ctrl.addNode("Extra", 2);
    expect(ok).toBe(true);
    expect(ctrl.getState().nodes.map((n) => n.id)).toContain(2);
    expect(snapshots[snapshots.length - 1]).toBe(6);
  });

  it("returns false for a duplicate id", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    expect(ctrl.addNode("Dup", 0)).toBe(false);
  });

  it("does not notify on failure", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    let calls = 0;
    ctrl.subscribe(() => calls++);
    ctrl.addNode("Dup", 0); // should fail silently
    expect(calls).toBe(0);
  });
});

describe("removeNode()", () => {
  it("removes a node and notifies subscribers", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    let lastCount = -1;
    ctrl.subscribe((s) => { lastCount = s.nodes.length; });
    const ok = ctrl.removeNode(6);
    expect(ok).toBe(true);
    expect(ctrl.getState().nodes.map((n) => n.id)).not.toContain(6);
    expect(lastCount).toBe(4);
  });

  it("returns false for a non-existent id", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    expect(ctrl.removeNode(99)).toBe(false);
  });

  it("clears selectedId when the selected node is removed", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.selectNode(6);
    ctrl.removeNode(6);
    expect(ctrl.getState().selectedId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// selectNode()
// ---------------------------------------------------------------------------

describe("selectNode()", () => {
  it("sets selectedId and notifies", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    let lastId: number | null = -1;
    ctrl.subscribe((s) => { lastId = s.selectedId; });
    ctrl.selectNode(3);
    expect(lastId).toBe(3);
    ctrl.selectNode(null);
    expect(lastId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// startRoute()
// ---------------------------------------------------------------------------

describe("startRoute()", () => {
  it("sets animation with correct path, step=0, done=false for multi-hop", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12
    ctrl.startRoute(5, 0); // SEARCH 5 0 → path [0,3,6], dest=6
    const { animation } = ctrl.getState();
    expect(animation).not.toBeNull();
    expect(animation!.kind).toBe("route");
    expect(animation!.key).toBe(5);
    expect(animation!.startId).toBe(0);
    expect(animation!.path).toEqual([0, 3, 6]);
    expect(animation!.destination).toBe(6);
    expect(animation!.step).toBe(0);
    expect(animation!.done).toBe(false);
  });

  it("single-hop route (start == destination) is immediately done", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12
    // SEARCH 14 0 → dest=0 (succ(14)=0), single-hop
    ctrl.startRoute(14, 0);
    const { animation } = ctrl.getState();
    expect(animation!.path).toEqual([0]);
    expect(animation!.done).toBe(true);
    expect(animation!.step).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// stepAnimation()
// ---------------------------------------------------------------------------

describe("stepAnimation()", () => {
  it("advances step one at a time and marks done at the last hop", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startRoute(5, 0); // path [0,3,6]
    // step 0 → step 1
    ctrl.stepAnimation();
    expect(ctrl.getState().animation!.step).toBe(1);
    expect(ctrl.getState().animation!.done).toBe(false);
    // step 1 → step 2 (last index = path.length-1 = 2 → done)
    ctrl.stepAnimation();
    expect(ctrl.getState().animation!.step).toBe(2);
    expect(ctrl.getState().animation!.done).toBe(true);
  });

  it("does nothing when animation is already done", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startRoute(14, 0); // single-hop, already done
    ctrl.stepAnimation(); // should be a no-op
    const { animation } = ctrl.getState();
    expect(animation!.step).toBe(0);
    expect(animation!.done).toBe(true);
  });

  it("notifies subscribers on each step", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startRoute(5, 0); // path [0,3,6]
    let calls = 0;
    ctrl.subscribe(() => calls++);
    ctrl.stepAnimation();
    ctrl.stepAnimation();
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// finishAnimation()
// ---------------------------------------------------------------------------

describe("finishAnimation()", () => {
  it("jumps to done with step at last hop index", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startRoute(5, 0); // path [0,3,6]
    ctrl.finishAnimation();
    const { animation } = ctrl.getState();
    expect(animation!.done).toBe(true);
    expect(animation!.step).toBe(2);
  });

  it("is a no-op if already done", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startRoute(14, 0); // already done
    let calls = 0;
    ctrl.subscribe(() => calls++);
    ctrl.finishAnimation();
    expect(calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Insert commit-on-done
// ---------------------------------------------------------------------------

describe("startInsertFile() — commit on done", () => {
  it("file does not appear in destination until animation is done", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12
    // Insert "hello": key = hash("hello", 4); route from node 0
    const key = hash("hello", 4);
    ctrl.startInsertFile("hello", 0);
    const stateBeforeDone = ctrl.getState();
    const anim = stateBeforeDone.animation!;
    // Animation must be in flight (unless single-hop)
    if (!anim.done) {
      // File should NOT yet be at destination
      const dest = stateBeforeDone.nodes.find((n) => n.id === anim.destination)!;
      expect(dest.files.some((f) => f.key === key)).toBe(false);
      // Advance to done
      ctrl.finishAnimation();
    }
    // Now done — file must be at destination
    const stateDone = ctrl.getState();
    const destNode = stateDone.nodes.find((n) => n.id === stateDone.animation!.destination)!;
    expect(destNode.files.some((f) => f.key === key && f.value === "hello")).toBe(true);
  });

  it("file appears at the correct destination after step-by-step walk", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const key = hash("world", 4);
    ctrl.startInsertFile("world", 0);
    // Step through until done
    let anim = ctrl.getState().animation!;
    while (!anim.done) {
      ctrl.stepAnimation();
      anim = ctrl.getState().animation!;
    }
    const destination = anim.destination;
    const destNode = ctrl.getState().nodes.find((n) => n.id === destination)!;
    expect(destNode.files.some((f) => f.key === key && f.value === "world")).toBe(true);
    // All other nodes should have no such file
    for (const n of ctrl.getState().nodes) {
      if (n.id !== destination) {
        expect(n.files.some((f) => f.key === key)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Delete commit-on-done
// ---------------------------------------------------------------------------

describe("startDeleteFile() — commit on done", () => {
  it("file is still at destination before animation is done", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    // First insert a file, bypassing animation (finish immediately)
    ctrl.startInsertFile("alpha", 0);
    ctrl.finishAnimation();
    const key = hash("alpha", 4);

    // Now delete it
    ctrl.startDeleteFile(key, 0);
    const animDel = ctrl.getState().animation!;
    if (!animDel.done) {
      // File should still be there
      const destNode = ctrl.getState().nodes.find((n) => n.id === animDel.destination)!;
      expect(destNode.files.some((f) => f.key === key)).toBe(true);
      // Advance to done
      ctrl.finishAnimation();
    }
    // After done, file must be gone
    const destAfter = ctrl.getState().nodes.find((n) => n.id === animDel.destination)!;
    expect(destAfter.files.some((f) => f.key === key)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Search — no mutation
// ---------------------------------------------------------------------------

describe("startSearchFile()", () => {
  it("reports null value for a missing key", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startSearchFile(5, 0);
    const { animation } = ctrl.getState();
    expect(animation!.kind).toBe("search");
    expect(animation!.value).toBeNull();
  });

  it("reports the correct value after the file has been inserted", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startInsertFile("gamma", 0);
    ctrl.finishAnimation();
    const key = hash("gamma", 4);
    ctrl.startSearchFile(key, 0);
    const { animation } = ctrl.getState();
    expect(animation!.value).toBe("gamma");
  });

  it("does not change files at any node", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const filesBefore = ctrl.getState().nodes.map((n) => n.files.length);
    ctrl.startSearchFile(5, 0);
    ctrl.finishAnimation();
    const filesAfter = ctrl.getState().nodes.map((n) => n.files.length);
    expect(filesAfter).toEqual(filesBefore);
  });
});

// ---------------------------------------------------------------------------
// subscribe / unsubscribe
// ---------------------------------------------------------------------------

describe("subscribe()", () => {
  it("listener receives state on every mutation", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const seen: number[] = [];
    ctrl.subscribe((s) => seen.push(s.nodes.length));
    ctrl.addNode("N1", 1);
    ctrl.addNode("N2", 2);
    expect(seen).toEqual([6, 7]);
  });

  it("unsubscribe stops further notifications", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 3);
    let calls = 0;
    const unsub = ctrl.subscribe(() => calls++);
    ctrl.addNode("A", 1); // calls=1
    unsub();
    ctrl.addNode("B", 2); // should NOT fire
    expect(calls).toBe(1);
  });

  it("multiple independent listeners each receive updates", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 3);
    const a: number[] = [];
    const b: number[] = [];
    ctrl.subscribe((s) => a.push(s.nodes.length));
    ctrl.subscribe((s) => b.push(s.nodes.length));
    ctrl.addNode("X", 1);
    expect(a).toEqual([4]);
    expect(b).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// hashName()
// ---------------------------------------------------------------------------

describe("hashName()", () => {
  it("matches the standalone hash() function", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    expect(ctrl.hashName("test")).toBe(hash("test", 4));
    expect(ctrl.hashName("hello")).toBe(hash("hello", 4));
  });
});

// ---------------------------------------------------------------------------
// Fix 1 — getState() deep-copies path and nodes arrays (no reference leaks)
// ---------------------------------------------------------------------------

describe("getState() — snapshot isolation", () => {
  it("mutating state.animation.path does not affect a subsequent getState()", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12
    ctrl.startRoute(5, 0); // path [0,3,6]

    const s1 = ctrl.getState();
    expect(s1.animation).not.toBeNull();
    const originalPath = [...s1.animation!.path];

    // Mutate the returned snapshot's path
    s1.animation!.path.push(999);

    // A fresh getState() must still return the unmodified path
    const s2 = ctrl.getState();
    expect(s2.animation!.path).toEqual(originalPath);
  });

  it("mutating a node's files array returned by getState() does not affect internal state", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startInsertFile("leak-test", 0);
    ctrl.finishAnimation();

    const s1 = ctrl.getState();
    // Find the node with the file and push a fake entry
    const nodeWithFile = s1.nodes.find((n) => n.files.length > 0)!;
    expect(nodeWithFile).toBeDefined();
    nodeWithFile.files.push({ key: 9999, value: "injected" });

    // Internal state must be clean
    const s2 = ctrl.getState();
    const sameNode = s2.nodes.find((n) => n.id === nodeWithFile.id)!;
    expect(sameNode.files.some((f) => f.key === 9999)).toBe(false);
  });

  it("mutating a node's fingers array returned by getState() does not affect internal state", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);

    const s1 = ctrl.getState();
    const originalFingerCount = s1.nodes[0]!.fingers.length;
    // Mutate the returned snapshot
    s1.nodes[0]!.fingers.splice(0, s1.nodes[0]!.fingers.length);

    // Fresh getState() must reflect the real finger table
    const s2 = ctrl.getState();
    expect(s2.nodes[0]!.fingers.length).toBe(originalFingerCount);
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — two subscribers each receive independent snapshots
// ---------------------------------------------------------------------------

describe("_notify() — per-listener independent snapshots", () => {
  it("mutation of snapshot in listener A does not corrupt snapshot seen by B", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    ctrl.startRoute(5, 0); // path [0,3,6]

    const pathsSeenByB: number[][] = [];

    // Listener A mutates the path it receives
    ctrl.subscribe((s) => {
      if (s.animation) s.animation.path.push(999);
    });
    // Listener B records what it sees
    ctrl.subscribe((s) => {
      if (s.animation) pathsSeenByB.push([...s.animation.path]);
    });

    ctrl.stepAnimation();

    // B should never see the 999 injected by A
    for (const p of pathsSeenByB) {
      expect(p).not.toContain(999);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 4 — starting a new animation while one is in-flight commits the first
// ---------------------------------------------------------------------------

describe("startInsertFile() — no silent drop on interrupt", () => {
  it("starting a second insert while first is in-flight commits the first", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12

    const key1 = hash("file-one", 4);
    ctrl.startInsertFile("file-one", 0);

    // Confirm animation is in-flight (not yet done for a multi-hop route)
    const anim1 = ctrl.getState().animation!;

    // If single-hop it already committed — skip the test body
    if (!anim1.done) {
      const dest1 = anim1.destination;

      // Start a second insert WITHOUT finishing the first
      ctrl.startInsertFile("file-two", 0);

      // The first file must now be present at its destination
      const state = ctrl.getState();
      const destNode = state.nodes.find((n) => n.id === dest1)!;
      expect(destNode.files.some((f) => f.key === key1 && f.value === "file-one")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 5 — removeNode of an intermediate hop cancels the animation
// ---------------------------------------------------------------------------

describe("removeNode() — intermediate-hop cancels animation", () => {
  it("removing a node that is an intermediate hop clears the animation", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12
    ctrl.startRoute(5, 0); // path [0,3,6] — node 3 is an intermediate hop

    const animBefore = ctrl.getState().animation!;
    // Verify node 3 is indeed an intermediate hop (not start/dest)
    expect(animBefore.path).toContain(3);
    expect(animBefore.startId).not.toBe(3);
    expect(animBefore.destination).not.toBe(3);

    ctrl.removeNode(3);

    expect(ctrl.getState().animation).toBeNull();
  });

  it("removing a node NOT in the animation path does not cancel the animation", () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5); // ids 0,3,6,9,12
    ctrl.startRoute(5, 0); // path [0,3,6] — node 9 and 12 are NOT in path

    ctrl.removeNode(9);

    expect(ctrl.getState().animation).not.toBeNull();
  });
});
