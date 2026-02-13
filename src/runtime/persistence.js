const DEFAULT_STORAGE_KEY = "tavern-sim.save.v1";

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export function createPersistence(storage = window.localStorage, key = DEFAULT_STORAGE_KEY) {
  function load() {
    try {
      const raw = storage.getItem(key);
      if (!raw) {
        return null;
      }
      return safeParse(raw);
    } catch (_error) {
      return null;
    }
  }

  function save(snapshot) {
    try {
      storage.setItem(key, JSON.stringify(snapshot));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function clear() {
    try {
      storage.removeItem(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  return {
    key,
    load,
    save,
    clear
  };
}
