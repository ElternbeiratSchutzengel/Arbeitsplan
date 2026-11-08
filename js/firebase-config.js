/**
 * Firebase-Konfiguration
 * ======================
 * Diese Datei ist absichtlich öffentlich. Der API-Key ist kein Secret;
 * der Schutz der Daten erfolgt über die Security Rules.
 *
 * 1. Firebase-Projekt anlegen (Realtime Database, Region europe-west1).
 * 2. Die Werte aus "Projekteinstellungen > Ihre Apps" hier eintragen.
 * 3. Sind die Platzhalter noch vorhanden, startet die App im lokalen
 *    Demo-Modus (nur localStorage, keine Firebase-Verbindung).
 *
 * Die Realtime Database muss unter der eingetragenen `databaseURL` existieren
 * (hier: Standard-Datenbank in europe-west1). Andernfalls antwortet Firebase
 * mit 404 und die App zeigt einen Ladefehler. Bei einer anderen Region muss
 * die URL entsprechend angepasst werden.
 *
 * Der API-Key sollte in der Google Cloud Console auf die Domain der
 * GitHub-Pages-Seite beschränkt werden.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyD6TwLszXpTkpy2W9FtwHTOrn2zpcl5B4Y",
  authDomain: "arbeitsplan-5ea86.firebaseapp.com",
  // Erforderlich für die Realtime Database. Das Config-Snippet der Firebase
  // Console enthält diese Zeile erst, wenn eine RTDB-Instanz existiert.
  databaseURL: "https://arbeitsplan-5ea86-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "arbeitsplan-5ea86",
  storageBucket: "arbeitsplan-5ea86.firebasestorage.app",
  messagingSenderId: "959977288992",
  appId: "1:959977288992:web:34bcd7849203e1d7e31345"
};

const requiredValues = [
  firebaseConfig.apiKey,
  firebaseConfig.databaseURL,
  firebaseConfig.projectId
];

export const firebaseConfigured = requiredValues.every(
  (value) => typeof value === "string" && value.length > 0 && !value.startsWith("BITTE_")
);
