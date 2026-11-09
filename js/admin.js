/**
 * Admin-Bereich
 * =============
 * Erstvergabe, Login, Sitzung, Veranstaltung, Stände, Schichten, Gruppen,
 * Bedarfsmatrix, Datenprüfung, Export, Passwortwechsel und Resets.
 *
 * Wichtig: Der Admin-Schutz ist ausschließlich ein UI-Schutz. Salt und Hash
 * liegen öffentlich lesbar in der Realtime Database. Es gibt keine
 * serverseitige Authentifizierung und keine Rate-Limits.
 */

import {
  backendMode,
  initError,
  db,
  ref,
  onValue,
  get,
  set,
  update,
  remove,
  push
} from "./firebase.js";

import {
  COLORS,
  ICON_NAMES,
  formatEventDate,
  formatDateTime,
  formatTimeRange,
  displayClubName,
  groupForStand,
  sortByOrder,
  applyTone,
  icon,
  uiIcon,
  qs,
  qsa,
  createEl,
  clearElement,
  setFieldError,
  isAdminSessionValid,
  readAdminSession,
  startAdminSession,
  touchAdminSession,
  clearAdminSession,
  showToast,
  setupModal,
  openModal,
  confirmAction,
  initConfirmDialog,
  setButtonBusy,
  scrollIntoViewSoft
} from "./ui.js";

import {
  normalizeWhitespace,
  validateText,
  validateEventDate,
  validateShiftTimes,
  shiftsOverlap,
  validatePasswordPair,
  validateDemand,
  hasValidAdminCredentials,
  isUniqueName,
  escapeCsvField
} from "./validation.js";

/* --------------------------------------------------------------------------
   Konstanten und Zustand
   -------------------------------------------------------------------------- */

const SECTIONS = new Set([
  "uebersicht",
  "veranstaltung",
  "staende",
  "schichten",
  "gruppen",
  "bedarf",
  "export",
  "passwort",
  "zuruecksetzen"
]);

const COLOR_KEYS = Object.keys(COLORS);
const DATA_PATHS = ["groups", "shifts", "stands", "demand", "assignments"];

const state = {
  config: {},
  configLoaded: false,
  inAdmin: false,
  authMode: null,
  authExpired: false,
  groups: {},
  shifts: {},
  stands: {},
  demand: {},
  assignments: {},
  loaded: new Set(),
  dataUnsubs: new Map(),
  configUnsub: null,
  renderScheduled: false,
  section: "uebersicht",
  eventDirty: false,
  eventBaseline: null,
  demandDraft: {},
  demandDirty: false,
  demandShowErrors: false,
  editingStand: null,
  editingShift: null,
  editingGroup: null,
  writeWarning: "",
  lastSessionTouch: 0,
  sessionTimer: null,
  listenerAbort: new AbortController()
};

const $ = (id) => document.getElementById(id);

function setHidden(element, hidden) {
  if (element) element.hidden = Boolean(hidden);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Die RTDB liefert dicht belegte Slot-Schlüssel (0, 1, 2 …) als Array zurück.
function isSlotCollection(value) {
  return Boolean(value) && typeof value === "object";
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/* --------------------------------------------------------------------------
   Kryptografie
   -------------------------------------------------------------------------- */

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Der Browser stellt keine sichere Zufallsquelle bereit.");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Die sichere Passwortprüfung benötigt HTTPS oder localhost. Bitte öffnen Sie die Seite über eine sichere Verbindung."
    );
  }
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(salt, password) {
  return sha256Hex(`${salt}${password}`);
}

function equalHex(first, second) {
  const a = String(first ?? "").toLowerCase();
  const b = String(second ?? "").toLowerCase();
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

/* --------------------------------------------------------------------------
   Datenhelfer
   -------------------------------------------------------------------------- */

function getDemandValue(shiftId, standId) {
  const value = numberOr(state.demand?.[shiftId]?.[standId], 0);
  return Number.isInteger(value) && value >= 0 && value <= 20 ? value : 0;
}

function totalDemandForStand(standId) {
  let total = 0;
  for (const shiftId of Object.keys(state.shifts ?? {})) {
    total += getDemandValue(shiftId, standId);
  }
  return total;
}

function assignmentSlots(shiftId, standId) {
  const slots = state.assignments?.[shiftId]?.[standId];
  return isSlotCollection(slots) ? slots : {};
}

function countShiftAssignments(shiftId) {
  const stands = state.assignments?.[shiftId];
  if (!isObject(stands)) return 0;
  return Object.values(stands).reduce((sum, slots) => {
    return sum + (isSlotCollection(slots) ? Object.keys(slots).length : 0);
  }, 0);
}

function validSlotEntries(shiftId, standId) {
  const demand = getDemandValue(shiftId, standId);
  const slots = assignmentSlots(shiftId, standId);
  return Object.entries(slots)
    .filter(([index]) => Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < demand)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([index, record]) => ({
      index: Number(index),
      record,
      name: isObject(record) && typeof record.name === "string" ? record.name : ""
    }));
}

function statsForData() {
  let total = 0;
  let filled = 0;

  for (const shiftId of Object.keys(state.shifts ?? {})) {
    for (const standId of Object.keys(state.stands ?? {})) {
      const demand = getDemandValue(shiftId, standId);
      total += demand;
      filled += validSlotEntries(shiftId, standId).length;
    }
  }

  return { total, filled, missing: Math.max(0, total - filled) };
}

function sortedGroups() {
  return sortByOrder(state.groups);
}

function sortedShifts() {
  return sortByOrder(state.shifts);
}

function sortedStands() {
  return sortByOrder(state.stands);
}

function groupBadge(stand, { className = "group-badge" } = {}) {
  const group = groupForStand(state.groups, stand);
  const badge = createEl("span", className, group?.name ?? "Ohne Gruppe");
  if (group) {
    applyTone(badge, group.color);
  } else {
    badge.classList.add("group-badge--none");
  }
  return badge;
}

/* --------------------------------------------------------------------------
   Audit-Log
   -------------------------------------------------------------------------- */

async function writeAudit({
  action,
  entity,
  entityId = null,
  shiftId = null,
  standId = null,
  slotIndex = null,
  oldValue = null,
  newValue = null
}) {
  const entry = {
    ts: Date.now(),
    action,
    entity,
    entityId: entityId === null ? "" : String(entityId),
    actor: "admin",
    source: "ui"
  };

  if (shiftId !== null) entry.shiftId = shiftId;
  if (standId !== null) entry.standId = standId;
  if (slotIndex !== null) entry.slotIndex = slotIndex;
  if (oldValue !== null) entry.oldValue = oldValue;
  if (newValue !== null) entry.newValue = newValue;

  try {
    await push(ref(db, "audit_log"), entry);
  } catch (error) {
    // Best effort: Das Audit-Log darf die eigentliche Aktion nicht blockieren.
    console.warn("Audit-Log-Eintrag konnte nicht geschrieben werden.", error);
  }
}

/* --------------------------------------------------------------------------
   Fehleranzeige
   -------------------------------------------------------------------------- */

function renderWriteWarning() {
  const box = $("dashboard-write-warning");
  const text = $("dashboard-write-warning-text");
  if (!box || !text) return;
  if (!state.writeWarning) {
    box.hidden = true;
    text.textContent = "";
    return;
  }
  text.textContent = state.writeWarning;
  box.hidden = false;
}

function markWriteSuccess() {
  if (!state.writeWarning) return;
  state.writeWarning = "";
  renderWriteWarning();
}

function reportWriteError(error, message = "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.") {
  console.error(message, error);
  state.writeWarning = `${message} Die Daten können unvollständig sein; nutzen Sie die Datenprüfung auf der Übersicht.`;
  renderWriteWarning();
  showToast(message, "error");
}

/* --------------------------------------------------------------------------
   Start, Konfiguration und Sitzung
   -------------------------------------------------------------------------- */

function hideLoading() {
  setHidden($("admin-loading"), true);
}

function showFatalError(message, detail = "") {
  hideLoading();
  setHidden($("auth-screen"), true);
  setHidden($("admin-app"), true);

  const loading = $("admin-loading");
  if (loading) {
    loading.hidden = false;
    clearElement(loading);
    const alert = createEl("div", "alert alert-error");
    alert.append(uiIcon("alert", "icon icon-sm"));
    const content = createEl("div");
    content.append(createEl("strong", "", message));
    if (detail) content.append(createEl("p", "", detail));
    alert.append(content);
    loading.append(alert);
  }
}

function updateAdminLabels() {
  const eventLabel = $("admin-event-label");
  if (eventLabel) {
    eventLabel.textContent = String(state.config.eventName || "Admin").trim() || "Admin";
  }
  document.title = state.inAdmin
    ? `${sectionTitle(state.section)} – Admin – Helferplan`
    : "Admin-Bereich – Helferplan";
}

function showAuth(mode, { expired = false } = {}) {
  state.authMode = mode;
  state.authExpired = expired;
  hideLoading();
  setHidden($("admin-app"), true);
  setHidden($("auth-screen"), false);

  const title = $("auth-title");
  const intro = $("auth-intro");
  const setupForm = $("setup-form");
  const loginForm = $("login-form");
  const sessionMessage = $("auth-session-message");
  const loginError = $("login-error");

  if (mode === "setup") {
    if (title) title.textContent = "Admin einrichten";
    if (intro) {
      intro.textContent =
        "Für diesen Helferplan ist noch kein Admin-Passwort hinterlegt. Legen Sie jetzt ein starkes Passwort fest.";
    }
    setHidden(setupForm, false);
    setHidden(loginForm, true);
    setHidden(sessionMessage, true);
    const password = $("setup-password");
    const repeat = $("setup-repeat");
    if (password) password.value = "";
    if (repeat) repeat.value = "";
    setFieldError($("setup-password"), $("setup-password-error"), "");
    setFieldError($("setup-repeat"), $("setup-repeat-error"), "");
  } else {
    if (title) title.textContent = "Anmelden";
    if (intro) intro.textContent = "Bitte geben Sie das Admin-Passwort ein.";
    setHidden(loginForm, false);
    setHidden(setupForm, true);
    setHidden(sessionMessage, !expired);
    const password = $("login-password");
    if (password) password.value = "";
    setFieldError($("login-password"), $("login-password-error"), "");
    if (loginError) {
      loginError.hidden = true;
      loginError.textContent = "";
    }
  }

  updateAdminLabels();
  window.setTimeout(() => {
    const target = mode === "setup" ? $("setup-password") : $("login-password");
    target?.focus({ preventScroll: true });
  }, 40);
}

function handleConfigValue(value) {
  const previousValid = hasValidAdminCredentials(state.config);
  state.config = isObject(value) ? value : {};
  state.configLoaded = true;

  const credentialsValid = hasValidAdminCredentials(state.config);
  updateAdminLabels();

  if (state.inAdmin) {
    if (!credentialsValid) {
      // Der Zugang wurde extern entfernt (z. B. vollständiger Reset).
      stopDataSubscriptions();
      clearAdminSession();
      state.inAdmin = false;
      showAuth("setup");
      return;
    }
    populateEventForm(false);
    scheduleRender();
    return;
  }

  if (credentialsValid) {
    if (isAdminSessionValid()) {
      enterAdmin();
      return;
    }
    const hadSession = Boolean(readAdminSession());
    showAuth("login", { expired: state.authExpired || hadSession });
    return;
  }

  if (previousValid) {
    showToast("Der Admin-Zugang wurde entfernt. Bitte richten Sie ein neues Passwort ein.", "info");
  }
  showAuth("setup");
}

function handleConfigError(error) {
  console.error("Konfiguration konnte nicht gelesen werden.", error);
  showFatalError(
    "Die Konfiguration konnte nicht geladen werden.",
    "Bitte laden Sie die Seite neu und versuchen Sie es erneut."
  );
}

function subscribeConfig() {
  if (state.configUnsub) return;
  state.configUnsub = onValue(
    ref(db, "config"),
    (snapshot) => handleConfigValue(snapshot.val()),
    handleConfigError
  );
}

function startDataSubscriptions() {
  if (state.dataUnsubs.size > 0) return;

  for (const path of DATA_PATHS) {
    const unsubscribe = onValue(
      ref(db, path),
      (snapshot) => {
        const value = snapshot.val();
        state[path] = isObject(value) ? value : {};
        state.loaded.add(path);
        if (path === "shifts" || path === "stands" || path === "demand") {
          syncDemandDraft();
        }
        scheduleRender();
      },
      (error) => {
        console.error(`Daten konnten nicht gelesen werden: ${path}`, error);
        state.writeWarning =
          "Ein Teil der Daten konnte nicht geladen werden. Bitte laden Sie die Seite neu.";
        renderWriteWarning();
      }
    );
    state.dataUnsubs.set(path, unsubscribe);
  }
}

function stopDataSubscriptions() {
  for (const unsubscribe of state.dataUnsubs.values()) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("Daten-Listener konnte nicht beendet werden.", error);
    }
  }
  state.dataUnsubs.clear();

  state.groups = {};
  state.shifts = {};
  state.stands = {};
  state.demand = {};
  state.assignments = {};
  state.loaded.clear();
  state.demandDraft = {};
  state.demandDirty = false;
}

function enterAdmin() {
  if (state.inAdmin) return;
  if (!isAdminSessionValid()) {
    showAuth("login", { expired: true });
    return;
  }

  state.inAdmin = true;
  state.authExpired = false;
  state.lastSessionTouch = Date.now();
  hideLoading();
  setHidden($("auth-screen"), true);
  setHidden($("admin-app"), false);
  startDataSubscriptions();
  updateAdminLabels();

  const hash = normalizeSection(window.location.hash.replace(/^#/, ""));
  activateSection(hash || "uebersicht", { focus: false, updateHash: false });
  renderAll();
}

function expireAdminSession() {
  if (!state.inAdmin) return;
  clearAdminSession();
  stopDataSubscriptions();
  state.inAdmin = false;
  showAuth("login", { expired: true });
  showToast("Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.", "info");
}

function checkAdminSession() {
  if (!state.inAdmin) return;
  if (!isAdminSessionValid()) {
    expireAdminSession();
  }
}

function handleAdminActivity() {
  if (!state.inAdmin) return;
  if (!isAdminSessionValid()) {
    expireAdminSession();
    return;
  }
  const now = Date.now();
  if (now - state.lastSessionTouch > 15000) {
    touchAdminSession();
    state.lastSessionTouch = now;
  }
}

function logoutAdmin() {
  clearAdminSession();
  stopDataSubscriptions();
  state.inAdmin = false;
  window.location.assign("index.html");
}

function startSessionWatchers() {
  if (state.sessionTimer) return;
  state.sessionTimer = window.setInterval(checkAdminSession, 20000);

  const options = { signal: state.listenerAbort.signal, capture: true };
  document.addEventListener("pointerdown", handleAdminActivity, options);
  document.addEventListener("keydown", handleAdminActivity, options);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkAdminSession();
  });
}

function normalizeSection(value) {
  const name = String(value ?? "").trim();
  return SECTIONS.has(name) ? name : "";
}

function sectionTitle(name) {
  return {
    uebersicht: "Übersicht",
    veranstaltung: "Veranstaltung",
    staende: "Stände",
    schichten: "Schichten",
    gruppen: "Gruppen",
    bedarf: "Bedarf",
    export: "Export",
    passwort: "Passwort ändern",
    zuruecksetzen: "Zurücksetzen"
  }[name] ?? "Übersicht";
}

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */

function activateSection(name, { focus = true, updateHash = true } = {}) {
  const section = normalizeSection(name) || "uebersicht";
  state.section = section;

  for (const button of qsa("#admin-nav [data-section]")) {
    const active = button.dataset.section === section;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }

  for (const panel of qsa("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== section;
  }

  if (updateHash) {
    const target = `#${section}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }

  if (section === "veranstaltung") {
    populateEventForm(false);
    updateEventPreview();
  } else if (section === "bedarf") {
    syncDemandDraft();
    renderDemand();
  } else if (section === "export") {
    renderExportSummary();
  }

  updateAdminLabels();

  if (focus) {
    const panel = qs(`[data-panel="${section}"]`);
    const heading = panel?.querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

/* --------------------------------------------------------------------------
   Anmeldung, Erstvergabe und Passwort
   -------------------------------------------------------------------------- */

async function handleSetupSubmit(event) {
  event.preventDefault();
  if (state.authMode !== "setup") return;

  const passwordInput = $("setup-password");
  const repeatInput = $("setup-repeat");
  const result = validatePasswordPair(passwordInput?.value ?? "", repeatInput?.value ?? "");
  setFieldError(passwordInput, $("setup-password-error"), result.password?.error ?? "");
  setFieldError(repeatInput, $("setup-repeat-error"), result.repeat?.error ?? "");
  if (!result.valid) {
    (result.password?.valid ? repeatInput : passwordInput)?.focus();
    return;
  }

  const submit = $("setup-submit");
  setButtonBusy(submit, true, "Wird gespeichert …");

  try {
    const snapshot = await get(ref(db, "config"));
    if (hasValidAdminCredentials(snapshot.val())) {
      handleConfigValue(snapshot.val());
      showToast("Der Admin-Zugang wurde inzwischen eingerichtet. Bitte melden Sie sich an.", "info");
      return;
    }

    const salt = randomSalt();
    const hash = await hashPassword(salt, passwordInput.value);
    await update(ref(db, "config"), { adminSalt: salt, adminHash: hash });
    state.config = { ...state.config, adminSalt: salt, adminHash: hash };
    startAdminSession();
    await writeAudit({ action: "update", entity: "config", entityId: "adminHash" });
    markWriteSuccess();
    showToast("Admin-Passwort gespeichert. Willkommen!", "success");
    enterAdmin();
  } catch (error) {
    reportWriteError(
      error,
      "Das Admin-Passwort konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
    );
  } finally {
    setButtonBusy(submit, false);
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (state.authMode !== "login") return;

  const input = $("login-password");
  const errorBox = $("login-error");
  const password = input?.value ?? "";

  if (!password) {
    setFieldError(input, $("login-password-error"), "Bitte geben Sie das Passwort ein.");
    input?.focus();
    return;
  }

  if (!hasValidAdminCredentials(state.config)) {
    showAuth("setup");
    return;
  }

  const submit = $("login-submit");
  setButtonBusy(submit, true, "Wird geprüft …");
  setFieldError(input, $("login-password-error"), "");
  if (errorBox) {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  try {
    const hash = await hashPassword(state.config.adminSalt, password);
    if (!equalHex(hash, state.config.adminHash)) {
      if (errorBox) {
        errorBox.textContent = "Passwort falsch.";
        errorBox.hidden = false;
      }
      setFieldError(input, $("login-password-error"), "Passwort falsch.");
      input?.select();
      return;
    }

    startAdminSession();
    showToast("Willkommen im Admin-Bereich.", "success");
    enterAdmin();
  } catch (error) {
    console.error("Anmeldung fehlgeschlagen.", error);
    if (errorBox) {
      errorBox.textContent = error?.message || "Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es erneut.";
      errorBox.hidden = false;
    }
  } finally {
    setButtonBusy(submit, false);
  }
}

async function handlePasswordSubmit(event) {
  event.preventDefault();

  const currentInput = $("password-current");
  const newInput = $("password-new");
  const repeatInput = $("password-repeat");
  const current = currentInput?.value ?? "";

  setFieldError(currentInput, $("password-current-error"), "");
  setFieldError(newInput, $("password-new-error"), "");
  setFieldError(repeatInput, $("password-repeat-error"), "");

  if (!current) {
    setFieldError(currentInput, $("password-current-error"), "Bitte geben Sie das aktuelle Passwort ein.");
    currentInput?.focus();
    return;
  }

  const pair = validatePasswordPair(newInput?.value ?? "", repeatInput?.value ?? "");
  setFieldError(newInput, $("password-new-error"), pair.password?.error ?? "");
  setFieldError(repeatInput, $("password-repeat-error"), pair.repeat?.error ?? "");
  if (!pair.valid) {
    (pair.password?.valid ? repeatInput : newInput)?.focus();
    return;
  }

  if (!hasValidAdminCredentials(state.config)) {
    showToast("Die Admin-Zugangsdaten sind nicht verfügbar. Bitte laden Sie die Seite neu.", "error");
    return;
  }

  const submit = $("password-save");
  setButtonBusy(submit, true, "Wird geändert …");

  try {
    const currentHash = await hashPassword(state.config.adminSalt, current);
    if (!equalHex(currentHash, state.config.adminHash)) {
      setFieldError(currentInput, $("password-current-error"), "Das aktuelle Passwort ist falsch.");
      currentInput?.focus();
      return;
    }

    const salt = randomSalt();
    const hash = await hashPassword(salt, newInput.value);
    await update(ref(db, "config"), { adminSalt: salt, adminHash: hash });
    state.config = { ...state.config, adminSalt: salt, adminHash: hash };
    await writeAudit({ action: "update", entity: "config", entityId: "adminHash" });
    markWriteSuccess();
    touchAdminSession();

    if (currentInput) currentInput.value = "";
    if (newInput) newInput.value = "";
    if (repeatInput) repeatInput.value = "";
    showToast("Passwort geändert. Die aktuelle Sitzung bleibt bestehen.", "success");
  } catch (error) {
    reportWriteError(error, "Das Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
  } finally {
    setButtonBusy(submit, false);
  }
}

/* --------------------------------------------------------------------------
   Veranstaltung
   -------------------------------------------------------------------------- */

const EVENT_FIELDS = [
  ["event-club", "clubName"],
  ["event-name", "eventName"],
  ["event-date", "eventDate"],
  ["event-location", "eventLocation"],
  ["event-tagline", "tagline"]
];

function readEventForm() {
  return {
    clubName: normalizeWhitespace($("event-club")?.value ?? ""),
    eventName: normalizeWhitespace($("event-name")?.value ?? ""),
    eventDate: String($("event-date")?.value ?? "").trim(),
    eventLocation: normalizeWhitespace($("event-location")?.value ?? ""),
    tagline: normalizeWhitespace($("event-tagline")?.value ?? "")
  };
}

function populateEventForm(force = false) {
  if (!state.configLoaded) return;
  if (!force && state.eventDirty) return;

  for (const [id, key] of EVENT_FIELDS) {
    const input = $(id);
    if (input) input.value = String(state.config?.[key] ?? "");
  }

  state.eventBaseline = readEventForm();
  state.eventDirty = false;
  updateEventDirtyBadge();
  updateEventPreview();

  for (const [id] of EVENT_FIELDS) {
    setFieldError($(id), $(`${id}-error`), "");
  }
}

function updateEventDirtyBadge() {
  const badge = $("event-dirty");
  if (badge) badge.hidden = !state.eventDirty;
}

function updateEventDirty() {
  if (!state.eventBaseline) return;
  const current = readEventForm();
  const dirty = Object.keys(current).some((key) => current[key] !== state.eventBaseline[key]);
  if (dirty === state.eventDirty) return;
  state.eventDirty = dirty;
  updateEventDirtyBadge();
}

function updateEventPreview() {
  const form = readEventForm();
  const eventName = form.eventName || "Veranstaltung";
  const clubName = form.clubName || "Verein";
  const eyebrow = $("event-preview-eyebrow");
  const title = $("event-preview-title");
  const date = $("event-preview-date");
  const location = $("event-preview-location");

  if (eyebrow) eyebrow.textContent = `${eventName} · ${clubName}`;
  if (title) title.textContent = form.tagline || eventName;
  if (date) date.textContent = formatEventDate(form.eventDate) || "Datum";
  if (location) location.textContent = form.eventLocation || "Ort";
}

async function handleEventSubmit(event) {
  event.preventDefault();

  const club = validateText($("event-club")?.value, { min: 1, max: 80, label: "Vereinsname" });
  const name = validateText($("event-name")?.value, { min: 1, max: 80, label: "Veranstaltungsname" });
  const date = validateEventDate($("event-date")?.value);
  const location = validateText($("event-location")?.value, {
    min: 1,
    max: 120,
    label: "Ort"
  });
  const tagline = validateText($("event-tagline")?.value, {
    min: 0,
    max: 160,
    label: "Tagline",
    optional: true
  });

  const checks = [
    [$("event-club"), $("event-club-error"), club],
    [$("event-name"), $("event-name-error"), name],
    [$("event-date"), $("event-date-error"), date],
    [$("event-location"), $("event-location-error"), location],
    [$("event-tagline"), $("event-tagline-error"), tagline]
  ];

  let firstInvalid = null;
  for (const [input, errorElement, result] of checks) {
    setFieldError(input, errorElement, result.error ?? "");
    if (!result.valid && !firstInvalid) firstInvalid = input;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const values = {
    clubName: club.value,
    eventName: name.value,
    eventDate: date.value,
    eventLocation: location.value,
    tagline: tagline.value
  };

  const oldValue = state.eventBaseline ?? readEventForm();
  const submit = $("event-save");
  setButtonBusy(submit, true, "Wird gespeichert …");

  try {
    await update(ref(db, "config"), values);
    await writeAudit({
      action: "update",
      entity: "config",
      entityId: "event",
      oldValue,
      newValue: values
    });
    state.config = { ...state.config, ...values };
    state.eventBaseline = { ...values };
    state.eventDirty = false;
    updateEventDirtyBadge();
    updateEventPreview();
    markWriteSuccess();
    showToast("Veranstaltungsdaten gespeichert.", "success");
  } catch (error) {
    reportWriteError(error, "Die Veranstaltungsdaten konnten nicht gespeichert werden.");
  } finally {
    setButtonBusy(submit, false);
  }
}

/* --------------------------------------------------------------------------
   Auswahl- und Reihenfolgehelfer
   -------------------------------------------------------------------------- */

function nextOrder(collection) {
  const entries = Object.values(collection ?? {});
  if (entries.length === 0) return 0;
  return Math.max(...entries.map((entry) => numberOr(entry?.order, 0))) + 1;
}

function renderGroupOptions() {
  const select = $("stand-group");
  if (!select) return;
  const previous = select.value;

  clearElement(select);
  const none = createEl("option", "", "Ohne Gruppe");
  none.value = "";
  select.append(none);

  for (const [id, group] of sortedGroups()) {
    const option = createEl("option", "", String(group?.name ?? "Gruppe"));
    option.value = id;
    select.append(option);
  }

  select.value = previous && state.groups[previous] ? previous : "";
}

async function moveEntity(collection, id, direction) {
  const entries = sortByOrder(state[collection]);
  const index = entries.findIndex(([entryId]) => entryId === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= entries.length) return;

  const ids = entries.map(([entryId]) => entryId);
  [ids[index], ids[target]] = [ids[target], ids[index]];

  const updates = {};
  ids.forEach((entryId, position) => {
    updates[`${entryId}/order`] = position;
  });

  try {
    await update(ref(db, collection), updates);
    const firstOld = numberOr(state[collection][id]?.order, index);
    const secondId = ids[index] === id ? ids[target] : ids[index];
    const secondOld = numberOr(state[collection][secondId]?.order, target);
    await Promise.all([
      writeAudit({
        action: "update",
        entity: collection === "stands" ? "stand" : collection === "shifts" ? "shift" : "group",
        entityId: id,
        oldValue: { order: firstOld },
        newValue: { order: ids.indexOf(id) }
      }),
      writeAudit({
        action: "update",
        entity: collection === "stands" ? "stand" : collection === "shifts" ? "shift" : "group",
        entityId: secondId,
        oldValue: { order: secondOld },
        newValue: { order: ids.indexOf(secondId) }
      })
    ]);
    markWriteSuccess();
  } catch (error) {
    reportWriteError(error, "Die Reihenfolge konnte nicht gespeichert werden.");
  }
}

/* --------------------------------------------------------------------------
   Stände
   -------------------------------------------------------------------------- */

function openStandEditor(id = null) {
  const form = $("stand-form");
  const stand = id ? state.stands[id] : null;
  if (id && !stand) return;

  state.editingStand = id;
  setHidden(form, false);

  const title = $("stand-form-title");
  if (title) title.textContent = id ? "Stand bearbeiten" : "Neuer Stand";
  const save = $("stand-save");
  if (save) save.textContent = id ? "Änderungen speichern" : "Stand speichern";

  const name = $("stand-name");
  const iconSelect = $("stand-icon");
  const colorSelect = $("stand-color");
  const groupSelect = $("stand-group");

  if (name) name.value = String(stand?.name ?? "");
  if (iconSelect) iconSelect.value = ICON_NAMES.has(stand?.icon) ? stand.icon : "flame";
  if (colorSelect) colorSelect.value = COLOR_KEYS.includes(stand?.color) ? stand.color : "sky";

  renderGroupOptions();
  if (groupSelect) {
    groupSelect.value = stand?.groupId && state.groups[stand.groupId] ? stand.groupId : "";
  }

  setFieldError(name, $("stand-name-error"), "");
  setFieldError(null, $("stand-form-error"), "");
  updateStandPreview();
  scrollIntoViewSoft(form);
  window.setTimeout(() => name?.focus({ preventScroll: true }), 40);
}

function closeStandEditor() {
  state.editingStand = null;
  setHidden($("stand-form"), true);
  setFieldError(null, $("stand-form-error"), "");
}

function updateStandPreview() {
  const name = normalizeWhitespace($("stand-name")?.value ?? "") || "Neuer Stand";
  const iconValue = $("stand-icon")?.value ?? "star";
  const colorValue = $("stand-color")?.value ?? "sky";
  const groupId = $("stand-group")?.value ?? "";

  const previewName = $("stand-preview-name");
  if (previewName) previewName.textContent = name;

  const previewIcon = $("stand-preview-icon");
  if (previewIcon) {
    clearElement(previewIcon);
    previewIcon.append(icon(iconValue, "icon icon-sm"));
    applyTone(previewIcon, colorValue);
  }

  const previewGroup = $("stand-preview-group");
  if (previewGroup) {
    const group = groupId ? state.groups[groupId] : null;
    previewGroup.textContent = group?.name ?? "Ohne Gruppe";
    previewGroup.className = "group-badge";
    if (group) {
      applyTone(previewGroup, group.color);
    } else {
      previewGroup.classList.add("group-badge--none");
    }
  }
}

async function handleStandSubmit(event) {
  event.preventDefault();

  const nameInput = $("stand-name");
  const name = validateText(nameInput?.value, { min: 2, max: 60, label: "Name" });
  const formError = $("stand-form-error");
  setFieldError(null, formError, "");

  if (!name.valid) {
    setFieldError(nameInput, $("stand-name-error"), name.error);
    nameInput?.focus();
    return;
  }

  const unique = isUniqueName(name.value, state.stands, {
    excludeId: state.editingStand,
    label: "Standname"
  });
  if (!unique.valid) {
    setFieldError(nameInput, $("stand-name-error"), unique.error);
    nameInput?.focus();
    return;
  }
  setFieldError(nameInput, $("stand-name-error"), "");

  const iconValue = $("stand-icon")?.value;
  const colorValue = $("stand-color")?.value;
  const groupValue = $("stand-group")?.value ?? "";
  const editedId = state.editingStand;
  const existing = editedId ? state.stands[editedId] : null;
  const id = editedId || push(ref(db, "stands")).key;

  const value = {
    name: name.value,
    icon: ICON_NAMES.has(iconValue) ? iconValue : "flame",
    color: COLOR_KEYS.includes(colorValue) ? colorValue : "sky",
    order: existing ? numberOr(existing.order, 0) : nextOrder(state.stands),
    groupId: groupValue && state.groups[groupValue] ? groupValue : null
  };

  const submit = $("stand-save");
  setButtonBusy(submit, true, "Wird gespeichert …");

  try {
    await set(ref(db, `stands/${id}`), value);
    await writeAudit({
      action: editedId ? "update" : "create",
      entity: "stand",
      entityId: id,
      oldValue: existing ?? null,
      newValue: value
    });
    markWriteSuccess();
    closeStandEditor();
    showToast(editedId ? "Stand aktualisiert." : "Stand angelegt.", "success");
  } catch (error) {
    reportWriteError(error, "Der Stand konnte nicht gespeichert werden.");
    setFieldError(null, formError, "Der Stand konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
  } finally {
    setButtonBusy(submit, false);
  }
}

function renderStands() {
  const list = $("stands-list");
  if (!list) return;

  if (state.editingStand && !state.stands[state.editingStand]) {
    closeStandEditor();
  }

  clearElement(list);
  const entries = sortedStands();
  setHidden($("stands-empty"), entries.length > 0);

  entries.forEach(([id, stand], index) => {
    const item = createEl("li", "admin-list-item");
    item.dataset.id = id;

    const iconBox = createEl("span", "admin-list-icon");
    iconBox.append(icon(stand?.icon, "icon icon-sm"));
    applyTone(iconBox, stand?.color);

    const main = createEl("div", "admin-list-main");
    main.append(createEl("p", "admin-list-name", String(stand?.name ?? "Stand")));

    const meta = createEl("div", "admin-list-meta");
    meta.append(groupBadge(stand));
    meta.append(createEl("span", "", `Reihenfolge ${index + 1}`));
    if (totalDemandForStand(id) === 0) {
      meta.append(createEl("span", "badge badge--muted", "In keiner Schicht aktiv"));
    }
    main.append(meta);

    const actions = createEl("div", "admin-list-actions");
    const orderButtons = createEl("div", "order-buttons");

    const up = createEl("button", "icon-btn");
    up.type = "button";
    up.dataset.action = "up";
    up.dataset.id = id;
    up.disabled = index === 0;
    up.setAttribute("aria-label", `${stand?.name ?? "Stand"} nach oben verschieben`);
    up.append(uiIcon("arrow-up", "icon icon-sm"));

    const down = createEl("button", "icon-btn");
    down.type = "button";
    down.dataset.action = "down";
    down.dataset.id = id;
    down.disabled = index === entries.length - 1;
    down.setAttribute("aria-label", `${stand?.name ?? "Stand"} nach unten verschieben`);
    down.append(uiIcon("arrow-down", "icon icon-sm"));

    orderButtons.append(up, down);

    const edit = createEl("button", "icon-btn");
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.id = id;
    edit.setAttribute("aria-label", `${stand?.name ?? "Stand"} bearbeiten`);
    edit.append(uiIcon("pencil", "icon icon-sm"));

    const del = createEl("button", "icon-btn icon-btn--danger");
    del.type = "button";
    del.dataset.action = "delete";
    del.dataset.id = id;
    del.setAttribute("aria-label", `${stand?.name ?? "Stand"} löschen`);
    del.append(uiIcon("trash", "icon icon-sm"));

    actions.append(orderButtons, edit, del);
    item.append(iconBox, main, actions);
    list.append(item);
  });
}

async function deleteStand(id) {
  const stand = state.stands[id];
  if (!stand) return;

  const demandPaths = [];
  let affectedShifts = 0;
  for (const shiftId of Object.keys(state.demand ?? {})) {
    if (isObject(state.demand[shiftId]) && id in state.demand[shiftId]) {
      demandPaths.push(`${shiftId}/${id}`);
      affectedShifts += 1;
    }
  }

  const assignmentPaths = [];
  let assignmentCount = 0;
  const assignmentAuditEntries = [];
  for (const shiftId of Object.keys(state.assignments ?? {})) {
    const slots = state.assignments?.[shiftId]?.[id];
    if (isSlotCollection(slots) && Object.keys(slots).length > 0) {
      assignmentPaths.push(`${shiftId}/${id}`);
      for (const [slotIndex, record] of Object.entries(slots)) {
        assignmentCount += 1;
        const numericSlot = Number(slotIndex);
        assignmentAuditEntries.push({
          action: "delete",
          entity: "assignment",
          entityId: `${shiftId}/${id}/${slotIndex}`,
          shiftId,
          standId: id,
          slotIndex: Number.isInteger(numericSlot) ? numericSlot : null,
          oldValue: record,
          newValue: null
        });
      }
    }
  }

  await confirmAction({
    title: "Stand löschen?",
    message: [
      `Der Stand „${stand.name ?? "Stand"}“ wird endgültig gelöscht.`,
      `Dabei werden der Bedarf in ${affectedShifts} ${affectedShifts === 1 ? "Schicht" : "Schichten"} und ${assignmentCount} ${assignmentCount === 1 ? "Helfer-Eintrag" : "Helfer-Einträge"} entfernt.`,
      "Die übrigen Stände, Schichten und Gruppen bleiben unverändert."
    ],
    confirmLabel: "Stand löschen",
    danger: true,
    onConfirm: async () => {
      try {
        await writeAudit({
          action: "delete",
          entity: "stand",
          entityId: id,
          oldValue: stand,
          newValue: null
        });
        await Promise.all(assignmentAuditEntries.map((entry) => writeAudit(entry)));

        const operations = [remove(ref(db, `stands/${id}`))];
        if (demandPaths.length > 0) {
          const demandUpdates = Object.fromEntries(demandPaths.map((path) => [path, null]));
          operations.push(update(ref(db, "demand"), demandUpdates));
        }
        if (assignmentPaths.length > 0) {
          const assignmentUpdates = Object.fromEntries(assignmentPaths.map((path) => [path, null]));
          operations.push(update(ref(db, "assignments"), assignmentUpdates));
        }

        await Promise.all(operations);
        markWriteSuccess();
        if (state.editingStand === id) closeStandEditor();
        showToast("Stand und zugehörige Einträge gelöscht.", "success");
      } catch (error) {
        reportWriteError(error, "Der Stand konnte nicht vollständig gelöscht werden.");
        throw new Error(
          "Der Stand konnte nicht vollständig gelöscht werden. Bitte versuchen Sie es erneut und nutzen Sie anschließend die Datenprüfung."
        );
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Schichten
   -------------------------------------------------------------------------- */

function openShiftEditor(id = null) {
  const form = $("shift-form");
  const shift = id ? state.shifts[id] : null;
  if (id && !shift) return;

  state.editingShift = id;
  setHidden(form, false);

  const title = $("shift-form-title");
  if (title) title.textContent = id ? "Schicht bearbeiten" : "Neue Schicht";
  const save = $("shift-save");
  if (save) save.textContent = id ? "Änderungen speichern" : "Schicht speichern";

  const name = $("shift-name");
  if (name) name.value = String(shift?.name ?? "");
  if ($("shift-start")) $("shift-start").value = String(shift?.start ?? "");
  if ($("shift-end")) $("shift-end").value = String(shift?.end ?? "");

  for (const field of ["shift-name", "shift-start", "shift-end"]) {
    setFieldError($(field), $(`${field}-error`), "");
  }
  setFieldError(null, $("shift-form-error"), "");
  updateShiftOverlapWarning();
  scrollIntoViewSoft(form);
  window.setTimeout(() => name?.focus({ preventScroll: true }), 40);
}

function closeShiftEditor() {
  state.editingShift = null;
  setHidden($("shift-form"), true);
  setHidden($("shift-overlap-warning"), true);
  setFieldError(null, $("shift-form-error"), "");
}

function updateShiftOverlapWarning() {
  const warning = $("shift-overlap-warning");
  if (!warning) return;

  const start = $("shift-start")?.value ?? "";
  const end = $("shift-end")?.value ?? "";
  const timesValid = validateShiftTimes(start, end).valid;
  if (!timesValid) {
    warning.hidden = true;
    return;
  }

  const overlaps = sortedShifts().some(([id, shift]) => {
    if (id === state.editingShift) return false;
    return shiftsOverlap({ start, end }, shift);
  });

  warning.hidden = !overlaps;
}

async function handleShiftSubmit(event) {
  event.preventDefault();

  const nameInput = $("shift-name");
  const startInput = $("shift-start");
  const endInput = $("shift-end");
  const name = validateText(nameInput?.value, { min: 2, max: 60, label: "Name" });
  const times = validateShiftTimes(startInput?.value, endInput?.value);

  let startError = "";
  let endError = "";
  if (!times.valid) {
    if (!startInput?.value) startError = "Bitte geben Sie eine Startzeit an.";
    else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startInput.value)) {
      startError = "Bitte geben Sie eine gültige Startzeit im Format HH:MM an.";
    } else if (!endInput?.value) endError = "Bitte geben Sie eine Endzeit an.";
    else endError = times.error;
  }

  setFieldError(nameInput, $("shift-name-error"), name.valid ? "" : name.error);
  setFieldError(startInput, $("shift-start-error"), startError);
  setFieldError(endInput, $("shift-end-error"), endError);
  setFieldError(null, $("shift-form-error"), "");

  if (!name.valid || !times.valid) {
    (name.valid ? (startError ? startInput : endInput) : nameInput)?.focus();
    return;
  }

  const editedId = state.editingShift;
  const existing = editedId ? state.shifts[editedId] : null;
  const id = editedId || push(ref(db, "shifts")).key;
  const value = {
    name: name.value,
    start: startInput.value,
    end: endInput.value,
    order: existing ? numberOr(existing.order, 0) : nextOrder(state.shifts)
  };

  const submit = $("shift-save");
  setButtonBusy(submit, true, "Wird gespeichert …");

  try {
    await set(ref(db, `shifts/${id}`), value);
    await writeAudit({
      action: editedId ? "update" : "create",
      entity: "shift",
      entityId: id,
      oldValue: existing ?? null,
      newValue: value
    });
    markWriteSuccess();
    closeShiftEditor();
    showToast(editedId ? "Schicht aktualisiert." : "Schicht angelegt.", "success");
  } catch (error) {
    reportWriteError(error, "Die Schicht konnte nicht gespeichert werden.");
    setFieldError(null, $("shift-form-error"), "Die Schicht konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
  } finally {
    setButtonBusy(submit, false);
  }
}

function renderShifts() {
  const list = $("shifts-list");
  if (!list) return;

  if (state.editingShift && !state.shifts[state.editingShift]) {
    closeShiftEditor();
  }

  clearElement(list);
  const entries = sortedShifts();
  setHidden($("shifts-empty"), entries.length > 0);

  entries.forEach(([id, shift], index) => {
    const item = createEl("li", "admin-list-item");
    item.dataset.id = id;

    const iconBox = createEl("span", "admin-list-icon");
    iconBox.append(uiIcon("clock", "icon icon-sm"));
    applyTone(iconBox, "sky");

    const main = createEl("div", "admin-list-main");
    main.append(createEl("p", "admin-list-name", String(shift?.name ?? "Schicht")));

    const meta = createEl("div", "admin-list-meta");
    meta.append(
      createEl("span", "", formatTimeRange(shift?.start, shift?.end) || "Keine Zeit angegeben")
    );
    meta.append(createEl("span", "", `Reihenfolge ${index + 1}`));
    main.append(meta);

    const actions = createEl("div", "admin-list-actions");
    const orderButtons = createEl("div", "order-buttons");

    const up = createEl("button", "icon-btn");
    up.type = "button";
    up.dataset.action = "up";
    up.dataset.id = id;
    up.disabled = index === 0;
    up.setAttribute("aria-label", `${shift?.name ?? "Schicht"} nach oben verschieben`);
    up.append(uiIcon("arrow-up", "icon icon-sm"));

    const down = createEl("button", "icon-btn");
    down.type = "button";
    down.dataset.action = "down";
    down.dataset.id = id;
    down.disabled = index === entries.length - 1;
    down.setAttribute("aria-label", `${shift?.name ?? "Schicht"} nach unten verschieben`);
    down.append(uiIcon("arrow-down", "icon icon-sm"));

    orderButtons.append(up, down);

    const edit = createEl("button", "icon-btn");
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.id = id;
    edit.setAttribute("aria-label", `${shift?.name ?? "Schicht"} bearbeiten`);
    edit.append(uiIcon("pencil", "icon icon-sm"));

    const del = createEl("button", "icon-btn icon-btn--danger");
    del.type = "button";
    del.dataset.action = "delete";
    del.dataset.id = id;
    del.setAttribute("aria-label", `${shift?.name ?? "Schicht"} löschen`);
    del.append(uiIcon("trash", "icon icon-sm"));

    actions.append(orderButtons, edit, del);
    item.append(iconBox, main, actions);
    list.append(item);
  });
}

async function deleteShift(id) {
  const shift = state.shifts[id];
  if (!shift) return;
  const assignmentCount = countShiftAssignments(id);
  const hasDemand = Boolean(state.demand?.[id]);
  const assignmentAuditEntries = [];
  for (const [standId, slots] of Object.entries(state.assignments?.[id] ?? {})) {
    if (!isSlotCollection(slots)) continue;
    for (const [slotIndex, record] of Object.entries(slots)) {
      const numericSlot = Number(slotIndex);
      assignmentAuditEntries.push({
        action: "delete",
        entity: "assignment",
        entityId: `${id}/${standId}/${slotIndex}`,
        shiftId: id,
        standId,
        slotIndex: Number.isInteger(numericSlot) ? numericSlot : null,
        oldValue: record,
        newValue: null
      });
    }
  }

  await confirmAction({
    title: "Schicht löschen?",
    message: [
      `Die Schicht „${shift.name ?? "Schicht"}“ wird endgültig gelöscht.`,
      `Dabei werden ${assignmentCount} ${assignmentCount === 1 ? "Helfer-Eintrag" : "Helfer-Einträge"} entfernt${hasDemand ? " und der zugehörige Bedarf gelöscht" : ""}.`,
      "Die übrigen Schichten, Stände und Gruppen bleiben unverändert."
    ],
    confirmLabel: "Schicht löschen",
    danger: true,
    onConfirm: async () => {
      try {
        await writeAudit({
          action: "delete",
          entity: "shift",
          entityId: id,
          oldValue: shift,
          newValue: null
        });
        await Promise.all(assignmentAuditEntries.map((entry) => writeAudit(entry)));

        await Promise.all([
          remove(ref(db, `shifts/${id}`)),
          remove(ref(db, `demand/${id}`)),
          remove(ref(db, `assignments/${id}`))
        ]);
        markWriteSuccess();
        if (state.editingShift === id) closeShiftEditor();
        showToast("Schicht und zugehörige Einträge gelöscht.", "success");
      } catch (error) {
        reportWriteError(error, "Die Schicht konnte nicht vollständig gelöscht werden.");
        throw new Error(
          "Die Schicht konnte nicht vollständig gelöscht werden. Bitte versuchen Sie es erneut und nutzen Sie anschließend die Datenprüfung."
        );
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Gruppen
   -------------------------------------------------------------------------- */

function openGroupEditor(id = null) {
  const form = $("group-form");
  const group = id ? state.groups[id] : null;
  if (id && !group) return;

  state.editingGroup = id;
  setHidden(form, false);

  const title = $("group-form-title");
  if (title) title.textContent = id ? "Gruppe bearbeiten" : "Neue Gruppe";
  const save = $("group-save");
  if (save) save.textContent = id ? "Änderungen speichern" : "Gruppe speichern";

  const name = $("group-name");
  if (name) name.value = String(group?.name ?? "");
  const color = $("group-color");
  if (color) color.value = COLOR_KEYS.includes(group?.color) ? group.color : "amber";

  setFieldError(name, $("group-name-error"), "");
  setFieldError(null, $("group-form-error"), "");
  updateGroupPreview();
  scrollIntoViewSoft(form);
  window.setTimeout(() => name?.focus({ preventScroll: true }), 40);
}

function closeGroupEditor() {
  state.editingGroup = null;
  setHidden($("group-form"), true);
  setFieldError(null, $("group-form-error"), "");
}

function updateGroupPreview() {
  const preview = $("group-preview");
  if (!preview) return;
  const name = normalizeWhitespace($("group-name")?.value ?? "") || "Neue Gruppe";
  const color = $("group-color")?.value ?? "amber";
  preview.textContent = name;
  preview.className = "group-badge";
  applyTone(preview, color);
}

async function handleGroupSubmit(event) {
  event.preventDefault();

  const nameInput = $("group-name");
  const name = validateText(nameInput?.value, { min: 2, max: 40, label: "Name" });
  setFieldError(null, $("group-form-error"), "");

  if (!name.valid) {
    setFieldError(nameInput, $("group-name-error"), name.error);
    nameInput?.focus();
    return;
  }

  const unique = isUniqueName(name.value, state.groups, {
    excludeId: state.editingGroup,
    label: "Gruppenname"
  });
  if (!unique.valid) {
    setFieldError(nameInput, $("group-name-error"), unique.error);
    nameInput?.focus();
    return;
  }
  setFieldError(nameInput, $("group-name-error"), "");

  const colorValue = $("group-color")?.value;
  const editedId = state.editingGroup;
  const existing = editedId ? state.groups[editedId] : null;
  const id = editedId || push(ref(db, "groups")).key;
  const value = {
    name: name.value,
    color: COLOR_KEYS.includes(colorValue) ? colorValue : "amber",
    order: existing ? numberOr(existing.order, 0) : nextOrder(state.groups)
  };

  const submit = $("group-save");
  setButtonBusy(submit, true, "Wird gespeichert …");

  try {
    await set(ref(db, `groups/${id}`), value);
    await writeAudit({
      action: editedId ? "update" : "create",
      entity: "group",
      entityId: id,
      oldValue: existing ?? null,
      newValue: value
    });
    markWriteSuccess();
    closeGroupEditor();
    showToast(editedId ? "Gruppe aktualisiert." : "Gruppe angelegt.", "success");
  } catch (error) {
    reportWriteError(error, "Die Gruppe konnte nicht gespeichert werden.");
    setFieldError(null, $("group-form-error"), "Die Gruppe konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
  } finally {
    setButtonBusy(submit, false);
  }
}

function renderGroups() {
  const list = $("groups-list");
  if (!list) return;

  if (state.editingGroup && !state.groups[state.editingGroup]) {
    closeGroupEditor();
  }

  clearElement(list);
  const entries = sortedGroups();
  setHidden($("groups-empty"), entries.length > 0);

  entries.forEach(([id, group], index) => {
    const item = createEl("li", "admin-list-item");
    item.dataset.id = id;

    const iconBox = createEl("span", "admin-list-icon");
    iconBox.append(uiIcon("users", "icon icon-sm"));
    applyTone(iconBox, group?.color);

    const main = createEl("div", "admin-list-main");
    main.append(createEl("p", "admin-list-name", String(group?.name ?? "Gruppe")));

    const meta = createEl("div", "admin-list-meta");
    const colorLabel = COLORS[group?.color]?.label ?? group?.color ?? "Grau";
    meta.append(createEl("span", "", `Farbe: ${colorLabel}`));
    meta.append(createEl("span", "", `Reihenfolge ${index + 1}`));
    const assignedStands = Object.values(state.stands).filter(
      (stand) => stand?.groupId === id
    ).length;
    if (assignedStands > 0) {
      meta.append(
        createEl(
          "span",
          "",
          `${assignedStands} ${assignedStands === 1 ? "Stand" : "Stände"}`
        )
      );
    }
    main.append(meta);

    const actions = createEl("div", "admin-list-actions");
    const orderButtons = createEl("div", "order-buttons");

    const up = createEl("button", "icon-btn");
    up.type = "button";
    up.dataset.action = "up";
    up.dataset.id = id;
    up.disabled = index === 0;
    up.setAttribute("aria-label", `${group?.name ?? "Gruppe"} nach oben verschieben`);
    up.append(uiIcon("arrow-up", "icon icon-sm"));

    const down = createEl("button", "icon-btn");
    down.type = "button";
    down.dataset.action = "down";
    down.dataset.id = id;
    down.disabled = index === entries.length - 1;
    down.setAttribute("aria-label", `${group?.name ?? "Gruppe"} nach unten verschieben`);
    down.append(uiIcon("arrow-down", "icon icon-sm"));

    orderButtons.append(up, down);

    const edit = createEl("button", "icon-btn");
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.id = id;
    edit.setAttribute("aria-label", `${group?.name ?? "Gruppe"} bearbeiten`);
    edit.append(uiIcon("pencil", "icon icon-sm"));

    const del = createEl("button", "icon-btn icon-btn--danger");
    del.type = "button";
    del.dataset.action = "delete";
    del.dataset.id = id;
    del.setAttribute("aria-label", `${group?.name ?? "Gruppe"} löschen`);
    del.append(uiIcon("trash", "icon icon-sm"));

    actions.append(orderButtons, edit, del);
    item.append(iconBox, main, actions);
    list.append(item);
  });
}

async function deleteGroup(id) {
  const group = state.groups[id];
  if (!group) return;

  const affectedStands = Object.entries(state.stands)
    .filter(([, stand]) => stand?.groupId === id)
    .map(([standId, stand]) => ({ standId, stand }));

  await confirmAction({
    title: "Gruppe löschen?",
    message: [
      `Die Gruppe „${group.name ?? "Gruppe"}“ wird endgültig gelöscht.`,
      affectedStands.length > 0
        ? `${affectedStands.length} ${affectedStands.length === 1 ? "Stand wird" : "Stände werden"} auf „Ohne Gruppe“ gesetzt. Helfer-Einträge bleiben erhalten.`
        : "Der Gruppe sind keine Stände zugeordnet.",
      "Die übrigen Gruppen und alle Helfer-Einträge bleiben unverändert."
    ],
    confirmLabel: "Gruppe löschen",
    danger: true,
    onConfirm: async () => {
      try {
        await writeAudit({
          action: "delete",
          entity: "group",
          entityId: id,
          oldValue: group,
          newValue: null
        });

        const operations = [remove(ref(db, `groups/${id}`))];
        if (affectedStands.length > 0) {
          const standUpdates = Object.fromEntries(
            affectedStands.map(({ standId }) => [`${standId}/groupId`, null])
          );
          operations.push(update(ref(db, "stands"), standUpdates));
        }

        await Promise.all(operations);
        markWriteSuccess();
        if (state.editingGroup === id) closeGroupEditor();
        showToast("Gruppe gelöscht. Zugeordnete Stände sind jetzt ohne Gruppe.", "success");
      } catch (error) {
        reportWriteError(error, "Die Gruppe konnte nicht vollständig gelöscht werden.");
        throw new Error(
          "Die Gruppe konnte nicht vollständig gelöscht werden. Bitte versuchen Sie es erneut und nutzen Sie anschließend die Datenprüfung."
        );
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Bedarfsmatrix
   -------------------------------------------------------------------------- */

function cloneData(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fallback */
    }
  }
  return JSON.parse(JSON.stringify(value ?? null));
}

function hasDemandMatrix() {
  return sortedShifts().length > 0 && sortedStands().length > 0;
}

function draftValue(shiftId, standId) {
  const value = state.demandDraft?.[shiftId]?.[standId];
  return value === undefined || value === null ? "0" : String(value);
}

function syncDemandDraft() {
  const previous = state.demandDraft ?? {};
  const next = {};

  for (const [shiftId] of sortedShifts()) {
    next[shiftId] = {};
    for (const [standId] of sortedStands()) {
      const saved = String(getDemandValue(shiftId, standId));
      const previousValue = previous?.[shiftId]?.[standId];
      next[shiftId][standId] =
        state.demandDirty && previousValue !== undefined ? String(previousValue) : saved;
    }
  }

  state.demandDraft = next;
  if (!state.demandDirty) state.demandShowErrors = false;
  updateDemandDirtyState();
}

function updateDemandDirtyState() {
  let dirty = false;
  for (const [shiftId, stands] of Object.entries(state.demandDraft ?? {})) {
    for (const [standId, raw] of Object.entries(stands ?? {})) {
      if (String(raw) !== String(getDemandValue(shiftId, standId))) {
        dirty = true;
        break;
      }
    }
    if (dirty) break;
  }
  state.demandDirty = dirty;
  updateDemandToolbar();
}

function updateDemandToolbar() {
  const save = $("demand-save");
  const badge = $("demand-dirty");
  const reset = $("demand-reset-all");
  const available = hasDemandMatrix() && Object.keys(state.shifts).length > 0;
  if (save) save.disabled = !available || !state.demandDirty;
  if (reset) reset.disabled = !available;
  if (badge) badge.hidden = !state.demandDirty;
}

function demandInputSelector(shiftId, standId) {
  return `[data-demand-input][data-shift-id="${CSS.escape(shiftId)}"][data-stand-id="${CSS.escape(standId)}"]`;
}

function updateDemandInputStyles() {
  for (const input of qsa("[data-demand-input]")) {
    const raw = input.value;
    const valid = validateDemand(raw).valid;
    const saved = String(getDemandValue(input.dataset.shiftId, input.dataset.standId));
    input.classList.toggle("is-dirty", raw !== saved);
    input.classList.toggle(
      "is-invalid",
      state.demandShowErrors ? !valid : raw !== "" && !valid
    );
  }
}

function createStandIcon(stand, className = "stand-icon") {
  const box = createEl("span", className);
  box.append(icon(stand?.icon, "icon icon-sm"));
  applyTone(box, stand?.color);
  return box;
}

function renderDemand() {
  const content = $("demand-content");
  const empty = $("demand-empty");
  const thead = $("demand-thead");
  const tbody = $("demand-tbody");
  const cards = $("demand-cards");
  if (!content || !empty || !thead || !tbody || !cards) return;

  const shifts = sortedShifts();
  const stands = sortedStands();
  const available = shifts.length > 0 && stands.length > 0;

  setHidden(empty, available);
  setHidden(content, !available);
  updateDemandToolbar();

  if (!available) {
    clearElement(thead);
    clearElement(tbody);
    clearElement(cards);
    const error = $("demand-error");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    return;
  }

  clearElement(thead);
  clearElement(tbody);
  clearElement(cards);

  const headRow = createEl("tr");
  const corner = createEl("th", "", "Stand");
  corner.scope = "col";
  headRow.append(corner);

  for (const [, shift] of shifts) {
    const cell = createEl("th");
    cell.scope = "col";
    cell.append(document.createTextNode(String(shift?.name ?? "Schicht")));
    cell.append(
      createEl("span", "", formatTimeRange(shift?.start, shift?.end) || "Keine Zeit")
    );
    headRow.append(cell);
  }
  thead.append(headRow);

  for (const [standId, stand] of stands) {
    const row = createEl("tr");
    const labelCell = createEl("td");
    const label = createEl("div", "row-label");
    label.append(createStandIcon(stand));
    label.append(createEl("span", "", String(stand?.name ?? "Stand")));
    label.append(groupBadge(stand, { className: "group-badge" }));
    labelCell.append(label);
    row.append(labelCell);

    for (const [shiftId, shift] of shifts) {
      const cell = createEl("td");
      const input = createEl("input");
      input.type = "number";
      input.min = "0";
      input.max = "20";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = draftValue(shiftId, standId);
      input.dataset.demandInput = "true";
      input.dataset.shiftId = shiftId;
      input.dataset.standId = standId;
      input.setAttribute(
        "aria-label",
        `Bedarf für ${stand?.name ?? "Stand"} in ${shift?.name ?? "Schicht"}`
      );
      cell.append(input);
      row.append(cell);
    }
    tbody.append(row);
  }

  for (const [shiftId, shift] of shifts) {
    const card = createEl("div", "demand-card");
    card.append(createEl("h3", "", String(shift?.name ?? "Schicht")));
    card.append(
      createEl("p", "", formatTimeRange(shift?.start, shift?.end) || "Keine Zeit angegeben")
    );

    for (const [standId, stand] of stands) {
      const row = createEl("label", "demand-row");
      const label = createEl("span", "demand-row-label");
      label.append(createStandIcon(stand));
      label.append(document.createTextNode(String(stand?.name ?? "Stand")));
      row.append(label);

      const input = createEl("input");
      input.type = "number";
      input.min = "0";
      input.max = "20";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = draftValue(shiftId, standId);
      input.dataset.demandInput = "true";
      input.dataset.shiftId = shiftId;
      input.dataset.standId = standId;
      input.setAttribute(
        "aria-label",
        `Bedarf für ${stand?.name ?? "Stand"} in ${shift?.name ?? "Schicht"}`
      );
      row.append(input);
      card.append(row);
    }
    cards.append(card);
  }

  updateDemandInputStyles();
}

function handleDemandInput(event) {
  const input = event.target.closest("[data-demand-input]");
  if (!input) return;

  const { shiftId, standId } = input.dataset;
  if (!state.demandDraft[shiftId]) state.demandDraft[shiftId] = {};
  state.demandDraft[shiftId][standId] = input.value;

  for (const twin of qsa(demandInputSelector(shiftId, standId))) {
    if (twin !== input) twin.value = input.value;
  }

  const error = $("demand-error");
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  state.demandShowErrors = false;

  updateDemandDirtyState();
  updateDemandInputStyles();
}

function resetDemandDraftToZero() {
  for (const input of qsa("[data-demand-input]")) {
    input.value = "0";
    const { shiftId, standId } = input.dataset;
    if (!state.demandDraft[shiftId]) state.demandDraft[shiftId] = {};
    state.demandDraft[shiftId][standId] = "0";
  }
  state.demandShowErrors = false;
  const error = $("demand-error");
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  updateDemandDirtyState();
  updateDemandInputStyles();
}

function validateDemandDraft() {
  const values = {};
  let firstInvalid = null;
  let invalidCount = 0;

  state.demandShowErrors = true;

  for (const [shiftId, stands] of Object.entries(state.demandDraft ?? {})) {
    values[shiftId] = {};
    for (const [standId, raw] of Object.entries(stands ?? {})) {
      const result = validateDemand(raw);
      values[shiftId][standId] = result.valid ? result.value : 0;
      if (!result.valid) {
        invalidCount += 1;
        if (!firstInvalid) firstInvalid = qs(demandInputSelector(shiftId, standId));
      }
    }
  }

  updateDemandInputStyles();

  const error = $("demand-error");
  if (error) {
    if (invalidCount > 0) {
      error.textContent = `Bitte korrigieren Sie ${invalidCount === 1 ? "das markierte Feld" : `die ${invalidCount} markierten Felder`}. Der Bedarf muss eine ganze Zahl zwischen 0 und 20 sein.`;
      error.hidden = false;
    } else {
      error.hidden = true;
      error.textContent = "";
    }
  }

  if (firstInvalid) firstInvalid.focus();
  return { valid: invalidCount === 0, values };
}

function collectDemandReductions(values) {
  const reductions = [];

  for (const [shiftId, stands] of Object.entries(values ?? {})) {
    for (const [standId, newDemand] of Object.entries(stands ?? {})) {
      const oldDemand = getDemandValue(shiftId, standId);
      if (newDemand >= oldDemand) continue;

      const entries = Object.entries(assignmentSlots(shiftId, standId))
        .filter(([index]) => {
          const slot = Number(index);
          return Number.isInteger(slot) && slot >= 0 && slot >= newDemand;
        })
        .map(([index, record]) => ({
          slotIndex: Number(index),
          record,
          name: isObject(record) && typeof record.name === "string" ? record.name : ""
        }))
        .sort((a, b) => a.slotIndex - b.slotIndex);

      if (entries.length > 0) {
        reductions.push({ shiftId, standId, oldDemand, newDemand, entries });
      }
    }
  }

  return reductions;
}

function demandReductionMessage(reductions) {
  const lines = [];
  let total = 0;

  for (const reduction of reductions) {
    const shift = state.shifts[reduction.shiftId];
    const stand = state.stands[reduction.standId];
    total += reduction.entries.length;
    const names = reduction.entries
      .slice(0, 4)
      .map((entry) => entry.name || "unbenannt")
      .join(", ");
    const more = reduction.entries.length > 4 ? ` und ${reduction.entries.length - 4} weitere` : "";
    lines.push(
      `${shift?.name ?? "Schicht"} · ${stand?.name ?? "Stand"}: ${reduction.entries.length} ${reduction.entries.length === 1 ? "Eintrag wird" : "Einträge werden"} gelöscht (${names}${more}).`
    );
  }

  return [
    `Durch die Verringerung des Bedarfs werden insgesamt ${total} ${total === 1 ? "Helfer-Eintrag" : "Helfer-Einträge"} gelöscht:`,
    ...lines,
    "Diese Einträge sind danach endgültig entfernt. Bitte prüfen Sie die betroffenen Plätze vor dem Speichern."
  ];
}

async function handleDemandSave() {
  if (state.demandDirty === false) return;

  const validation = validateDemandDraft();
  if (!validation.valid) return;

  const reductions = collectDemandReductions(validation.values);
  if (reductions.length > 0) {
    const confirmed = await confirmAction({
      title: "Bedarf reduzieren?",
      message: demandReductionMessage(reductions),
      confirmLabel: "Bedarf speichern",
      danger: true
    });
    if (!confirmed) return;
  }

  const button = $("demand-save");
  setButtonBusy(button, true, "Wird gespeichert …");

  const demandUpdates = {};
  const assignmentUpdates = {};
  const auditTasks = [];
  let removedAssignments = 0;

  for (const [shiftId, stands] of Object.entries(validation.values)) {
    for (const [standId, newDemand] of Object.entries(stands)) {
      demandUpdates[`${shiftId}/${standId}`] = newDemand;
      const oldDemand = getDemandValue(shiftId, standId);
      if (oldDemand !== newDemand) {
        auditTasks.push(
          writeAudit({
            action: "update",
            entity: "demand",
            entityId: `${shiftId}/${standId}`,
            shiftId,
            standId,
            oldValue: { demand: oldDemand },
            newValue: { demand: newDemand }
          })
        );
      }
    }
  }

  for (const reduction of reductions) {
    for (const entry of reduction.entries) {
      assignmentUpdates[`${reduction.shiftId}/${reduction.standId}/${entry.slotIndex}`] = null;
      removedAssignments += 1;
      auditTasks.push(
        writeAudit({
          action: "delete",
          entity: "assignment",
          entityId: `${reduction.shiftId}/${reduction.standId}/${entry.slotIndex}`,
          shiftId: reduction.shiftId,
          standId: reduction.standId,
          slotIndex: entry.slotIndex,
          oldValue: entry.record,
          newValue: null
        })
      );
    }
  }

  try {
    await update(ref(db, "demand"), demandUpdates);

    if (Object.keys(assignmentUpdates).length > 0) {
      await update(ref(db, "assignments"), assignmentUpdates);
    }

    await Promise.all(auditTasks);

    const nextDemand = cloneData(state.demand) ?? {};
    for (const [shiftId, stands] of Object.entries(validation.values)) {
      nextDemand[shiftId] = { ...(isObject(nextDemand[shiftId]) ? nextDemand[shiftId] : {}), ...stands };
    }
    state.demand = nextDemand;

    if (Object.keys(assignmentUpdates).length > 0) {
      const nextAssignments = cloneData(state.assignments) ?? {};
      for (const path of Object.keys(assignmentUpdates)) {
        const [shiftId, standId, slotIndex] = path.split("/");
        if (nextAssignments?.[shiftId]?.[standId]) {
          delete nextAssignments[shiftId][standId][slotIndex];
        }
      }
      state.assignments = nextAssignments;
    }

    state.demandDirty = false;
    state.demandShowErrors = false;
    syncDemandDraft();
    renderDemand();
    markWriteSuccess();
    showToast(
      removedAssignments > 0
        ? `Bedarf gespeichert. ${removedAssignments} ${removedAssignments === 1 ? "überzähliger Eintrag wurde" : "überzählige Einträge wurden"} gelöscht.`
        : "Bedarf gespeichert.",
      "success"
    );
  } catch (error) {
    reportWriteError(error, "Der Bedarf konnte nicht vollständig gespeichert werden.");
  } finally {
    setButtonBusy(button, false);
    updateDemandToolbar();
  }
}

/* --------------------------------------------------------------------------
   Übersicht und Datenprüfung
   -------------------------------------------------------------------------- */

function renderDashboard() {
  const stats = statsForData();
  const setText = (id, value) => {
    const element = $(id);
    if (element) element.textContent = String(value);
  };

  setText("stat-stands", Object.keys(state.stands).length);
  setText("stat-shifts", Object.keys(state.shifts).length);
  setText("stat-groups", Object.keys(state.groups).length);
  setText("stat-filled", stats.filled);
  setText("stat-free", stats.missing);

  const needsOnboarding =
    !state.configLoaded ||
    Object.keys(state.stands).length === 0 ||
    Object.keys(state.shifts).length === 0 ||
    !state.config.clubName ||
    !state.config.eventName ||
    !state.config.eventDate ||
    !state.config.eventLocation;
  setHidden($("dashboard-onboarding"), !needsOnboarding);

  const issues = collectIntegrityIssues();
  const warningPanel = $("dashboard-warnings");
  const warningText = $("dashboard-warning-text");

  if (issues.total === 0) {
    setHidden(warningPanel, true);
    if (warningText) warningText.textContent = "";
  } else {
    setHidden(warningPanel, false);
    if (warningText) {
      const parts = [];
      if (issues.assignmentPaths.length > 0) {
        parts.push(
          `${issues.assignmentPaths.length} verwaiste oder ungültige ${issues.assignmentPaths.length === 1 ? "Helfer-Eintrag" : "Helfer-Einträge"}`
        );
      }
      if (issues.demandPaths.length > 0) {
        parts.push(
          `${issues.demandPaths.length} ungültige ${issues.demandPaths.length === 1 ? "Bedarfseintrag" : "Bedarfseinträge"}`
        );
      }
      if (issues.standGroupPaths.length > 0) {
        parts.push(
          `${issues.standGroupPaths.length} ungültige ${issues.standGroupPaths.length === 1 ? "Gruppenverweis" : "Gruppenverweise"}`
        );
      }
      warningText.textContent = `${issues.total} ${issues.total === 1 ? "Auffälligkeit" : "Auffälligkeiten"} gefunden: ${parts.join(", ")}. Die Datenprüfung kann die betroffenen Einträge bereinigen.`;
    }
  }

  renderWriteWarning();
}

function collectIntegrityIssues() {
  const assignmentPaths = [];
  const demandPaths = [];
  const standGroupPaths = [];

  for (const [shiftId, stands] of Object.entries(state.assignments ?? {})) {
    if (!state.shifts[shiftId]) {
      assignmentPaths.push(shiftId);
      continue;
    }
    if (!isObject(stands)) {
      assignmentPaths.push(shiftId);
      continue;
    }

    for (const [standId, slots] of Object.entries(stands)) {
      if (!state.stands[standId]) {
        assignmentPaths.push(`${shiftId}/${standId}`);
        continue;
      }
      if (!isSlotCollection(slots)) {
        assignmentPaths.push(`${shiftId}/${standId}`);
        continue;
      }
      const demand = getDemandValue(shiftId, standId);
      for (const [index, record] of Object.entries(slots)) {
        const slot = Number(index);
        const validRecord =
          isObject(record) &&
          typeof record.name === "string" &&
          record.name.trim().length >= 2 &&
          record.name.trim().length <= 60 &&
          Number.isFinite(Number(record.createdAt)) &&
          Number.isFinite(Number(record.updatedAt));
        if (!Number.isInteger(slot) || slot < 0 || slot >= demand || !validRecord) {
          assignmentPaths.push(`${shiftId}/${standId}/${index}`);
        }
      }
    }
  }

  for (const [shiftId, stands] of Object.entries(state.demand ?? {})) {
    if (!state.shifts[shiftId]) {
      demandPaths.push(shiftId);
      continue;
    }
    if (!isObject(stands)) {
      demandPaths.push(shiftId);
      continue;
    }
    for (const [standId, value] of Object.entries(stands)) {
      const number = Number(value);
      if (
        !state.stands[standId] ||
        !Number.isInteger(number) ||
        number < 0 ||
        number > 20
      ) {
        demandPaths.push(`${shiftId}/${standId}`);
      }
    }
  }

  for (const [standId, stand] of Object.entries(state.stands ?? {})) {
    if (stand?.groupId && !state.groups[stand.groupId]) {
      standGroupPaths.push(standId);
    }
  }

  return {
    assignmentPaths,
    demandPaths,
    standGroupPaths,
    total: assignmentPaths.length + demandPaths.length + standGroupPaths.length
  };
}

function describeIntegrityPath(path, type) {
  const parts = String(path).split("/");
  const shiftId = parts[0];
  const standId = parts[1];
  const slot = parts[2];
  const shift = state.shifts[shiftId];
  const stand = state.stands[standId];

  if (type === "standGroup") {
    return `Stand „${state.stands[path]?.name ?? path}“ verweist auf eine nicht vorhandene Gruppe.`;
  }

  if (type === "demand") {
    if (!standId) return `Bedarf für unbekannte Schicht „${shift?.name ?? shiftId}“.`;
    return `Bedarf für „${stand?.name ?? standId}“ in „${shift?.name ?? shiftId}“ ist ungültig oder verwaist.`;
  }

  if (!standId) return `Helfer-Einträge für unbekannte Schicht „${shift?.name ?? shiftId}“.`;
  if (slot === undefined) {
    return `Helfer-Einträge für unbekannten Stand „${stand?.name ?? standId}“ in „${shift?.name ?? shiftId}“.`;
  }
  return `Platz ${Number(slot) + 1} bei „${stand?.name ?? standId}“ in „${shift?.name ?? shiftId}“ ist ungültig oder außerhalb des Bedarfs.`;
}

async function runIntegrityCheck() {
  const issues = collectIntegrityIssues();
  if (issues.total === 0) {
    showToast("Keine Auffälligkeiten gefunden. Die Daten sind konsistent.", "success");
    return;
  }

  const lines = [];
  const addLines = (paths, type) => {
    for (const path of paths.slice(0, 6)) {
      lines.push(describeIntegrityPath(path, type));
    }
    if (paths.length > 6) {
      lines.push(`… und ${paths.length - 6} weitere in dieser Kategorie.`);
    }
  };
  addLines(issues.assignmentPaths, "assignment");
  addLines(issues.demandPaths, "demand");
  addLines(issues.standGroupPaths, "standGroup");

  await confirmAction({
    title: "Daten prüfen und bereinigen?",
    message: [
      `Es wurden ${issues.total} ${issues.total === 1 ? "Auffälligkeit" : "Auffälligkeiten"} gefunden:`,
      ...lines,
      "Beim Bereinigen werden ausschließlich die betroffenen ungültigen Einträge entfernt. Gültige Helfer-Einträge bleiben erhalten.",
      "Bitte laden Sie vorher bei Bedarf den CSV-Export herunter."
    ],
    confirmLabel: "Bereinigen",
    danger: true,
    onConfirm: async () => {
      try {
        await writeAudit({
          action: "reset",
          entity: "config",
          entityId: "integrity_check",
          oldValue: {
            assignments: issues.assignmentPaths.length,
            demand: issues.demandPaths.length,
            groupRefs: issues.standGroupPaths.length
          },
          newValue: null
        });

        const operations = [];
        if (issues.assignmentPaths.length > 0) {
          operations.push(
            update(
              ref(db, "assignments"),
              Object.fromEntries(issues.assignmentPaths.map((path) => [path, null]))
            )
          );
        }
        if (issues.demandPaths.length > 0) {
          operations.push(
            update(
              ref(db, "demand"),
              Object.fromEntries(issues.demandPaths.map((path) => [path, null]))
            )
          );
        }
        if (issues.standGroupPaths.length > 0) {
          operations.push(
            update(
              ref(db, "stands"),
              Object.fromEntries(issues.standGroupPaths.map((path) => [`${path}/groupId`, null]))
            )
          );
        }

        await Promise.all(operations);
        markWriteSuccess();
        showToast("Datenprüfung abgeschlossen. Ungültige Einträge wurden bereinigt.", "success");
      } catch (error) {
        reportWriteError(error, "Die Daten konnten nicht vollständig bereinigt werden.");
        throw new Error(
          "Die Daten konnten nicht vollständig bereinigt werden. Bitte versuchen Sie es erneut."
        );
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Export und Druck
   -------------------------------------------------------------------------- */

function collectExportRows() {
  const rows = [];

  for (const [shiftId, shift] of sortedShifts()) {
    for (const [standId, stand] of sortedStands()) {
      const demand = getDemandValue(shiftId, standId);
      if (demand <= 0) continue;
      const slots = assignmentSlots(shiftId, standId);
      const group = groupForStand(state.groups, stand);

      for (let slotIndex = 0; slotIndex < demand; slotIndex += 1) {
        const record = slots[String(slotIndex)];
        const name =
          isObject(record) && typeof record.name === "string" ? record.name.trim() : "";
        rows.push({
          shiftId,
          shiftName: String(shift?.name ?? "Schicht"),
          time: formatTimeRange(shift?.start, shift?.end),
          standId,
          standName: String(stand?.name ?? "Stand"),
          groupName: group?.name ?? "Ohne Gruppe",
          slot: slotIndex + 1,
          name,
          status: name ? "belegt" : "frei"
        });
      }
    }
  }

  return rows;
}

function renderExportSummary() {
  const summary = $("export-summary");
  if (!summary) return;

  if (!state.configLoaded) {
    summary.textContent = "Noch keine Daten geladen.";
    return;
  }

  const rows = collectExportRows();
  const filled = rows.filter((row) => row.status === "belegt").length;
  const free = rows.length - filled;
  const date = formatEventDate(state.config.eventDate);
  const parts = [
    `${sortedShifts().length} ${sortedShifts().length === 1 ? "Schicht" : "Schichten"}`,
    `${sortedStands().length} ${sortedStands().length === 1 ? "Stand" : "Stände"}`,
    `${rows.length} ${rows.length === 1 ? "Platz" : "Plätze"}`,
    `${filled} belegt`,
    `${free} frei`
  ];

  summary.textContent = parts.join(" · ");
  if (date) summary.append(document.createTextNode(` · ${date}`));
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const rows = collectExportRows();
  const header = ["Schicht", "Zeit", "Stand", "Gruppe", "Platz", "Name", "Status"];
  const lines = [header.join(";")];

  for (const row of rows) {
    lines.push(
      [
        row.shiftName,
        row.time,
        row.standName,
        row.groupName,
        String(row.slot),
        row.name,
        row.status
      ]
        .map(escapeCsvField)
        .join(";")
    );
  }

  const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
  const date = String(state.config.eventDate || "").trim();
  const filename = date ? `helferplan_${date}.csv` : "helferplan.csv";
  downloadFile(csv, filename, "text/csv;charset=utf-8");
  showToast("CSV-Export erstellt.", "success");
}

function exportJson() {
  const config = { ...state.config };
  delete config.adminSalt;
  delete config.adminHash;

  const backup = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    event: config,
    groups: cloneData(state.groups),
    shifts: cloneData(state.shifts),
    stands: cloneData(state.stands),
    demand: cloneData(state.demand),
    assignments: cloneData(state.assignments)
  };

  const date = String(state.config.eventDate || "").trim();
  const filename = date ? `helferplan-sicherung_${date}.json` : "helferplan-sicherung.json";
  downloadFile(JSON.stringify(backup, null, 2), filename, "application/json;charset=utf-8");
  showToast("JSON-Sicherung erstellt. Admin-Zugangsdaten sind nicht enthalten.", "success");
}

function preparePrintView() {
  const header = $("print-header");
  const thead = $("print-thead");
  const tbody = $("print-tbody");
  const generated = $("print-generated");
  if (!header || !thead || !tbody || !generated) return;

  const shifts = sortedShifts();
  const stands = sortedStands();

  clearElement(header);
  header.className = "print-header";
  header.append(createEl("h1", "", String(state.config.eventName || "Helferplan")));
  header.append(createEl("p", "", displayClubName(state.config.clubName)));
  const metaParts = [formatEventDate(state.config.eventDate), state.config.eventLocation].filter(
    Boolean
  );
  if (metaParts.length > 0) header.append(createEl("p", "", metaParts.join(" · ")));
  header.append(createEl("p", "print-meta", "Helferliste – Stände je Schicht"));

  clearElement(thead);
  const headRow = createEl("tr");
  const corner = createEl("th", "print-corner", "Stand");
  corner.scope = "col";
  headRow.append(corner);

  for (const [, shift] of shifts) {
    const cell = createEl("th", "print-shift");
    cell.scope = "col";
    cell.append(createEl("span", "print-shift-name", String(shift?.name ?? "Schicht")));
    cell.append(
      createEl("span", "print-shift-time", formatTimeRange(shift?.start, shift?.end) || "Keine Zeit")
    );
    headRow.append(cell);
  }
  thead.append(headRow);

  clearElement(tbody);
  let total = 0;
  let filled = 0;

  if (stands.length === 0 || shifts.length === 0) {
    const row = createEl("tr");
    const cell = createEl(
      "td",
      "print-empty-row",
      stands.length === 0 ? "Keine Stände vorhanden." : "Keine Schichten vorhanden."
    );
    cell.colSpan = Math.max(1, shifts.length + 1);
    row.append(cell);
    tbody.append(row);
  } else {
    for (const [standId, stand] of stands) {
      const row = createEl("tr");
      const label = createEl("th", "print-stand");
      label.scope = "row";
      label.append(createEl("span", "print-stand-name", String(stand?.name ?? "Stand")));
      const group = groupForStand(state.groups, stand);
      if (group) label.append(createEl("span", "print-stand-group", group.name));
      row.append(label);

      for (const [shiftId] of shifts) {
        const demand = getDemandValue(shiftId, standId);
        const slots = assignmentSlots(shiftId, standId);
        const cell = createEl("td", "print-slots");

        if (demand <= 0) {
          cell.append(createEl("span", "print-no-demand", "–"));
        } else {
          for (let slotIndex = 0; slotIndex < demand; slotIndex += 1) {
            const record = slots[String(slotIndex)];
            const name =
              isObject(record) && typeof record.name === "string" ? record.name.trim() : "";
            total += 1;
            if (name) {
              filled += 1;
              cell.append(createEl("span", "print-slot print-slot--filled", name));
            } else {
              cell.append(createEl("span", "print-slot print-slot--free", "frei"));
            }
          }
        }

        row.append(cell);
      }
      tbody.append(row);
    }
  }

  const free = total - filled;
  generated.textContent = `${filled} von ${total} Plätzen belegt · ${free} frei · Erstellt am ${formatDateTime(Date.now())} Uhr`;
}

function printHelferList() {
  preparePrintView();
  window.setTimeout(() => window.print(), 60);
}

/* --------------------------------------------------------------------------
   Zurücksetzen
   -------------------------------------------------------------------------- */

function resetLocalAfterEntries() {
  state.assignments = {};
  state.writeWarning = "";
  renderWriteWarning();
}

async function resetEntries() {
  const includeAudit = Boolean($("reset-entries-audit")?.checked);

  await confirmAction({
    title: "Einträge zurücksetzen?",
    message: [
      "Alle Helfer-Einträge werden endgültig gelöscht. Veranstaltung, Stände, Schichten, Gruppen und Bedarf bleiben erhalten.",
      includeAudit
        ? "Das Audit-Log wird ebenfalls vollständig gelöscht."
        : "Das Audit-Log bleibt erhalten; vor dem Löschen wird ein Reset-Eintrag geschrieben.",
      "Bitte laden Sie vorher den CSV-Export herunter, falls Sie die aktuellen Einträge noch benötigen."
    ],
    confirmLabel: "Einträge zurücksetzen",
    danger: true,
    onConfirm: async () => {
      try {
        if (!includeAudit) {
          await writeAudit({
            action: "reset",
            entity: "config",
            entityId: "assignments",
            oldValue: null,
            newValue: null
          });
        }

        await remove(ref(db, "assignments"));
        if (includeAudit) {
          await remove(ref(db, "audit_log"));
        }

        resetLocalAfterEntries();
        markWriteSuccess();
        showToast("Alle Helfer-Einträge wurden zurückgesetzt.", "success");
      } catch (error) {
        reportWriteError(error, "Die Einträge konnten nicht vollständig zurückgesetzt werden.");
        throw new Error(
          "Die Einträge konnten nicht vollständig zurückgesetzt werden. Bitte versuchen Sie es erneut und nutzen Sie die Datenprüfung."
        );
      }
    }
  });
}

async function resetConfiguration() {
  await confirmAction({
    title: "Konfiguration zurücksetzen?",
    message: [
      "Helfer-Einträge, Bedarf, Stände, Schichten und Gruppen werden endgültig gelöscht.",
      "Veranstaltungsdaten, Admin-Passwort und Audit-Log bleiben erhalten.",
      "Bitte laden Sie vorher den CSV-Export herunter, falls Sie die aktuelle Planung noch benötigen."
    ],
    confirmLabel: "Konfiguration zurücksetzen",
    danger: true,
    onConfirm: async () => {
      try {
        await writeAudit({
          action: "reset",
          entity: "config",
          entityId: "configuration",
          oldValue: null,
          newValue: null
        });

        await Promise.all([
          remove(ref(db, "assignments")),
          remove(ref(db, "demand")),
          remove(ref(db, "stands")),
          remove(ref(db, "shifts")),
          remove(ref(db, "groups"))
        ]);

        closeStandEditor();
        closeShiftEditor();
        closeGroupEditor();
        state.assignments = {};
        state.demand = {};
        state.stands = {};
        state.shifts = {};
        state.groups = {};
        state.demandDraft = {};
        state.demandDirty = false;
        state.demandShowErrors = false;
        markWriteSuccess();
        renderAll();
        showToast("Konfiguration zurückgesetzt. Veranstaltungsdaten und Passwort bleiben erhalten.", "success");
      } catch (error) {
        reportWriteError(error, "Die Konfiguration konnte nicht vollständig zurückgesetzt werden.");
        throw new Error(
          "Die Konfiguration konnte nicht vollständig zurückgesetzt werden. Bitte versuchen Sie es erneut und nutzen Sie anschließend die Datenprüfung."
        );
      }
    }
  });
}

async function resetEverything() {
  await confirmAction({
    title: "Wirklich alles löschen?",
    message: [
      "Alle Event-Daten werden endgültig gelöscht: Veranstaltungsdaten, Admin-Passwort, Stände, Schichten, Gruppen, Bedarf, Helfer-Einträge und Audit-Log.",
      "Danach erscheint die Erstvergabe und Sie müssen ein neues Admin-Passwort festlegen.",
      "Diese Aktion kann nicht rückgängig gemacht werden. Bitte laden Sie vorher den CSV-Export herunter."
    ],
    confirmLabel: "Alles löschen",
    danger: true,
    requireText: "ALLES LÖSCHEN",
    requireTextLabel: "Zur Bestätigung „ALLES LÖSCHEN“ eingeben",
    onConfirm: async () => {
      stopDataSubscriptions();
      clearAdminSession();
      state.inAdmin = false;
      state.config = {};
      state.configLoaded = false;
      state.groups = {};
      state.shifts = {};
      state.stands = {};
      state.demand = {};
      state.assignments = {};
      state.demandDraft = {};
      state.demandDirty = false;
      state.demandShowErrors = false;
      state.eventDirty = false;
      state.writeWarning = "";
      closeStandEditor();
      closeShiftEditor();
      closeGroupEditor();
      showAuth("setup");
      updateAdminLabels();

      const results = await Promise.allSettled([
        remove(ref(db, "config")),
        remove(ref(db, "groups")),
        remove(ref(db, "shifts")),
        remove(ref(db, "stands")),
        remove(ref(db, "demand")),
        remove(ref(db, "assignments")),
        remove(ref(db, "audit_log"))
      ]);

      const failed = results.filter((result) => result.status === "rejected");
      failed.forEach((result) => console.error("Löschen beim vollständigen Reset fehlgeschlagen.", result.reason));

      if (failed.length > 0) {
        showToast(
          "Einige Daten konnten nicht gelöscht werden. Bitte versuchen Sie es erneut.",
          "error"
        );
      } else {
        showToast("Alle Daten wurden gelöscht. Bitte richten Sie den Admin-Zugang neu ein.", "success");
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Rendern und Ereignisse
   -------------------------------------------------------------------------- */

function scheduleRender() {
  if (!state.inAdmin || state.renderScheduled) return;
  state.renderScheduled = true;
  window.requestAnimationFrame(() => {
    state.renderScheduled = false;
    if (state.inAdmin) renderAll();
  });
}

function renderAll() {
  if (!state.inAdmin) return;
  updateAdminLabels();
  renderDashboard();
  renderGroupOptions();
  renderStands();
  renderShifts();
  renderGroups();
  renderDemand();
  renderExportSummary();
}

function bindEvents() {
  const signal = state.listenerAbort.signal;

  for (const button of qsa("#admin-nav [data-section]")) {
    button.addEventListener("click", () => activateSection(button.dataset.section), { signal });
  }

  for (const button of qsa("[data-goto]")) {
    button.addEventListener("click", () => activateSection(button.dataset.goto), { signal });
  }

  $("admin-logout")?.addEventListener("click", logoutAdmin, { signal });
  $("admin-nav-logout")?.addEventListener("click", logoutAdmin, { signal });

  $("setup-form")?.addEventListener("submit", handleSetupSubmit, { signal });
  $("login-form")?.addEventListener("submit", handleLoginSubmit, { signal });
  $("password-form")?.addEventListener("submit", handlePasswordSubmit, { signal });
  $("event-form")?.addEventListener("submit", handleEventSubmit, { signal });
  $("event-cancel")?.addEventListener("click", () => populateEventForm(true), { signal });

  $("forgot-link")?.addEventListener(
    "click",
    () => openModal("recovery-dialog", { opener: $("forgot-link") }),
    { signal }
  );

  for (const [id] of EVENT_FIELDS) {
    const input = $(id);
    input?.addEventListener(
      "input",
      () => {
        updateEventPreview();
        updateEventDirty();
        setFieldError(input, $(`${id}-error`), "");
      },
      { signal }
    );
  }

  for (const [inputId, errorId] of [
    ["setup-password", "setup-password-error"],
    ["setup-repeat", "setup-repeat-error"],
    ["login-password", "login-password-error"],
    ["password-current", "password-current-error"],
    ["password-new", "password-new-error"],
    ["password-repeat", "password-repeat-error"]
  ]) {
    const input = $(inputId);
    input?.addEventListener(
      "input",
      () => {
        setFieldError(input, $(errorId), "");
        if (inputId === "login-password") {
          const loginError = $("login-error");
          if (loginError) loginError.hidden = true;
        }
      },
      { signal }
    );
  }

  $("stand-add")?.addEventListener("click", () => openStandEditor(), { signal });
  $("stand-form")?.addEventListener("submit", handleStandSubmit, { signal });
  $("stand-form-close")?.addEventListener("click", closeStandEditor, { signal });
  $("stand-cancel")?.addEventListener("click", closeStandEditor, { signal });
  $("stand-name")?.addEventListener(
    "input",
    () => {
      updateStandPreview();
      setFieldError($("stand-name"), $("stand-name-error"), "");
    },
    { signal }
  );
  for (const id of ["stand-icon", "stand-color", "stand-group"]) {
    $(id)?.addEventListener("change", updateStandPreview, { signal });
  }

  $("stands-list")?.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "up") moveEntity("stands", id, -1);
      else if (button.dataset.action === "down") moveEntity("stands", id, 1);
      else if (button.dataset.action === "edit") openStandEditor(id);
      else if (button.dataset.action === "delete") deleteStand(id);
    },
    { signal }
  );

  $("shift-add")?.addEventListener("click", () => openShiftEditor(), { signal });
  $("shift-form")?.addEventListener("submit", handleShiftSubmit, { signal });
  $("shift-form-close")?.addEventListener("click", closeShiftEditor, { signal });
  $("shift-cancel")?.addEventListener("click", closeShiftEditor, { signal });
  for (const id of ["shift-name", "shift-start", "shift-end"]) {
    $(id)?.addEventListener(
      "input",
      () => {
        updateShiftOverlapWarning();
        setFieldError($(id), $(`${id}-error`), "");
      },
      { signal }
    );
  }

  $("shifts-list")?.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "up") moveEntity("shifts", id, -1);
      else if (button.dataset.action === "down") moveEntity("shifts", id, 1);
      else if (button.dataset.action === "edit") openShiftEditor(id);
      else if (button.dataset.action === "delete") deleteShift(id);
    },
    { signal }
  );

  $("group-add")?.addEventListener("click", () => openGroupEditor(), { signal });
  $("group-form")?.addEventListener("submit", handleGroupSubmit, { signal });
  $("group-form-close")?.addEventListener("click", closeGroupEditor, { signal });
  $("group-cancel")?.addEventListener("click", closeGroupEditor, { signal });
  $("group-name")?.addEventListener(
    "input",
    () => {
      updateGroupPreview();
      setFieldError($("group-name"), $("group-name-error"), "");
    },
    { signal }
  );
  $("group-color")?.addEventListener("change", updateGroupPreview, { signal });

  $("groups-list")?.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "up") moveEntity("groups", id, -1);
      else if (button.dataset.action === "down") moveEntity("groups", id, 1);
      else if (button.dataset.action === "edit") openGroupEditor(id);
      else if (button.dataset.action === "delete") deleteGroup(id);
    },
    { signal }
  );

  $("demand-content")?.addEventListener("input", handleDemandInput, { signal });
  $("demand-reset-all")?.addEventListener("click", resetDemandDraftToZero, { signal });
  $("demand-save")?.addEventListener("click", handleDemandSave, { signal });

  $("run-integrity-check")?.addEventListener("click", runIntegrityCheck, { signal });
  $("print-button")?.addEventListener("click", printHelferList, { signal });
  $("csv-button")?.addEventListener("click", exportCsv, { signal });
  $("json-button")?.addEventListener("click", exportJson, { signal });

  $("reset-entries-button")?.addEventListener("click", resetEntries, { signal });
  $("reset-config-button")?.addEventListener("click", resetConfiguration, { signal });
  $("reset-all-button")?.addEventListener("click", resetEverything, { signal });

  window.addEventListener(
    "hashchange",
    () => {
      if (!state.inAdmin) return;
      const section = normalizeSection(window.location.hash.replace(/^#/, ""));
      if (section) activateSection(section, { updateHash: false });
    },
    { signal }
  );

  window.addEventListener(
    "beforeunload",
    (event) => {
      if (!state.eventDirty && !state.demandDirty) return;
      event.preventDefault();
      event.returnValue = "";
    },
    { signal }
  );
}

function initAdmin() {
  initConfirmDialog();
  setupModal("recovery-dialog");
  bindEvents();
  startSessionWatchers();

  if (backendMode === "error" || initError) {
    showFatalError(
      "Der Admin-Bereich konnte nicht geladen werden.",
      "Bitte laden Sie die Seite neu."
    );
    return;
  }

  subscribeConfig();

  window.setTimeout(() => {
    if (state.configLoaded || state.inAdmin) return;
    showFatalError(
      "Das Laden dauert zu lange.",
      "Bitte laden Sie die Seite neu."
    );
  }, 15000);
}

initAdmin();

