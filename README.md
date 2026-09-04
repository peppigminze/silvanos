# SILVAN.OS v2

Persönliches Life-Dashboard im HUD/Terminal-Look. Installierbar als PWA, Daten lokal + optional Cloud-Sync über eine private GitHub Gist.

## Was neu ist (v2)

- **Fitness:** fixe Übungsreihenfolge (Chestpress → Schrägbank → Cable Flys H2L/L2H → Latzug → Rudern eng/breit → Seitheben → Schulterpresse → Bizeps → Brachialis → Trizeps → Bauch gerade/seitlich), 2x/Woche. Pro Übung Gewicht (kg) + Wiederholungen loggen, und im **Übungs-Verlauf** unten einzeln per Dropdown den Gewichts- und Reps-Verlauf als Chart ansehen.
- **Kalender statt Roadmap:** Sektion 05 ist jetzt ein **Tagesplaner** — Wochenstreifen zum Navigieren, pro Tag frei Aufgaben hinzufügen/abhaken.
- **Lehre / Moto-Fonds / Steal & Escape sind jetzt generische, frei editierbare Projekt-Panels:**
  - Titel direkt anklicken & umbenennen
  - Aufgaben hinzufügen/umbenennen/löschen, mit optionalen Teilschritten (aufklappbar)
  - Optionales Zahlenziel (z.B. Sparfortschritt) hinzufügen/entfernen — nicht nur für Moto, für jedes Projekt
  - Ganze Projekte löschen oder über **+ NEUES PROJEKT / TAB** neue anlegen — die Nummerierung (02, 03, 04...) passt sich automatisch an
- **Als App installierbar (PWA):** Manifest + Service Worker für Offline-Start und "Zum Homescreen hinzufügen" auf dem Handy.

## Lokal testen

`index.html` direkt öffnen, oder für sauberes PWA/Service-Worker-Verhalten:
```bash
python3 -m http.server
```
dann `http://localhost:8000` öffnen.

## Auf GitHub pushen

```bash
cd silvanos
git init
git add .
git commit -m "SILVAN.OS v2"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/silvanos.git
git push -u origin main
```

## Live hosten mit GitHub Pages (gratis, nötig für PWA-Installation)

1. Repo auf GitHub → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch `main`, Ordner `/ (root)` → Save
3. Nach ~1 Minute läuft es unter `https://DEIN-USERNAME.github.io/silvanos/`

PWA-Installation (Homescreen) braucht HTTPS — GitHub Pages liefert das automatisch. Lokal über `file://` funktioniert der Service Worker nicht zuverlässig, über `localhost` schon.

## App aufs Handy installieren

- **Android/Chrome:** Seite öffnen → Menü (⋮) → "Zum Startbildschirm hinzufügen" / "App installieren"
- **iOS/Safari:** Seite öffnen → Teilen-Icon → "Zum Home-Bildschirm"

Danach läuft SILVAN.OS wie eine native App (eigenes Icon, kein Browser-UI, funktioniert offline für die Oberfläche selbst).

## Geräteübergreifend synchronisieren (Cloud Sync)

Optional, über eine private GitHub Gist:

1. [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) → **Generate new token**
2. Permissions → Account permissions → **Gists: Read and write**
3. Token generieren, kopieren
4. In der App oben auf **EINRICHTEN** → Token einfügen → **VERBINDEN**
5. Auf jedem weiteren Gerät denselben Token eingeben → App findet die Gist automatisch

Der Token bleibt nur in `localStorage` des jeweiligen Geräts und geht ausschliesslich direkt an `api.github.com`. Änderungen synct die App automatisch (leicht verzögert, gebündelt). Ohne Verbindung läuft alles rein lokal; **EXPORT/IMPORT** unten bleibt zusätzlich als manuelles JSON-Backup.

## Struktur

```
silvanos/
├── index.html
├── style.css
├── app.js
├── manifest.json          # PWA-Manifest
├── service-worker.js      # Offline-Caching des App-Shells
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
└── README.md
```

## Anpassen

- Feste Übungsliste: `EXERCISES` in `app.js`
- Standard-Inhalte der drei mitgelieferten Projekt-Panels: `defaultProjects()` in `app.js` — greift aber nur beim allerersten Start (danach übernimmt `localStorage`/die Gist)
- Alles andere (Projekte, Aufgaben, Kalender) editierst du direkt in der laufenden App
