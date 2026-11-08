/**
 * Helfer-Ansicht
 * ==============
 * Öffentlicher Schichtplan mit Echtzeit-Synchronisation, Filtern,
 * Dialog zum Eintragen/Bearbeiten/Löschen und WhatsApp-Teilen.
 */

import {
  backendMode,
  initError,
  db,
  ref,
  onValue,
  get,
  runTransaction,
  push,
  update
} from "./firebase.js";

import {
  formatEventDate,
  formatTimeRange,
  initials,
  clubWithEV,
  plural,
  groupForStand,
  canonicalPageUrl,
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
  showToast,
  setupModal,
  openModal,
  closeModal,
  confirmAction,
  initConfirmDialog,
  setButtonBusy
} from "./ui.js";

import {
  validateName,
  validateText,
  validateEventDate,
  normalizeWhitespace,
  namesEqual
} from "./validation.js";

const state = {
  config: null,
  groups: {},
  shifts: {},
  stands: {},
  demand: {},
  assignments: {},
  loaded: new Set(),
  loadError: null,
  connection: true,
  hasConnected: false,
  wasOffline: false,
  filters: { stand: "", shift: "", group: "" },
  pendingUrlFilters: null,
  filterSignature: "",
  openFilter: null,
  pendingWrites: new Map(),
  eventDialogBusy: false,
  offlineQueue: [],
  processingQueue: false,
  reportedOrphans: new Set(),
  unsubs: [],
  renderScheduled: false,
  slotDialog: null,
  focusSlotKey: null,
  initialized: false
};

const DATA_PATHS = [
  ["config", "config"],
  ["groups", "groups"],
  ["shifts", "shifts"],
  ["stands", "stands"],
  ["demand", "demand"],
  ["assignments", "assignments"]
];

const SLOT_PATH = (shiftId, standId, slotIndex) =>
  `assignments/${shiftId}/${standId}/${slotIndex}`;

const SLOT_KEY = (shiftId, standId, slotIndex) => `${shiftId}/${standId}/${slotIndex}`;

const LOAD_TIMEOUT_MS = 15000;

const EVENT_FORM_FIELDS = [
  ["event-club", "event-club-error"],
  ["event-name", "event-name-error"],
  ["event-date", "event-date-error"],
  ["event-location", "event-location-error"],
  ["event-tagline", "event-tagline-error"]
];

/* --------------------------------------------------------------------------
   Start
   -------------------------------------------------------------------------- */

init();

function init() {
  if (state.initialized) return;
  state.initialized = true;

  if (backendMode === "demo") {
    const banner = qs("#demo-banner");
    if (banner) banner.hidden = false;
  }

  bindStaticEvents();
  setupStaticDialogs();

  state.pendingUrlFilters = readFiltersFromUrl();

  if (backendMode === "error") {
    showLoadError(initError);
    return;
  }

  subscribeConnection();
  subscribeData();
  window.setTimeout(checkInitialLoad, LOAD_TIMEOUT_MS);
}

function checkInitialLoad() {
  if (state.loadError) return;
  if (DATA_PATHS.every(([key]) => state.loaded.has(key))) return;
  showLoadError(new Error("Zeitüberschreitung beim Laden der Datenbank."));
}

function bindStaticEvents() {
  qs("#filter-reset")?.addEventListener("click", resetFilters);
  qs("#empty-filter-reset")?.addEventListener("click", resetFilters);
  qs("#error-retry")?.addEventListener("click", retryLoading);
  qs("#event-start-btn")?.addEventListener("click", openEventDialog);
  qs("#footer-privacy-link")?.addEventListener("click", () => {
    openModal("privacy-dialog", { opener: document.activeElement });
  });

  qs("#whatsapp-link")?.addEventListener("click", (event) => {
    const link = event.currentTarget;
    if (link.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      showToast("Der Plan ist noch nicht vollständig eingerichtet.", "info");
    }
  });

  for (const name of ["stand", "shift", "group"]) {
    const button = qs(`#filter-${name}-btn`);
    button?.addEventListener("click", () => toggleFilterMenu(name));
    button?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openFilterMenu(name, true);
      } else if (event.key === "Escape") {
        closeFilterMenus();
      }
    });

    const menu = qs(`#filter-${name}-menu`);
    menu?.addEventListener("keydown", (event) => handleFilterMenuKeydown(event, name));
  }

  document.addEventListener("click", (event) => {
    if (!state.openFilter) return;
    const target = event.target;
    if (target.closest(".filter")) return;
    closeFilterMenus();
  });

  window.addEventListener("scroll", closeFilterMenus, { passive: true });
  window.addEventListener("resize", closeFilterMenus);
}

function setupStaticDialogs() {
  setupModal("privacy-dialog");
  initConfirmDialog();

  setupModal("slot-dialog", {
    onRequestClose: () => requestCloseSlotDialog()
  });

  setupModal("event-dialog", {
    onRequestClose: requestCloseEventDialog
  });

  qs("#event-form")?.addEventListener("submit", submitEventForm);

  for (const [inputId, errorId] of EVENT_FORM_FIELDS) {
    const input = qs(`#${inputId}`);
    input?.addEventListener("input", () => {
      setFieldError(input, qs(`#${errorId}`), "");
      const formError = qs("#event-form-error");
      if (formError) formError.hidden = true;
    });
  }

  qs("#slot-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSlotDialog();
  });

  qs("#slot-name")?.addEventListener("input", () => {
    validateSlotInput({ touched: true });
  });

  qs("#slot-name")?.addEventListener("blur", () => {
    validateSlotInput({ touched: true });
  });

  qs("#slot-refresh")?.addEventListener("click", refreshSlotDialog);
  qs("#slot-delete")?.addEventListener("click", deleteSlotFromDialog);
}

/* --------------------------------------------------------------------------
   Firebase-Abonnements
   -------------------------------------------------------------------------- */

function subscribeConnection() {
  const unsubscribe = onValue(
    ref(db, ".info/connected"),
    (snapshot) => {
      const connected = snapshot.val() === true;
      const previous = state.connection;
      state.connection = connected;
      updateConnectionUi();

      if (!connected) {
        // Der erste Verbindungsaufbau meldet kurz „false“, bevor die
        // Firebase-Verbindung steht. Das ist kein Verbindungsabbruch.
        if (state.hasConnected) state.wasOffline = true;
      } else {
        state.hasConnected = true;
        if (previous === false && state.wasOffline) {
          showToast("Verbindung wiederhergestellt. Änderungen werden synchronisiert.", "success");
          processOfflineQueue();
        }
      }
    },
    (error) => {
      console.error("Verbindungsstatus konnte nicht abonniert werden.", error);
    }
  );

  state.unsubs.push(unsubscribe);
}

function subscribeData() {
  for (const [key, path] of DATA_PATHS) {
    const unsubscribe = onValue(
      ref(db, path),
      (snapshot) => {
        state[key] = snapshot.val() ?? {};
        state.loaded.add(key);
        scheduleRender();
      },
      (error) => {
        console.error(`Datenpfad „${path}“ konnte nicht geladen werden.`, error);
        showLoadError(error);
      }
    );
    state.unsubs.push(unsubscribe);
  }
}

function retryLoading() {
  if (backendMode === "error") {
    window.location.reload();
    return;
  }

  unsubscribeAll();
  state.loaded.clear();
  state.loadError = null;
  state.reportedOrphans.clear();
  clearElement(qs("#shift-list"));
  renderSkeleton();
  qs("#error-state").hidden = true;
  qs("#empty-state").hidden = true;
  qs("#empty-filter-state").hidden = true;
  qs("#event-start").hidden = true;
  qs("#plan-content").hidden = false;
  subscribeConnection();
  subscribeData();
}

function unsubscribeAll() {
  for (const unsubscribe of state.unsubs) {
    try {
      unsubscribe();
    } catch {
      /* ignore */
    }
  }
  state.unsubs = [];
}

function showLoadError(error) {
  state.loadError = error ?? new Error("Unbekannter Ladefehler");
  const errorState = qs("#error-state");
  const errorMessage = qs("#error-message");
  if (errorMessage) {
    errorMessage.textContent =
      "Bitte prüfe deine Verbindung und versuche es erneut. Wenn der Fehler bleibt, wende dich an den Admin.";
  }
  if (errorState) errorState.hidden = false;

  const list = qs("#shift-list");
  if (list) {
    clearElement(list);
    list.setAttribute("aria-busy", "false");
  }
  qs("#empty-state")?.setAttribute("hidden", "");
  qs("#empty-filter-state")?.setAttribute("hidden", "");
  qs("#event-start")?.setAttribute("hidden", "");
  qs("#plan-content")?.removeAttribute("hidden");
}

/* --------------------------------------------------------------------------
   Rendern
   -------------------------------------------------------------------------- */

function scheduleRender() {
  if (state.renderScheduled) return;
  state.renderScheduled = true;
  window.requestAnimationFrame(() => {
    state.renderScheduled = false;
    render();
  });
}

function render() {
  if (state.loadError) {
    showLoadError(state.loadError);
    return;
  }

  const allLoaded = DATA_PATHS.every(([key]) => state.loaded.has(key));
  if (!allLoaded) {
    renderHeader();
    updateConnectionUi();
    return;
  }

  document.body.classList.remove("is-loading");

  const eventExists = hasConfiguredEvent();
  applyEventVisibility(eventExists);
  renderHeader();
  updateAdminLinkLabel();
  updateConnectionUi();

  if (!eventExists) {
    const badge = qs("#brand-club");
    if (badge) badge.textContent = "Neue Veranstaltung";
    const footer = qs("#footer-club");
    if (footer) footer.textContent = "Helferplan";
    return;
  }

  renderFilters();
  renderPlan();
  renderShare();
}

function hasConfiguredEvent() {
  const config = state.config ?? {};
  return Boolean(
    String(config.eventName ?? "").trim() && String(config.eventDate ?? "").trim()
  );
}

function applyEventVisibility(eventExists) {
  const start = qs("#event-start");
  const hero = qs("#hero");
  const filterBar = qs("#filter-bar");
  const planContent = qs("#plan-content");

  if (start) start.hidden = eventExists;
  if (hero) hero.hidden = !eventExists;
  if (filterBar) filterBar.hidden = !eventExists;
  if (planContent) planContent.hidden = !eventExists;
}

function renderHeader() {
  const config = state.config ?? {};
  const clubName = String(config.clubName ?? "").trim() || "Verein";
  const eventName = String(config.eventName ?? "").trim() || "Vereinsfest";
  const tagline = String(config.tagline ?? "").trim();
  const dateLabel = formatEventDate(config.eventDate);
  const locationLabel = String(config.eventLocation ?? "").trim();

  qs("#brand-club").textContent = clubName;
  qs("#hero-eyebrow").textContent = `${eventName} · ${clubName}`;
  qs("#hero-title").textContent = tagline || eventName;
  qs("#hero-date").textContent = dateLabel || "Datum folgt";
  qs("#hero-location").textContent = locationLabel || "Ort folgt";
  qs("#footer-club").textContent = `Helferplan · ${clubWithEV(clubName)}`;

  const stats = computeStats();
  const count = qs("#progress-count");
  const missing = qs("#progress-missing");
  const track = qs("#progress-track");
  const fill = qs("#progress-fill");

  if (count) {
    clearElement(count);
    count.append(document.createTextNode(String(stats.filled)));
    const total = createEl("span", "total", `/${stats.total}`);
    count.append(total);
  }

  if (missing) {
    if (stats.total === 0) {
      missing.textContent = "Noch keine Plätze konfiguriert";
    } else if (stats.missing === 0) {
      missing.textContent = "Alle Plätze belegt";
    } else if (stats.missing === 1) {
      missing.textContent = "1 Helfer fehlt noch";
    } else {
      missing.textContent = `${stats.missing} Helfer fehlen noch`;
    }
  }

  if (track && fill) {
    if (stats.total === 0) {
      track.hidden = true;
      track.setAttribute("aria-valuemax", "0");
      track.setAttribute("aria-valuenow", "0");
      track.setAttribute("aria-valuetext", "Noch keine Plätze konfiguriert");
      fill.style.width = "0%";
    } else {
      track.hidden = false;
      track.setAttribute("aria-valuemax", String(stats.total));
      track.setAttribute("aria-valuenow", String(stats.filled));
      track.setAttribute(
        "aria-valuetext",
        `${stats.filled} von ${stats.total} Plätzen belegt, ${stats.missing} ${plural(stats.missing, "Helfer fehlt", "Helfer fehlen")}`
      );
      fill.style.width = `${Math.round((stats.filled / stats.total) * 100)}%`;
    }
  }

  const fullBanner = qs("#full-banner");
  if (fullBanner) fullBanner.hidden = !(stats.total > 0 && stats.missing === 0);
}

function renderFilters() {
  const groupsExist = Object.keys(state.groups ?? {}).length > 0;

  if (state.pendingUrlFilters) {
    state.filters = validateFilters(state.pendingUrlFilters);
    state.pendingUrlFilters = null;
  } else {
    state.filters = validateFilters(state.filters);
  }

  const signature = JSON.stringify({
    stands: sortByOrder(state.stands).map(([id, stand]) => [id, stand.name]),
    shifts: sortByOrder(state.shifts).map(([id, shift]) => [id, shift.name]),
    groups: groupsExist
      ? sortByOrder(state.groups).map(([id, group]) => [id, group.name])
      : []
  });

  if (signature !== state.filterSignature) {
    const wasOpen = state.openFilter;
    closeFilterMenus();
    buildFilterMenu("stand", [
      { value: "", label: "Alle" },
      ...sortByOrder(state.stands).map(([id, stand]) => ({ value: id, label: stand.name || "Stand" }))
    ]);
    buildFilterMenu("shift", [
      { value: "", label: "Alle" },
      ...sortByOrder(state.shifts).map(([id, shift]) => ({ value: id, label: shift.name || "Schicht" }))
    ]);
    buildFilterMenu("group", [
      { value: "", label: "Alle" },
      ...sortByOrder(state.groups).map(([id, group]) => ({ value: id, label: group.name || "Gruppe" })),
      { value: "__none__", label: "Ohne Gruppe" }
    ]);
    state.filterSignature = signature;
    if (wasOpen) openFilterMenu(wasOpen);
  }

  const groupWrap = qs("#filter-group-wrap");
  if (groupWrap) groupWrap.hidden = !groupsExist;
  if (!groupsExist) state.filters.group = "";

  qs("#filter-stand-value").textContent =
    labelForFilter("stand", state.filters.stand) || "Alle";
  qs("#filter-shift-value").textContent =
    labelForFilter("shift", state.filters.shift) || "Alle";
  if (groupsExist) {
    qs("#filter-group-value").textContent =
      labelForFilter("group", state.filters.group) || "Alle";
  }

  const hasActive = Boolean(state.filters.stand || state.filters.shift || state.filters.group);
  const reset = qs("#filter-reset");
  if (reset) reset.disabled = !hasActive;

  const inner = qs("#filter-inner");
  const loading = qs("#filter-loading");
  if (inner) inner.hidden = false;
  if (loading) loading.hidden = true;

  for (const name of ["stand", "shift", "group"]) {
    const menu = qs(`#filter-${name}-menu`);
    if (!menu) continue;
    for (const option of qsa('[role="option"]', menu)) {
      option.setAttribute("aria-selected", option.dataset.value === state.filters[name] ? "true" : "false");
    }
  }
}

function buildFilterMenu(name, options) {
  const menu = qs(`#filter-${name}-menu`);
  if (!menu) return;
  clearElement(menu);

  for (const option of options) {
    const item = createEl("li", "filter-option", option.label);
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "-1");
    item.setAttribute("aria-selected", option.value === state.filters[name] ? "true" : "false");
    item.dataset.value = option.value;
    item.addEventListener("click", () => selectFilter(name, option.value));
    menu.append(item);
  }
}

function labelForFilter(name, value) {
  if (!value) return "Alle";
  if (name === "group" && value === "__none__") return "Ohne Gruppe";
  const collection =
    name === "stand" ? state.stands : name === "shift" ? state.shifts : state.groups;
  return collection?.[value]?.name ?? "";
}

function selectFilter(name, value) {
  state.filters[name] = value;
  closeFilterMenus();
  updateFiltersInUrl();
  scheduleRender();
}

function toggleFilterMenu(name) {
  if (state.openFilter === name) closeFilterMenus();
  else openFilterMenu(name);
}

function openFilterMenu(name, focusFirst = false) {
  const menu = qs(`#filter-${name}-menu`);
  const button = qs(`#filter-${name}-btn`);
  if (!menu || !button) return;

  closeFilterMenus();
  state.openFilter = name;
  menu.hidden = false;
  menu.classList.add("is-floating");
  button.setAttribute("aria-expanded", "true");

  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 12;
  const left = Math.max(
    margin,
    Math.min(buttonRect.left, window.innerWidth - menuRect.width - margin)
  );
  const top = Math.max(
    margin,
    Math.min(buttonRect.bottom + 4, window.innerHeight - menuRect.height - margin)
  );
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  const selected = menu.querySelector('[aria-selected="true"]');
  const target = focusFirst
    ? menu.querySelector('[role="option"]')
    : selected || menu.querySelector('[role="option"]');
  target?.focus({ preventScroll: true });
}

function closeFilterMenus() {
  if (!state.openFilter) {
    for (const name of ["stand", "shift", "group"]) {
      const menu = qs(`#filter-${name}-menu`);
      const button = qs(`#filter-${name}-btn`);
      if (menu) {
        menu.hidden = true;
        menu.classList.remove("is-floating");
      }
      if (button) button.setAttribute("aria-expanded", "false");
    }
    return;
  }

  const name = state.openFilter;
  const menu = qs(`#filter-${name}-menu`);
  const button = qs(`#filter-${name}-btn`);
  if (menu) {
    menu.hidden = true;
    menu.classList.remove("is-floating");
  }
  if (button) button.setAttribute("aria-expanded", "false");
  state.openFilter = null;
}

function handleFilterMenuKeydown(event, name) {
  const menu = qs(`#filter-${name}-menu`);
  if (!menu) return;
  const options = qsa('[role="option"]', menu);
  const currentIndex = options.indexOf(document.activeElement);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    options[Math.min(options.length - 1, currentIndex + 1)]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    options[Math.max(0, currentIndex - 1)]?.focus();
  } else if (event.key === "Home") {
    event.preventDefault();
    options[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    options[options.length - 1]?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (currentIndex >= 0) {
      selectFilter(name, options[currentIndex].dataset.value ?? "");
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeFilterMenus();
    qs(`#filter-${name}-btn`)?.focus();
  } else if (event.key === "Tab") {
    closeFilterMenus();
  }
}

function resetFilters() {
  state.filters = { stand: "", shift: "", group: "" };
  closeFilterMenus();
  updateFiltersInUrl();
  scheduleRender();
}

function readFiltersFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const groupParam = params.get("gruppe") ?? "";
    return {
      stand: params.get("stand") ?? "",
      shift: params.get("schicht") ?? "",
      group: groupParam === "ohne" ? "__none__" : groupParam
    };
  } catch {
    return { stand: "", shift: "", group: "" };
  }
}

function validateFilters(filters) {
  const next = {
    stand: state.stands?.[filters.stand] ? filters.stand : "",
    shift: state.shifts?.[filters.shift] ? filters.shift : "",
    group: ""
  };

  if (filters.group === "__none__" && Object.keys(state.groups ?? {}).length > 0) {
    next.group = "__none__";
  } else if (state.groups?.[filters.group]) {
    next.group = filters.group;
  }

  return next;
}

function updateFiltersInUrl() {
  try {
    const url = new URL(window.location.href);
    if (state.filters.stand) url.searchParams.set("stand", state.filters.stand);
    else url.searchParams.delete("stand");
    if (state.filters.shift) url.searchParams.set("schicht", state.filters.shift);
    else url.searchParams.delete("schicht");
    if (state.filters.group === "__none__") url.searchParams.set("gruppe", "ohne");
    else if (state.filters.group) url.searchParams.set("gruppe", state.filters.group);
    else url.searchParams.delete("gruppe");
    window.history.replaceState(null, "", url);
  } catch {
    /* URL-Speicherung ist optional. */
  }
}

function renderPlan() {
  const list = qs("#shift-list");
  if (!list) return;

  const activeElement = document.activeElement;
  const focusedSlot = activeElement?.closest?.("[data-slot-key]")?.dataset?.slotKey ?? null;

  clearElement(list);
  list.setAttribute("aria-busy", "false");

  const hasActive = hasAnyActiveShift();
  const emptyState = qs("#empty-state");
  const emptyFilterState = qs("#empty-filter-state");

  if (!hasActive) {
    if (emptyState) emptyState.hidden = false;
    if (emptyFilterState) emptyFilterState.hidden = true;
    state.focusSlotKey = null;
    return;
  }

  const visibleShifts = [];
  for (const [shiftId, shift] of sortByOrder(state.shifts)) {
    const stands = getStandsForShift(shiftId).filter(([, , demand, stand]) => {
      if (demand <= 0) return false;
      if (state.filters.stand && stand._id !== state.filters.stand) return false;
      if (state.filters.shift && shiftId !== state.filters.shift) return false;
      if (state.filters.group) {
        const group = groupForStand(state.groups, stand);
        if (state.filters.group === "__none__" && group) return false;
        if (state.filters.group !== "__none__" && stand.groupId !== state.filters.group) return false;
      }
      return true;
    });

    if (stands.length > 0) {
      visibleShifts.push({ shiftId, shift, stands });
    }
  }

  if (visibleShifts.length === 0) {
    if (emptyState) emptyState.hidden = true;
    if (emptyFilterState) emptyFilterState.hidden = false;
    state.focusSlotKey = null;
    return;
  }

  if (emptyState) emptyState.hidden = true;
  if (emptyFilterState) emptyFilterState.hidden = true;

  for (const { shiftId, shift, stands } of visibleShifts) {
    list.append(buildShiftCard(shiftId, shift, stands));
  }

  const focusTargetKey = state.focusSlotKey || focusedSlot;
  state.focusSlotKey = null;

  if (focusTargetKey && !document.querySelector(".modal.is-open")) {
    window.requestAnimationFrame(() => {
      const target = qs(`[data-slot-key="${CSS.escape(focusTargetKey)}"]`);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    });
  }
}

function buildShiftCard(shiftId, shift, stands) {
  const card = createEl("section", "shift-card");
  card.setAttribute("aria-labelledby", `shift-title-${shiftId}`);

  let total = 0;
  let filled = 0;
  for (const [, , demand, stand] of stands) {
    total += demand;
    filled += countFilledSlots(shiftId, stand._id, demand, { report: false });
  }
  const free = Math.max(0, total - filled);

  const head = createEl("div", "shift-head");
  const headLeft = createEl("div", "shift-head-left");
  const shiftIcon = createEl("span", "shift-icon");
  shiftIcon.append(uiIcon("clock", "icon"));
  shiftIcon.setAttribute("aria-hidden", "true");

  const titleWrap = createEl("div", "shift-title-wrap");
  const title = createEl("h3", "shift-name", shift.name || "Schicht");
  title.id = `shift-title-${shiftId}`;
  const time = createEl("p", "shift-time", formatTimeRange(shift.start, shift.end));
  titleWrap.append(title, time);
  headLeft.append(shiftIcon, titleWrap);

  const badges = createEl("div", "shift-badges");
  if (free > 0) {
    badges.append(createEl("span", "badge badge--free", `${free} frei`));
  } else {
    const full = createEl("span", "badge badge--full");
    full.append(uiIcon("check", "icon"), document.createTextNode("Vollzählig"));
    badges.append(full);
  }
  badges.append(createEl("span", "badge badge--count", `${filled}/${total} belegt`));

  head.append(headLeft, badges);
  card.append(head);

  const standList = createEl("div", "stand-list");
  for (const [, , demand, stand] of stands) {
    standList.append(buildStandBlock(shiftId, shift, stand, demand));
  }
  card.append(standList);

  return card;
}

function buildStandBlock(shiftId, shift, stand, demand) {
  const block = createEl("div", "stand-block");
  const filled = countFilledSlots(shiftId, stand._id, demand, { report: true });
  const free = Math.max(0, demand - filled);
  const group = groupForStand(state.groups, stand);

  const head = createEl("div", "stand-head");
  const left = createEl("div", "stand-head-left");

  const standIcon = createEl("span", "stand-icon");
  applyTone(standIcon, stand.color);
  standIcon.append(icon(stand.icon, "icon"));
  standIcon.setAttribute("aria-hidden", "true");

  const title = createEl("div", "stand-title");
  const titleRow = createEl("div", "stand-title-row");
  titleRow.append(createEl("h4", "stand-name", stand.name || "Stand"));

  const groupBadge = createEl("span", `group-badge${group ? "" : " group-badge--none"}`, group?.name ?? "Ohne Gruppe");
  if (group) applyTone(groupBadge, group.color);
  titleRow.append(groupBadge);

  const demandWord = demand === 1 ? "Platz" : "Plätzen";
  const occupancy = createEl("p", "stand-meta", `${filled} von ${demand} ${demandWord} belegt`);
  title.append(titleRow, occupancy);

  left.append(standIcon, title);

  const status = createEl("span", `stand-status${free === 0 ? " stand-status--full" : ""}`);
  if (free === 0) {
    status.append(uiIcon("check", "icon"), document.createTextNode("Vollzählig"));
  } else {
    const dot = createEl("span", "status-dot");
    dot.setAttribute("aria-hidden", "true");
    status.append(dot, document.createTextNode(`${free} ${plural(free, "Platz", "Plätze")} frei`));
  }

  head.append(left, status);
  block.append(head);

  const grid = createEl("div", "slots-grid");
  for (let slotIndex = 0; slotIndex < demand; slotIndex += 1) {
    grid.append(buildSlot(shiftId, shift, stand, demand, slotIndex));
  }
  block.append(grid);

  checkSurplusAssignments(shiftId, stand._id, demand);

  return block;
}

function buildSlot(shiftId, shift, stand, demand, slotIndex) {
  const key = SLOT_KEY(shiftId, stand._id, slotIndex);
  const pending = state.pendingWrites.get(key);
  const assignment = getAssignment(shiftId, stand._id, slotIndex);
  const context = `Platz ${slotIndex + 1} bei ${stand.name} in der ${shift.name}`;

  if (pending) {
    const isDelete = pending.type === "delete";
    const button = createEl("button", "slot slot--pending");
    button.type = "button";
    button.dataset.slotKey = key;
    button.dataset.shiftId = shiftId;
    button.dataset.standId = stand._id;
    button.dataset.slotIndex = String(slotIndex);
    button.dataset.pending = "true";
    button.setAttribute("aria-disabled", "true");
    button.setAttribute(
      "aria-label",
      isDelete
        ? `${context}, Löschung wird synchronisiert`
        : `${context}, belegt von ${pending.name}, wird synchronisiert`
    );

    if (isDelete) {
      const plus = createEl("span", "slot-plus");
      plus.append(uiIcon("plus", "icon icon-sm"));
      button.append(plus, createEl("span", "slot-free-text", "Freier Platz"));
      button.append(createEl("span", "slot-sync", "Wird synchronisiert"));
    } else {
      const avatar = createEl("span", "slot-avatar", initials(pending.name));
      applyTone(avatar, stand.color);
      const name = createEl("span", "slot-name", pending.name);
      name.title = pending.name;
      button.append(avatar, name);
      button.append(createEl("span", "slot-sync", "Wird synchronisiert"));
    }

    button.addEventListener("click", () => {
      showToast("Dieser Platz wird noch synchronisiert. Bitte warte einen Moment.", "info");
    });
    return button;
  }

  if (assignment) {
    const button = createEl("button", "slot slot--taken");
    button.type = "button";
    button.dataset.slotKey = key;
    button.dataset.shiftId = shiftId;
    button.dataset.standId = stand._id;
    button.dataset.slotIndex = String(slotIndex);
    button.setAttribute(
      "aria-label",
      `${context}, belegt von ${assignment.name}. Eintrag bearbeiten.`
    );

    const avatar = createEl("span", "slot-avatar", initials(assignment.name));
    applyTone(avatar, stand.color);
    avatar.setAttribute("aria-hidden", "true");

    const name = createEl("span", "slot-name", assignment.name);
    name.title = assignment.name;

    const pencil = uiIcon("pencil", "icon slot-pencil");
    const sr = createEl("span", "sr-only", "Eintrag bearbeiten");

    button.append(avatar, name, pencil, sr);
    button.addEventListener("click", () => openSlotDialog(shiftId, stand._id, slotIndex, button));
    return button;
  }

  const button = createEl("button", "slot slot--free");
  button.type = "button";
  button.dataset.slotKey = key;
  button.dataset.shiftId = shiftId;
  button.dataset.standId = stand._id;
  button.dataset.slotIndex = String(slotIndex);
  button.setAttribute("aria-label", `${context} eintragen.`);

  const plus = createEl("span", "slot-plus");
  plus.append(uiIcon("plus", "icon icon-sm"));
  button.append(
    plus,
    createEl("span", "slot-free-text", "Freier Platz"),
    createEl("span", "slot-cta", "Eintragen")
  );
  button.addEventListener("click", () => openSlotDialog(shiftId, stand._id, slotIndex, button));
  return button;
}

/* --------------------------------------------------------------------------
   Auswertung
   -------------------------------------------------------------------------- */

function computeStats() {
  let total = 0;
  let filled = 0;
  const canReport = allDataLoaded();

  for (const [shiftId, shiftDemand] of Object.entries(state.demand ?? {})) {
    if (!state.shifts?.[shiftId]) {
      if (canReport) reportReadIssue(`Bedarf für unbekannte Schicht ${shiftId}.`);
      continue;
    }
    for (const [standId, rawDemand] of Object.entries(shiftDemand ?? {})) {
      if (!state.stands?.[standId]) {
        if (canReport) reportReadIssue(`Bedarf für unbekannten Stand ${standId}.`);
        continue;
      }
      const demand = Number(rawDemand);
      if (!Number.isInteger(demand) || demand < 0) {
        if (canReport) reportReadIssue(`Ungültiger Bedarf ${rawDemand} für ${shiftId}/${standId}.`);
        continue;
      }
      total += demand;
      filled += countFilledSlots(shiftId, standId, demand, { report: canReport });
    }
  }

  return {
    total,
    filled: Math.min(filled, total),
    missing: Math.max(0, total - filled)
  };
}

function countFilledSlots(shiftId, standId, demand, { report = true } = {}) {
  const slots = state.assignments?.[shiftId]?.[standId];
  if (!slots || typeof slots !== "object") return 0;

  let count = 0;
  for (const [rawIndex, assignment] of Object.entries(slots)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= demand) {
      if (report) {
        reportReadIssue(
          `Assignment außerhalb des Bedarfs: ${shiftId}/${standId}/${rawIndex} (Bedarf ${demand}).`
        );
      }
      continue;
    }
    if (assignment && typeof assignment === "object" && typeof assignment.name === "string" && assignment.name.trim()) {
      count += 1;
    } else if (report) {
      reportReadIssue(`Assignment ohne gültigen Namen: ${shiftId}/${standId}/${rawIndex}.`);
    }
  }
  return count;
}

function checkSurplusAssignments(shiftId, standId, demand) {
  const slots = state.assignments?.[shiftId]?.[standId];
  if (!slots) return;
  for (const rawIndex of Object.keys(slots)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= demand) {
      reportReadIssue(
        `Überzähliger Eintrag wird nicht angezeigt: ${shiftId}/${standId}/${rawIndex} (Bedarf ${demand}).`
      );
    }
  }
}

function reportReadIssue(message) {
  if (state.reportedOrphans.has(message)) return;
  state.reportedOrphans.add(message);
  console.error(`[Helferplan] ${message}`);
}

function getAssignment(shiftId, standId, slotIndex) {
  const assignment = state.assignments?.[shiftId]?.[standId]?.[slotIndex];
  if (!assignment || typeof assignment !== "object") return null;
  if (typeof assignment.name !== "string" || !assignment.name.trim()) return null;
  return assignment;
}

function getDemand(shiftId, standId) {
  const raw = state.demand?.[shiftId]?.[standId];
  const demand = Number(raw);
  return Number.isInteger(demand) && demand > 0 ? demand : 0;
}

function getStandsForShift(shiftId) {
  return sortByOrder(state.stands).map(([id, stand]) => {
    const demand = getDemand(shiftId, id);
    return [id, stand, demand, { ...stand, _id: id }];
  });
}

function hasAnyActiveShift() {
  for (const shiftId of Object.keys(state.shifts ?? {})) {
    for (const standId of Object.keys(state.stands ?? {})) {
      if (getDemand(shiftId, standId) > 0) return true;
    }
  }
  return false;
}

function allDataLoaded() {
  return DATA_PATHS.every(([key]) => state.loaded.has(key));
}

/* --------------------------------------------------------------------------
   Filter-Label / Hilfen
   -------------------------------------------------------------------------- */

function updateAdminLinkLabel() {
  const text = qs("#admin-link-text");
  if (text) text.textContent = isAdminSessionValid() ? "Admin-Bereich" : "Admin";
}

function updateConnectionUi() {
  const online = state.connection;
  const banner = qs("#offline-banner");
  if (banner) banner.hidden = online;

  const status = qs("#connection-status");
  const text = qs("#connection-text");
  if (status) {
    status.classList.toggle("connection--online", online);
    status.classList.toggle("connection--offline", !online);
  }
  if (text) text.textContent = online ? "Online" : "Offline";
}

/* --------------------------------------------------------------------------
   WhatsApp
   -------------------------------------------------------------------------- */

function renderShare() {
  const link = qs("#whatsapp-link");
  if (!link) return;

  const config = state.config ?? {};
  const stats = computeStats();
  const eventName = String(config.eventName ?? "").trim();
  const eventDate = formatEventDate(config.eventDate);
  const eventLocation = String(config.eventLocation ?? "").trim();

  if (!eventName || !eventDate || !eventLocation || stats.total === 0) {
    link.setAttribute("aria-disabled", "true");
    link.classList.add("is-disabled");
    link.href = "https://wa.me/";
    return;
  }

  const url = canonicalPageUrl();
  let text;

  if (stats.missing === 0) {
    text = `Hallo zusammen! Für ${eventName} am ${eventDate} in ${eventLocation} ist der Helferplan voll. Vielen Dank an alle, die mithelfen! Hier geht's zum Plan: ${url}`;
  } else if (stats.missing === 1) {
    text = `Hallo zusammen! Für ${eventName} am ${eventDate} in ${eventLocation} wird noch 1 Helfer gesucht. Tragt euch hier ein: ${url}`;
  } else {
    text = `Hallo zusammen! Für ${eventName} am ${eventDate} in ${eventLocation} werden noch Helfer gesucht. Es fehlen noch ${stats.missing} Helfer. Tragt euch hier ein: ${url}`;
  }

  link.removeAttribute("aria-disabled");
  link.classList.remove("is-disabled");
  link.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/* --------------------------------------------------------------------------
   Veranstaltung anlegen
   -------------------------------------------------------------------------- */

function openEventDialog() {
  if (hasConfiguredEvent()) {
    showToast("Es ist bereits eine Veranstaltung angelegt.", "info");
    return;
  }

  const config = state.config ?? {};
  const values = {
    "event-club": config.clubName,
    "event-name": config.eventName,
    "event-date": config.eventDate,
    "event-location": config.eventLocation,
    "event-tagline": config.tagline
  };

  for (const [inputId, errorId] of EVENT_FORM_FIELDS) {
    const input = qs(`#${inputId}`);
    if (!input) continue;
    input.value = String(values[inputId] ?? "").trim();
    setFieldError(input, qs(`#${errorId}`), "");
  }

  const formError = qs("#event-form-error");
  if (formError) {
    formError.textContent = "";
    formError.hidden = true;
  }

  state.eventDialogBusy = false;
  setButtonBusy(qs("#event-create-submit"), false);

  const focusSelector = qs("#event-club")?.value.trim() ? "#event-name" : "#event-club";
  openModal("event-dialog", { opener: document.activeElement, focusSelector });
}

function requestCloseEventDialog() {
  if (state.eventDialogBusy) return;
  closeModal("event-dialog");
}

function setEventFormDisabled(disabled) {
  for (const [inputId] of EVENT_FORM_FIELDS) {
    const input = qs(`#${inputId}`);
    if (input) input.disabled = disabled;
  }
}

async function submitEventForm(event) {
  event.preventDefault();
  if (state.eventDialogBusy) return;

  const clubInput = qs("#event-club");
  const nameInput = qs("#event-name");
  const dateInput = qs("#event-date");
  const locationInput = qs("#event-location");
  const taglineInput = qs("#event-tagline");

  const club = validateText(clubInput?.value, { min: 1, max: 80, label: "Vereinsname" });
  const name = validateText(nameInput?.value, { min: 1, max: 80, label: "Veranstaltungsname" });
  const date = validateEventDate(dateInput?.value);
  const location = validateText(locationInput?.value, { min: 1, max: 120, label: "Ort" });
  const tagline = validateText(taglineInput?.value, {
    min: 0,
    max: 160,
    label: "Tagline",
    optional: true
  });

  const checks = [
    [clubInput, qs("#event-club-error"), club],
    [nameInput, qs("#event-name-error"), name],
    [dateInput, qs("#event-date-error"), date],
    [locationInput, qs("#event-location-error"), location],
    [taglineInput, qs("#event-tagline-error"), tagline]
  ];

  let firstInvalid = null;
  for (const [input, errorElement, result] of checks) {
    setFieldError(input, errorElement, result.error ?? "");
    if (!result.valid && !firstInvalid) firstInvalid = input;
  }

  const formError = qs("#event-form-error");
  if (firstInvalid) {
    if (formError) {
      formError.textContent = "Bitte prüfe die markierten Felder.";
      formError.hidden = false;
    }
    firstInvalid.focus();
    return;
  }
  if (formError) formError.hidden = true;

  const values = {
    clubName: club.value,
    eventName: name.value,
    eventDate: date.value,
    eventLocation: location.value,
    tagline: tagline.value
  };

  const submit = qs("#event-create-submit");
  state.eventDialogBusy = true;
  setButtonBusy(submit, true, "Wird erstellt …");
  setEventFormDisabled(true);

  try {
    await update(ref(db, "config"), values);

    state.config = { ...(state.config ?? {}), ...values };
    state.eventDialogBusy = false;
    setEventFormDisabled(false);
    closeModal("event-dialog", { restoreFocus: false });
    scheduleRender();
    showToast(
      "Veranstaltung erstellt. Jetzt können Stände und Schichten eingerichtet werden.",
      "success"
    );

    window.requestAnimationFrame(() => {
      qs("#hero-title")?.focus();
    });
  } catch (error) {
    console.error("Die Veranstaltung konnte nicht erstellt werden.", error);
    if (formError) {
      formError.textContent =
        "Die Veranstaltung konnte nicht erstellt werden. Bitte prüfe deine Verbindung und versuche es erneut.";
      formError.hidden = false;
    }
    showToast("Die Veranstaltung konnte nicht erstellt werden.", "error");
  } finally {
    state.eventDialogBusy = false;
    setEventFormDisabled(false);
    setButtonBusy(submit, false);
  }
}

/* --------------------------------------------------------------------------
   Slot-Dialog
   -------------------------------------------------------------------------- */

function openSlotDialog(shiftId, standId, slotIndex, opener) {
  if (state.pendingWrites.has(SLOT_KEY(shiftId, standId, slotIndex))) {
    showToast("Dieser Platz wird noch synchronisiert.", "info");
    return;
  }

  const shift = state.shifts?.[shiftId];
  const stand = state.stands?.[standId];
  const demand = getDemand(shiftId, standId);
  if (!shift || !stand || demand <= 0 || slotIndex < 0 || slotIndex >= demand) {
    showToast("Dieser Platz ist nicht mehr verfügbar. Bitte lade den Plan neu.", "error");
    return;
  }

  const assignment = getAssignment(shiftId, standId, slotIndex);
  const dialog = {
    shiftId,
    standId,
    slotIndex,
    demand,
    expectedName: assignment?.name ?? null,
    initialName: assignment?.name ?? "",
    createdAt: assignment?.createdAt ?? null,
    mode: assignment ? "edit" : "create",
    busy: false,
    conflict: false
  };
  state.slotDialog = dialog;

  qs("#slot-dialog-title").textContent = assignment ? "Eintrag bearbeiten" : "Platz eintragen";
  qs("#slot-dialog-context").textContent =
    `${shift.name} · ${formatTimeRange(shift.start, shift.end)} · ${stand.name} · Platz ${slotIndex + 1} von ${demand}`;
  qs("#slot-name-label").textContent = assignment ? "Name" : "Dein Name";
  qs("#slot-name-hint").textContent = assignment
    ? "2–60 Zeichen. Dein Name wird öffentlich angezeigt."
    : "2–60 Zeichen. Dein Name wird öffentlich angezeigt.";

  const input = qs("#slot-name");
  input.value = assignment?.name ?? "";
  input.disabled = false;
  input.setAttribute("aria-invalid", "false");
  qs("#slot-name-error").textContent = "";
  qs("#slot-duplicate").hidden = true;
  qs("#slot-conflict").hidden = true;

  const deleteButton = qs("#slot-delete");
  deleteButton.hidden = !assignment;
  deleteButton.disabled = false;

  const saveButton = qs("#slot-save");
  saveButton.textContent = assignment ? "Speichern" : "Eintragen";
  saveButton.disabled = true;

  openModal("slot-dialog", { opener, focusSelector: "#slot-name" });
  window.requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    input.select();
  });

  validateSlotInput({ touched: false });
}

function validateSlotInput({ touched = false } = {}) {
  const dialog = state.slotDialog;
  if (!dialog) return null;

  const input = qs("#slot-name");
  const error = qs("#slot-name-error");
  const save = qs("#slot-save");
  const duplicate = qs("#slot-duplicate");

  const result = validateName(input.value, { min: 2, max: 60, label: "Name" });
  const showError = touched || input.value.trim().length > 0;
  setFieldError(input, error, result.valid || !showError ? "" : result.error);

  const normalized = normalizeWhitespace(input.value);
  const unchanged = dialog.mode === "edit" && normalized === normalizeWhitespace(dialog.initialName);
  const disabled = dialog.busy || dialog.conflict || !result.valid || unchanged;
  save.disabled = disabled;

  let duplicateFound = false;
  if (result.valid) {
    duplicateFound = hasDuplicateInShift(dialog.shiftId, normalized, {
      standId: dialog.standId,
      slotIndex: dialog.slotIndex
    });
  }
  duplicate.hidden = !duplicateFound;

  return result;
}

function hasDuplicateInShift(shiftId, name, { standId, slotIndex }) {
  const shiftAssignments = state.assignments?.[shiftId] ?? {};
  for (const [otherStandId, slots] of Object.entries(shiftAssignments)) {
    for (const [rawIndex, assignment] of Object.entries(slots ?? {})) {
      if (otherStandId === standId && Number(rawIndex) === slotIndex) continue;
      if (assignment?.name && namesEqual(assignment.name, name)) return true;
    }
  }
  return false;
}

async function saveSlotDialog() {
  const dialog = state.slotDialog;
  if (!dialog || dialog.busy || dialog.conflict) return;

  const result = validateSlotInput({ touched: true });
  if (!result?.valid) return;

  const normalized = normalizeWhitespace(result.value);
  if (dialog.mode === "edit" && normalized === normalizeWhitespace(dialog.initialName)) return;

  const input = qs("#slot-name");
  const save = qs("#slot-save");
  const deleteButton = qs("#slot-delete");

  dialog.busy = true;
  input.disabled = true;
  save.disabled = true;
  save.textContent = "Wird gespeichert …";
  deleteButton.disabled = true;

  const key = SLOT_KEY(dialog.shiftId, dialog.standId, dialog.slotIndex);
  const now = Date.now();
  const operation = {
    kind: "upsert",
    action: dialog.mode === "create" ? "create" : "update",
    shiftId: dialog.shiftId,
    standId: dialog.standId,
    slotIndex: dialog.slotIndex,
    expectedName: dialog.expectedName,
    value: {
      name: normalized,
      createdAt: dialog.createdAt ?? now,
      updatedAt: now
    },
    key
  };

  state.pendingWrites.set(key, { type: "upsert", name: normalized });
  scheduleRender();

  if (!state.connection) {
    enqueueOfflineOperation(operation);
    closeSlotDialog({ restoreFocus: false, silent: true });
    state.focusSlotKey = key;
    scheduleRender();
    showToast("Offline – der Eintrag wird synchronisiert, sobald wieder Verbindung besteht.", "info");
    return;
  }

  let settled = false;
  const timeout = window.setTimeout(() => {
    if (settled) return;
    if (state.slotDialog === dialog) {
      closeSlotDialog({ restoreFocus: false, silent: true });
      state.focusSlotKey = key;
      scheduleRender();
      showToast("Der Eintrag wird noch synchronisiert.", "info");
    }
  }, 15000);

  try {
    const outcome = await commitSlotOperation(operation);
    settled = true;
    window.clearTimeout(timeout);
    finishSlotOperation(operation, outcome, { dialog });
  } catch (error) {
    settled = true;
    window.clearTimeout(timeout);

    if (!state.connection) {
      enqueueOfflineOperation(operation);
      if (state.slotDialog === dialog) {
        closeSlotDialog({ restoreFocus: false, silent: true });
        state.focusSlotKey = key;
        scheduleRender();
      }
      showToast(
        "Offline – der Eintrag wird synchronisiert, sobald wieder Verbindung besteht.",
        "info"
      );
      return;
    }

    failSlotOperation(operation, { dialog, error });
  }
}

function commitSlotOperation(operation) {
  const path = SLOT_PATH(operation.shiftId, operation.standId, operation.slotIndex);
  return runTransaction(ref(db, path), (current) => {
    const currentName =
      current && typeof current === "object" && typeof current.name === "string"
        ? current.name
        : null;
    if (currentName !== operation.expectedName) return undefined;
    return operation.value;
  });
}

function finishSlotOperation(operation, outcome, { dialog = null, queued = false } = {}) {
  const { key } = operation;
  state.pendingWrites.delete(key);
  scheduleRender();

  if (outcome?.committed) {
    writeAssignmentAudit({
      action: operation.action,
      shiftId: operation.shiftId,
      standId: operation.standId,
      slotIndex: operation.slotIndex,
      oldValue: operation.expectedName ? { name: operation.expectedName } : null,
      newValue: operation.value ? { name: operation.value.name } : null
    });

    if (dialog && state.slotDialog === dialog) {
      closeSlotDialog({ restoreFocus: false, silent: true });
    }
    state.focusSlotKey = key;
    scheduleRender();
    showToast(
      operation.kind === "delete"
        ? "Eintrag gelöscht."
        : queued
          ? "Synchronisiert. Danke für deine Hilfe!"
          : operation.action === "create"
            ? "Eingetragen. Danke für deine Hilfe!"
            : "Gespeichert.",
      "success"
    );
    return;
  }

  if (dialog && state.slotDialog === dialog) {
    handleSlotConflict(dialog, key);
    return;
  }

  state.focusSlotKey = key;
  scheduleRender();
  showToast(
    "Ein Eintrag wurde inzwischen geändert. Bitte prüfe den aktuellen Schichtplan.",
    "error"
  );
}

function failSlotOperation(operation, { dialog = null, error = null, queued = false } = {}) {
  const { key } = operation;
  state.pendingWrites.delete(key);
  scheduleRender();

  console.error("Speichern des Platzes fehlgeschlagen.", error);
  recordWriteFailure();

  if (dialog && state.slotDialog === dialog) {
    dialog.busy = false;
    const input = qs("#slot-name");
    const save = qs("#slot-save");
    const deleteButton = qs("#slot-delete");
    if (input) input.disabled = false;
    if (deleteButton) {
      deleteButton.disabled = false;
      deleteButton.textContent = "Löschen";
    }
    if (save) {
      save.textContent = dialog.mode === "create" ? "Eintragen" : "Speichern";
      validateSlotInput({ touched: true });
    }
  }

  showToast(
    queued
      ? "Eine vorgemerkte Änderung konnte nicht gespeichert werden. Bitte prüfe den Plan."
      : "Speichern fehlgeschlagen. Bitte prüfe die Verbindung und versuche es erneut.",
    "error"
  );
}

function enqueueOfflineOperation(operation) {
  const existing = state.offlineQueue.findIndex((entry) => entry.key === operation.key);
  if (existing >= 0) state.offlineQueue.splice(existing, 1);
  state.offlineQueue.push(operation);
}

async function processOfflineQueue() {
  if (state.processingQueue || state.offlineQueue.length === 0 || !state.connection) return;
  state.processingQueue = true;

  try {
    while (state.offlineQueue.length > 0 && state.connection) {
      const operation = state.offlineQueue.shift();
      try {
        const outcome = await commitSlotOperation(operation);
        finishSlotOperation(operation, outcome, { queued: true });
      } catch (error) {
        if (!state.connection) {
          state.offlineQueue.unshift(operation);
          break;
        }
        failSlotOperation(operation, { error, queued: true });
      }
    }
  } finally {
    state.processingQueue = false;
  }
}

async function handleSlotConflict(dialog, key) {
  let latest = null;
  try {
    const snapshot = await get(ref(db, SLOT_PATH(dialog.shiftId, dialog.standId, dialog.slotIndex)));
    latest = snapshot?.val() ?? null;
  } catch (error) {
    console.error("Aktuellen Platzstand konnte nicht gelesen werden.", error);
  }

  const latestName =
    latest && typeof latest === "object" && typeof latest.name === "string" ? latest.name : null;

  if (state.slotDialog !== dialog) {
    state.focusSlotKey = key;
    scheduleRender();
    showToast(
      "Ein Eintrag wurde inzwischen geändert. Bitte prüfe den aktuellen Schichtplan.",
      "error"
    );
    return;
  }

  dialog.busy = false;
  dialog.conflict = true;

  const input = qs("#slot-name");
  const save = qs("#slot-save");
  const deleteButton = qs("#slot-delete");
  input.disabled = false;
  deleteButton.disabled = false;
  save.disabled = true;
  save.textContent = dialog.mode === "create" ? "Eintragen" : "Speichern";
  qs("#slot-conflict").hidden = false;

  // Konflikt ist sichtbar; „Aktualisieren“ liest den aktuellen Stand erneut ein.
  dialog.latestName = latestName;
  qs("#slot-name").setAttribute("aria-invalid", "false");
  qs("#slot-name-error").textContent = "";
}

async function refreshSlotDialog() {
  const dialog = state.slotDialog;
  if (!dialog) return;

  try {
    const snapshot = await get(ref(db, SLOT_PATH(dialog.shiftId, dialog.standId, dialog.slotIndex)));
    const latest = snapshot?.val() ?? null;
    const latestName =
      latest && typeof latest === "object" && typeof latest.name === "string" ? latest.name : null;

    dialog.mode = latestName ? "edit" : "create";
    dialog.expectedName = latestName;
    dialog.initialName = latestName ?? "";
    dialog.createdAt = latest?.createdAt ?? null;
    dialog.conflict = false;
    dialog.busy = false;

    qs("#slot-dialog-title").textContent = latestName ? "Eintrag bearbeiten" : "Platz eintragen";
    qs("#slot-name-label").textContent = latestName ? "Name" : "Dein Name";
    qs("#slot-name").value = latestName ?? "";
    qs("#slot-name").disabled = false;
    qs("#slot-delete").hidden = !latestName;
    qs("#slot-delete").disabled = false;
    qs("#slot-conflict").hidden = true;
    qs("#slot-save").textContent = latestName ? "Speichern" : "Eintragen";

    validateSlotInput({ touched: false });
    showToast("Aktueller Stand geladen.", "info");
  } catch (error) {
    console.error("Aktualisieren des Dialogs fehlgeschlagen.", error);
    showToast("Der aktuelle Stand konnte nicht geladen werden.", "error");
  }
}

async function requestCloseSlotDialog() {
  const dialog = state.slotDialog;
  if (!dialog) {
    closeModal("slot-dialog");
    return;
  }
  if (dialog.busy) return;

  const input = qs("#slot-name");
  const current = normalizeWhitespace(input.value);
  const initial = normalizeWhitespace(dialog.initialName);
  const dirty = current !== initial;

  if (dirty) {
    const discard = await confirmAction({
      title: "Änderungen verwerfen?",
      message: "Der eingegebene Name wurde noch nicht gespeichert. Möchtest du die Änderung verwerfen?",
      confirmLabel: "Verwerfen",
      cancelLabel: "Weiter bearbeiten",
      danger: true
    });
    if (!discard) return;
  }

  closeSlotDialog({ restoreFocus: true });
}

function closeSlotDialog({ restoreFocus = true, silent = false } = {}) {
  const dialog = state.slotDialog;
  if (!dialog) return;

  const key = SLOT_KEY(dialog.shiftId, dialog.standId, dialog.slotIndex);
  state.slotDialog = null;
  state.focusSlotKey = restoreFocus ? key : state.focusSlotKey;
  closeModal("slot-dialog", { restoreFocus: false });
  scheduleRender();

  if (restoreFocus && !silent) {
    window.setTimeout(() => {
      const target = qs(`[data-slot-key="${CSS.escape(key)}"]`);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 220);
  }
}

async function deleteSlotFromDialog() {
  const dialog = state.slotDialog;
  if (!dialog || dialog.busy || !dialog.expectedName) return;

  const shift = state.shifts?.[dialog.shiftId];
  const stand = state.stands?.[dialog.standId];

  const confirmed = await confirmAction({
    title: "Eintrag wirklich löschen?",
    message: `Der Eintrag von ${dialog.expectedName} bei ${stand?.name ?? "Stand"} in der ${shift?.name ?? "Schicht"} (Platz ${dialog.slotIndex + 1}) wird entfernt. Der Platz wird wieder frei.`,
    confirmLabel: "Löschen",
    cancelLabel: "Abbrechen",
    danger: true
  });

  if (!confirmed || state.slotDialog !== dialog) return;

  await performDelete(dialog);
}

async function performDelete(dialog) {
  const key = SLOT_KEY(dialog.shiftId, dialog.standId, dialog.slotIndex);
  const operation = {
    kind: "delete",
    action: "delete",
    shiftId: dialog.shiftId,
    standId: dialog.standId,
    slotIndex: dialog.slotIndex,
    expectedName: dialog.expectedName,
    value: null,
    key
  };

  dialog.busy = true;
  const input = qs("#slot-name");
  const save = qs("#slot-save");
  const deleteButton = qs("#slot-delete");
  input.disabled = true;
  save.disabled = true;
  deleteButton.disabled = true;
  deleteButton.textContent = "Wird gelöscht …";

  state.pendingWrites.set(key, { type: "delete" });
  scheduleRender();

  if (!state.connection) {
    enqueueOfflineOperation(operation);
    closeSlotDialog({ restoreFocus: false, silent: true });
    state.focusSlotKey = key;
    scheduleRender();
    showToast("Offline – die Löschung wird synchronisiert.", "info");
    return;
  }

  try {
    const outcome = await commitSlotOperation(operation);
    finishSlotOperation(operation, outcome, { dialog });
  } catch (error) {
    if (!state.connection) {
      enqueueOfflineOperation(operation);
      if (state.slotDialog === dialog) {
        closeSlotDialog({ restoreFocus: false, silent: true });
        state.focusSlotKey = key;
        scheduleRender();
      }
      showToast("Offline – die Löschung wird synchronisiert.", "info");
      return;
    }
    failSlotOperation(operation, { dialog, error });
  }
}

/* --------------------------------------------------------------------------
   Audit-Log & Fehlerzähler
   -------------------------------------------------------------------------- */

function writeAssignmentAudit({ action, shiftId, standId, slotIndex, oldValue, newValue }) {
  const entry = {
    ts: Date.now(),
    action,
    entity: "assignment",
    entityId: `${shiftId}/${standId}/${slotIndex}`,
    shiftId,
    standId,
    slotIndex,
    oldValue,
    newValue,
    actor: isAdminSessionValid() ? "admin" : "helper",
    source: "ui"
  };

  try {
    const result = push(ref(db, "audit_log"), entry);
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        console.error("Audit-Log-Eintrag konnte nicht geschrieben werden.", error);
      });
    }
  } catch (error) {
    console.error("Audit-Log-Eintrag konnte nicht geschrieben werden.", error);
  }
}

function recordWriteFailure() {
  try {
    const current = Number(window.sessionStorage.getItem("helferplan.writeFailures") ?? "0");
    window.sessionStorage.setItem("helferplan.writeFailures", String(current + 1));
  } catch {
    /* optional */
  }
}

/* --------------------------------------------------------------------------
   Ladezustand
   -------------------------------------------------------------------------- */

function renderSkeleton() {
  const list = qs("#shift-list");
  if (!list) return;
  clearElement(list);
  list.setAttribute("aria-busy", "true");
  for (let index = 0; index < 2; index += 1) {
    const card = createEl("section", "skeleton-card");
    card.setAttribute("aria-hidden", "true");
    const head = createEl("div", "skeleton-head");
    head.append(createEl("span", "skeleton-block skeleton-icon"));
    const lines = createEl("div", "skeleton-lines");
    lines.append(createEl("span", "skeleton-line skeleton-line--title"));
    lines.append(createEl("span", "skeleton-line skeleton-line--short"));
    head.append(lines);
    const body = createEl("div", "skeleton-body");
    body.append(createEl("span", "skeleton-line skeleton-line--full"));
    body.append(createEl("span", "skeleton-line skeleton-line--full"));
    card.append(head, body);
    list.append(card);
  }
}
