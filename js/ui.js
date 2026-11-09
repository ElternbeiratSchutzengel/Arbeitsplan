/**
 * Gemeinsame UI-Bausteine
 * =======================
 * Formatierung, Farb-/Icon-Mapping, Dialoge, Toasts und Session-Helfer.
 */

/* --------------------------------------------------------------------------
   Formatierung
   -------------------------------------------------------------------------- */

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin"
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin"
});

export function formatEventDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}

export function formatDateTime(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "";
  return dateTimeFormatter.format(date);
}

export function formatTimeRange(start, end, { withUhr = true } = {}) {
  if (!start || !end) return "";
  return `${start} – ${end}${withUhr ? " Uhr" : ""}`;
}

export function initials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join("").toLocaleUpperCase("de");
  }

  const first = Array.from(words[0])[0] ?? "";
  const last = Array.from(words[words.length - 1])[0] ?? "";
  return `${first}${last}`.toLocaleUpperCase("de");
}

export function displayClubName(clubName) {
  return String(clubName ?? "").trim() || "Verein";
}

export function plural(count, singular, pluralForm) {
  return Number(count) === 1 ? singular : pluralForm;
}

export function groupForStand(groups, stand) {
  if (!stand?.groupId) return null;
  return groups?.[stand.groupId] ?? null;
}

export function groupLabel(groups, stand) {
  return groupForStand(groups, stand)?.name ?? "Ohne Gruppe";
}

export function canonicalPageUrl() {
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return window.location.href.split(/[?#]/)[0];
  }
}

export function sortByOrder(entries) {
  return Object.entries(entries ?? {}).sort(([idA, a], [idB, b]) => {
    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    const nameCompare = String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "de");
    if (nameCompare !== 0) return nameCompare;
    return String(idA).localeCompare(String(idB), "de");
  });
}

/* --------------------------------------------------------------------------
   Farben & Icons
   -------------------------------------------------------------------------- */

export const COLORS = {
  sky: {
    label: "Blau",
    bg: "#F0F9FF",
    border: "#E0F2FE",
    text: "#0369A1",
    avatar: "#174A73"
  },
  teal: {
    label: "Türkis",
    bg: "#F0FDFA",
    border: "#CCFBF1",
    text: "#0F766E",
    avatar: "#0F766E"
  },
  indigo: {
    label: "Indigo",
    bg: "#EEF2FF",
    border: "#E0E7FF",
    text: "#4338CA",
    avatar: "#4338CA"
  },
  rose: {
    label: "Rot",
    bg: "#FFF1F2",
    border: "#FFE4E6",
    text: "#BE123C",
    avatar: "#BE123C"
  },
  amber: {
    label: "Gelb",
    bg: "#FFFBEB",
    border: "#FDE68A",
    text: "#B45309",
    avatar: "#B45309"
  },
  violet: {
    label: "Lila",
    bg: "#F5F3FF",
    border: "#EDE9FE",
    text: "#6D28D9",
    avatar: "#6D28D9"
  },
  emerald: {
    label: "Grün",
    bg: "#ECFDF5",
    border: "#D1FAE5",
    text: "#047857",
    avatar: "#047857"
  },
  slate: {
    label: "Grau",
    bg: "#F1F5F9",
    border: "#E2E8F0",
    text: "#475569",
    avatar: "#334155"
  }
};

export const ICON_NAMES = new Set([
  "flame",
  "beer",
  "cash",
  "cake",
  "droplet",
  "coffee",
  "music",
  "ticket",
  "salad",
  "star",
  "users",
  "heart"
]);

export const ICON_LABELS = {
  flame: "Flamme",
  beer: "Bierglas",
  cash: "Geldschein",
  cake: "Kuchen",
  droplet: "Tropfen",
  coffee: "Kaffeetasse",
  music: "Note",
  ticket: "Ticket",
  salad: "Salat",
  star: "Stern",
  users: "Personen",
  heart: "Herz"
};

export const COLOR_LABELS = Object.fromEntries(
  Object.entries(COLORS).map(([key, value]) => [key, value.label])
);

export function colorFor(key) {
  return COLORS[key] ?? COLORS.slate;
}

export function applyTone(element, colorKey) {
  const tone = colorFor(colorKey);
  element.style.setProperty("--tone-bg", tone.bg);
  element.style.setProperty("--tone-border", tone.border);
  element.style.setProperty("--tone-text", tone.text);
  element.style.setProperty("--tone-avatar", tone.avatar);
}

export function icon(name, className = "icon") {
  const safeName = ICON_NAMES.has(name) ? name : "star";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${safeName}`);
  svg.append(use);
  return svg;
}

export function uiIcon(name, className = "icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

/* --------------------------------------------------------------------------
   DOM-Helfer
   -------------------------------------------------------------------------- */

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function createEl(tag, className = "", text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = text;
  return element;
}

export function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

export function setFieldError(input, errorElement, message) {
  if (input) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
  if (errorElement) {
    errorElement.textContent = message || "";
  }
}

export function clearFieldError(input, errorElement) {
  setFieldError(input, errorElement, "");
}

/* --------------------------------------------------------------------------
   Session
   -------------------------------------------------------------------------- */

export const ADMIN_SESSION_KEY = "helferplan.admin.session";
export const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readAdminSession() {
  const raw = readStorage(window.sessionStorage, ADMIN_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object") return null;
    return session;
  } catch {
    return null;
  }
}

export function isAdminSessionValid() {
  const session = readAdminSession();
  if (!session?.authenticated) return false;
  const lastActivity = Number(session.lastActivity);
  if (!Number.isFinite(lastActivity)) return false;
  return Date.now() - lastActivity < ADMIN_SESSION_TTL_MS;
}

export function startAdminSession() {
  const session = { authenticated: true, lastActivity: Date.now() };
  writeStorage(window.sessionStorage, ADMIN_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function touchAdminSession() {
  if (!isAdminSessionValid()) return false;
  const session = { authenticated: true, lastActivity: Date.now() };
  writeStorage(window.sessionStorage, ADMIN_SESSION_KEY, JSON.stringify(session));
  return true;
}

export function clearAdminSession() {
  removeStorage(window.sessionStorage, ADMIN_SESSION_KEY);
}

/* --------------------------------------------------------------------------
   Toasts
   -------------------------------------------------------------------------- */

const TOAST_ICONS = {
  success: "check",
  error: "alert",
  info: "info"
};

export function showToast(message, type = "success", { duration = 4500 } = {}) {
  const region = document.getElementById("toast-region");
  if (!region) return;

  const toast = createEl("div", `toast toast--${type}`);
  toast.append(uiIcon(TOAST_ICONS[type] ?? "info", "icon icon-sm"));
  toast.append(createEl("span", "", message));
  region.append(toast);

  while (region.children.length > 3) {
    region.firstElementChild?.remove();
  }

  const remove = () => {
    if (!toast.isConnected || toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 190);
  };

  const timer = window.setTimeout(remove, duration);
  toast.addEventListener("click", () => {
    window.clearTimeout(timer);
    remove();
  });
}

/* --------------------------------------------------------------------------
   Dialoge
   -------------------------------------------------------------------------- */

const modalConfigs = new Map();
const modalStack = [];
let viewportSyncInitialized = false;
let viewportSyncTimer = 0;

/**
 * Hält die Dialogebene exakt auf dem sichtbaren Viewport.
 * Auf Mobilgeräten schrumpft beim Öffnen der Tastatur nur der visualViewport,
 * nicht aber das Layout-Viewport. Ohne diesen Abgleich läge die Aktionsleiste
 * des Dialogs hinter der Tastatur.
 */
function syncModalViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  const top = viewport ? viewport.offsetTop : 0;

  root.style.setProperty("--visual-viewport-height", `${Math.max(0, Math.round(height))}px`);
  root.style.setProperty("--visual-viewport-top", `${Math.max(0, Math.round(top))}px`);
}

function scheduleModalViewportSync() {
  syncModalViewport();
  window.clearTimeout(viewportSyncTimer);
  // Tastaturen werden animiert ein-/ausgeblendet. Ein kurzer Nachlauf stellt
  // sicher, dass die Dialogebene auch danach exakt sitzt.
  viewportSyncTimer = window.setTimeout(syncModalViewport, 300);
}

function ensureModalViewportSync() {
  syncModalViewport();
  if (viewportSyncInitialized) return;
  viewportSyncInitialized = true;

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncModalViewport, { passive: true });
    window.visualViewport.addEventListener("scroll", syncModalViewport, { passive: true });
  }

  window.addEventListener("resize", syncModalViewport, { passive: true });
  window.addEventListener("orientationchange", syncModalViewport, { passive: true });
  document.addEventListener("focusin", scheduleModalViewportSync, { passive: true });
  document.addEventListener("focusout", scheduleModalViewportSync, { passive: true });
}

export function setupModal(id, { onRequestClose = null } = {}) {
  const layer = document.getElementById(id);
  if (!layer) return;

  const existing = modalConfigs.get(id);
  if (existing) {
    if (onRequestClose) existing.onRequestClose = onRequestClose;
    return;
  }

  const config = { onRequestClose, closeTimer: null, opener: null };
  modalConfigs.set(id, config);

  const closeTargets = layer.querySelectorAll(`[data-close="${CSS.escape(id)}"]`);
  closeTargets.forEach((target) => {
    target.addEventListener("click", (event) => {
      if (target.classList.contains("modal-backdrop") && event.target !== target) return;
      requestCloseModal(id);
    });
  });
}

export function openModal(id, { opener = document.activeElement, focusSelector = null } = {}) {
  const layer = document.getElementById(id);
  if (!layer) return;
  if (!modalConfigs.has(id)) setupModal(id);

  const config = modalConfigs.get(id);
  if (config.closeTimer) {
    window.clearTimeout(config.closeTimer);
    config.closeTimer = null;
  }

  if (modalStack.includes(id)) {
    focusModal(id, focusSelector);
    return;
  }

  config.opener = opener instanceof HTMLElement ? opener : document.activeElement;
  ensureModalViewportSync();
  layer.hidden = false;
  layer.classList.remove("is-open");
  // Reflow erzwingen, damit die Einblend-Animation startet.
  void layer.offsetWidth;
  layer.classList.add("is-open");

  for (const openId of modalStack) {
    const openLayer = document.getElementById(openId);
    if (openLayer) {
      openLayer.setAttribute("aria-hidden", "true");
      openLayer.inert = true;
    }
  }

  modalStack.push(id);
  document.body.classList.add("has-modal");
  document.addEventListener("keydown", handleGlobalKeydown);

  focusModal(id, focusSelector);
}

export function requestCloseModal(id) {
  const config = modalConfigs.get(id);
  if (!config) {
    closeModal(id);
    return;
  }
  if (typeof config.onRequestClose === "function") {
    config.onRequestClose();
  } else {
    closeModal(id);
  }
}

export function closeModal(id, { restoreFocus = true } = {}) {
  const layer = document.getElementById(id);
  const config = modalConfigs.get(id);
  if (!layer || !config) return;

  const index = modalStack.indexOf(id);
  if (index === -1) {
    layer.hidden = true;
    return;
  }

  modalStack.splice(index, 1);
  layer.classList.remove("is-open");
  layer.setAttribute("aria-hidden", "true");

  if (config.closeTimer) window.clearTimeout(config.closeTimer);
  config.closeTimer = window.setTimeout(() => {
    if (!modalStack.includes(id)) layer.hidden = true;
    config.closeTimer = null;
  }, 210);

  const nextId = modalStack[modalStack.length - 1];
  if (nextId) {
    const nextLayer = document.getElementById(nextId);
    if (nextLayer) {
      nextLayer.removeAttribute("aria-hidden");
      nextLayer.inert = false;
    }
  } else {
    document.body.classList.remove("has-modal");
    document.removeEventListener("keydown", handleGlobalKeydown);
  }

  if (nextId) {
    if (restoreFocus) focusModal(nextId);
  } else if (restoreFocus && config.opener && config.opener.isConnected) {
    config.opener.focus({ preventScroll: true });
  }

  config.opener = null;
}

export function isModalOpen(id) {
  return modalStack.includes(id);
}

export function getTopModal() {
  return modalStack[modalStack.length - 1] ?? null;
}

function focusModal(id, focusSelector = null) {
  const layer = document.getElementById(id);
  if (!layer) return;

  window.requestAnimationFrame(() => {
    if (modalStack[modalStack.length - 1] !== id) return;
    const modal = layer.querySelector(".modal");
    let target = null;

    if (focusSelector) {
      target = modal?.querySelector(focusSelector) ?? null;
    }
    if (!target) {
      target = modal?.querySelector("[data-autofocus]") ?? null;
    }
    if (!target) {
      target = getFocusable(modal)[0] ?? null;
    }
    target?.focus({ preventScroll: true });
  });
}

function handleGlobalKeydown(event) {
  const topId = modalStack[modalStack.length - 1];
  if (!topId) return;
  const layer = document.getElementById(topId);
  const modal = layer?.querySelector(".modal");
  if (!modal) return;

  if (event.key === "Escape") {
    event.preventDefault();
    requestCloseModal(topId);
    return;
  }

  if (event.key === "Tab") {
    const focusable = getFocusable(modal);
    if (focusable.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !modal.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}

function getFocusable(root) {
  if (!root) return [];
  const selector = [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled):not([type='hidden'])",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  return Array.from(root.querySelectorAll(selector)).filter((element) => {
    return (
      element instanceof HTMLElement &&
      element.offsetParent !== null &&
      !element.closest("[hidden]")
    );
  });
}

/* --------------------------------------------------------------------------
   Bestätigungsdialog
   -------------------------------------------------------------------------- */

let confirmResolve = null;
let confirmState = null;
let confirmInitialized = false;

export function initConfirmDialog() {
  if (confirmInitialized) return;
  const modal = document.getElementById("confirm-dialog");
  const submit = document.getElementById("confirm-submit");
  const cancel = document.getElementById("confirm-cancel");
  if (!modal || !submit || !cancel) return;

  confirmInitialized = true;

  setupModal("confirm-dialog", {
    onRequestClose: () => {
      if (confirmState?.busy) return;
      finishConfirm(false);
    }
  });

  submit.addEventListener("click", async () => {
    if (!confirmState || confirmState.busy) return;

    const state = confirmState;
    const textInput = document.getElementById("confirm-text");
    const textError = document.getElementById("confirm-text-error");

    if (state.requireText) {
      if (String(textInput?.value ?? "") !== state.requireText) {
        setFieldError(textInput, textError, `Bitte geben Sie „${state.requireText}“ exakt ein.`);
        textInput?.focus();
        return;
      }
      setFieldError(textInput, textError, "");
    }

    state.busy = true;
    setConfirmBusy(true);

    try {
      if (typeof state.onConfirm === "function") {
        await state.onConfirm();
      }
      finishConfirm(true);
    } catch (error) {
      console.error("Bestätigte Aktion fehlgeschlagen.", error);
      state.busy = false;
      setConfirmBusy(false);
      showConfirmError(error?.message || "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut.");
    }
  });

  cancel.addEventListener("click", () => {
    if (confirmState?.busy) return;
    finishConfirm(false);
  });
}

export function confirmAction({
  title = "Bestätigen",
  message = "",
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  danger = false,
  requireText = "",
  requireTextLabel = "Bestätigung",
  onConfirm = null
} = {}) {
  initConfirmDialog();

  if (confirmState) {
    // Vorherigen Dialog sauber abschließen.
    finishConfirm(false);
  }

  const titleElement = document.getElementById("confirm-title");
  const messageElement = document.getElementById("confirm-message");
  const submit = document.getElementById("confirm-submit");
  const cancel = document.getElementById("confirm-cancel");
  const textWrap = document.getElementById("confirm-text-wrap");
  const textInput = document.getElementById("confirm-text");
  const textLabel = document.getElementById("confirm-text-label");
  const textError = document.getElementById("confirm-text-error");
  const errorBox = document.getElementById("confirm-error");

  if (titleElement) titleElement.textContent = title;
  renderConfirmMessage(messageElement, message);

  if (submit) {
    submit.textContent = confirmLabel;
    submit.dataset.label = confirmLabel;
    submit.className = danger ? "btn btn-danger" : "btn btn-primary";
    submit.disabled = false;
  }
  if (cancel) cancel.textContent = cancelLabel;
  if (errorBox) {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  if (textWrap) textWrap.hidden = !requireText;
  if (requireText) {
    if (textLabel) textLabel.textContent = requireTextLabel;
    if (textInput) {
      textInput.value = "";
      textInput.disabled = false;
      textInput.setAttribute("aria-invalid", "false");
    }
    if (textError) textError.textContent = "";
  }
  if (cancel) cancel.disabled = false;

  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmState = {
      busy: false,
      requireText,
      onConfirm
    };

    openModal("confirm-dialog", {
      opener: document.activeElement,
      focusSelector: requireText ? "#confirm-text" : "#confirm-cancel"
    });
  });
}

function finishConfirm(result) {
  if (!confirmResolve) return;
  const resolve = confirmResolve;
  confirmResolve = null;
  confirmState = null;
  setConfirmBusy(false);
  closeModal("confirm-dialog");
  resolve(result);
}

function setConfirmBusy(busy) {
  const submit = document.getElementById("confirm-submit");
  const cancel = document.getElementById("confirm-cancel");
  const textInput = document.getElementById("confirm-text");

  if (submit) {
    submit.disabled = busy;
    submit.textContent = busy ? "Wird ausgeführt …" : submit.dataset.label || "Bestätigen";
  }
  if (cancel) cancel.disabled = busy;
  if (textInput) textInput.disabled = busy;
}

function showConfirmError(message) {
  const errorBox = document.getElementById("confirm-error");
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function renderConfirmMessage(container, message) {
  if (!container) return;
  clearElement(container);

  if (message instanceof Node) {
    container.append(message);
    return;
  }

  if (Array.isArray(message)) {
    for (const part of message) {
      if (part instanceof Node) container.append(part);
      else container.append(createEl("p", "", String(part)));
    }
    return;
  }

  const paragraphs = String(message ?? "").split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    container.append(createEl("p", "", paragraph));
  }
}

/* --------------------------------------------------------------------------
   Hilfen für Formulare
   -------------------------------------------------------------------------- */

export function setButtonBusy(button, busy, busyLabel = "Wird gespeichert …") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent.trim();
    }
    button.disabled = true;
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

export function scrollIntoViewSoft(element) {
  if (!element) return;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

export function focusBySelector(selector, root = document) {
  const element = root.querySelector(selector);
  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true });
    return true;
  }
  return false;
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}
