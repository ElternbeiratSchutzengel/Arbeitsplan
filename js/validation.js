/**
 * Validierung und Normalisierung
 * ==============================
 * Alle Funktionen liefern ein Objekt mit `valid`, `value` und optional
 * `error`. Fehlermeldungen sind bewusst konkret und auf Deutsch.
 */

const CONTROL_OR_ANGLE = /[\u0000-\u001F\u007F-\u009F<>]/;
const HTML_BRACKETS = /[<>]/;

export function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function hasControlOrAngle(value) {
  return CONTROL_OR_ANGLE.test(String(value ?? ""));
}

export function validateName(raw, { min = 2, max = 60, label = "Name" } = {}) {
  const input = String(raw ?? "");

  if (CONTROL_OR_ANGLE.test(input)) {
    return {
      valid: false,
      value: "",
      error: `${label} enthält ungültige Zeichen. Bitte verwende keine Steuerzeichen oder spitzen Klammern.`
    };
  }

  const value = normalizeWhitespace(input);

  if (!value) {
    return { valid: false, value: "", error: `Bitte gib ${label === "Name" ? "einen Namen" : `einen ${label}`} ein.` };
  }

  if (value.length < min) {
    return {
      valid: false,
      value,
      error: `Bitte gib ${label === "Name" ? "einen Namen" : `einen ${label}`} mit mindestens ${min} Zeichen ein.`
    };
  }

  if (value.length > max) {
    return {
      valid: false,
      value,
      error: `${label} darf höchstens ${max} Zeichen lang sein.`
    };
  }

  return { valid: true, value, error: "" };
}

export function validateText(raw, { min = 1, max = 80, label = "Feld", optional = false } = {}) {
  const input = String(raw ?? "");

  if (HTML_BRACKETS.test(input)) {
    return { valid: false, value: "", error: `${label} darf keine spitzen Klammern enthalten.` };
  }

  if (/[\u0000-\u001F\u007F-\u009F]/.test(input)) {
    return { valid: false, value: "", error: `${label} enthält ungültige Steuerzeichen.` };
  }

  const value = normalizeWhitespace(input);

  if (!value) {
    if (optional) return { valid: true, value: "", error: "" };
    return { valid: false, value: "", error: `Bitte fülle das Feld „${label}“ aus.` };
  }

  if (value.length < min) {
    return { valid: false, value, error: `${label} muss mindestens ${min} Zeichen lang sein.` };
  }

  if (value.length > max) {
    return { valid: false, value, error: `${label} darf höchstens ${max} Zeichen lang sein.` };
  }

  return { valid: true, value, error: "" };
}

export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function validateEventDate(value) {
  if (!value) return { valid: false, value: "", error: "Bitte wähle ein Datum aus." };
  if (!isValidIsoDate(value)) return { valid: false, value, error: "Bitte gib ein gültiges Datum an." };
  return { valid: true, value, error: "" };
}

export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

export function timeToMinutes(value) {
  if (!isValidTime(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function validateShiftTimes(start, end) {
  if (!isValidTime(start)) {
    return { valid: false, error: "Bitte gib eine gültige Startzeit im Format HH:MM an." };
  }
  if (!isValidTime(end)) {
    return { valid: false, error: "Bitte gib eine gültige Endzeit im Format HH:MM an." };
  }
  if (timeToMinutes(end) <= timeToMinutes(start)) {
    return { valid: false, error: "Die Endzeit muss nach der Startzeit liegen." };
  }
  return { valid: true, error: "" };
}

export function shiftsOverlap(first, second) {
  const firstStart = timeToMinutes(first.start);
  const firstEnd = timeToMinutes(first.end);
  const secondStart = timeToMinutes(second.start);
  const secondEnd = timeToMinutes(second.end);
  if ([firstStart, firstEnd, secondStart, secondEnd].some((value) => value === null)) return false;
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function validatePassword(password, { label = "Passwort" } = {}) {
  const value = String(password ?? "");

  if (!value) return { valid: false, value, error: `Bitte gib ein ${label} ein.` };
  if (!value.trim()) return { valid: false, value, error: `${label} darf nicht nur aus Leerzeichen bestehen.` };
  if (value.length < 8) {
    return { valid: false, value, error: "Das Passwort muss mindestens 8 Zeichen lang sein." };
  }
  if (value.length > 128) {
    return { valid: false, value, error: "Das Passwort darf höchstens 128 Zeichen lang sein." };
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return { valid: false, value, error: "Das Passwort enthält ungültige Steuerzeichen." };
  }
  return { valid: true, value, error: "" };
}

export function validatePasswordPair(password, repeat) {
  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return { valid: false, password: passwordResult, repeat: { valid: false, error: "" } };

  if (String(password ?? "") !== String(repeat ?? "")) {
    return {
      valid: false,
      password: passwordResult,
      repeat: { valid: false, error: "Die Passwörter stimmen nicht überein." }
    };
  }

  return { valid: true, password: passwordResult, repeat: { valid: true, error: "" } };
}

export function validateDemand(raw) {
  const value = String(raw ?? "").trim();
  if (value === "") return { valid: false, value: 0, error: "Bitte gib eine Zahl zwischen 0 und 20 ein." };
  if (!/^\d+$/.test(value)) {
    return { valid: false, value: 0, error: "Bitte gib eine ganze Zahl zwischen 0 und 20 ein." };
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 20) {
    return { valid: false, value: 0, error: "Der Bedarf muss zwischen 0 und 20 liegen." };
  }
  return { valid: true, value: number, error: "" };
}

export function isValidAdminSalt(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value);
}

export function isValidAdminHash(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

export function hasValidAdminCredentials(config) {
  return Boolean(config && isValidAdminSalt(config.adminSalt) && isValidAdminHash(config.adminHash));
}

export function namesEqual(first, second) {
  return normalizeWhitespace(first).localeCompare(normalizeWhitespace(second), "de", {
    sensitivity: "accent"
  }) === 0;
}

export function isUniqueName(name, entries, { excludeId = null, label = "Name" } = {}) {
  const normalized = normalizeWhitespace(name).toLocaleLowerCase("de");
  if (!normalized) return { valid: false, error: `Bitte gib einen ${label} ein.` };

  const duplicate = Object.entries(entries ?? {}).find(([id, entry]) => {
    if (excludeId && id === excludeId) return false;
    return normalizeWhitespace(entry?.name).toLocaleLowerCase("de") === normalized;
  });

  if (duplicate) {
    return { valid: false, error: `${label} ist bereits vorhanden. Bitte wähle einen anderen ${label}.` };
  }

  return { valid: true, error: "" };
}
