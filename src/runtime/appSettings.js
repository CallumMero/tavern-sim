const SETTINGS_STORAGE_KEY = "tavern-sim.settings.v1";

const DEFAULT_APP_SETTINGS = Object.freeze({
  audioMode: "hearth_only",
  uiScale: "1",
  textSize: "default",
  defaultSpeed: "0",
  inGameView: "command",
  reportTab: "daily"
});

function normalizeAppSettings(settings = null) {
  const input = settings && typeof settings === "object" ? settings : {};
  const audioMode = input.audioMode === "muted" ? "muted" : "hearth_only";
  const uiScale = ["0.9", "1", "1.1"].includes(`${input.uiScale}`) ? `${input.uiScale}` : "1";
  const textSize = ["compact", "default", "large"].includes(`${input.textSize}`)
    ? `${input.textSize}`
    : "default";
  const defaultSpeed = ["0", "1", "2", "4"].includes(`${input.defaultSpeed}`)
    ? `${input.defaultSpeed}`
    : "0";
  const inGameView = ["command", "operations", "staff", "world", "analytics", "reports"].includes(
    `${input.inGameView}`
  )
    ? `${input.inGameView}`
    : "command";
  const reportTab = ["daily", "weekly", "log"].includes(`${input.reportTab}`)
    ? `${input.reportTab}`
    : "daily";

  return {
    audioMode,
    uiScale,
    textSize,
    defaultSpeed,
    inGameView,
    reportTab
  };
}

export function createAppSettingsStore(
  storage = window.localStorage,
  key = SETTINGS_STORAGE_KEY
) {
  function load() {
    try {
      const raw = storage.getItem(key);
      if (!raw) {
        return { ...DEFAULT_APP_SETTINGS };
      }
      const parsed = JSON.parse(raw);
      return normalizeAppSettings(parsed);
    } catch (_error) {
      return { ...DEFAULT_APP_SETTINGS };
    }
  }

  function save(nextSettings = null) {
    const normalized = normalizeAppSettings(nextSettings);
    try {
      storage.setItem(key, JSON.stringify(normalized));
      return { ok: true, settings: normalized };
    } catch (_error) {
      return { ok: false, settings: normalized };
    }
  }

  return {
    key,
    defaults: { ...DEFAULT_APP_SETTINGS },
    load,
    save
  };
}
