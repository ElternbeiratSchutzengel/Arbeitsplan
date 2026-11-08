# Helferplan

Statischer, deutschsprachiger Schichtplan für Vereinsfeste: Die Helfer-Ansicht
ist öffentlich, der Admin-Bereich ist mit einem Passwort geschützt. Die Daten
liegen in der Firebase Realtime Database; das Frontend läuft ohne eigenen
Server und ohne Build-Schritt auf GitHub Pages.

Die verbindliche Implementierungsspezifikation steht in
[`requirements_document.md`](requirements_document.md). Das visuelle Vorbild ist
`prototypes/design-1-klar.html` („Klar & Klassisch“).

## Funktionsumfang

**Helfer-Ansicht (`index.html`)**

- Startbildschirm mit „Neue Veranstaltung erstellen“, solange noch keine
  Veranstaltung in der Datenbank hinterlegt ist
- Dialog für Vereinsname, Veranstaltungsname, Datum, Ort und optionale Tagline;
  die Daten werden direkt in `config` gespeichert
- Veranstaltungsheader mit Belegungsfortschritt und Echtzeit-Aktualisierung
- Schichtkarten mit ausklappbaren Stand-Blöcken und allen Plätzen
- Eintragen, Bearbeiten und Löschen ohne Anmeldung
- Konfliktbehandlung über Firebase-Transaktionen
- Filter nach Stand, Schicht und Gruppe inklusive URL-Parametern
- WhatsApp-Teilen mit kanonischer URL
- Datenschutzhinweis als Dialog
- Offline-Banner, Wartezustände und verständliche Fehlermeldungen

**Admin-Bereich (`admin.html`)**

- Erstvergabe und Login mit clientseitigem Salt-/SHA-256-Hash
- Sitzung mit 30 Minuten Inaktivitäts-Timeout (`sessionStorage`)
- Veranstaltungsdaten, Stände, Schichten und Gruppen verwalten
- Reihenfolge per Pfeiltasten ändern
- Bedarfsmatrix bearbeiten; beim Reduzieren werden überzählige Einträge nach
  Bestätigung gelöscht
- Datenprüfung für verwaiste Einträge und ungültige Gruppenverweise
- CSV-Export, JSON-Sicherung und Druckansicht
- Passwort ändern sowie abgestufte Reset-Funktionen

## Technik

- Reines HTML, CSS und ES-Module; kein Build-Schritt erforderlich
- Firebase JS SDK 10.14.1, dynamisch von `gstatic.com` geladen
- Firebase Realtime Database (nicht Firestore)
- Selbst gehostete Inter-Variable-Schrift
- Demo-Modus über `localStorage`, solange `js/firebase-config.js` Platzhalter
  enthält – ausschließlich für Entwicklung und Vorschau gedacht

```text
/
├── index.html                  Helfer-Ansicht
├── admin.html                  Admin-Bereich
├── css/styles.css              Designsystem und responsive Layouts
├── js/
│   ├── app.js                  Helfer-Ansicht
│   ├── admin.js                Admin-Bereich
│   ├── firebase.js             Firebase-SDK bzw. Demo-Backend
│   ├── firebase-config.js      öffentliche Firebase-Konfiguration
│   ├── ui.js                   Dialoge, Toasts, Session, Formatierung
│   └── validation.js           Validierung und CSV-Escaping
├── assets/
│   ├── fonts/                  InterVariable.woff2
│   ├── favicon.svg
│   └── og-image.png
├── database.rules.json         Security Rules für die RTDB
├── firebase.json               Regeln und Emulator-Konfiguration
├── .gitignore                  Emulator-Logs und node_modules ausblenden
├── .nojekyll                   GitHub Pages: Jekyll deaktivieren
├── requirements_document.md    verbindliche Spezifikation
├── README.md
└── prototypes/                 Design-Vorlagen, nicht Teil der App
```

## Lokal starten

Wegen der ES-Module und `crypto.subtle` muss die Seite über HTTP und möglichst
über `localhost` geöffnet werden. **Ein Doppelklick auf `index.html`
(`file:///…`) funktioniert nicht** — der Browser blockiert dann die
ES-Module, und die Seite bleibt im Lade-Skelett stehen.

```bash
cd Arbeitsplan
python3 -m http.server 8765
```

Danach `http://127.0.0.1:8765/index.html` öffnen (nicht die Datei direkt). Mit der eingecheckten
Konfiguration verbindet sich die App mit Firebase. Für einen reinen Demo-Betrieb
ohne Firebase die Werte in `js/firebase-config.js` durch Platzhalter ersetzen
(z. B. `apiKey: "BITTE_API_KEY_EINTRAGEN"`); dann erscheint der Demo-Modus. Alle
Daten liegen in diesem Fall nur im `localStorage` des Browsers
(`helferplan.demo.v1`) und werden nicht zwischen Geräten synchronisiert.

## Firebase einrichten

1. Im [Firebase Console](https://console.firebase.google.com/) ein Projekt
   anlegen.
2. **Realtime Database** erstellen und als Region `europe-west1` wählen.
3. Ein Web-App-Eintrag unter **Projekteinstellungen → Meine Apps** anlegen.
4. Die Konfigurationswerte in `js/firebase-config.js` eintragen:

   ```js
   export const firebaseConfig = {
     apiKey: "…",
     authDomain: "…firebaseapp.com",
     databaseURL: "https://…-default-rtdb.europe-west1.firebasedatabase.app",
     projectId: "…",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…"
   };
   ```

   Der API-Key ist öffentlich und kein Secret. Er sollte in der Google Cloud
   Console auf die eigene GitHub-Pages-Domain beschränkt werden.

   > **Wichtig für dieses Projekt:** `js/firebase-config.js` verweist bereits auf
   > `arbeitsplan-5ea86` und erwartet die Standard-Datenbank in
   > `europe-west1`. Diese Instanz muss in der Firebase Console unter
   > **Realtime Database → Datenbank erstellen** angelegt werden, falls sie noch
   > nicht existiert. Wird eine andere Region gewählt, muss `databaseURL`
   > entsprechend angepasst werden.

5. Die Security Rules veröffentlichen. Entweder die Datei
   `database.rules.json` in der Firebase Console unter **Realtime Database →
   Regeln** einfügen oder mit der Firebase CLI:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only database
   ```

6. Die Seite über den lokalen Server öffnen
   (`http://127.0.0.1:8765/index.html`), nicht per Doppelklick auf die Datei.
   Solange `config/eventName` und `config/eventDate` fehlen, erscheint der
   Startbildschirm mit **„Neue Veranstaltung erstellen“**.
   Verein, Veranstaltungsname, Datum, Ort und optional die Tagline eintragen;
   die Angaben werden sofort in Firebase gespeichert. Die Admin-Zugangsdaten
   (`adminSalt`/`adminHash`) bleiben dabei unberührt.
7. `admin.html` öffnen und bei der Erstvergabe ein starkes, einzigartiges
   Passwort vergeben. Danach Stände, Schichten, Gruppen und den Bedarf anlegen.
   Die Veranstaltungsdaten lassen sich dort später jederzeit bearbeiten.

### Firestore und Realtime Database nicht verwechseln

Die App nutzt ausschließlich die **Realtime Database**. Die Firebase Console
bietet daneben **Cloud Firestore** an. Regeln mit `service cloud.firestore`
(z. B. für eine Sammlung `sheets`) gelten nur für Firestore und haben für diese
App keine Wirkung. Die passenden Regeln stehen in `database.rules.json` und
werden unter **Realtime Database → Regeln** veröffentlicht.

In der linken Navigation der Firebase Console ist die Realtime Database unter
**Datenbanken und Speicher** zu finden (nicht unter dem separat aufgeführten
**Firestore**). Die URL enthält `/database/`, nicht `/firestore/`.

Das Konfigurations-Snippet der Console enthält `databaseURL` erst, wenn eine
Realtime-Database-Instanz existiert. Fehlt die Zeile in `js/firebase-config.js`,
startet die App im Demo-Modus. Antwortet die konfigurierte Datenbank-URL mit
HTTP 404, ist die Instanz noch nicht angelegt oder liegt in einer anderen
Region. HTTP 401 bedeutet dagegen, dass die Instanz existiert, aber die Regeln
noch nicht veröffentlicht wurden.

### Regeln im Emulator prüfen

`firebase.json` enthält eine Emulator-Konfiguration. Voraussetzung ist eine
Java-Installation.

```bash
firebase emulators:start --only database
```

Die Regeln sind bewusst nur eine strukturelle Absicherung. Sie können ohne
Firebase Auth keine Admin-Rolle prüfen und keine fachlichen Kaskaden erzwingen.
Siehe [Sicherheitsmodell](#sicherheitsmodell-und-grenzen).

## GitHub Pages

1. Repository nach GitHub pushen; der Branch `main` enthält die Dateien im
   Wurzelverzeichnis.
2. Unter **Settings → Pages** als Quelle „Deploy from a branch“, Branch `main`
   und Ordner `/ (root)` wählen.
3. `.nojekyll` liegt bereits im Repository und verhindert die
   Jekyll-Verarbeitung.
4. Nach dem Deployment `https://<user>.github.io/Arbeitsplan/` aufrufen.
   `crypto.subtle` funktioniert dort über HTTPS.
5. Kanonische URL und Open-Graph-Angaben in `index.html` prüfen. Die
   OG-Metadaten sind statisch; bei einem neuen Veranstaltungsnamen oder einer
   anderen Domain müssen `og:title`, `og:description`, `og:image` und `og:url`
   angepasst werden. Das OG-Bild liegt unter `assets/og-image.png`
   (1200 × 630 px).

## Admin-Bereich

### Erstvergabe

Beim ersten Aufruf von `admin.html` fehlen `config/adminSalt` und
`config/adminHash`. Dann erscheint die Erstvergabe. Das Passwort muss mindestens
8 Zeichen haben. Der Salt besteht aus 16 zufälligen Bytes (32 Hex-Zeichen), der
Hash aus `SHA-256(UTF-8(adminSaltHex + password))` (64 Hex-Zeichen). Nach dem
Speichern ist der Admin automatisch angemeldet.

### Anmeldung und Sitzung

Die Sitzung liegt in `sessionStorage` unter `helferplan.admin.session` und läuft
nach 30 Minuten Inaktivität ab. Ein Logout löscht die Sitzung. Die
Administration ist nur ein UI-Schutz; sie ist keine serverseitige
Authentifizierung.

### Passwort vergessen

Es gibt keinen E-Mail-Reset. Der Zugang wird direkt in der Firebase Console
zurückgesetzt:

1. **Realtime Database → Daten** öffnen.
2. Die Knoten `config/adminSalt` und `config/adminHash` löschen.
3. `admin.html` neu laden.
4. Die Erstvergabe erscheint; ein neues Passwort setzen.

Achtung: Wer diese Knoten löscht, kann den Admin-Zugang übernehmen. Der
Firebase-Konsolenzugang muss deshalb gut geschützt sein.

### Passwort ändern

Im Admin-Bereich unter **Passwort ändern** das aktuelle und das neue Passwort
eingeben. Salt und Hash werden neu erzeugt; andere Sitzungen werden dadurch
nicht automatisch beendet.

## Datenmodell

Die Daten liegen auf oberster Ebene in der Realtime Database. Es gibt genau eine
aktive Veranstaltung pro Deployment.

| Pfad | Inhalt |
|---|---|
| `config` | `clubName`, `eventName`, `eventDate`, `eventLocation`, `tagline`, `adminSalt`, `adminHash` |
| `groups/{groupId}` | `name`, `color`, `order` |
| `shifts/{shiftId}` | `name`, `start`, `end`, `order` |
| `stands/{standId}` | `name`, `icon`, `color`, `groupId`, `order` |
| `demand/{shiftId}/{standId}` | Bedarf als Ganzzahl 0–20 |
| `assignments/{shiftId}/{standId}/{slotIndex}` | `name`, `createdAt`, `updatedAt` |
| `audit_log/{logId}` | `ts`, `action`, `entity`, `entityId`, `actor`, `source` und optionale Details |

Details, Feldlängen und Kaskaden stehen in
[`requirements_document.md`](requirements_document.md), Abschnitt 6.

## Sicherheitsmodell und Grenzen

Diese Hinweise sind Teil des akzeptierten Risikomodells und müssen vor einem
Produktiveinsatz gelesen werden:

- **Der Admin-Schutz ist ausschließlich UI-Ebene.** Es gibt keine Firebase
  Authentication, keine Cloud Functions und keine serverseitige
  Autorisierung. Wer die Datenbank direkt anspricht, kann Daten lesen und –
  entsprechend den Regeln – auch schreiben oder löschen.
- **Salt und Hash sind öffentlich lesbar.** Das ist für die clientseitige
  Anmeldung erforderlich. Ein Angreifer kann den Hash offline mit
  Wörterbuch- oder Brute-Force-Angriffen attackieren. Verwende ein langes,
  einzigartiges Passwort und ändere es bei Verdacht.
- **Die Regeln schützen Struktur und Wertebereiche, nicht die Fachlogik.**
  Slot-Indizes, Kaskaden und Bedarfsgrenzen werden in der App geprüft; direkte
  API-Aufrufe können sie umgehen. Die Datenprüfung im Admin-Bereich hilft beim
  Bereinigen.
- **`sessionStorage` ist manipulierbar.** Die Sitzung ist kein echtes
  Sicherheitstoken.
- **Keine serverseitigen Rate-Limits.** Login-Versuche können beliebig oft
  wiederholt werden.
- **Das Audit-Log ist clientseitig und nicht fälschungssicher.** Es dient der
  Nachvollziehbarkeit, nicht als Beweis. Clients dürfen es schreiben, aber nicht
  lesen; die Firebase Console umgeht die Regeln.
- **Jeder Besucher kann Einträge ändern oder löschen.** Das offene
  Bearbeitungskonzept ist gewollt; es gibt keine Identitätsprüfung.
- **Auch die Veranstaltungsdaten (`config`) sind öffentlich schreibbar.** Der
  Startbildschirm erscheint nur, solange `eventName` und `eventDate` fehlen.
  Die Regeln prüfen Feldlängen und Formate, verhindern aber keine direkten
  Änderungen an der Config durch Dritte.
- **Das Firebase-Projekt ist kein Sicherheitsperimeter.** Schütze den
  Firebase-/Google-Account mit starker Authentifizierung und beschränke den
  API-Key auf die eigene Domain.

Für eine höhere Sicherheit wäre eine Migration auf Firebase Authentication mit
serverseitigen Regeln oder Cloud Functions nötig. Das ist ausdrücklich nicht
Teil von Version 1.

## Datenschutz

- In der Helfer-Ansicht wird ausschließlich der eingegebene Name öffentlich
  angezeigt. Es werden keine Kontaktdaten, E-Mail-Adressen oder Telefonnummern
  erhoben.
- Zu jedem Eintrag werden `createdAt` und `updatedAt` als Zeitstempel
  gespeichert.
- Ein Eintrag kann jederzeit über den Dialog geändert oder gelöscht werden.
  Admins können alle Einträge zurücksetzen oder vollständig löschen.
- Das Audit-Log enthält Aktionsdaten (Zeitpunkt, Aktion, Entität, alte/neue
  Werte) und wird beim vollständigen Reset gelöscht. Beim Zurücksetzen der
  Einträge kann es optional mitgelöscht werden.
- Im Demo-Modus liegen alle Daten im `localStorage` des jeweiligen Browsers.
- Die Datenschutzhinweise in der App sind ein allgemeiner Entwurf und ersetzen
  keine rechtliche Prüfung. Impressumspflicht und DSGVO-Anforderungen sind vor
  der Veröffentlichung zu klären.

## Tests und Qualitätssicherung

Es gibt keinen Build-Schritt. Sinnvolle Prüfungen:

```bash
# Syntax aller Module
for file in js/*.js; do node --check "$file"; done

# Optional: ESLint (Konfiguration nicht im Repository enthalten)
npx eslint js/*.js
```

Manuell zu prüfen:

1. Helfer-Ansicht auf Desktop und Smartphone (mindestens 320 px Breite).
2. Eintrag anlegen, bearbeiten und löschen; Konfliktfall in zwei Tabs.
3. Filter kombinieren, zurücksetzen und über URL neu laden.
4. WhatsApp-Text und OG-Vorschau prüfen.
5. Admin-Erstvergabe, Login, falsches Passwort, Logout und Session-Timeout.
6. Stände, Schichten und Gruppen anlegen, sortieren, löschen.
7. Bedarf erhöhen und reduzieren; Löschbestätigung der überzähligen Plätze.
8. CSV-, JSON- und Druckausgabe prüfen.
9. Datenprüfung mit künstlich verwaisten Einträgen.
10. Alle Reset-Stufen inklusive `ALLES LÖSCHEN` prüfen.
11. Nach dem Löschen von `config/adminSalt` und `config/adminHash` die
    Erstvergabe erneut durchlaufen.

## Betrieb und Wartung

- **Backups:** Vor größeren Änderungen im Admin-Bereich die JSON-Sicherung
  herunterladen. Zusätzlich regelmäßig die Firebase Console exportieren.
- **Aufbewahrung:** Nicht mehr benötigte Veranstaltungsdaten mit „Alles
  löschen“ entfernen; danach ist eine neue Erstvergabe nötig.
- **Mehrere Veranstaltungen:** Nicht unterstützt. Für eine neue Veranstaltung
  die alten Daten löschen oder ein separates Deployment verwenden.
- **Browser:** Moderne Evergreen-Browser (Chrome, Edge, Firefox, Safari) mit
  Unterstützung für ES-Module, `crypto.subtle` und `Intl`.

## Fehlerbehebung

| Symptom | Ursache / Lösung |
|---|---|
| Banner „Demo-Modus“ | `js/firebase-config.js` enthält noch Platzhalter. Firebase-Werte eintragen. |
| „Die Konfiguration konnte nicht geladen werden“ / Ladefehler | Prüfen, ob die Realtime Database unter der `databaseURL` existiert (Region), dann Regeln und Internetverbindung prüfen. |
| Login immer „Passwort falsch.“ | Groß-/Kleinschreibung und Tastaturlayout prüfen; notfalls Hash in der Firebase Console zurücksetzen. |
| „Permission denied“ beim Speichern | `database.rules.json` passt nicht zu den geschriebenen Pfaden; Regeln erneut deployen. |
| Keine WhatsApp-Vorschau | OG-Tags und `assets/og-image.png` müssen unter der öffentlichen HTTPS-URL erreichbar sein. |
| Kamera/Smartphone zeigt veraltete Daten | Seite neu laden; Echtzeit-Updates benötigen eine aktive Verbindung. |
| Admin-Lockout | `config/adminSalt` und `config/adminHash` in der Firebase Console löschen und Erstvergabe erneut durchlaufen. |

## Nicht enthalten

Mehrere gleichzeitige Veranstaltungen, Helfer-Konten, PWA-Installation,
Dark Mode, Zahlungen, automatische Benachrichtigungen, Upload eines
Vereinslogos, QR-Codes und eine Admin-UI für das Audit-Log.
