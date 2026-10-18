# Breuer Grand Prix · 3.6.0

Spielen: https://breuer-grand-prix-final.vercel.app/

## Neu in 3.6

Zehn ergänzende Higgsfield-Texturpakete verfeinern die vorhandenen Atlanten für Fassaden, Dächer, Pflaster/Grünflächen, Fenster/Türen, Werkstatt und Bäckerauslagen, Vegetation, Fahrzeugteile sowie UI-Oberflächen und Medaillen. Kritische Material-Crops und der ruhige Rennasphalt bleiben erhalten. Alle 80 Fahrzeugansichten werden mit denselben Modellen und unveränderter Kamera neu gebacken. Straßen, Gebäudekoordinaten, Fahrzeuggeometrie und Shader bleiben unverändert; es kommen keine weiteren 3D-Materialpässe hinzu.

Die zusätzlich gewünschte größere MiniMap erhält einen eigenen Rahmen, deutlichere Marker und eine aufklappbare Ansicht. Die Karte entsteht weiterhin aus den tatsächlichen Kursdaten. Native Beschriftungen bleiben lesbar und bedienbar.

Kosten dieses Durchgangs: 42,50 Credits für die zehn ergänzenden Atlanten plus 2,75 für den MiniMap-Rahmen, insgesamt **45,25 Credits**. Bestätigtes Guthaben unmittelbar danach: 73. Elf Originalgenerationen, Prompts und die technische Zellkombination liegen im separaten Art-Ergänzungspaket. Die zehn kombinierten Atlanten samt neuem 512²-Rahmen benötigen 1.781.590 Bytes gegenüber 1.823.274 Bytes für die zehn vorherigen Atlanten allein. Dieser Dateivergleich ist keine Geräte-FPS-Messung.

## Grundlage aus 3.5


Der Grafikdurchgang orientiert sich an plastischer, handbemalter 3D-Spielgrafik: echte gerundete Fahrzeugflächen und Gebäudedetails, gemalte Materialtiefe und lesbare kräftige Formen. 15 eigens erzeugte Higgsfield-Assets werden als gemeinsame Materialien und UI-Atlanten eingesetzt. Das Medienbudget dieses Durchgangs beträgt exakt 56,25 Credits; bestätigter Reststand 121,25. Die Quelldateien bleiben als Masterpaket erhalten, das Webspiel lädt komprimierte WebP-Dateien.

Die Renderplanung übernimmt Zeitreste auf 90-/144-Hz-Anzeigen, statt sie bei jedem Bild zu verlieren. Offline-Pausen zeichnen seltener neu; unveränderte HUD-Werte erzeugen keine wiederholten DOM-Schreibzugriffe. Diese kontrolliert geprüften Planungs-/CPU-Verbesserungen sind kein gemessener Geräte-FPS-Nachweis. Die Fahrphysik und der Rennzeitgeber bleiben unverändert.

## Spiel und Bedienung

Die mobile Garage zeigt eine große Fahrzeugbühne und eine feste Auswahlzeile. Auto → Strecke → Rennen bleibt als dreistufiger Ablauf erhalten; Profil und Mehr stehen im kompakten Kopf. Ton und Vollbild liegen unter Mehr. Die Aktionen haben 44–48 CSS-Pixel Zielhöhe und klare Abstände. Fahrername und Fahrerpass sind getrennte Ansichten; die Formularaktion sitzt im festen Fußbereich. Die Tastaturansicht richtet sich am sichtbaren Browserfenster aus. Langdruck-Auswahl, Bildziehen und Kontextmenü sind auf Spieloberflächen deaktiviert; Texteingaben behalten die üblichen Bearbeitungsfunktionen.

Alle fünf Fahrzeugmodelle wurden mit feineren Konturen, gewölbten Scheiben, Innenraum und geschlossenen Dachübergängen überarbeitet. Die Garagenvorschau verwendet 16 neu gerenderte Ansichten je Auto mit fester Kamera, gemeinsamem Weltmaßstab und feststehender Beleuchtung. Der Größenwechsel beim Drehen entfällt. Die gezeichnete Garage wurde für diesen Stil neu gemalt. Fünf vorher unnötig geladene 3D-Garagenmodelle entfallen beim Start.

Gemeinsame Higgsfield-Atlanten liefern unterschiedliche Putz-, Naturstein-, Klinker-, Schiefer- und Holzflächen, Dächer, Fenster, Werkstattrequisiten, Vegetation und Bodenmaterialien. Kartierte Straßen, Dachgrundlagen und Fahrflächen bleiben erhalten. Fassaden sind stilisierte Nachbildungen; ein vollständiger aktueller Street-View-Scan war nicht möglich. Die Garage und Kursszenen im Menü sind dekorative Illustrationen, keine vermessenen Ansichten des echten Dorfs.

Fahrer wählen einen eindeutigen Namen mit 2–20 Zeichen. Groß-/Kleinschreibung, Unicodevarianten und zusätzliche Leerzeichen erlauben keine Doppelbelegung. Ein vergebener Name ergibt eine verständliche Fehlermeldung. Profile, abgeschlossene Wertungsläufe und Bestzeiten werden in PostgreSQL gespeichert. Jede Kombination aus Strecke, Auto, Rundenzahl, Regeln, Fahrhilfen und Rennart hat eine eigene Wertung; die eigene Platzierung erscheint auch außerhalb der Spitzengruppe. Namen lassen sich auch nach dem ersten Rennen reservieren und dessen Zeit anschließend eintragen.

Ein privater Fahrerpass kann heruntergeladen und auf einem anderen Gerät importiert werden. Er enthält den Zugang zum Fahrerprofil und muss privat bleiben. Ohne Sicherung kann ein gelöschter Browserzugang nicht einfach anhand des Namens zurückgeholt werden.

| Kurs · eine Runde | Gold bis | Silber bis | Bronze bis |
| --- | ---: | ---: | ---: |
| Lammersdorf GP | 35,00 s | 40,00 s | 50,00 s |
| Bahnhof-Runde | 47,29 s | 54,04 s | 67,55 s |
| Krämer-Sprint | 46,91 s | 53,61 s | 67,02 s |

Die Ziele werden mit der gewählten Rundenzahl multipliziert und vor dem Start angezeigt. Gold ist bewusst sehr anspruchsvoll; eine menschliche 35-Sekunden-Runde wurde hier nicht nachgewiesen.

## Spielen

Fünf Autos: gelber Opel Kadett C, AC Schnitzer BMW E30 M3, BMW M1 Procar, grauer BMW M2 Competition und blauer Porsche 911 GT3 RS. Drei Rundkurse, Einzelrennen, Zeitfahren mit lokalem Geist, Breuer-Cup und Max-Challenge. 1, 2, 3, 5 oder 10 Runden, bis zu fünf KI-Gegner, verschiedene Schwierigkeiten, Action/Klassisch und Fahrhilfen.

PC: WASD/Pfeile, Leertaste zum Driften, E für Item, R zum Zurücksetzen, C für Kamera, Escape/P für Pause. Handy: Querformat, linke oder rechte Bildschirmhälfte halten. Gas läuft automatisch; Bremse und Item liegen mittig. Vor dem Start erscheint eine kurze Erklärung. Hochkant pausiert das Spiel mit Querformatmeldung. Gamepad wird ebenfalls unterstützt.

22 ElevenLabs-Sounds sind integriert, darunter fünf unterschiedliche Motoren. Ton startet stumm und wird unter Mehr bewusst aktiviert. Pause, Tabwechsel und Verlassen stoppen laufende Geräusche.

## Online und Datenbank

Bis zu sechs Fahrer spielen über Raumcode oder Einladung. Alle bestätigen die Konfiguration und Bereitschaft, dann beginnt ein gemeinsamer Countdown. WebSockets und HTTP-Fallback teilen die gespeicherten Rennzustände; Wiederverbindung und Gastgeberwechsel bleiben verfügbar.

Vercel-Projekt: `breuer-grand-prix-final` / `prj_ed4SbzEGOGAws5Lm2luQ24Awwgwr`.
Die bestehende Neon-Datenbank `breuer-grand-prix-db` ist mit Preview und Production verbunden. Es wurde keine zusätzliche Datenbank angelegt. `DATABASE_URL` bleibt eine sensible Umgebungsvariable. `/api/health` prüft den aktiven Anschluss und liefert die Releaseversion. Additive Migrationen verwenden das Schema `breuer_gp`.

Die Backendprüfung authentifiziert Profile, reserviert Namen atomar, prüft Zeit-/Sektorplausibilität und speichert bessere Ergebnisse atomar. Abgeschlossene Läufe können unverändert wiederholt bestätigt werden. Die Fahrphysik läuft im Browser; dies ist keine serverautoritative Anti-Cheat-Engine. Geister bleiben lokal, die öffentlichen Bestzeiten liegen in der Datenbank.

## Wix

Am einfachsten: einen Wix-Button mit der Spieladresse verlinken und „In neuem Tab öffnen“ wählen. Das gibt dem Spiel auf Handys die volle Seite. Alternativ eine eigene Wix-Seite mit Website-/HTML-Einbettung anlegen und dorthin verlinken. Das aktualisierte Snippet liegt in `Breuer-GP-Wix-Einbettung.html`. Das ZIP ist die Quellcode-Sicherung; Wix führt daraus keine Vercel-Funktionen aus.

Die Einbettung benötigt ausreichend Höhe. Im Querformat möglichst den verfügbaren Bildschirmraum nutzen und Vollbild erlauben. Mindestens 320 px Spielhöhe sind empfehlenswert; die kompakte Garage und der Profil-Dialog wurden zusätzlich bei 568 × 260 px geprüft. `/wix-test.html` bietet feste Prüfgrößen einschließlich 1024 × 351 px für Safari mit Leisten. Eine Prüfung der tatsächlich veröffentlichten Wix-Seite bleibt separat.

## Bauen und veröffentlichen

Node.js 24:

```sh
npm ci
npm test
npm run build:vercel
```

Der zusätzliche Art-Test `npm run test:art` und das erneute Rendern der Fahrzeugansichten benötigen lokal `@napi-rs/canvas` und `sharp`. Diese optionalen Werkzeuge sind keine Voraussetzung für Spiel, normalen Produktionsbuild oder `npm test`. Die ausgelieferten 80 Ansichten liegen bereits fertig vor.

Der Build erzeugt `public/` einschließlich aller 80 Fahrzeugansichten, 22 Sounddateien und Kursdaten. Alle benötigten Assets liegen im ZIP. Zugangsdaten sind nicht enthalten. `scripts/publish-live.mjs` veröffentlicht nach offizieller CLI-Anmeldung nur in das oben genannte verifizierte Projekt. Nicht versehentlich das ältere Projekt `breuer-grand-prix` auswählen.

```sh
node scripts/publish-live.mjs
```

Nach Veröffentlichung `/api/health`, Garage, Fahrername, Rangliste und Online-Rennen prüfen. Der autorisierte Live-Test erstellt einen kurzlebigen eigenen Raum und verlässt ihn anschließend:

```sh
node tests/live-online.mjs https://breuer-grand-prix-final.vercel.app --race --output online-live-results.json
```

## Prüfung und Quellen

Der aktuelle Releasebericht in `docs/release-3.6.md` und `verification/release-3.6.json` dokumentiert diesen Stand. Die Vollsuite bestand mit 40 Prüfprogrammen und 105 PASS-Meldungen; Build, Bildprüfung und Fahrzeug-Art-Test bestanden ebenfalls. 286 Eingabedateien blieben während des Vollsuite-Laufs unverändert. Nach der isolierten CSS-Korrektur an der MiniMap wurden deren Tests und der Build erneut erfolgreich ausgeführt. Alle 136 öffentlichen Produktionsdateien wurden in Größe und SHA-256 mit dem finalen Build verglichen. Der unveränderte Online-Kern wurde bei 3.3 mit sechs Clients live geprüft; dieser frühere Test wird nicht als erneut ausgeführtes 3.6-Online-Rennen ausgegeben.

Die Browserprüfung deckt Desktop und kleine Querformate ab. In der Cloud stand der 2D-Kompatibilitätsrenderer zur Verfügung. Echte iPhone-/Android-Multitouchprüfung, reale 3D-GPU-Bildraten und Langzeitbetrieb sind damit nicht belegt. „Leistung prüfen“ liefert auf dem jeweiligen Gerät eine 60-Sekunden-Messfahrt und einen herunterladbaren Bericht.

`docs/data-source-report.md`, `docs/landmark-references.md` und `docs/streetview-other-courses.md` dokumentieren OSM-Straßen, amtliche NRW-Dächer, Geländedaten und tatsächlich gesichtete Referenzen. Fassaden und Teile der Anbauten bleiben künstlerische Näherungen. Es wurde kein neuer vollständiger Street-View-Scan vorgenommen. Attribution und Medienquellen stehen in `assets/ASSET-NOTES.md`, `docs/AUDIO-PROVENANCE.md` und `docs/vehicle-model-references.md`.
