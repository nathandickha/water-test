// js/state/PoolState.js
// Single authoritative mutable pool state.
//
// Existing PoolApp code historically mutates poolParams directly. A Proxy keeps
// that API compatible while providing a central subscription/snapshot boundary
// for future controllers, persistence and undo/redo work.

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch (_) {}
  }
  return JSON.parse(JSON.stringify(value));
}

export function createPoolState(initialState = {}) {
  const listeners = new Set();
  const target = { ...initialState };

  const proxy = new Proxy(target, {
    set(obj, key, value) {
      const previous = obj[key];
      if (Object.is(previous, value)) return true;

      obj[key] = value;
      for (const listener of listeners) {
        try {
          listener({
            key,
            value,
            previous,
            state: proxy
          });
        } catch (error) {
          console.warn("[PoolState] subscriber failed", error);
        }
      }
      return true;
    },

    deleteProperty(obj, key) {
      if (!(key in obj)) return true;
      const previous = obj[key];
      delete obj[key];

      for (const listener of listeners) {
        try {
          listener({
            key,
            value: undefined,
            previous,
            deleted: true,
            state: proxy
          });
        } catch (error) {
          console.warn("[PoolState] subscriber failed", error);
        }
      }
      return true;
    }
  });

  Object.defineProperties(proxy, {
    subscribe: {
      enumerable: false,
      value(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },

    snapshot: {
      enumerable: false,
      value() {
        return cloneValue(target);
      }
    },

    patch: {
      enumerable: false,
      value(next = {}) {
        Object.entries(next).forEach(([key, value]) => {
          proxy[key] = value;
        });
        return proxy;
      }
    },

    destroy: {
      enumerable: false,
      value() {
        listeners.clear();
      }
    }
  });

  return proxy;
}
