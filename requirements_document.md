# Software Requirements Specification (SRS)
## Projekt: Mobiler Einsatzplaner für Vereinsfeste

| Feld | Wert |
|---|---|
| Dokumentversion | 1.0 |
| Stand | 07.11.2026 |
| Status | Umsetzungsreif |
| Sprache | Deutsch (de-DE) |
| Verbindliches Design | [`prototypes/design-1-klar.html`](prototypes/design-1-klar.html) – „Klar & Klassisch“ |
| Nicht bindend | `design-2-community.html`, `design-3-kompakt.html`, `design-4-nachtblau.html` |
| Hosting | GitHub Pages (statisch) |
| Backend | Firebase Realtime Database |
| Zielgeräte | Smartphone, Tablet, Desktop; responsive ab 320 px |

### 0. Dokumentkonventionen

* **Anforderungs-IDs:**
  * `ARC-xx` – Architektur und Technik
  * `FR-H-xx` – Helfer-Ansicht
  * `FR-A-xx` – Admin-Bereich
  * `FR-D-xx` – Datenmodell und Persistenz
  * `FR-UI-xx` – Design, UI und Barrierefreiheit
  * `NFR-xx` – Nicht-funktionale Anforderungen
  * `AC-xx` – Abnahmekriterien
* **Prioritäten:**
  * `MUSS` – zwingend für Version 1
  * `SOLL` – sollte in Version 1 enthalten sein
  * `KANN` – optional oder für eine spätere Version
* **Verbindlichkeit:** Design 1 „Klar & Klassisch“ ist für Layout, Farben, Typografie, Abstände und Interaktionszustände bindend. Wo die Designreferenz unvollständig ist (Dialoge, Admin-Bereich, Leerzustände), gilt dieses Dokument.
* **Sprache:** Alle sichtbaren Texte, Fehlermeldungen, Dialoge und Exporte sind auf Deutsch. Datums- und Zeitformate verwenden `de-DE` und die Zeitzone `Europe/Berlin`.

#### Begriffe

| Begriff | Bedeutung |
|---|---|
| Stand | Arbeitsbereich auf dem Fest, z. B. Grill, Ausschank oder Kasse |
| Schicht | Zeitfenster, in dem Stände besetzt werden, z. B. 11:00–14:00 Uhr |
| Platz | Ein einzelner Helfer-Slot innerhalb eines Standes und einer Schicht |
| Bedarf | Anzahl benötigter Helfer pro Stand und Schicht |
| Belegung | Anzahl bereits eingetragener Helfer |
| Vollzählig | Alle Plätze eines Standes oder einer Schicht sind belegt |
| Gruppe | Optionale Vereinsgruppe, z. B. Jugend, Vorstand oder Aktive |
| Audit-Log | Hintergrundprotokoll für Änderungen an Einträgen und Konfiguration |
| Helfer-Ansicht | Öffentliche, anonym nutzbare Schichtplan-Ansicht |
| Admin-Bereich | Passwortgeschützte Konfigurations- und Verwaltungsansicht |

---

### 1. Ziel & Zweck

#### 1.1 Ziel

Eine moderne, schlanke und mobil-optimierte Web-App zur einfachen Organisation von Helfer-Schichten bei Vereinsfesten und Events. Helfer sollen sich ohne Registrierung, App-Installation oder Anmeldung in einen Schichtplan eintragen, ihren Eintrag jederzeit ändern oder löschen können. Der Admin soll Stände, Schichten, Gruppen und den Helferbedarf ohne Programmierkenntnisse verwalten können.

#### 1.2 Erfolgskriterien

* Ein Helfer kann in weniger als 30 Sekunden einen freien Platz finden, seinen Namen eintragen und die Bestätigung sehen.
* Ein Admin kann eine Veranstaltung mit Schichten, Ständen, Gruppen und Bedarf in weniger als 15 Minuten vollständig konfigurieren.
* Der Schichtplan ist auf einem Smartphone ab 320 px Breite ohne horizontales Scrollen der Hauptseite nutzbar; nur die Filterleiste darf horizontal scrollen.
* Änderungen sind auf allen geöffneten Geräten ohne manuelles Neuladen sichtbar.
* Die Anwendung ist vollständig auf Deutsch und für ältere Vereinsmitglieder gut lesbar.
* Ein Druck-Export liefert eine vollständige, weiterverarbeitbare Helferliste.
* Die Admin-Konfiguration lässt sich als JSON sichern und wieder importieren; die Datei enthält keine Helfer-Einträge.

#### 1.3 Zielgruppe

* Vereinsmitglieder und Helfer, die sich eintragen wollen.
* Organisatoren und Vorstand, die den Plan verwalten.
* Personen, die den Plan am Handy im Festzelt oder am Desktop im Vereinsheim aufrufen.

---

### 2. Rollen, Einsatzszenario & Abgrenzung

#### 2.1 Rollen

| Rolle | Zugang | Rechte |
|---|---|---|
| Helfer | anonym, ohne Konto | Plan lesen, freie Plätze eintragen, bestehende Einträge bearbeiten und löschen |
| Admin | Passwort | Alles, was Helfer dürfen, plus Konfiguration, Bedarf, Export, Zurücksetzen und Audit-Log-Einsicht über die Firebase Console |
| System | automatisch | Erstkonfiguration erkennen, Statistiken berechnen, Echtzeit-Synchronisation, Audit-Log schreiben |

#### 2.2 Einsatzszenario

* Ein Verein betreibt pro Deployment genau eine aktive Veranstaltung.
* Nach dem Fest setzt der Admin die Einträge zurück; die Konfiguration kann für das nächste Fest wiederverwendet oder ebenfalls zurückgesetzt werden.
* Es gibt keine Helfer-Konten. Die Identität eines Helfers ist ausschließlich der eingetragene Name.
* Die Anwendung ist ein statisches Frontend; es gibt keinen eigenen Server und keine Cloud Functions.

#### 2.3 Abgrenzung

* Keine Mehrfach-Veranstaltungen und kein Event-Umschalter in Version 1.
* Keine Helfer-Registrierung, keine E-Mail-Verifizierung und keine Einladungscodes.
* Kein Schutz einzelner Einträge vor Änderungen durch Dritte; das offene Bearbeitungskonzept ist gewollt.
* Keine automatisierten WhatsApp-, E-Mail- oder Push-Benachrichtigungen.
* Keine Zahlungs-, Kassensystem- oder Inventarfunktionen.
* Keine native App, keine PWA-Installation und kein Dark Mode in Version 1.

---

### 3. Tech-Stack & Architektur

#### 3.1 Frontend

* **ARC-01 (MUSS):** Die Anwendung ist eine statische Website aus HTML5, CSS und Vanilla JavaScript (ES-Module). Es wird kein Frontend-Framework und keine Server-Laufzeit verwendet.
* **ARC-02 (MUSS):** Tailwind CSS wird für die Produktion als kompilierte CSS-Datei eingebunden. Der Tailwind-Play-CDN darf nur in den Prototypen unter `prototypes/` verwendet werden.
* **ARC-03 (MUSS):** Die Schriftart Inter wird selbst gehostet (WOFF2) und mit `font-display: swap` eingebunden. Fallback: `ui-sans-serif, system-ui, sans-serif`.
* **ARC-04 (MUSS):** Icons werden als inline SVG-Sprite in `index.html` und `admin.html` eingebunden. Die Sprite-IDs und Pfade entsprechen Design 1.
* **ARC-05 (SOLL):** Es werden keine externen UI-Bibliotheken, Icon-Fonts oder Analyse-Skripte geladen.
* **ARC-06 (MUSS):** Die Anwendung besteht mindestens aus `index.html` (Helfer-Ansicht), `admin.html` (Admin-Bereich), `css/styles.css`, `js/app.js`, `js/admin.js`, `js/firebase.js`, `js/firebase-config.js`, `js/ui.js`, `js/validation.js`, `assets/`, `firebase.json` und `database.rules.json`.
* **ARC-07 (SOLL):** Gemeinsame UI-Funktionen (Dialoge, Toasts, Formatierung, Validierung) liegen in wiederverwendbaren ES-Modulen.

#### 3.2 Backend & Echtzeit

* **ARC-08 (MUSS):** Daten werden in der Firebase Realtime Database gespeichert. Es wird das modulare Firebase JS SDK (Version 9 oder neuer) verwendet, als ES-Modul von `gstatic` geladen oder über einen optionalen Bundler eingebunden.
* **ARC-09 (MUSS):** Die Helfer-Ansicht abonniert die relevanten Pfade mit `onValue` und aktualisiert die Oberfläche ohne Neuladen.
* **ARC-10 (MUSS):** Schreibzugriffe auf einen Helferplatz verwenden `runTransaction`, um konkurrierende Änderungen zu erkennen.
* **ARC-11 (MUSS):** Zeitstempel werden als Serverzeit (`ServerValue.TIMESTAMP`) gespeichert, sofern die Firebase-API dies an der Stelle unterstützt; andernfalls wird `Date.now()` verwendet und die Abweichung dokumentiert.
* **ARC-12 (MUSS):** Die Realtime Database unterstützt Offline-Caching. Schreibvorgänge werden bei fehlender Verbindung innerhalb der laufenden Seitensitzung lokal gepuffert und nach Wiederherstellung synchronisiert. Das Web-SDK persistiert diese Warteschlange nicht über einen Reload hinweg; nicht serverseitig bestätigte Schreibvorgänge können bei einem Reload im Offline-Zustand verloren gehen und werden bis zur Bestätigung als „Wird synchronisiert“ gekennzeichnet.
* **ARC-13 (MUSS):** Es werden keine Cloud Functions, kein eigener Server und keine externe Datenbank verwendet.

#### 3.3 Hosting & Deployment

* **ARC-14 (MUSS):** Das Frontend wird über GitHub Pages als statische Website bereitgestellt. Die Seite muss über HTTPS erreichbar sein.
* **ARC-15 (MUSS):** Die Firebase-Konfiguration (`apiKey`, `databaseURL`, `projectId` usw.) liegt in einer öffentlichen `js/firebase-config.js`. Das ist bei Firebase zulässig; der Schutz erfolgt über Security Rules. Der API-Key wird in der Google Cloud Console auf die GitHub-Pages-Domain beschränkt.
* **ARC-16 (MUSS):** Die Security Rules werden aus `database.rules.json` über die Firebase CLI deployed. Die Datei ist versioniert.
* **ARC-17 (MUSS):** Das Firebase-Projekt wird nach Möglichkeit in der Region `europe-west1` angelegt. Die Realtime Database wird bei der Erstellung einer Region zugeordnet.
* **ARC-18 (SOLL):** Ein README dokumentiert Projektanlage, Deployment, Admin-Passwort-Recovery und die wichtigsten Testschritte.
* **ARC-19 (SOLL):** Eine `.nojekyll`-Datei verhindert, dass GitHub Pages Dateien mit Unterstrich ignoriert.
* **ARC-20 (KANN):** Eine eigene Domain kann über GitHub Pages konfiguriert werden; die Anwendung muss auch unter der Standard-`github.io`-URL funktionieren.

#### 3.4 Sicherheitsmodell

* **ARC-21 (MUSS):** Die Event-Daten (`config`, `groups`, `shifts`, `stands`, `demand`, `assignments`) sind öffentlich lesbar, damit die Helfer-Ansicht ohne Anmeldung funktioniert. Dazu gehört auch `config/adminHash`; siehe ARC-26.
* **ARC-22 (MUSS):** Die Helfer-Ansicht schreibt ausschließlich auf `assignments/{shiftId}/{standId}/{slotIndex}`; auf diesen Pfaden validieren die Security Rules die Daten. Ohne Firebase Auth können die Security Rules Schreibzugriffe auf Konfigurationspfade technisch nicht verhindern; siehe ARC-26.
* **ARC-23 (MUSS):** Das Audit-Log ist für Clients nicht lesbar (`.read: false`). Die Einsicht erfolgt über die Firebase Console. Es gibt in Version 1 keine Audit-Log-UI.
* **ARC-24 (MUSS):** Das Admin-Passwort wird als gesalzener SHA-256-Hash in `config/adminHash` gespeichert; der Salt liegt in `config/adminSalt`. Der Hash wird mit der Web Crypto API (`crypto.subtle.digest`) berechnet.
* **ARC-25 (MUSS):** Es wird kein Klartextpasswort und kein vorgegebener Hash im Quellcode hinterlegt.
* **ARC-26 (MUSS):** Die Admin-Konfiguration ist ohne Firebase Auth technisch nicht gegen direkte Schreibzugriffe geschützt. Die Admin-Oberfläche und die `sessionStorage`-Session sind ein UI-Schutz, keine Server-Authentifizierung; die Session ist clientseitig manipulierbar, und es gibt kein serverseitiges Rate-Limiting für Passwortversuche. Dieses Restrisiko ist für den Vereinsbetrieb akzeptiert und muss im README und im Admin-Login sichtbar dokumentiert werden.
* **ARC-27 (MUSS):** Es werden keine sensiblen personenbezogenen Daten (Kontaktdaten, Adressen, Geburtsdaten, Zahlungsdaten) erhoben. Es werden ausschließlich Namen gespeichert.
* **ARC-28 (MUSS):** Alle Eingaben werden vor dem Rendern als Text behandelt (`textContent`, keine HTML-Interpolation). Steuerzeichen und spitze Klammern werden abgelehnt.
* **ARC-29 (SOLL):** Firebase App Check mit reCAPTCHA v3 kann optional aktiviert werden, um einfache Skript-Angriffe zu reduzieren. App Check ersetzt keine Admin-Authentifizierung.
* **ARC-30 (KANN):** Eine spätere Migration auf Firebase Auth mit rollenbasierten Security Rules ist vorgesehen, aber nicht Teil von Version 1.

#### 3.5 Browser & Geräte

* **ARC-31 (MUSS):** Unterstützt werden die letzten zwei Versionen von Chrome, Edge, Firefox und Safari sowie iOS Safari ab Version 15 und Android Chrome ab Version 100.
* **ARC-32 (MUSS):** Die Anwendung funktioniert ohne Maus, ausschließlich per Tastatur und Touch.
* **ARC-33 (MUSS):** Die Hauptansicht ist ab 320 px Breite nutzbar; die Filterleiste darf horizontal scrollen.
* **ARC-34 (SOLL):** Die Anwendung wird auf einem echten iPhone und einem echten Android-Gerät getestet, nicht nur im Responsive-Modus des Browsers.

---

### 4. Funktionale Anforderungen – Helfer-Ansicht

Die Helfer-Ansicht ist die öffentliche Startseite `index.html`. Sie ist nach Design 1 „Klar & Klassisch“ umzusetzen.

#### 4.1 Veranstaltungsheader

* **FR-H-01 (MUSS):** Die Navigation zeigt den App-Namen „Helferplan“ und den Vereinsnamen als Badge. Der Titelbereich zeigt als Eyebrow `{eventName} · {clubName}`, die Tagline als H1, Datum und Ort sowie die Fortschrittskarte. Ist die Tagline leer, wird der Veranstaltungsname als H1 verwendet.
* **FR-H-02 (MUSS):** Das Datum wird mit `Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })` formatiert, z. B. „So, 14. Juni 2026“.
* **FR-H-03 (MUSS):** Der Header enthält eine Fortschrittskarte mit dem Zähler `belegt/gesamt`, dem Label „Plätze belegt“, der Anzahl fehlender Helfer („x Helfer fehlen noch“) und einem Fortschrittsbalken.
* **FR-H-04 (MUSS):** `gesamt` ist die Summe aller Bedarfswerte über alle Schichten und Stände. `belegt` ist die Anzahl der Assignments auf gültigen Slots (`slotIndex < demand`); verwaiste oder überzählige Einträge zählen nicht. `fehlend = max(0, gesamt - belegt)`.
* **FR-H-05 (MUSS):** Die Fortschrittsanzeige aktualisiert sich in Echtzeit, wenn Einträge hinzugefügt, geändert oder gelöscht werden.
* **FR-H-06 (MUSS):** Bei `gesamt = 0` zeigt die Karte „Noch keine Plätze konfiguriert“ und keinen Fortschrittsbalken; eine Division durch null findet nicht statt. Die Schichtliste zeigt den Leerzustand „Noch keine Schichten konfiguriert.“ mit einem Link zum Admin-Bereich.
* **FR-H-07 (MUSS):** Der Fortschrittsbalken hat `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="{gesamt}"`, `aria-valuenow="{belegt}"` und eine deutsche `aria-label`.
* **FR-H-08 (MUSS):** Der Header enthält einen sichtbaren Admin-Link mit Schloss-Icon, der zu `admin.html` führt.
* **FR-H-09 (SOLL):** Bei aktiver Admin-Session zeigt der Link „Admin-Bereich“ statt „Admin“.
* **FR-H-10 (MUSS):** Der Header ist auch bei kleiner Breite vollständig lesbar; Tagline und Fortschrittskarte brechen um, ohne überzulaufen.

#### 4.2 Filterleiste

* **FR-H-11 (MUSS):** Unter dem Header befindet sich eine sticky Filterleiste mit den Filtern „Stand“, „Schicht“ und „Gruppe“.
* **FR-H-12 (MUSS):** Jeder Filter hat die Standardoption „Alle“ und zeigt die aktuell konfigurierten Werte.
* **FR-H-13 (MUSS):** Die Filter werden mit UND kombiniert. Es werden nur Schichten und Stände angezeigt, die allen aktiven Filtern entsprechen.
* **FR-H-14 (MUSS):** Der Gruppenfilter wird nur eingeblendet, wenn mindestens eine Gruppe existiert. Existieren Gruppen, enthält der Filter zusätzlich die Option „Ohne Gruppe“.
* **FR-H-15 (MUSS):** Ein „Zurücksetzen“-Link setzt alle Filter auf „Alle“ zurück. Er ist immer sichtbar, ohne aktiven Filter jedoch deaktiviert und ausgegraut; auf kleinen Bildschirmen ist er als Icon-Button mit zugänglichem Label verfügbar.
* **FR-H-16 (MUSS):** Die Filterleiste ist auf kleinen Bildschirmen horizontal scrollbar, ohne sichtbare Scrollbar. Alle Filter-Bedienelemente haben mindestens 44 px Höhe.
* **FR-H-17 (MUSS):** Bei leerem Filterergebnis erscheint eine deutsche Meldung „Keine Einträge für diese Filter.“ mit einer Aktion „Filter zurücksetzen“.
* **FR-H-18 (MUSS):** Die Filter beeinflussen ausschließlich die Liste der Schichten und Stände, nicht die globalen Kennzahlen im Header.
* **FR-H-19 (SOLL):** Der Filterzustand wird in den URL-Query-Parametern gespeichert, damit ein gefilterter Plan geteilt oder neu geladen werden kann.
* **FR-H-20 (SOLL):** Die Filter-Dropdowns sind per Tastatur bedienbar (`Enter`, `Leertaste`, `Escape`, Pfeiltasten), haben `aria-expanded` und schließen bei Klick außerhalb.
* **FR-H-21 (MUSS):** Die Filterleiste bleibt beim Scrollen oben sichtbar (`position: sticky`, `top: 0`, ausreichender `z-index`) und überdeckt keine Dialoge.

#### 4.3 Schichtkarten

* **FR-H-22 (MUSS):** Jede Schicht wird als eigene Karte dargestellt. Die Reihenfolge folgt dem `order`-Feld, bei Gleichstand der Startzeit.
* **FR-H-23 (MUSS):** Der Kartenkopf zeigt den Schichtnamen, die Zeit im Format `HH:MM – HH:MM Uhr`, die Anzahl freier Plätze und die Belegung `belegt/gesamt`.
* **FR-H-24 (MUSS):** Die Anzahl freier Plätze einer Schicht ist die Summe der freien Plätze aller in dieser Schicht aktiven Stände.
* **FR-H-25 (MUSS):** Ist mindestens ein Platz frei, zeigt der Kopf ein grünes Badge „x frei“. Ist die Schicht vollständig belegt, zeigt er „Vollzählig“ mit Check-Icon.
* **FR-H-26 (MUSS):** Das Badge `belegt/gesamt` wird ab der Breakpoint `sm` (640 px) zusätzlich angezeigt; auf kleinen Bildschirmen genügt das Frei-Badge.
* **FR-H-27 (MUSS):** Eine Schicht ohne aktive Stände (alle Bedarfswerte 0) wird in der Helfer-Ansicht ausgeblendet. Im Admin-Bereich bleibt sie sichtbar.
* **FR-H-28 (MUSS):** Alle Schichtkarten sind aufgeklappt; ein Accordion- oder Aufklapp-Verhalten ist in Version 1 nicht vorgesehen.

#### 4.4 Stände und Plätze

* **FR-H-29 (MUSS):** Innerhalb einer Schicht wird jeder aktive Stand als aufgeklappter Block mit Icon, Name, optionalem Gruppen-Badge, Belegungstext, Status und allen Plätzen dargestellt. Die im Prototyp in der Abendschicht verwendeten Kompaktzeilen entfallen; alle Schichten nutzen dieselbe aufgeklappte Slot-Karte.
* **FR-H-30 (MUSS):** Der Belegungstext lautet „x von y Plätzen belegt“. Bei y = 1 wird „1 von 1 Platz belegt“ verwendet.
* **FR-H-31 (MUSS):** Das Gruppen-Badge zeigt den Gruppennamen in der konfigurierten Farbe. Hat ein Stand keine Gruppe, erscheint das Badge „Ohne Gruppe“ in Slate-Grau.
* **FR-H-32 (MUSS):** Ist noch ein Platz frei, zeigt der Stand-Status „1 Platz frei“ bzw. „x Plätze frei“ mit grünem Punkt. Ist der Stand voll, zeigt er „Vollzählig“ mit Check-Icon.
* **FR-H-33 (MUSS):** Hat ein Stand in einer Schicht den Bedarf 0, wird er in dieser Schicht nicht angezeigt.
* **FR-H-34 (MUSS):** Die Plätze werden als Grid dargestellt: eine Spalte auf Mobilgeräten, zwei Spalten ab `sm` (640 px).
* **FR-H-35 (MUSS):** Ein belegter Platz ist eine Schaltfläche mit Initialen-Avatar, dem Namen (bei Platzmangel gekürzt) und einem Stift-Icon. Die Schaltfläche ist mindestens 48 px hoch.
* **FR-H-36 (MUSS):** Ein freier Platz ist eine Schaltfläche mit gestricheltem Himmelblau-Rahmen, Plus-Icon, dem Text „Freier Platz“ und der Aktion „Eintragen“. Die Schaltfläche ist mindestens 48 px hoch.
* **FR-H-37 (MUSS):** Der Avatar zeigt maximal zwei Initialen: ersten Buchstaben des ersten und des letzten Wortes; bei einem Wort die ersten beiden Buchstaben. Die Avatar-Farbe entspricht der Stand-Farbe in der 700er-Stufe; für die Stand-Farbe `sky` wird `navy-700` verwendet.
* **FR-H-38 (MUSS):** Lange Namen werden mit Ellipse gekürzt; der vollständige Name ist über `title` und ein zugängliches Label erreichbar.
* **FR-H-39 (MUSS):** Belegte und freie Plätze haben sichtbare Hover-, Fokus- (`focus-visible`) und Aktiv-Zustände. Der Fokusring ist 2 px Sky-500 mit 2 px Offset.
* **FR-H-40 (MUSS):** Oberhalb der Schichtliste befindet sich eine Legende für „belegt“ (graue Karte) und „frei“ (gestrichelter Sky-Rahmen).
* **FR-H-41 (MUSS):** Namen werden ausschließlich als Text gerendert; HTML, Skripte oder Event-Handler aus Namen werden nicht interpretiert.
* **FR-H-42 (MUSS):** Die Anzahl der angezeigten Plätze entspricht exakt dem Bedarf. Gibt es mehr Assignments als Bedarf (Dateninkonsistenz), wird der Überschuss nicht angezeigt und ein Konsolenfehler protokolliert.

#### 4.5 Eintragen, Bearbeiten und Löschen

* **FR-H-43 (MUSS):** Klick/Tipp auf einen freien Platz öffnet einen Dialog „Platz eintragen“ mit Kontext (Schicht, Stand, Platznummer) und einem Namensfeld.
* **FR-H-44 (MUSS):** Klick/Tipp auf einen belegten Platz öffnet „Eintrag bearbeiten“ mit vorausgefülltem Namen, Speichern, Abbrechen und Löschen.
* **FR-H-45 (MUSS):** Der Name wird getrimmt, interne mehrfache Leerzeichen werden zu einem Leerzeichen zusammengefasst. Gültig sind 2–60 Zeichen. Leerzeichen allein ist ungültig. Steuerzeichen und `<`/`>` werden abgelehnt.
* **FR-H-46 (MUSS):** Der Speichern-Button ist deaktiviert, solange die Eingabe ungültig ist. Die Fehlermeldung erscheint direkt am Feld auf Deutsch.
* **FR-H-47 (MUSS):** Speichern verwendet `runTransaction` mit optimistischer Konfliktprüfung: Beim Öffnen wird der erwartete aktuelle Wert festgehalten; beim Speichern wird abgebrochen, wenn sich der Platz inzwischen geändert hat.
* **FR-H-48 (MUSS):** Bei einem Konflikt bleibt der Dialog offen, zeigt die Meldung „Dieser Platz wurde inzwischen geändert. Bitte prüfe den aktuellen Eintrag.“ und bietet „Aktualisieren“ an.
* **FR-H-49 (MUSS):** Nach erfolgreichem Speichern schließt der Dialog, die Ansicht aktualisiert sich, der Fokus kehrt zum Platz zurück und ein Toast „Eingetragen“ bzw. „Gespeichert“ erscheint.
* **FR-H-50 (MUSS):** Löschen erfordert eine Bestätigung „Eintrag wirklich löschen?“ mit „Löschen“ und „Abbrechen“. Nach Erfolg wird der Platz frei, ein Toast „Eintrag gelöscht“ erscheint.
* **FR-H-51 (MUSS):** Abbrechen, Escape und Klick auf den Hintergrund schließen den Dialog ohne Speichern. Bei ungespeicherten Änderungen fragt die App nach, ob sie verworfen werden sollen.
* **FR-H-52 (MUSS):** Der Dialog hat `role="dialog"`, `aria-modal="true"` und einen zugänglichen Titel, fängt den Fokus ein, gibt ihn nach dem Schließen zurück und ist auf Mobilgeräten als Bottom-Sheet oder zentriertes Modal mit scrollbarem Inhalt umgesetzt.
* **FR-H-53 (MUSS):** Jeder darf jeden Eintrag bearbeiten und löschen; es gibt keine Eingabesperre pro Person. Das ist beabsichtigt.
* **FR-H-54 (SOLL):** Wenn derselbe Name bereits in derselben Schicht eingetragen ist, zeigt der Dialog einen nicht blockierenden Hinweis „Dieser Name ist in dieser Schicht bereits eingetragen.“
* **FR-H-55 (MUSS):** Jede Änderung schreibt einen Audit-Log-Eintrag. Schlägt der Audit-Log-Schreibvorgang fehl, bleibt die Benutzeraktion erfolgreich; der Fehler wird in der Konsole protokolliert.
* **FR-H-56 (MUSS):** Im Dialog steht ein Datenschutzhinweis: „Dein Name wird öffentlich im Schichtplan angezeigt. Es werden keine Kontaktdaten erhoben.“

#### 4.6 Echtzeit, Offline und Fehlerzustände

* **FR-H-57 (MUSS):** Die Helfer-Ansicht abonniert `config`, `groups`, `shifts`, `stands`, `demand` und `assignments`. Änderungen werden ohne Neuladen sichtbar.
* **FR-H-58 (MUSS):** Beim ersten Laden erscheint ein Skeleton oder ein Ladeindikator; es wird kein leerer „keine Daten“-Zustand vorgetäuscht.
* **FR-H-59 (MUSS):** Bei fehlender Verbindung erscheint ein Banner „Offline – Änderungen werden synchronisiert, sobald wieder Verbindung besteht.“
* **FR-H-60 (MUSS):** Nach Wiederherstellung der Verbindung verschwindet das Banner; gepufferte Schreibvorgänge werden synchronisiert. Bei Konflikten gilt FR-H-48. Bis zur serverseitigen Bestätigung kennzeichnet die UI den betroffenen Platz als „Wird synchronisiert“. `runTransaction`-Vorgänge werden bei fehlender Verbindung erst nach Wiederverbindung abgeschlossen; ein Reload im Offline-Zustand kann sie verlieren (siehe ARC-12).
* **FR-H-61 (MUSS):** Bei Berechtigungs- oder Ladefehlern erscheint eine deutsche Fehlermeldung mit „Erneut versuchen“.
* **FR-H-62 (MUSS):** Echtzeit-Updates dürfen den Fokus und die Scrollposition nicht unerwartet zurücksetzen. Wenn der aktualisierte Platz sichtbar ist, bleibt die Position erhalten.
* **FR-H-63 (SOLL):** Ein kurzer Verbindungsstatus (online/offline) ist auch ohne Banner im Footer oder über ein kleines Status-Icon erkennbar.
* **FR-H-64 (MUSS):** Die App zeigt bei `gesamt > 0` und `belegt = gesamt` einen positiven Zustand „Alle Plätze belegt – vielen Dank!“ oberhalb der Liste.

#### 4.7 WhatsApp-Teilen

* **FR-H-65 (MUSS):** Unter dem Schichtplan befindet sich eine WhatsApp-Karte mit Überschrift „Noch Helfer gesucht?“, Erklärungstext und einem grünen Button „Auf WhatsApp teilen“.
* **FR-H-66 (MUSS):** Der Share-Text wird aus den Veranstaltungsdaten und der aktuellen Anzahl fehlender Helfer erzeugt. `{eventDate}` wird wie in FR-H-02 formatiert, nicht als ISO-Datum. Vorlage:
  „Hallo zusammen! Für {eventName} am {eventDate} in {eventLocation} werden noch Helfer gesucht. Es fehlen noch {missing} Helfer. Tragt euch hier ein: {url}“
* **FR-H-67 (MUSS):** Bei `missing = 1` wird die Vorlage „Ein fehlender Helfer“ aus Anhang A verwendet, bei `missing = 0` die Vorlage „Plan voll“. Die Vorlagen in Anhang A sind verbindlich.
* **FR-H-68 (MUSS):** Der Text wird mit `encodeURIComponent` kodiert und über `https://wa.me/?text=...` in einem neuen Tab geöffnet (`target="_blank"`, `rel="noopener noreferrer"`).
* **FR-H-69 (MUSS):** Die geteilte URL ist die kanonische Seiten-URL ohne Filterparameter und ohne Tracking-Parameter.
* **FR-H-70 (MUSS):** Die Seite enthält Open-Graph-Metadaten (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`), damit WhatsApp eine Vorschau anzeigt. Da WhatsApp kein JavaScript ausführt, sind diese Tags statisch; bei Änderungen der Veranstaltungsdaten müssen sie im Deployment angepasst werden.
* **FR-H-71 (SOLL):** Ein statisches OG-Bild im Format 1200 × 630 px liegt unter `assets/og-image.png` und zeigt „Helferplan“ sowie ein neutrales Vereinsmotiv.
* **FR-H-72 (MUSS):** Der Button ist auch auf kleinen Bildschirmen voll breit und mindestens 48 px hoch.
* **FR-H-73 (SOLL):** Der Button funktioniert auf Desktop (WhatsApp Web) und Mobilgeräten (WhatsApp-App) gleichwertig.

#### 4.8 Footer und Datenschutz

* **FR-H-74 (MUSS):** Der Footer zeigt „Helferplan · {clubName}“ sowie einen Link „Admin-Login“ zu `admin.html`.
* **FR-H-75 (MUSS):** Der Footer ist nicht sticky und erscheint nach dem WhatsApp-Bereich.
* **FR-H-76 (SOLL):** Der Footer enthält einen Link „Datenschutz“, der eine statische Datenschutzhinweis-Seite oder ein Modal öffnet.
* **FR-H-77 (MUSS):** Der Footer ist auch bei 320 px Breite lesbar; die Elemente brechen um.

---

### 5. Funktionale Anforderungen – Admin-Bereich

Der Admin-Bereich ist eine separate Seite `admin.html` im gleichen Designsystem. Er ist passwortgeschützt und wird über den Admin-Link in Header und Footer erreicht.

#### 5.1 Admin-Authentifizierung

* **FR-A-01 (MUSS):** Beim Aufruf von `admin.html` prüft die App, ob `config/adminHash` und `config/adminSalt` vorhanden und formal gültig sind. Fehlt einer der Werte oder ist er ungültig, wird der Erstvergabe-Dialog angezeigt. Sind beide gültig, wird der Login angezeigt.
* **FR-A-02 (MUSS):** Erstvergabe: Passwort und Passwortwiederholung, mindestens 8 Zeichen. Ein Salt mit 16 zufälligen Bytes wird über `crypto.getRandomValues` erzeugt und als 32 Hex-Zeichen gespeichert; `adminHash = SHA-256(UTF-8(adminSaltHex + password))` wird als 64 Hex-Zeichen gespeichert. Danach ist der Admin automatisch angemeldet.
* **FR-A-03 (MUSS):** Login: Passwort eingeben; die App berechnet den Hash mit dem gespeicherten Salt und vergleicht ihn mit `adminHash`. Bei Erfolg wird die Session angelegt; bei Fehler erscheint „Passwort falsch.“ ohne Details.
* **FR-A-04 (MUSS):** Die Session liegt in `sessionStorage` unter `helferplan.admin.session` mit `authenticated` und `lastActivity`. Sie läuft nach 30 Minuten Inaktivität ab. Jede Admin-Aktion aktualisiert `lastActivity`.
* **FR-A-05 (MUSS):** „Abmelden“ löscht die Session und leitet zur Helfer-Ansicht oder zum Login weiter.
* **FR-A-06 (MUSS):** „Passwort ändern“ verlangt das aktuelle Passwort, das neue Passwort und die Wiederholung. Nach Erfolg werden `adminSalt` und `adminHash` aktualisiert; die Session bleibt bestehen.
* **FR-A-07 (MUSS):** Passwort-Recovery: Der Admin löscht `adminHash` und `adminSalt` in der Firebase Console und lädt `admin.html` neu. Dann erscheint wieder die Erstvergabe. Dieser Ablauf ist im README und als Hinweis auf dem Login zu dokumentieren.
* **FR-A-08 (MUSS):** Passwortregeln: mindestens 8 Zeichen, maximal 128 Zeichen, keine reinen Leerzeichen. 12 Zeichen werden empfohlen.
* **FR-A-09 (MUSS):** Auf Login- und Erstvergabeseite steht ein sichtbarer Sicherheitshinweis: „Der Admin-Zugang ist ein UI-Schutz, keine Server-Authentifizierung. Der Passwort-Hash ist in der Datenbank lesbar. Bitte ein starkes, einzigartiges Passwort verwenden.“
* **FR-A-10 (MUSS):** Nach erfolgreichem Login wird der Admin auf das Dashboard weitergeleitet. Direkte Aufrufe von Admin-Unterseiten ohne gültige Session zeigen den Login.
* **FR-A-11 (SOLL):** Ein „Passwort vergessen?“-Link öffnet einen Dialog mit der Recovery-Anleitung aus FR-A-07.
* **FR-A-12 (KANN):** Optional kann die Session bei „Angemeldet bleiben“ in `localStorage` gespeichert werden; Standard ist `sessionStorage`.

#### 5.2 Veranstaltungseinstellungen

* **FR-A-13 (MUSS):** Der Admin kann folgende Felder bearbeiten: Vereinsname, Veranstaltungsname, Datum, Ort und Tagline. Der Vereinsname wird im Footer unverändert angezeigt.
* **FR-A-14 (MUSS):** Pflichtfelder: Vereinsname, Veranstaltungsname, Datum, Ort. Die Tagline ist optional.
* **FR-A-15 (MUSS):** Längenlimits: Vereinsname 1–80, Veranstaltungsname 1–80, Ort 1–120, Tagline 0–160 Zeichen.
* **FR-A-16 (MUSS):** Das Datum wird als ISO-Datum (`YYYY-MM-DD`) gespeichert und in der Helfer-Ansicht deutsch formatiert.
* **FR-A-17 (MUSS):** Änderungen werden nach dem Speichern sofort in der Helfer-Ansicht sichtbar (Echtzeit).
* **FR-A-18 (SOLL):** Eine Vorschau zeigt den Header mit den aktuellen Werten.
* **FR-A-19 (MUSS):** Der App-Name „Helferplan“ ist fest und nicht editierbar.

#### 5.3 Stände

* **FR-A-20 (MUSS):** Der Admin sieht alle Stände als Liste mit Name, Icon, Farbe, Gruppe und Reihenfolge.
* **FR-A-21 (MUSS):** Anlegen und Bearbeiten: Name (2–60 Zeichen, eindeutig, case-insensitiv), Icon, Farbe, optionale Gruppe, Reihenfolge.
* **FR-A-22 (MUSS):** Icon-Auswahl aus einem festen Satz: `flame`, `beer`, `cash`, `cake`, `droplet`, `coffee`, `music`, `ticket`, `salad`, `waffle`, `ice-cream`, `fries`, `popcorn`, `candy`, `sausage`, `lemonade`, `tea`, `wine`, `cocktail`, `star`, `users`, `child`, `heart`, `balloon`, `gift`, `game`, `tent`.
* **FR-A-23 (MUSS):** Farbauswahl aus einem festen Satz: `sky`, `teal`, `indigo`, `rose`, `amber`, `violet`, `emerald`, `slate`.
* **FR-A-24 (MUSS):** Gruppe ist optional; Standard ist „Ohne Gruppe“.
* **FR-A-25 (MUSS):** Die Reihenfolge wird über Hoch-/Runter-Buttons geändert und als `order` gespeichert; der Tausch zweier Positionen erfolgt atomar per Multi-Path-Update. Drag-and-drop ist optional.
* **FR-A-26 (MUSS):** Löschen eines Standes verlangt eine Bestätigung und entfernt den Stand, seinen Bedarf in allen Schichten und alle zugehörigen Assignments. Ein Audit-Log-Eintrag wird geschrieben.
* **FR-A-27 (MUSS):** Die Reihenfolge der Stände gilt in der Helfer-Ansicht innerhalb jeder Schicht.
* **FR-A-28 (SOLL):** Die Liste zeigt eine Vorschau von Icon und Farbe.
* **FR-A-29 (MUSS):** Ein Stand mit Bedarf 0 in allen Schichten bleibt im Admin sichtbar und wird mit „In keiner Schicht aktiv“ markiert.

#### 5.4 Schichten

* **FR-A-30 (MUSS):** Der Admin sieht alle Schichten als Liste mit Name, Startzeit, Endzeit und Reihenfolge.
* **FR-A-31 (MUSS):** Anlegen und Bearbeiten: Name (2–60 Zeichen), Startzeit (`HH:MM`), Endzeit (`HH:MM`), Reihenfolge.
* **FR-A-32 (MUSS):** Die Endzeit muss nach der Startzeit liegen. Übernacht-Schichten sind in Version 1 nicht vorgesehen.
* **FR-A-33 (MUSS):** Die Reihenfolge wird über Hoch-/Runter-Buttons geändert und als `order` gespeichert.
* **FR-A-34 (MUSS):** Löschen einer Schicht verlangt eine Bestätigung und entfernt die Schicht, ihren Bedarf und alle zugehörigen Assignments. Ein Audit-Log-Eintrag wird geschrieben.
* **FR-A-35 (SOLL):** Überlappende Schichten erzeugen eine Warnung, blockieren das Speichern aber nicht.
* **FR-A-36 (MUSS):** Neue Schichten starten mit leeren Pflichtfeldern und einer verständlichen Validierung.

#### 5.5 Gruppen

* **FR-A-37 (MUSS):** Der Admin sieht alle Gruppen als Liste mit Name, Farbe und Reihenfolge.
* **FR-A-38 (MUSS):** Anlegen und Bearbeiten: Name (2–40 Zeichen, eindeutig, case-insensitiv), Farbe, Reihenfolge.
* **FR-A-39 (MUSS):** Farbauswahl aus demselben Satz wie bei Ständen; die Farbe bestimmt das Badge in der Helfer-Ansicht.
* **FR-A-40 (MUSS):** Löschen einer Gruppe verlangt eine Bestätigung. Zugewiesene Stände werden auf „Ohne Gruppe“ gesetzt; Assignments bleiben erhalten. Ein Audit-Log-Eintrag wird geschrieben.
* **FR-A-41 (MUSS):** Es dürfen null Gruppen existieren. Dann wird der Gruppenfilter in der Helfer-Ansicht ausgeblendet.
* **FR-A-42 (SOLL):** Die Reihenfolge der Gruppen bestimmt die Reihenfolge im Filter und in Badges.

#### 5.6 Bedarfsmatrix

* **FR-A-43 (MUSS):** Der Admin kann pro Stand und Schicht den benötigten Helferbedarf als ganze Zahl von 0 bis 20 festlegen.
* **FR-A-44 (MUSS):** Desktop: Matrix mit Ständen als Zeilen und Schichten als Spalten. Mobil: pro Schicht eine Karte mit allen Ständen und Number-Inputs.
* **FR-A-45 (MUSS):** Bedarf 0 oder ein fehlender Bedarfswert blendet den Stand in dieser Schicht in der Helfer-Ansicht aus. Bedarf > 0 erzeugt genau diese Anzahl Slots.
* **FR-A-46 (MUSS):** Wird der Bedarf unter die Anzahl bestehender Assignments gesenkt, zeigt die App eine Warnung mit den betroffenen Plätzen. Nach Bestätigung werden alle Assignments mit `slotIndex >= neuem Bedarf` gelöscht; je gelöschtem Assignment wird ein Audit-Log-Eintrag geschrieben.
* **FR-A-47 (MUSS):** Wird der Bedarf erhöht, entstehen neue freie Slots.
* **FR-A-48 (MUSS):** Nicht-numerische oder negative Eingaben werden abgelehnt; Dezimalzahlen werden abgelehnt.
* **FR-A-49 (MUSS):** Änderungen werden erst nach „Speichern“ übernommen; ein Indikator zeigt ungespeicherte Änderungen.
* **FR-A-50 (SOLL):** „Alle auf 0“ und „Zeile/Spalte kopieren“ sind optionale Komfortfunktionen.
* **FR-A-51 (MUSS):** Ein Stand mit Bedarf 0 in allen Schichten wird im Admin als „In keiner Schicht aktiv“ markiert.

#### 5.7 Zurücksetzen

* **FR-A-52 (MUSS):** „Einträge zurücksetzen“ löscht alle Assignments, behält aber Konfiguration, Gruppen, Schichten, Stände und Bedarf. Optional kann das Audit-Log mitgelöscht werden.
* **FR-A-53 (MUSS):** „Konfiguration zurücksetzen“ löscht Assignments, Bedarf, Stände, Schichten und Gruppen; Veranstaltungseinstellungen und Admin-Hash bleiben erhalten.
* **FR-A-54 (MUSS):** „Alles löschen“ löscht alle Event-Daten einschließlich Veranstaltungseinstellungen, Admin-Hash und Audit-Log; danach erscheint die Erstvergabe.
* **FR-A-55 (MUSS):** Jede Reset-Aktion verlangt eine explizite Bestätigung. Für „Alles löschen“ muss der Admin die Phrase „ALLES LÖSCHEN“ eingeben.
* **FR-A-56 (MUSS):** Vor dem Reset wird ein Hinweis auf den Druck-/PDF-Export angezeigt; der Export ist nicht zwingend.
* **FR-A-57 (MUSS):** Reset-Operationen werden als Multi-Path-Update oder `remove()` ausgeführt und sind gegen Fehler abgesichert. Bei Teilfehlern zeigt die App eine verständliche Meldung.
* **FR-A-58 (MUSS):** Wenn das Audit-Log erhalten bleibt, wird vor dem Löschen ein Reset-Eintrag geschrieben. Wird das Audit-Log gelöscht, entfällt dieser Eintrag.
* **FR-A-59 (SOLL):** Nach einem Reset bleibt der Admin angemeldet, außer bei „Alles löschen“.

#### 5.8 Export

* **FR-A-60 (MUSS):** Der Admin kann die Helferliste drucken bzw. als PDF speichern. Der Button öffnet den Browser-Druckdialog.
* **FR-A-61 (MUSS):** Das Drucklayout ist standardmäßig A4 Querformat mit Veranstaltungsheader (Verein, Veranstaltung, Datum, Ort), Tabelle und Generierungszeitpunkt.
* **FR-A-62 (MUSS):** Die Drucktabelle ist eine Matrix und enthält unabhängig von aktiven Filtern alle Schichten und Stände: Die erste Spalte listet die Stände mit Gruppe, die erste Zeile alle Schichten mit ihren Zeiten. Jede Zelle enthält die belegten Plätze mit Namen; freie Plätze werden als „frei“ ausgegeben.
* **FR-A-63 (MUSS):** Navigation, Filter, Buttons, WhatsApp-Karte, Footer-Links und Schatten werden im Druck ausgeblendet. Es werden keine Seiten mitten in einer Tabellenzeile umbrochen.
* **FR-A-90 (MUSS):** Der Admin kann die Konfiguration unter „Sicherung“ als JSON exportieren. Die Datei enthält Veranstaltungsdaten, Stände mit Farben und Icons, Gruppen, Schichten und Bedarf. Sie enthält keine Helfer-Einträge, keine Admin-Zugangsdaten und kein Audit-Log. Der Standard-Dateiname lautet `YYYY-MM-DD_Titel.json`, wobei `Titel` der Veranstaltungsname ist.
* **FR-A-91 (MUSS):** Der Admin kann eine zuvor exportierte Konfigurationsdatei importieren. Die Datei wird vor der Übernahme validiert; Fehler werden verständlich angezeigt, und der Import erfolgt erst nach einer Bestätigung. Importiert werden ausschließlich die Konfigurationsdaten; vorhandene Helfer-Einträge bleiben erhalten, sofern sie weiterhin zu Ständen, Schichten und Bedarf passen, andernfalls werden sie entfernt. Admin-Passwort und Audit-Log bleiben unverändert.

#### 5.9 Audit-Log

* **FR-A-71 (MUSS):** Bei jedem Anlegen, Bearbeiten und Löschen eines Assignments wird ein Audit-Log-Eintrag geschrieben.
* **FR-A-72 (MUSS):** Bei Konfigurationsänderungen (Stand, Schicht, Gruppe, Bedarf, Veranstaltung) wird ebenfalls ein Audit-Log-Eintrag geschrieben. Bei Passwortänderungen werden weder alter noch neuer Hash oder Salt im Audit-Log gespeichert; der Eintrag enthält nur `action: update`, `entity: config` und `entityId: adminHash`.
* **FR-A-73 (MUSS):** Ein Audit-Log-Eintrag enthält mindestens: `ts`, `action`, `entity`, `entityId`, `shiftId`, `standId`, `slotIndex`, `oldValue`, `newValue`, `actor`.
* **FR-A-74 (MUSS):** `actor` ist `admin`, wenn im selben Tab eine gültige Admin-Session aktiv ist, sonst `helper`. Eine eindeutige Personenidentifikation gibt es nicht; der Wert ist nicht fälschungssicher.
* **FR-A-75 (MUSS):** Das Audit-Log ist für Clients nicht lesbar. Die Einsicht erfolgt über die Firebase Console.
* **FR-A-76 (MUSS):** Das Audit-Log wird beim „Einträge zurücksetzen“ optional und bei „Alles löschen“ zwingend gelöscht. Die Aufbewahrung ist im Datenschutzhinweis zu beschreiben.
* **FR-A-77 (SOLL):** Eine spätere Admin-UI für das Audit-Log ist möglich, erfordert aber eine echte Authentifizierung.

#### 5.10 Admin-Oberfläche

* **FR-A-78 (MUSS):** `admin.html` verwendet dasselbe Designsystem wie die Helfer-Ansicht (Farben, Typografie, Radien, Schatten, Fokusringe).
* **FR-A-79 (MUSS):** Die Admin-Oberfläche hat folgende Bereiche: Übersicht, Veranstaltung, Stände, Schichten, Gruppen, Bedarf, Drucken, Sicherung, Passwort ändern, Zurücksetzen und Abmelden.
* **FR-A-80 (MUSS):** Die Navigation ist auf Mobilgeräten horizontal scrollbar; auf Desktop als Tabs oder Seitenleiste.
* **FR-A-81 (MUSS):** Formulare haben sichtbare Labels, Inline-Validierung, Speichern/Abbrechen und Toast-Feedback.
* **FR-A-82 (MUSS):** Destruktive Aktionen öffnen einen Bestätigungsdialog mit klarer Konsequenzbeschreibung.
* **FR-A-83 (MUSS):** Die Admin-Oberfläche ist vollständig per Tastatur bedienbar und hat sichtbare Fokusringe.
* **FR-A-84 (MUSS):** Ein Link „Zur Helfer-Ansicht“ öffnet `index.html` in einem neuen Tab oder derselben Ansicht. Die Bearbeitung und Löschung einzelner Einträge erfolgt in der Helfer-Ansicht; ein separates Assignment-Management im Admin-Bereich ist nicht erforderlich.
* **FR-A-85 (MUSS):** Der Logout-Button ist immer sichtbar, wenn eine Session aktiv ist.
* **FR-A-86 (SOLL):** Das Dashboard zeigt Kennzahlen: Anzahl Stände, Schichten, Gruppen, belegte Plätze und offene Plätze.
* **FR-A-87 (MUSS):** Wenn noch keine Schichten oder Stände existieren, zeigt der Admin einen Onboarding-Hinweis mit den nächsten Schritten.
* **FR-A-88 (MUSS):** Der Admin-Container darf für Tabellen breiter sein als die Helfer-Ansicht (`max-w-5xl`), die Designsprache bleibt gleich.
* **FR-A-89 (SOLL):** Ungespeicherte Änderungen lösen beim Verlassen der Seite eine Browser-Warnung aus.

---

### 6. Datenmodell & Persistenz

#### 6.1 Struktur der Realtime Database

Die Daten liegen auf oberster Ebene. Es gibt genau eine aktive Veranstaltung pro Deployment.

```json
{
  "config": {
    "clubName": "TSV Musterstadt",
    "eventName": "Vereinsfest 2026",
    "eventDate": "2026-06-14",
    "eventLocation": "Festplatz am Sportheim",
    "tagline": "Helfer gesucht. Packst du mit an?",
    "adminSalt": "0123456789abcdef0123456789abcdef",
    "adminHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
  },
  "groups": {
    "-Ngroup1": { "name": "Aktive", "color": "amber", "order": 0 },
    "-Ngroup2": { "name": "Jugend", "color": "sky", "order": 1 }
  },
  "shifts": {
    "-Nshift1": { "name": "Frühschicht", "start": "11:00", "end": "14:00", "order": 0 }
  },
  "stands": {
    "-Nstand1": { "name": "Grill", "icon": "flame", "color": "sky", "groupId": "-Ngroup1", "order": 0 }
  },
  "demand": {
    "-Nshift1": { "-Nstand1": 3 }
  },
  "assignments": {
    "-Nshift1": {
      "-Nstand1": {
        "0": { "name": "Lena Hoffmann", "createdAt": 1710000000000, "updatedAt": 1710000000000 }
      }
    }
  },
  "audit_log": {
    "-Nlog1": {
      "ts": 1710000000000,
      "action": "create",
      "entity": "assignment",
      "entityId": "-Nshift1/-Nstand1/0",
      "shiftId": "-Nshift1",
      "standId": "-Nstand1",
      "slotIndex": 0,
      "oldValue": null,
      "newValue": { "name": "Lena Hoffmann" },
      "actor": "helper"
    }
  }
}
```

#### 6.2 Felddefinitionen

| Pfad | Typ | Pflicht | Validierung / Hinweis |
|---|---|---|---|
| `config/clubName` | String | ja | 1–80 Zeichen |
| `config/eventName` | String | ja | 1–80 Zeichen |
| `config/eventDate` | String | ja | ISO `YYYY-MM-DD`, gültiges Datum |
| `config/eventLocation` | String | ja | 1–120 Zeichen |
| `config/tagline` | String | nein | 0–160 Zeichen |
| `config/adminSalt` | String | bei Hash | 32 Hex-Zeichen (16 Bytes) |
| `config/adminHash` | String | bei Hash | 64 Hex-Zeichen (SHA-256) |
| `groups/{id}/name` | String | ja | 2–40 Zeichen, eindeutig |
| `groups/{id}/color` | String | ja | Farb-Key aus FR-A-39 |
| `groups/{id}/order` | Number | ja | Ganzzahl, aufsteigend |
| `shifts/{id}/name` | String | ja | 2–60 Zeichen |
| `shifts/{id}/start` | String | ja | `HH:MM`, 00:00–23:59 |
| `shifts/{id}/end` | String | ja | `HH:MM`, nach `start` |
| `shifts/{id}/order` | Number | ja | Ganzzahl, aufsteigend |
| `stands/{id}/name` | String | ja | 2–60 Zeichen, eindeutig |
| `stands/{id}/icon` | String | ja | Icon-Key aus FR-A-22 |
| `stands/{id}/color` | String | ja | Farb-Key aus FR-A-23 |
| `stands/{id}/groupId` | String | nein | Muss auf eine existierende Gruppe zeigen; nicht gesetzt = „Ohne Gruppe“ |
| `stands/{id}/order` | Number | ja | Ganzzahl, aufsteigend |
| `demand/{shiftId}/{standId}` | Number | nein | Ganzzahl 0–20; fehlender Wert = 0 |
| `assignments/{shiftId}/{standId}/{slotIndex}/name` | String | ja | 2–60 Zeichen, getrimmt |
| `assignments/{shiftId}/{standId}/{slotIndex}/createdAt` | Number | ja | Unix-Zeitstempel in ms |
| `assignments/{shiftId}/{standId}/{slotIndex}/updatedAt` | Number | ja | Unix-Zeitstempel in ms |
| `audit_log/{id}` | Object | nein | Siehe Abschnitt 6.5 |

#### 6.3 IDs, Reihenfolge und Slot-Indizes

* **FR-D-01 (MUSS):** Gruppen, Schichten, Stände und Audit-Log-Einträge verwenden Firebase-`push()`-Keys.
* **FR-D-02 (MUSS):** Die Reihenfolge wird über das Feld `order` bestimmt. Bei Gleichstand wird nach Name und anschließend nach ID sortiert.
* **FR-D-03 (MUSS):** Slot-Indizes sind 0-basiert und liegen im Bereich `0` bis `demand - 1`. In der UI werden sie 1-basiert angezeigt.
* **FR-D-04 (MUSS):** Schichtzeiten werden als `HH:MM` gespeichert; die Anzeige ergänzt „Uhr“.
* **FR-D-05 (MUSS):** Das Veranstaltungsdatum wird als ISO-Datum gespeichert und nur für die Anzeige formatiert.
* **FR-D-06 (MUSS):** `groupId` ist entweder ein existierender Gruppen-Key oder nicht gesetzt (in der App als `null` behandelt). Beim Löschen einer Gruppe wird `groupId` bei den betroffenen Ständen entfernt.
* **FR-D-07 (MUSS):** Es werden keine Arrays für dynamische Listen verwendet; stattdessen Objects mit Push-Keys, damit parallele Änderungen keine Indizes verschieben.

#### 6.4 Transaktionen und Konfliktbehandlung

* **FR-D-08 (MUSS):** Beim Öffnen des Dialogs wird der aktuelle Wert `expectedName` (String oder `null`) und die Slot-Referenz gespeichert.
* **FR-D-09 (MUSS):** Beim Speichern wird `runTransaction(slotRef, current => ...)` verwendet:
  * Wenn `current?.name !== expectedName`, wird die Transaktion mit `undefined` abgebrochen.
  * Bei einer Neuanlage muss `current` leer sein.
  * Bei einer Bearbeitung muss `current.name` exakt `expectedName` entsprechen.
  * Bei einer Löschung muss `current.name` exakt `expectedName` entsprechen.
* **FR-D-10 (MUSS):** Nach einem Abbruch wird der aktuelle Wert erneut gelesen und die Konfliktmeldung aus FR-H-48 angezeigt.
* **FR-D-11 (MUSS):** Bei einer Neuanlage werden `createdAt` und `updatedAt` gesetzt; bei einer Bearbeitung bleibt `createdAt` erhalten und `updatedAt` wird aktualisiert. Anschließend wird der Audit-Log-Eintrag geschrieben.
* **FR-D-12 (MUSS):** Der Audit-Log-Schreibvorgang ist „best effort“ und darf die erfolgreiche Benutzeraktion nicht rückgängig machen.
* **FR-D-13 (MUSS):** Das Löschen eines Assignments entfernt den gesamten Slot-Datensatz, nicht nur den Namen.

#### 6.5 Audit-Log-Schema

| Feld | Typ | Beschreibung |
|---|---|---|
| `ts` | Number | Serverzeitstempel in Millisekunden |
| `action` | String | `create`, `update`, `delete` oder `reset` |
| `entity` | String | `assignment`, `stand`, `shift`, `group`, `demand` oder `config` |
| `entityId` | String | ID oder Pfad des geänderten Objekts |
| `shiftId` | String | Optional, bei Assignment- und Bedarfsänderungen |
| `standId` | String | Optional, bei Assignment- und Bedarfsänderungen |
| `slotIndex` | Number | Optional, bei Assignment-Änderungen |
| `oldValue` | Object oder String | Vorheriger Wert, bei Neuanlage `null` |
| `newValue` | Object oder String | Neuer Wert, bei Löschung `null` |
| `actor` | String | `helper` oder `admin` |
| `source` | String | Optional: `ui`, `import` oder `system` |

#### 6.6 Security Rules (Beispiel)

Die folgenden Regeln sind ein Startpunkt. Sie müssen im Firebase Emulator getestet werden. Wichtig: RTDB-Regeln können ohne Firebase Auth keine Admin-Rolle prüfen. Die Regeln verhindern strukturell ungültige Daten, aber keine mutwilligen Änderungen durch technisch versierte Nutzer.

```json
{
  "rules": {
    "config": {
      ".read": true,
      ".write": true,
      "clubName": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 80" },
      "eventName": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 80" },
      "eventDate": { ".validate": "newData.isString() && newData.val().matches(/^\\d{4}-\\d{2}-\\d{2}$/)" },
      "eventLocation": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 120" },
      "tagline": { ".validate": "newData.isString() && newData.val().length <= 160" },
      "adminSalt": { ".validate": "newData.isString() && newData.val().length == 32" },
      "adminHash": { ".validate": "newData.isString() && newData.val().length == 64" }
    },
    "groups": {
      ".read": true,
      ".write": true,
      "$groupId": {
        ".validate": "newData.hasChildren(['name','color','order'])"
      }
    },
    "shifts": {
      ".read": true,
      ".write": true,
      "$shiftId": {
        ".validate": "newData.hasChildren(['name','start','end','order'])"
      }
    },
    "stands": {
      ".read": true,
      ".write": true,
      "$standId": {
        ".validate": "newData.hasChildren(['name','icon','color','order'])"
      }
    },
    "demand": {
      ".read": true,
      ".write": true,
      "$shiftId": {
        "$standId": {
          ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 20 && newData.val() % 1 === 0"
        }
      }
    },
    "assignments": {
      ".read": true,
      "$shiftId": {
        "$standId": {
          "$slotIndex": {
            ".write": true,
            ".validate": "newData.hasChildren(['name','createdAt','updatedAt']) && newData.child('name').isString() && newData.child('name').val().length >= 2 && newData.child('name').val().length <= 60 && newData.child('createdAt').isNumber() && newData.child('updatedAt').isNumber()"
          }
        }
      }
    },
    "audit_log": {
      ".read": false,
      ".write": true,
      "$logId": {
        ".validate": "newData.hasChildren(['ts','action','entity','actor'])"
      }
    }
  }
}
```

Hinweise:

* `audit_log` ist bewusst nicht lesbar; die Firebase Console umgeht die Regeln.
* `config` enthält `adminHash` und ist öffentlich lesbar. Das ist für den clientseitigen Login erforderlich und ein akzeptiertes Restrisiko.
* Die Slot-Index-Validierung gegen `demand` ist in RTDB-Regeln aufwändig; sie wird zusätzlich in der App geprüft. Wenn eine serverseitige Validierung gewünscht ist, muss der Slot-Index im Datensatz mitgeführt oder auf Firebase Auth/Cloud Functions migriert werden.
* Die Regeln erlauben das Löschen ganzer Knoten (z. B. für Reset). Das ist beabsichtigt, aber auch ein Angriffsvektor.
* `.validate`-Regeln müssen auf den tatsächlich geschriebenen Kindpfaden liegen; das Beispiel ist bewusst einfach gehalten.

#### 6.7 Datenintegrität und Kaskaden

* **FR-D-14 (MUSS):** Beim Löschen eines Standes werden sein Bedarf in allen Schichten und alle zugehörigen Assignments entfernt. Der Stand selbst wird entfernt.
* **FR-D-15 (MUSS):** Beim Löschen einer Schicht werden ihr Bedarf und alle zugehörigen Assignments entfernt. Die Schicht selbst wird entfernt.
* **FR-D-16 (MUSS):** Beim Löschen einer Gruppe wird `groupId` bei allen Ständen entfernt, die auf diese Gruppe zeigen (in der App als `null` behandelt). Assignments bleiben erhalten.
* **FR-D-17 (MUSS):** Beim Löschen eines Assignments wird der gesamte Slot-Datensatz entfernt.
* **FR-D-18 (MUSS):** Die App prüft beim Rendern, ob ein Assignment einen gültigen Slot-Index innerhalb des Bedarfs hat. Ungültige Einträge werden nicht angezeigt und in der Konsole protokolliert.
* **FR-D-19 (SOLL):** Der Admin-Bereich bietet eine Funktion „Daten prüfen“, die verwaiste Assignments, Bedarfseinträge ohne Stand/Schicht und ungültige Gruppenverweise findet und bereinigt.
* **FR-D-20 (MUSS):** Ein Multi-Path-Update wird verwendet, wenn mehrere zusammengehörige Pfade atomar geändert werden müssen (z. B. Stand löschen).
* **FR-D-21 (MUSS):** Die Datenstruktur bleibt abwärtskompatibel: Neue optionale Felder dürfen hinzukommen, bestehende Felder werden nicht umbenannt, ohne eine Migration zu dokumentieren.
* **FR-D-22 (SOLL):** Der Admin-Bereich bietet einen Import und Export der Konfiguration als JSON (Veranstaltungsdaten, Stände, Schichten, Gruppen, Bedarf). Helfer-Einträge, Admin-Zugangsdaten und Audit-Log sind nicht Bestandteil des Exports.

---

### 7. Design & UI – „Klar & Klassisch“

#### 7.1 Design Tokens

**Farben:**

| Token | Wert | Verwendung |
|---|---|---|
| `navy-700` | `#174A73` | Avatar-Hintergründe, dunkle Akzente, Hover |
| `navy-800` | `#0D2A45` | Schicht-Icon-Kacheln, Überschriften |
| `navy-900` | `#0A1F33` | Header-Hintergrund, Primärtext auf hellem Grund |
| `sky-50` | `#F0F9FF` | Freie Plätze, Icon-Kacheln |
| `sky-100` | `#E0F2FE` | Icon-Kachel-Rahmen |
| `sky-200` | `#BAE6FD` | Badge-Rahmen im Header |
| `sky-300` | `#7DD3FC` | Gestrichelte Rahmen freier Plätze |
| `sky-400` | `#38BDF8` | Icons im Header, Fortschrittsbalken |
| `sky-500` | `#0EA5E9` | Fokusringe, primäre Aktionen |
| `sky-600` | `#0284C7` | Icon-Akzente |
| `sky-700` | `#0369A1` | Icon-Text und Labels auf Sky-Flächen |
| `sky-800` | `#075985` | Text „Freier Platz“ |
| `emerald-50` | `#ECFDF5` | Status-Badges „frei“ |
| `emerald-500` | `#10B981` | Status-Punkte |
| `emerald-600` | `#059669` | Badge-Rahmen |
| `emerald-700` | `#047857` | Status-Text |
| `slate-50` | `#F8FAFC` | Belegte Slot-Karten |
| `slate-100` | `#F1F5F9` | Seitenhintergrund, neutrale Badges |
| `slate-200` | `#E2E8F0` | Karten- und Slot-Rahmen |
| `slate-300` | `#CBD5E1` | Icons in belegten Slots |
| `slate-400` | `#94A3B8` | Dekorative Icons und Linien; nicht für Fließtext |
| `slate-500` | `#64748B` | Sekundärtext, Belegungstexte |
| `slate-800` | `#1E293B` | Fließtext |
| `slate-900` | `#0F172A` | Überschriften |
| `amber-50` | `#FFFBEB` | Gruppen-Badge „Aktive“ |
| `amber-600` | `#D97706` | Badge-Ring |
| `amber-700` | `#B45309` | Gruppen-Badge-Text „Aktive“ |
| `teal-50` | `#F0FDFA` | Stand-Icon „Ausschank“ |
| `teal-100` | `#CCFBF1` | Stand-Icon-Rahmen |
| `teal-700` | `#0F766E` | Stand-Icon-Text „Ausschank“ |
| `indigo-50` | `#EEF2FF` | Stand-Icon „Kasse“ |
| `indigo-100` | `#E0E7FF` | Stand-Icon-Rahmen |
| `indigo-700` | `#4338CA` | Stand-Icon-Text „Kasse“ |
| `rose-50` | `#FFF1F2` | Stand-Icon „Kuchenbuffet“ |
| `rose-100` | `#FFE4E6` | Stand-Icon-Rahmen |
| `rose-700` | `#BE123C` | Stand-Icon-Text „Kuchenbuffet“ |
| `violet-50` | `#F5F3FF` | Gruppen-Badge „Vorstand“ |
| `violet-700` | `#6D28D9` | Gruppen-Badge-Text „Vorstand“ |
| `whatsapp` | `#1FAF54` | WhatsApp-Button |
| `whatsapp-hover` | `#188F44` | WhatsApp-Button-Hover |
| `whatsapp-icon` | `#25D366` | WhatsApp-Icon-Hintergrund |

**Typografie:**

| Element | Vorgabe |
|---|---|
| Schriftart | Inter, Fallback `ui-sans-serif, system-ui, sans-serif` |
| Gewichte | 400, 500, 600, 700, 800 |
| H1 | `text-3xl` mobil, `text-4xl` ab `sm`, `font-bold`, `tracking-tight` |
| H2 | `text-lg`, `font-bold` |
| Kartentitel | `font-bold` bzw. `font-semibold` |
| Fließtext | `text-sm` bis `text-base` |
| Kleine Labels | `text-[11px]` bis `text-[10px]`, teils uppercase mit Tracking |
| Zahlen | `tabular-nums` für Zeiten und Zähler |

**Abstände, Radien, Schatten:**

| Token | Wert |
|---|---|
| Spacing-Basis | 4 px (Tailwind-Standard) |
| Karten-Radius | 16 px (`rounded-2xl`) |
| Slot-/Dialog-Radius | 12 px (`rounded-xl`) |
| Button-/Badge-Radius | 8 px (`rounded-lg`) bzw. `rounded-full`; WhatsApp-Button 12 px (`rounded-xl`) |
| Karten-Schatten | `0 1px 2px rgba(15,42,70,.04), 0 10px 28px -14px rgba(15,42,70,.22)` |
| Helfer-Container | `max-w-3xl` (768 px) |
| Admin-Container | `max-w-5xl` (1024 px) für Tabellen |
| Header-Hero | `py-7` mobil, `py-9` ab `sm` |
| Main | `pt-6` mobil, `pt-8` ab `sm`, `pb-10` |

Die Tokens werden in `tailwind.config.js` als `colors.navy`, `boxShadow.card` und `fontFamily.sans` abgebildet; alle übrigen Werte sind Tailwind-Standardklassen.

**Farbe und Kontrast:** Die Tabelle nennt die im Design verwendeten Stufen der Tailwind-Standardpalette. Für Fließtext und Labels wird mindestens `slate-500` verwendet; `slate-400` ist nur für dekorative Elemente zulässig. Kleine Labels in `sky-600` werden für ausreichenden Kontrast auf `sky-700` abgedunkelt. Diese beiden Regeln sind bewusste Barrierefreiheitskorrekturen gegenüber dem Prototyp.

**Breakpoints:** `sm` 640 px, `md` 768 px, `lg` 1024 px.

**Touch-Ziele:** Slots mindestens 48 px hoch; alle anderen interaktiven Elemente mindestens 44 × 44 px.

#### 7.2 Layout und responsive Verhalten

* **FR-UI-01 (MUSS):** Die Helfer-Ansicht ist mobile-first aufgebaut und nutzt auf großen Bildschirmen eine zentrierte Spalte mit maximal 768 px.
* **FR-UI-02 (MUSS):** Der Header ist vollbreit navyfarben mit dezentem Punktraster; der Inhalt ist auf die zentrierte Spalte begrenzt.
* **FR-UI-03 (MUSS):** Die Filterleiste klebt unter dem oberen Rand, hat einen weißen, leicht transparenten Hintergrund mit Backdrop-Blur und eine untere Trennlinie.
* **FR-UI-04 (MUSS):** Schichtkarten haben 20 px Abstand zueinander; innerhalb einer Karte trennen feine Linien die Stände.
* **FR-UI-05 (MUSS):** Das Slot-Grid ist mobil einspaltig und ab 640 px zweispaltig.
* **FR-UI-06 (MUSS):** Die WhatsApp-Karte und der Footer folgen nach dem Schichtplan mit 24 px Abstand.
* **FR-UI-07 (MUSS):** Der Admin-Bereich nutzt dasselbe Farbschema und dieselben Komponenten, darf aber für Tabellen und die Bedarfsmatrix breiter sein.
* **FR-UI-08 (MUSS):** Auf 320 px dürfen keine horizontalen Überläufe außerhalb der Filterleiste und der Admin-Tabellen entstehen.
* **FR-UI-09 (SOLL):** Der Header-Hero bricht Tagline und Fortschrittskarte untereinander um, wenn der Platz nicht reicht.

#### 7.3 Komponenten

* **Header:** Navy-Hintergrund, Punktraster, Logo-Kachel mit „H“, App-Name „Helferplan“, Vereins-Badge, Admin-Link mit Schloss-Icon. Titelbereich mit Eyebrow, H1, Datum, Ort und Fortschrittskarte.
* **Fortschrittskarte:** Halbtransparente weiße Karte mit 12 px Radius und Backdrop-Blur, großem Zähler `belegt/gesamt`, Text „Plätze belegt“, fehlenden Helfern und einem 6 px hohen (`h-1.5`), 176 px breiten (`w-44`) Fortschrittsbalken in Sky-400 auf `white/15`.
* **Filterleiste:** Weiße, sticky Leiste mit Filter-Buttons (Label + aktueller Wert + Chevron), optionalem Sliders-Icon und „Zurücksetzen“-Link. Horizontal scrollbar.
* **Schichtkarte:** Weiße Karte mit 16 px Radius, Schatten, Kopfbereich mit Navy-Icon-Kachel, Schichtname, Zeit und Status-Badges; darunter die Stände.
* **Standblock:** Icon-Kachel in Stand-Farbe, Name, Gruppen-Badge, Belegungstext und Status rechts. Darunter das Slot-Grid.
* **Belegter Slot:** Helle Slate-Karte mit farbigem Initialen-Avatar, Name und Stift-Icon; Hover hellt auf.
* **Freier Slot:** Gestrichelter Sky-Rahmen, heller Sky-Hintergrund, Plus-Kreis, „Freier Platz“ und „Eintragen“.
* **Gruppen-Badge:** Kleines Pill-Badge mit Gruppenfarbe, uppercase, 10 px; „Ohne Gruppe“ in Slate.
* **Status:** Grüner Punkt + „x Platz/Plätze frei“ oder Check + „Vollzählig“.
* **Legende:** Zwei kleine Farbfelder mit „belegt“ und „frei“.
* **WhatsApp-Karte:** Weiße Karte mit WhatsApp-Icon, Überschrift, Erklärungstext, grünem Vollbreite-Button und Datenschutz-Fußnote.
* **Footer:** Kleiner Slate-Text mit Vereinsname und Admin-Link.
* **Dialog:** Zentriertes Modal oder Bottom-Sheet mit Titel, Kontext, Eingabefeld, Validierung, Speichern/Abbrechen und optionalem Löschen.
* **Toast:** Kurze deutsche Erfolgs- oder Fehlermeldung, `aria-live="polite"`, verschwindet automatisch.
* **Admin-Navigation:** Tabs oder Sidebar mit den Bereichen aus FR-A-79; mobil horizontal scrollbar.
* **Admin-Formulare:** Labels über den Feldern, Fehlertext darunter, Speichern primär, Abbrechen sekundär.
* **Bedarfsmatrix:** Tabelle mit Ständen als Zeilen und Schichten als Spalten; mobil Schicht-Karten mit Number-Inputs.
* **Leerzustände:** Freundliche deutsche Meldung mit klarer nächster Aktion.
* **Ladezustand:** Skeleton-Karten in der Form der späteren Inhalte.
* **Offline-Banner:** Volle Breite, dezenter Amber-Hintergrund, deutscher Text, optional Retry.
* **Drucklayout:** Schwarzer Text auf Weiß, Tabellenlinien, keine Schatten, keine Navigation.

> **Bewusste Abweichung von Design 1:** Der Prototyp zeigt in der Abendschicht kompakte Standzeilen. Gemäß FR-H-28 und FR-H-29 werden in Version 1 alle Schichten mit aufgeklappten Slot-Karten dargestellt. Die Kompaktvariante ist nicht umzusetzen.

#### 7.4 Interaktionszustände

* **FR-UI-10 (MUSS):** Alle interaktiven Elemente haben einen Hover-Zustand mit sichtbarer Farb- oder Rahmenänderung.
* **FR-UI-11 (MUSS):** Alle fokussierbaren Elemente haben einen sichtbaren `focus-visible`-Ring (2 px Sky-500, 2 px Offset). Der Ring darf nicht durch `outline: none` ohne Ersatz entfernt werden.
* **FR-UI-12 (MUSS):** Beim Aktivieren (Touch/Klick) ist eine kurze visuelle Rückmeldung sichtbar; bei langsamen Aktionen erscheint ein Ladezustand.
* **FR-UI-13 (MUSS):** Deaktivierte Buttons sind visuell klar unterscheidbar, haben `disabled` bzw. `aria-disabled` und lösen keine Aktion aus.
* **FR-UI-14 (MUSS):** Ladezustände blockieren keine bereits sichtbaren Inhalte unnötig; Skeleton oder Spinner sind klar erkennbar.
* **FR-UI-15 (MUSS):** Fehlerzustände sind textlich beschrieben, nicht nur farblich. Sie enthalten eine Handlungsoption („Erneut versuchen“, „Filter zurücksetzen“).
* **FR-UI-16 (SOLL):** Übergänge dauern 150–300 ms und sind dezent; keine dauerhaften Animationen.
* **FR-UI-17 (MUSS):** Bei `prefers-reduced-motion: reduce` werden Animationen und Übergänge auf ein Minimum reduziert.

#### 7.5 Barrierefreiheit

* **FR-UI-18 (MUSS):** Die Anwendung erfüllt WCAG 2.1 AA für die Helfer-Ansicht und den Admin-Bereich.
* **FR-UI-19 (MUSS):** Textkontrast mindestens 4,5:1 für normalen Text und 3:1 für große Schrift. Kleine 10–11-px-Texte werden geprüft und bei Bedarf abgedunkelt; `slate-400` wird nicht für Text verwendet.
* **FR-UI-20 (MUSS):** Alle Funktionen sind per Tastatur erreichbar; die Tab-Reihenfolge ist logisch.
* **FR-UI-21 (MUSS):** Fokus ist immer sichtbar; Dialoge fangen den Fokus ein und geben ihn nach dem Schließen zurück.
* **FR-UI-22 (MUSS):** Icon-only-Buttons haben ein deutsches `aria-label` oder einen `sr-only`-Text.
* **FR-UI-23 (MUSS):** Statusänderungen (Eintrag gespeichert, Fehler, Verbindung) werden über `aria-live` angekündigt.
* **FR-UI-24 (MUSS):** Der Fortschrittsbalken hat die korrekten ARIA-Attribute aus FR-H-07.
* **FR-UI-25 (MUSS):** Touch-Ziele sind mindestens 44 × 44 px, Slots mindestens 48 px hoch.
* **FR-UI-26 (MUSS):** Farbe ist nie der einzige Informationsträger; Status haben zusätzlich Text und/oder Icon.
* **FR-UI-27 (MUSS):** Das Dokument hat `lang="de"`.
* **FR-UI-28 (MUSS):** Bei 200 % Textzoom bleibt die Anwendung bedienbar; Inhalte überlaufen nicht unkontrolliert.
* **FR-UI-29 (SOLL):** Die Anwendung wird mit einem Screenreader (VoiceOver/NVDA) getestet.
* **FR-UI-30 (MUSS):** Fehlermeldungen sind mit dem jeweiligen Eingabefeld über `aria-describedby` verknüpft.
* **FR-UI-31 (SOLL):** Ein „Zum Inhalt springen“-Link ist am Seitenanfang verfügbar.

#### 7.6 Texte, Zahlen und Pluralisierung

* **FR-UI-32 (MUSS):** Alle sichtbaren Texte sind auf Deutsch und verwenden eine einheitliche Anrede („du“ für Helfer, „Sie“ im Admin-Bereich).
* **FR-UI-33 (MUSS):** Das Datum wird mit `Intl.DateTimeFormat('de-DE')` formatiert; die Zeitzone ist `Europe/Berlin`. Uhrzeiten werden aus dem gespeicherten `HH:MM` als `HH:MM Uhr` gerendert.
* **FR-UI-34 (MUSS):** Pluralformen werden korrekt gebildet:
  * 0: „0 Plätze frei“
  * 1: „1 Platz frei“
  * n > 1: „n Plätze frei“
  * „1 von 1 Platz belegt“, „2 von 3 Plätzen belegt“
* **FR-UI-35 (MUSS):** Schaltflächen und Labels verwenden die Begriffe aus dem Glossar: „Stand“, „Schicht“, „Platz“, „Gruppe“, „Bedarf“, „Vollzählig“.
* **FR-UI-36 (MUSS):** Fehlermeldungen sind konkret und handlungsorientiert, z. B. „Bitte gib einen Namen mit mindestens 2 Zeichen ein.“
* **FR-UI-37 (MUSS):** Keine englischen UI-Begriffe außer „WhatsApp“, „Admin“ und technischen Bezeichnungen in der Admin-Dokumentation.
* **FR-UI-38 (SOLL):** Toasts und Bestätigungen verwenden kurze, freundliche Sätze, z. B. „Eingetragen. Danke für deine Hilfe!“
* **FR-UI-39 (MUSS):** Die Datenschutzhinweise sind in einfacher, verständlicher Sprache formuliert.

---

### 8. Nicht-funktionale Anforderungen

#### 8.1 Performance

* **NFR-01 (MUSS):** Der Largest Contentful Paint (LCP) liegt auf einer simulierten 4G-Verbindung unter 2,5 Sekunden.
* **NFR-02 (SOLL):** Lighthouse erreicht mindestens 90 für Performance, 95 für Accessibility und 90 für Best Practices.
* **NFR-03 (MUSS):** CSS und JavaScript werden minifiziert ausgeliefert; ungenutztes CSS wird entfernt.
* **NFR-04 (MUSS):** Es werden keine externen Font- oder Icon-Dienste geladen. Inter wird selbst gehostet, Icons sind inline.
* **NFR-05 (MUSS):** Vom Firebase SDK werden nur die tatsächlich benötigten Module importiert.
* **NFR-06 (SOLL):** Das OG-Bild und sonstige Assets sind komprimiert und angemessen dimensioniert.

#### 8.2 Zuverlässigkeit und Offline-Verhalten

* **NFR-07 (MUSS):** Änderungen werden auf anderen Geräten in der Regel innerhalb von 2 Sekunden sichtbar.
* **NFR-08 (MUSS):** Bei Verbindungsverlust bleibt die App bedienbar; Schreibvorgänge werden gepuffert und nach Möglichkeit synchronisiert.
* **NFR-09 (MUSS):** Es gehen keine serverseitig bestätigten Einträge durch einen Reload verloren. Nicht bestätigte Offline-Schreibvorgänge sind gemäß ARC-12 und FR-H-60 als „Wird synchronisiert“ sichtbar.
* **NFR-10 (MUSS):** Fehler werden abgefangen und als verständliche deutsche Meldung angezeigt; die App bleibt bedienbar.

#### 8.3 Datenschutz und DSGVO

* **NFR-11 (MUSS):** Es werden keine Cookies, kein Tracking und keine Analyse-Dienste eingesetzt.
* **NFR-12 (MUSS):** Namen sind öffentlich im Schichtplan sichtbar. Der Datenschutzhinweis weist darauf hin, dass keine Kontaktdaten erhoben werden.
* **NFR-13 (MUSS):** Firebase wird als Auftragsverarbeiter genutzt; die Firebase-Datenschutzhinweise sind im README zu verlinken.
* **NFR-14 (MUSS):** Namen können durch den Admin gelöscht werden (Eintrag löschen oder Reset). Das Audit-Log kann optional mitgelöscht werden.
* **NFR-15 (MUSS):** Das Audit-Log wird nur so lange aufbewahrt, wie es für den Vereinsbetrieb erforderlich ist; empfohlen ist die Löschung nach Abschluss der Veranstaltung.
* **NFR-16 (MUSS):** Es werden keine besonderen Kategorien personenbezogener Daten (Gesundheit, Religion, ethnische Herkunft usw.) erhoben.
* **NFR-17 (SOLL):** Eine statische Datenschutzseite oder ein Modal erklärt Zweck, Speicherung, Empfänger (Firebase), Löschung und Kontakt des Vereins.

#### 8.4 Sicherheit

* **NFR-18 (MUSS):** Die Seite wird ausschließlich über HTTPS ausgeliefert.
* **NFR-19 (MUSS):** Die Security Rules aus Abschnitt 6.6 sind deployed und getestet.
* **NFR-20 (MUSS):** Alle Eingaben werden validiert und als Text gerendert; es gibt keine HTML-Injection.
* **NFR-21 (MUSS):** Es befinden sich keine Secrets, privaten Schlüssel oder Klartextpasswörter im Repository.
* **NFR-22 (MUSS):** Das Restrisiko des clientseitigen Admin-Hashs ist dokumentiert; es wird ein starkes, einzigartiges Passwort empfohlen.
* **NFR-23 (SOLL):** Abhängigkeiten werden aktuell gehalten; Firebase-SDK-Updates werden vor dem Deployment getestet.
* **NFR-24 (KANN):** Eine Content-Security-Policy als Meta-Tag wird geprüft, sobald sie mit Firebase und den Inline-Styles kompatibel ist.

#### 8.5 Wartbarkeit

* **NFR-25 (MUSS):** Der JavaScript-Code ist in klar getrennte Module aufgeteilt (Firebase, UI, Helper, Admin, Validierung).
* **NFR-26 (MUSS):** Ein README beschreibt Setup, Deployment, Datenmodell, Admin-Recovery und Testschritte.
* **NFR-27 (MUSS):** Es gibt keinen verpflichtenden Build-Schritt für das Deployment; Tailwind wird vorab kompiliert und die fertige CSS-Datei eingecheckt. Ein optionaler npm-Build ist erlaubt.
* **NFR-28 (MUSS):** `database.rules.json` ist versioniert und wird bei Änderungen mitgetestet.
* **NFR-29 (SOLL):** Komplexe Logik (Transaktionen, Statistiken, Validierung) ist kommentiert und durch kleine, benannte Funktionen gekapselt.

#### 8.6 Auffindbarkeit und Teilen

* **NFR-30 (MUSS):** Die Seite hat einen deutschen `<title>`, eine Meta-Description und ein Favicon.
* **NFR-31 (MUSS):** Open-Graph-Tags sind vorhanden; sie sind statisch und müssen bei Veranstaltungsänderungen im Deployment angepasst werden.
* **NFR-32 (SOLL):** Ein `theme-color`-Meta-Tag entspricht dem Navy-Header.

#### 8.7 Beobachtbarkeit

* **NFR-33 (MUSS):** Unerwartete Fehler werden mit Kontext in der Browser-Konsole protokolliert.
* **NFR-34 (MUSS):** Es werden keine personenbezogenen Daten an externe Monitoring-Dienste gesendet.
* **NFR-35 (SOLL):** Die Anzahl fehlgeschlagener Schreibvorgänge der laufenden Sitzung ist im Admin-Dashboard als einfache Warnung sichtbar.

#### 8.8 Kompatibilität

* **NFR-36 (MUSS):** Die Anwendung wird auf aktuellen Versionen von Chrome, Edge, Firefox und Safari getestet.
* **NFR-37 (MUSS):** Die Anwendung wird auf iOS Safari und Android Chrome auf echten Geräten getestet.
* **NFR-38 (SOLL):** Die Anwendung bleibt bei 200 % Textzoom und im Querformat bedienbar.

---

### 9. Abnahmekriterien

Die folgenden Kriterien sind verbindlich für die Abnahme. Sie ergänzen die funktionalen Anforderungen.

* **AC-01 – Freien Platz eintragen:** Given ein freier Platz ist sichtbar. When ich darauf tippe, einen gültigen Namen eingebe und speichere. Then zeigt der Platz den Namen, die Zähler aktualisieren sich und ein Audit-Log-Eintrag entsteht.
* **AC-02 – Eintrag bearbeiten:** Given ein Platz ist belegt. When ich den Namen ändere und speichere. Then zeigt der Platz den neuen Namen; die Belegung bleibt gleich.
* **AC-03 – Eintrag löschen:** Given ein Platz ist belegt. When ich „Löschen“ bestätige. Then ist der Platz frei, die Zähler aktualisieren sich und ein Audit-Log-Eintrag entsteht.
* **AC-04 – Validierung:** Given ich öffne einen freien Platz. When ich einen leeren, zu kurzen oder ungültigen Namen eingebe. Then ist Speichern deaktiviert und eine deutsche Fehlermeldung erscheint.
* **AC-05 – Konflikt:** Given zwei Personen öffnen denselben freien Platz. When die erste Person speichert und die zweite Person danach speichert. Then sieht die zweite Person eine Konfliktmeldung und der erste Eintrag bleibt erhalten.
* **AC-06 – Filter:** Given mehrere Schichten und Stände. When ich nach Stand, Schicht und Gruppe filtere. Then werden nur passende Einträge angezeigt; „Zurücksetzen“ stellt alles wieder her.
* **AC-07 – Gruppenfilter optional:** Given es existieren keine Gruppen. When ich die Helfer-Ansicht öffne. Then ist der Gruppenfilter ausgeblendet und Stände zeigen „Ohne Gruppe“.
* **AC-08 – Bedarf 0:** Given ein Stand hat in einer Schicht Bedarf 0. When ich die Helfer-Ansicht öffne. Then wird der Stand in dieser Schicht nicht angezeigt.
* **AC-09 – Gesamtfortschritt:** Given 10 von 18 Plätzen sind belegt. Then zeigt der Header „10/18“, „8 Helfer fehlen noch“ und einen Fortschrittsbalken von 56 %.
* **AC-10 – Echtzeit:** Given zwei Geräte zeigen denselben Plan. When ich auf Gerät A einen Namen eintrage. Then erscheint der Name auf Gerät B innerhalb von 2 Sekunden ohne Reload.
* **AC-11 – WhatsApp:** Given der Plan ist geöffnet. When ich „Auf WhatsApp teilen“ tippe. Then öffnet sich WhatsApp mit dem korrekten deutschen Text und dem Link.
* **AC-12 – Erstvergabe:** Given es existiert kein Admin-Hash. When ich `admin.html` öffne. Then erscheint die Erstvergabe; nach dem Speichern bin ich angemeldet und der Hash liegt in Firebase.
* **AC-13 – Login und Logout:** Given ein Admin-Hash existiert. When ich das richtige Passwort eingebe. Then bin ich angemeldet; „Abmelden“ beendet die Session.
* **AC-14 – Session-Timeout:** Given ich bin angemeldet und 30 Minuten inaktiv. When ich eine Admin-Aktion ausführe. Then werde ich zur Anmeldung aufgefordert.
* **AC-15 – Passwort ändern:** Given ich bin angemeldet. When ich das Passwort ändere. Then funktioniert nur noch das neue Passwort.
* **AC-16 – Veranstaltungseinstellungen:** Given ich ändere den Veranstaltungsnamen. When ich speichere. Then aktualisiert sich der Header in der Helfer-Ansicht in Echtzeit.
* **AC-17 – CRUD Stände/Schichten/Gruppen:** Given ich lege einen Stand, eine Schicht und eine Gruppe an. Then erscheinen sie in der Helfer-Ansicht; Löschen entfernt die zugehörigen Daten nach Bestätigung.
* **AC-18 – Bedarf reduzieren:** Given ein Stand hat 3 belegte Plätze. When ich den Bedarf auf 2 senke und bestätige. Then wird der überzählige Platz gelöscht und die Belegung zeigt 2/2.
* **AC-19 – Einträge zurücksetzen:** Given es gibt Einträge. When ich „Einträge zurücksetzen“ bestätige. Then sind alle Assignments gelöscht, die Konfiguration bleibt erhalten und die Zähler stehen auf 0.
* **AC-21 – Druck/PDF:** Given ich öffne den Druckdialog. Then sind Navigation, Filter und Buttons ausgeblendet und die Helferliste ist als Matrix mit Ständen in der ersten Spalte und Schichten samt Zeiten in der ersten Zeile auf A4 lesbar.
* **AC-22 – Barrierefreiheit:** Given ich navigiere nur mit der Tastatur. Then sind alle Funktionen erreichbar und der Fokus ist sichtbar.
* **AC-23 – Mobile 320 px:** Given ich öffne die Seite bei 320 px Breite. Then gibt es keinen horizontalen Überlauf außerhalb der Filterleiste; alle Inhalte sind lesbar.
* **AC-24 – Offline:** Given ich bin offline und lasse die Seite geöffnet. When ich einen Eintrag speichere. Then erscheint das Offline-Banner, der Platz zeigt „Wird synchronisiert“ und der Eintrag wird nach Wiederverbindung ohne Reload synchronisiert.
* **AC-25 – Konfiguration sichern:** Given ich bin im Admin-Bereich unter „Sicherung“. When ich die Konfiguration exportiere. Then heißt die JSON-Datei `YYYY-MM-DD_Titel.json` und enthält Veranstaltungsdaten, Stände, Schichten, Gruppen und Bedarf, aber keine Helfer-Einträge, Admin-Zugangsdaten oder Audit-Logs. When ich eine gültige Konfigurationsdatei importiere und bestätige. Then werden die Einstellungen übernommen, das Admin-Passwort bleibt unverändert und unpassende Helfer-Einträge werden entfernt.

---

### 10. Abgrenzung, Risiken & offene Punkte

#### 10.1 Out of Scope für Version 1

* Mehrere gleichzeitige Veranstaltungen und ein Event-Umschalter.
* Helfer-Konten, Login, E-Mail-Verifizierung oder Einladungscodes.
* Schutz einzelner Einträge vor Änderungen durch andere Personen.
* Automatische WhatsApp-, E-Mail- oder Push-Benachrichtigungen.
* Zahlungs-, Kassensystem- oder Inventarfunktionen.
* Native Apps, PWA-Installation, Offline-App-Shell.
* Dark Mode oder Theme-Umschalter.
* Mehrsprachigkeit.
* Admin-UI für das Audit-Log.
* Cloud Functions oder eigene serverseitige Geschäftslogik; die Security Rules validieren ausschließlich Struktur und Wertebereiche.
* Upload eines Vereinslogos; der Header verwendet eine Initialen-Kachel.
* QR-Code zum Teilen.
* Kalender-Integration.

#### 10.2 Risiken

| Risiko | Auswirkung | Maßnahme |
|---|---|---|
| Admin-Hash ist öffentlich lesbar | Offline-Brute-Force gegen den Hash möglich; die Konfiguration kann direkt geändert oder gelöscht werden (inkl. Admin-Lockout) | Starkes, einzigartiges Passwort, regelmäßige Druck-/JSON-Exporte, dokumentiertes Restrisiko, spätere Firebase-Auth-Migration |
| Keine serverseitige Authentifizierung | Admin-Schutz ist nur UI-Ebene; `sessionStorage` ist manipulierbar | Restrisiko akzeptiert, Admin-Zugang nicht als Sicherheitsgrenze behandeln |
| Keine serverseitige Geschäftslogik | Business-Regeln (z. B. Slot-Index gegen Bedarf) werden nur clientseitig geprüft; direkte API-Aufrufe können sie umgehen | Security Rules für Struktur und Wertebereiche, App-Validierung, regelmäßige Datenprüfung |
| Offenes Bearbeitungskonzept | Jeder kann fremde Einträge ändern oder löschen | Gewollt; Audit-Log, regelmäßige Exporte und Admin-Reset; keine Identitätsprüfung |
| Audit-Log ist clientseitig | Einträge können manipuliert oder gelöscht werden | Nur als Nachvollziehbarkeit nutzen, nicht als Beweis |
| GitHub Pages oder Firebase nicht erreichbar | Plan nicht verfügbar | Offline-Cache, Statusbanner, Retry |
| Statische OG-Tags | WhatsApp-Vorschau passt nicht zu geänderten Veranstaltungsdaten | OG-Tags bei Deployment aktualisieren oder neutral halten |
| Viele Stände/Schichten | Lange mobile Seite | Standardlayout bleibt; spätere kompakte Variante möglich |
| Doppelte Namen | Verwechslung bei gleichem Namen | Optionaler Hinweis, keine Blockade |
| Safari-/iOS-Eigenheiten | Layout- oder Scrollprobleme | Test auf echten Geräten |

#### 10.3 Offene Punkte

* Separater Wireframe/Prototyp für den Admin-Bereich fehlt; die funktionalen Anforderungen und Design-Tokens sind verbindlich.
* Die Kontrastprüfung der verbleibenden 10–11-px-Texte steht noch aus; bei Verstoß gilt die Kontrastregel aus Abschnitt 7.1.
* Firebase App Check wird optional geprüft; die Entscheidung fällt vor dem Produktiv-Deployment.
* Filter-Persistenz in der URL ist optional (FR-H-19).
* Datenschutzseite ist optional, aber empfohlen (FR-H-76).
* `localStorage` für die Admin-Session ist optional; Standard bleibt `sessionStorage` (FR-A-12).
* Ein statisches OG-Bild muss vor dem Deployment erstellt und mit der kanonischen URL verknüpft werden.
* Eine Impressumspflicht ist vor der Veröffentlichung zu prüfen; falls erforderlich, wird ein Impressum-Link in den Footer aufgenommen.

---

### 11. Anhang

#### A. WhatsApp-Textvorlage

**Normalfall:**
```
Hallo zusammen! Für {eventName} am {eventDate} in {eventLocation} werden noch Helfer gesucht. Es fehlen noch {missing} Helfer. Tragt euch hier ein: {url}
```

`{eventDate}` ist die deutsch formatierte Datumsangabe aus FR-H-02 (z. B. „So, 14. Juni 2026“), nicht das ISO-Datum. `{url}` ist die kanonische Seiten-URL ohne Filter- und Tracking-Parameter.

**Ein fehlender Helfer:**
```
Hallo zusammen! Für {eventName} am {eventDate} in {eventLocation} wird noch 1 Helfer gesucht. Tragt euch hier ein: {url}
```

**Plan voll:**
```
Hallo zusammen! Für {eventName} am {eventDate} in {eventLocation} ist der Helferplan voll. Vielen Dank an alle, die mithelfen! Hier geht's zum Plan: {url}
```

#### B. Reset-Matrix

| Aktion | Löscht | Behält | Danach |
|---|---|---|---|
| Einträge zurücksetzen | `assignments`, optional `audit_log` | `config`, `groups`, `shifts`, `stands`, `demand` | Zähler auf 0, Konfiguration bleibt |
| Konfiguration zurücksetzen | `assignments`, `demand`, `stands`, `shifts`, `groups` | `config` inkl. Admin-Hash | Helfer-Ansicht leer, Admin kann neu anlegen |
| Alles löschen | alle Event-Daten inkl. `config` und `audit_log` | nichts | Erstvergabe erscheint |

#### C. Deployment-Checkliste

1. Firebase-Projekt anlegen, Realtime Database aktivieren, Region `europe-west1` wählen.
2. `database.rules.json` deployen und im Firebase Emulator testen.
3. `js/firebase-config.js` mit den Projektdaten befüllen.
4. GitHub-Repository verbinden und GitHub Pages aktivieren.
5. `.nojekyll`, Favicon, OG-Bild und statische Meta-Tags prüfen.
6. Admin-Erstvergabe durchführen und Passwort sicher notieren.
7. Veranstaltungsdaten, Stände, Schichten, Gruppen und Bedarf anlegen.
8. Auf iPhone, Android und Desktop testen.
9. WhatsApp-Teilen und OG-Vorschau testen.
10. README mit Recovery-, Datenschutz- und Backup-Hinweisen vervollständigen.
11. Prüfen, dass weder Klartextpasswort noch `adminHash` im Quellcode stehen und `prototypes/` nicht verlinkt wird.

#### D. Icon- und Farb-Keys

**Icons:**

| Key | Icon | Typischer Einsatz |
|---|---|---|
| `flame` | Flamme | Grill |
| `beer` | Bierglas | Ausschank |
| `cash` | Geldschein | Kasse |
| `cake` | Kuchen | Kuchenbuffet |
| `droplet` | Tropfen | Spüldienst |
| `coffee` | Kaffeetasse | Kaffee- und Kuchenstand |
| `music` | Note | Musik/Bühne |
| `ticket` | Ticket | Eintritt |
| `salad` | Salat | Speisen |
| `star` | Stern | Sonstiges |
| `users` | Personen | Team/Aufbau |
| `heart` | Herz | Sonstiges |

**Farben:** `sky`, `teal`, `indigo`, `rose`, `amber`, `violet`, `emerald`, `slate`.

#### E. Dateistruktur

```text
/
├── index.html
├── admin.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── admin.js
│   ├── firebase.js
│   ├── firebase-config.js
│   ├── ui.js
│   └── validation.js
├── assets/
│   ├── fonts/
│   ├── favicon.svg
│   └── og-image.png
├── firebase.json
├── database.rules.json
├── tailwind.config.js        # nur für den optionalen CSS-Build
├── package.json              # nur für den optionalen CSS-Build
├── README.md
└── prototypes/
    ├── design-1-klar.html
    ├── design-2-community.html
    ├── design-3-kompakt.html
    ├── design-4-nachtblau.html
    └── index.html
```

---

### 12. Dokumentstatus

| Version | Datum | Änderung |
|---|---|---|
| 1.0 | 07.11.2026 | Erste umsetzungsreife Fassung auf Basis von Design 1 „Klar & Klassisch“; Firebase Realtime Database, clientseitiger Admin-Hash, standardisierte Slot-Karten, vollständige Anforderungen und Abnahmekriterien. |

