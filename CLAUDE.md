# Breuer Grand Prix – Arbeitsstand für Claude

Arcade-Rennspiel (three.js r180) für Fahrzeugtechnik Breuer, Lammersdorf (B399 Nr. 27).
Repo: github.com/lucalnd812-hub/FahrzeugtechnikbreuerGame · Live: https://breuer-grand-prix-final.vercel.app/
(Vercel-Projekt `breuer-grand-prix-final`, Region fra1, Neon-DB `breuer-grand-prix-db`).

**Diese Datei wird nach jeder Antwort aktualisiert** (Wunsch des Nutzers), damit ein neuer Chat
nahtlos weitermachen kann. Unten im „Verlauf“ den neuesten Stand ergänzen.

## Feste Regeln des Nutzers
- Lammersdorf (echtes OSM-Layout) muss unter allen Umständen erhalten bleiben.
- Muss auf Handy **und** Desktop gut laufen, möglichst ohne Unterschiede in der Optik.
- Vor dem Bearbeiten eines Autos/Gebäudes echte Referenzfotos ansehen.
- Vor Commit, Push oder Vercel-Deploy fragen (außer der Nutzer hat es für diese Runde ausdrücklich erlaubt).
- Higgsfield-Credits nur im genannten Budget (Runde 2: max. 200, ~107 verbraucht).
- Blender: **nie** lange Cycles-GPU-Renderserien – hat den PC zweimal abstürzen lassen.
  CPU, 4 Threads, Pause zwischen Bildern (`art/blender/ai_sprites.py`: THREADS/PAUSE, fortsetzbar).
  Keine Tests parallel zum Rendern.
- Antworten an den Nutzer auf Deutsch.

## Bauen, testen, ansehen
- Node 24. `npm ci`, `npm run build:vercel` → Ausgabe in `public/`.
- `npm test` (≈40 Programme, muss Exit 0 haben). `npm run test:art` braucht lokale Grafik-Abhängigkeiten.
- Vorschau: `npx http-server@14.1.1 public -p 4173 -c-1` (im Ordner darüber liegt `.claude/launch.json` „breuer-static“).
- `deployment/assets-manifest.json` per `node scripts/sync-assets-manifest.cjs` synchron halten.
- Vercel-CLI ist lokal **nicht** installiert/eingeloggt. Frühere Deploys liefen nicht über Git-Push.

## Wichtige Dateien
- `src/game.js` Haupt-Controller · `src/world.js` Welt/Qualität · `src/performance.js` Profile Q0/Q1/Q2.
- `src/toon-shading.js`, `src/comic-post.js` Comic-Look. Autos bekommen `SMOOTH_SHADING` (kein Banding).
- `src/minimap.js` lokales GPS (nur ~100 m voraus, ausgeblendet); große Karte beim Antippen.
- `src/item-box.js` schwebende Mario-Kart-Itemboxen · `src/road-paint.js` BREUER-Schriftzug + Kurvenpfeile.
- `src/landmarks.js` / `world.js` (`breuerYard`) Hof von Breuer bis zur Straße, ohne Zäune.
- Menü: `src/menu-2026.css` (zuletzt gebündelt), `assets/nextlevel/arcade-hero.webp`, `arcade-intro.mp4`, `garage-showroom.webp`.
- Garage: `src/garage-vehicle-preview.js` (Backdrop-Modus: Hintergrund und Auto-Canvas teilen
  `backdropTransform()` aus `src/vehicle-art.js`), `src/garage-idle.js` (Anlassen, Abgas, Wackeln).
- Autos: Higgsfield-Tripo-Modelle `art/ai3d/<id>_tripo.glb` → `art/blender/ai_car.py` → `assets/vehicles3d/<id>-{high,low}.glb`.
  Garage-Ansichten: `art/blender/ai_sprites.py` → `assets/vehicles/<id>/00–15.webp` (1344×752, Kamera passend zum Showroom),
  dann `node scripts/build-sprite-manifest.mjs`. `tests/vehicle-art.mjs` hasht die Tripo-GLBs – nicht löschen.
- `art/references/` und `art/renders/` sind git-ignoriert (private Referenzen / Prüfbilder).

## Verlauf
- 2026-10-19 Runde 2: Neues Hauptmenü + Intro-Video, Garage mit Drehscheibe, 5 neue Autos (Higgsfield → Blender),
  lokales GPS, neue Itemboxen, Breuer-Einfahrt, Fahrbahnmarkierungen, Schatten/Details auch auf dem Handy.
- 2026-10-19: Fehler behoben – Auto stand in der Garage ~100 px unter der Drehscheibe. Ursache: `inset:'auto'`
  wurde nach `left/top` gesetzt und hat sie zurückgesetzt (`garage-vehicle-preview.js`, `resize`).
  Desktop (1280×720) und Handy quer (844×390) geprüft, alle Tests grün.
- 2026-10-19: Commit/Push gestoppt (Nutzer: „Stop. Das Auto ist auf dem Handy total gequetscht.“).
  Nichts committet: Git hat keinen Namen/E-Mail konfiguriert (`git config user.name/user.email` fehlt).
  Alles liegt gestaged auf Branch `runde-2-menue-autos` (lokal, nicht gepusht).
  Untersucht: Querformat 844×390 (auch nach Drehen ohne Neuladen) zeichnet das Auto mit richtigen
  Proportionen; keine CSS-Transition. Hochformat 375×812: Garage-Layout zweispaltig zusammengedrückt,
  Auto-Bühne nur 217 px breit (war in der alten Version genauso). Warte auf Details vom Nutzer
  (Hoch-/Querformat, welche Seite, welches Handy/Browser, Screenshot).
- 2026-10-19: Nutzer meinte meinen Screenshot (M2 bei 844×390 direkt nach Wechsel von 1280×720).
  Auto war um 342/656 vertikal gestaucht = alte Zeichnung in neuer Fläche. Im Code war die Fläche korrekt;
  zur Sicherheit beobachtet `garage-vehicle-preview.js` jetzt auch die Bühne (ResizeObserver) und zeichnet
  nach einem Fenster-Resize im nächsten Frame neu (`onWindowResize`/`settleFrame`). Wechsel 1280×720 ↔ 844×390
  im Browser geprüft, Auto steht unverzerrt auf der Scheibe. `npm test` Exit 0.
  Weiterhin nichts committet/gepusht; Git-Identität fehlt noch, Vercel-CLI nicht eingeloggt.
- 2026-10-19: Veröffentlicht. Git-Autor im Projekt: Luca <lucalnd812@gmail.com>. Commit af35ebe auf Branch
  `runde-2-menue-autos` gepusht (GitHub). `main` ist NICHT aktualisiert (direkter Push auf main wurde von der
  Sicherheitsprüfung blockiert) – PR: github.com/lucalnd812-hub/FahrzeugtechnikbreuerGame/pull/new/runde-2-menue-autos.
  Vercel: Nutzer hat sich per `npx vercel login` (Device-Link im Browserfenster) angemeldet, Konto lucalnd812-hub,
  Team „Luca's projects“. Ordner mit `vercel link --project breuer-grand-prix-final` verknüpft (`.vercel/`, `.env.local`
  mit Zugangsdaten – beide git- und vercel-ignoriert). `npx vercel deploy --prod --yes` → live, Bundle
  `game-81f728a6945c.js` identisch mit lokalem Build, `/api/health` ok, Garage live geprüft.
  `.vercelignore` lässt art/, tests/, docs/, qa/, verification/, public/ und .env* weg.
- Offen: echte FPS auf einem Handy messen; Rauch/Wackeln im echten Browser ansehen; Richtung der Kurvenpfeile prüfen.
