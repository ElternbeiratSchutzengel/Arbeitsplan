/**
 * Datenzugriff
 * ============
 * Bei konfiguriertem Firebase-Projekt wird das modulare Firebase JS SDK
 * (RTDB) verwendet. Ohne gültige Konfiguration startet ein lokaler
 * Demo-Modus, der dieselbe schmale API auf localStorage abbildet.
 * Der Demo-Modus ist ausschließlich für Entwicklung und Vorschau gedacht.
 */

import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

export let backendMode = "demo";
export let initError = null;
export let db = null;

export let ref = () => ({ path: "" });
export let onValue = () => () => {};
export let get = () => Promise.resolve(null);
export let set = () => Promise.resolve();
export let update = () => Promise.resolve();
export let remove = () => Promise.resolve();
export let push = () => ({ key: "" });
export let runTransaction = () => Promise.resolve({ committed: false, snapshot: null });

const SDK_VERSION = "10.14.1";

if (firebaseConfigured) {
  try {
    const [appModule, databaseModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database.js`)
    ]);

    const app = appModule.initializeApp(firebaseConfig);
    db = databaseModule.getDatabase(app);

    ref = databaseModule.ref;
    onValue = databaseModule.onValue;
    get = databaseModule.get;
    set = databaseModule.set;
    update = databaseModule.update;
    remove = databaseModule.remove;
    push = databaseModule.push;
    runTransaction = databaseModule.runTransaction;
    backendMode = "firebase";
  } catch (error) {
    console.error("Firebase konnte nicht initialisiert werden.", error);
    initError = error;
    backendMode = "error";
  }
} else {
  installDemoBackend();
  backendMode = "demo";
}

/* ==========================================================================
   Demo-Backend
   ========================================================================== */

function installDemoBackend() {
  const state = loadDemoState();
  const subscribers = new Set();
  let flushScheduled = false;

  db = { demo: true };

  ref = (_database, path = "") => ({ path: normalizePath(path) });

  onValue = (target, callback, errorCallback) => {
    const subscription = {
      path: normalizePath(target?.path ?? ""),
      callback,
      errorCallback
    };
    subscribers.add(subscription);

    Promise.resolve().then(() => {
      if (!subscribers.has(subscription)) return;
      try {
        subscription.callback(makeSnapshot(readPath(subscription.path), lastKey(subscription.path)));
      } catch (error) {
        console.error("Demo-Snapshot fehlgeschlagen.", error);
        subscription.errorCallback?.(error);
      }
    });

    return () => subscribers.delete(subscription);
  };

  get = async (target) => {
    const path = normalizePath(target?.path ?? "");
    return makeSnapshot(readPath(path), lastKey(path));
  };

  set = async (target, value) => {
    writePath(normalizePath(target?.path ?? ""), clone(value));
    scheduleNotify();
  };

  update = async (target, values) => {
    const base = normalizePath(target?.path ?? "");
    for (const [key, value] of Object.entries(values ?? {})) {
      const relative = normalizePath(key);
      const path = base && relative ? `${base}/${relative}` : base || relative;
      writePath(path, clone(value));
    }
    scheduleNotify();
  };

  remove = async (target) => {
    writePath(normalizePath(target?.path ?? ""), null);
    scheduleNotify();
  };

  push = (target, value) => {
    const base = normalizePath(target?.path ?? "");
    const key = `-demo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const child = { path: base ? `${base}/${key}` : key, key };

    if (value !== undefined) {
      writePath(child.path, clone(value));
      scheduleNotify();
      return Promise.resolve(child);
    }
    return child;
  };

  runTransaction = async (target, updateFn) => {
    const path = normalizePath(target?.path ?? "");
    const current = readPath(path);
    const next = updateFn(clone(current));

    if (next === undefined) {
      return {
        committed: false,
        snapshot: makeSnapshot(current, lastKey(path))
      };
    }

    writePath(path, clone(next));
    scheduleNotify();

    return {
      committed: true,
      snapshot: makeSnapshot(next, lastKey(path))
    };
  };

  function makeSnapshot(value, key = null) {
    const copy = clone(value);
    return {
      key,
      val: () => clone(copy),
      exists: () => copy !== null && copy !== undefined
    };
  }

  function scheduleNotify() {
    persistDemoState(state);
    if (flushScheduled) return;
    flushScheduled = true;

    queueMicrotask(() => {
      flushScheduled = false;
      for (const subscription of subscribers) {
        const path = subscription.path;
        const value = path === ".info/connected" ? true : readPath(path);
        try {
          subscription.callback(makeSnapshot(value, lastKey(path)));
        } catch (error) {
          console.error("Demo-Listener fehlgeschlagen.", error);
          subscription.errorCallback?.(error);
        }
      }
    });
  }

  function readPath(path) {
    if (path === ".info/connected") return true;
    if (!path) return clone(state.data);
    let current = state.data;
    for (const segment of path.split("/")) {
      if (current === null || typeof current !== "object") return null;
      if (!(segment in current)) return null;
      current = current[segment];
    }
    return clone(current ?? null);
  }

  function writePath(path, value) {
    if (!path) {
      state.data = value && typeof value === "object" ? value : {};
      return;
    }

    const segments = path.split("/");
    let current = state.data;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!current[segment] || typeof current[segment] !== "object") {
        current[segment] = {};
      }
      current = current[segment];
    }

    const last = segments[segments.length - 1];
    if (value === null || value === undefined) {
      delete current[last];
    } else {
      current[last] = value;
    }
  }

  function normalizePath(path) {
    return String(path ?? "").replace(/^\/+|\/+$/g, "");
  }

  function lastKey(path) {
    if (!path || path === ".info/connected") return null;
    const segments = path.split("/");
    return segments[segments.length - 1];
  }
}

function loadDemoState() {
  try {
    const raw = globalThis.localStorage?.getItem("helferplan.demo.v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.data) return parsed;
    }
  } catch (error) {
    console.warn("Demo-Daten konnten nicht gelesen werden.", error);
  }

  const seeded = { version: 1, data: createDemoData() };
  persistDemoState(seeded);
  return seeded;
}

function persistDemoState(state) {
  try {
    globalThis.localStorage?.setItem("helferplan.demo.v1", JSON.stringify(state));
  } catch (error) {
    console.warn("Demo-Daten konnten nicht gespeichert werden.", error);
  }
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function createDemoData() {
  const now = Date.now();
  const created = now - 36 * 60 * 60 * 1000;

  return {
    config: {
      clubName: "TSV Musterstadt",
      eventName: "Vereinsfest 2026",
      eventDate: "2026-06-14",
      eventLocation: "Festplatz am Sportheim",
      tagline: "Helfer gesucht. Packst du mit an?"
    },
    groups: {
      "g-aktive": { name: "Aktive", color: "amber", order: 0 },
      "g-jugend": { name: "Jugend", color: "sky", order: 1 },
      "g-vorstand": { name: "Vorstand", color: "violet", order: 2 }
    },
    shifts: {
      "sh-frueh": { name: "Frühschicht", start: "11:00", end: "14:00", order: 0 },
      "sh-mittag": { name: "Mittagsschicht", start: "14:00", end: "17:00", order: 1 },
      "sh-abend": { name: "Abendschicht", start: "17:00", end: "20:00", order: 2 }
    },
    stands: {
      "st-grill": { name: "Grill", icon: "flame", color: "sky", groupId: "g-aktive", order: 0 },
      "st-ausschank": { name: "Ausschank", icon: "beer", color: "teal", groupId: "g-jugend", order: 1 },
      "st-kasse": { name: "Kasse", icon: "cash", color: "indigo", order: 2 },
      "st-kuchen": { name: "Kuchenbuffet", icon: "cake", color: "rose", groupId: "g-vorstand", order: 3 },
      "st-spuel": { name: "Spüldienst", icon: "droplet", color: "sky", order: 4 }
    },
    demand: {
      "sh-frueh": { "st-grill": 3, "st-ausschank": 2, "st-kasse": 2, "st-kuchen": 0, "st-spuel": 0 },
      "sh-mittag": { "st-grill": 3, "st-ausschank": 2, "st-kasse": 0, "st-kuchen": 2, "st-spuel": 0 },
      "sh-abend": { "st-grill": 0, "st-ausschank": 0, "st-kasse": 2, "st-kuchen": 0, "st-spuel": 2 }
    },
    assignments: {
      "sh-frueh": {
        "st-grill": {
          "0": { name: "Lena Hoffmann", createdAt: created, updatedAt: created },
          "1": { name: "Jonas Weber", createdAt: created, updatedAt: created }
        },
        "st-ausschank": {
          "0": { name: "Mia Schneider", createdAt: created, updatedAt: created },
          "1": { name: "Timo Krause", createdAt: created, updatedAt: created }
        },
        "st-kasse": {
          "0": { name: "Sarah Klein", createdAt: created, updatedAt: created }
        }
      },
      "sh-mittag": {
        "st-grill": {
          "0": { name: "Markus Braun", createdAt: created, updatedAt: created }
        },
        "st-ausschank": {
          "0": { name: "Nina Fischer", createdAt: created, updatedAt: created }
        },
        "st-kuchen": {
          "0": { name: "Petra Lang", createdAt: created, updatedAt: created },
          "1": { name: "Andrea Wolf", createdAt: created, updatedAt: created }
        }
      },
      "sh-abend": {
        "st-spuel": {
          "0": { name: "Felix Neumann", createdAt: created, updatedAt: created }
        }
      }
    },
    audit_log: {}
  };
}
