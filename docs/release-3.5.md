# Breuer Grand Prix · Release 3.5.0

Stand: 15. Oktober 2026. Spieladresse: https://breuer-grand-prix-final.vercel.app/

## Grafik und Fahrzeuge

Der Grafikpass folgt der Nutzerreferenz einer plastischen, gemalten 3D-Spielwelt. Alle fünf Fahrzeuge besitzen stärker gerundete Dachschultern, gewölbte Flanken, größere Räder, breitere modellierte Radläufe, tiefere Kühlergrillrahmen und differenzierte Glas-/Metall-/Gummiflächen. Die Silhouetten und fünf Fahrzeugidentitäten bleiben erhalten. Eine gemeinsame Matcap mit Detailatlas liefert weiche Lackreflexionen in einem Materialpass. CPU-Vorschau und natives Three-Material verwenden dieselbe Coat-Formel; die Vorschau übernimmt NeutralToneMapping mit Belichtung 1,05.

Alle 80 Ansichten werden aus genau dem ausgelieferten Modellstand gerendert. Kamera, Maßstab, Bodenpunkt und Licht bleiben beim Drehen fest. Low nutzt 6 Materialgruppen und etwa 5.100–6.000 Dreiecke pro Auto; High 15 Gruppen und etwa 15.200–15.700. Glas und Bodenkontaktflächen verwenden einen einzelnen DoubleSide-Pass. Ein mit der neuen Dachrundung kollidierender M1-Lackstreifen wurde unterteilt; reale Raycasts sichern dessen Dachauflage in beiden Detailstufen.

## Dorf und Werkstatt

Neue gemeinsame Materialien liefern unterschiedliche Fassaden, Dächer, Bodenflächen, Fenster, Werkstattrequisiten, Straßen-/Gartendetails und Vegetation. Nahe Gebäude haben echte gefaste Kanten, etwa 6,5 cm tiefe Fensterlaibungen und geschichtete Traufen. Werkstatt- und Gartendetails nutzen abgerundete Volumen. Rückseitige, von der Strecke verdeckte Fassadendetails entfallen. Niedrige Grafik nutzt normale gemeinsame Texturen ohne eigenen Atlas-Shader; die mittlere/hohe Stufe wiederholt Atlasteile über eine kleine Materialanpassung ohne zusätzliche Renderpässe.

Nahe Bäume behalten räumliche Kronen. Entfernte Kronen und Stämme teilen sparsame Alpha-Cutout-Batches. Die vorhandenen Straßen-, Gelände-, Dach- und Fahrphysikgrundlagen bleiben bytegleich. Stilisierte Fassaden und Teile der Anbauten bleiben künstlerische Näherungen; es wurde in diesem Durchgang kein neuer Street-View-Scan durchgeführt. Die Menügarage und Kursillustrationen sind keine vermessenen Ortsansichten.

Im Vergleich über 45 identische Kamerapunkte sinken die sichtbaren Karten-Mesh-Peaks in allen neun Kurs-/Qualitätskombinationen. Acht Karten-Dreiecks-Peaks sinken ebenfalls; Lammersdorf Q0 steigt für die Nahfasen von 169.590 auf 170.670 (+0,64 %). Mit den detaillierteren finalen Autos benötigt die komplette Lammersdorf-Szene mehr Dreiecke: Q0 203.601 statt 195.173, Q2 355.780 statt 345.300. Gleichzeitig sinken die jeweiligen Mesh-Peaks von 269 auf 266 und von 403 auf 400. Deshalb wird keine pauschale GPU-FPS-Steigerung behauptet. Vorhandene Leistungsgrenzen wurden nicht erhöht.

## Oberfläche und Laufzeit

Das dreistufige Menü und die festen mobilen Aktionen bleiben erhalten. Neue rot-/graphitfarbene Bedienflächen, native lesbare Beschriftungen, eigene Itembilder und Medaillen ergänzen das Branding. Kursillustrationen sind dekorativ; die tatsächliche Streckenkarte bleibt sichtbar. Ein generischer Mechaniker ergänzt geeignete Desktop-Lade-/Leerzustände. Auf Handys wird kein zusätzlicher Platz dafür beansprucht.

Die Renderplanung erhält Zeitreste auf 90-/144-Hz-Anzeigen und vermeidet dadurch ungleichmäßige Auslassungen. In zehn kontrollierten Sekunden mit 144-Hz-RAF und Ziel 60 werden 600 statt 480 Renderaufrufe geplant. Offline-Pause zeichnet 20 statt bis zu 600 Mal neu; Online-Pause bleibt im aktiven Takt. 100 unveränderte HUD-Aktualisierungen verursachen im instrumentierten Vergleich 0 statt 1.600 Property-Schreibzugriffe. Das sind Code-/Planungsnachweise und keine gemessenen Handy-FPS. Physikschritt, Rundenzeitgeber und Fahrgefühl wurden nicht verändert.

## Online und Daten

Das bestehende Vercel-Projekt breuer-grand-prix-final und die verbundene Neon-Datenbank breuer-grand-prix-db bleiben erhalten. Eindeutige Namen, dauerhafte Bestzeiten und Mehrspieler werden weiterverwendet. Keine neue Datenbank und kein zusätzlicher Tarif. Zugangsdaten sind nicht Teil der Übergabe.

Der Online-Kern ist gegenüber 3.3 unverändert. Der damalige Live-Protokolltest belegte sechs Clients, Wiederverbindung, HTTP-Fallback und sechs bestätigte Zieleinläufe über zwölf Kontrollpunkte. Dieser frühere Test wird nicht als erneut ausgeführtes 3.5-Online-Rennen ausgegeben. Aktuelle lokale Backendtests verwenden die produktiven Handler mit PostgreSQL-kompatibler PGlite-Engine.

Medaillenziele pro Runde bleiben: Lammersdorf 35/40/50 Sekunden; Bahnhof 47,29/54,04/67,55; Krämer 46,91/53,61/67,02. Mehrere Runden skalieren die Ziele.

## Medienbudget

Exakt 56,25 Higgsfield-Credits für 15 abgeschlossene Bildaufträge: zehn große Material-/Dekorationspakete zu je 4,25 und fünf UI-Assets zu je 2,75. Bestätigter Kontostand vorher 177,5; danach 121,25. Die Vorgabe 50–60 Credits ist erfüllt. Die Webfassungen belegen zusammen 2.536.830 Bytes; Originale, Prompts, Job-IDs und Hashes bleiben im separaten Art-Masterpaket erhalten. Keine neuen Video-, Sound- oder 3D-Generierungen. Vorhandene 22 ElevenLabs-Sounds bleiben eingebunden. Die Fahrzeugansichten entstanden lokal ohne Generierungscredits.

## Prüfungen und Veröffentlichung

`npm test`: 39 Prüfprogramme, 102 PASS-Meldungen, Exit 0. Separater optionaler Fahrzeug-Art-Test bestanden; alle 80 ausgelieferten WebP-Ansichten wurden dekodiert und gegen den Modell-/Kamerastand geprüft. Produktionsbuild bestanden. 267 Eingabedateien blieben während des finalen Testlaufs unverändert.

Die responsive Browserprüfung umfasst sechs Formate mit allen drei Vorbereitungsschritten, darunter 568 × 260, 568 × 320, 667 × 375, 844 × 390 und 1024 × 351. Zusätzlich wurden die drei Einstellungsseiten, Fahrerprofil, Zusatzmenü und geladene Bestenliste geprüft: insgesamt 26 dokumentierte Ansichten ohne Seitenüberlauf; die gemessenen sichtbaren Buttons sind mindestens 44 × 44 CSS-Pixel groß. Rennstart, eingeblendete Lenkhilfe, laufende Rennzeit, Pause, Fortsetzen und Rückkehr zur Garage wurden im echten HTTPS-Browser bedient. Ein bereits vergebener Fahrername wurde durch die verbundene Datenbank abgewiesen; dafür wurde kein neuer Testfahrer oder Rekord erzeugt. Das neue Produktionsmenü wurde zusätzlich direkt auf der Hauptadresse geöffnet und geprüft.

Vercel-Produktion `dpl_6dx6zz4XEu8ryyBuC57temAHqJFG` ist READY und bedient https://breuer-grand-prix-final.vercel.app/. Alle 135 öffentlich ausgelieferten Dateien wurden über diese Hauptadresse heruntergeladen und per SHA-256 sowie Bytezahl mit dem getesteten lokalen Build verglichen: 135 Übereinstimmungen, keine Fehler, zusammen 7.205.472 Bytes. `/api/health` antwortet HTTP 200 mit Release 3.5.0 sowie aktivem Mehrspieler-/Bestenlistenstatus.

JavaScript-Bundle: `game-3d1ec142e241.js`, 1.073.331 Bytes, SHA-256 `3d1ec142e2418d3b28535459bf86108684a5946bea4f9e22dedc121261858dc4`. HTML: 336.059 Bytes, SHA-256 `5fe8ff459dfddab803163f84a16f5fe68a37aae9d6c181529272049c7f34c0fc`. Die 80 Fahrzeugansichten benötigen gemeinsam nur 1.305.024 Bytes. Das Quellcode-ZIP wurde separat entpackt und aus seinen enthaltenen Dateien erneut gebaut: Alle 135 Ausgabedateien stimmen bytegenau mit dem veröffentlichten Stand überein.

Nachweise stehen unter `verification/3.5-*` und `verification/release-3.5.json`.

Die Cloud liefert nur den 2D-Kompatibilitätsrenderer. Physische iPhone-/Android-Multitouchprüfung, Safari-Langdruck auf echter Hardware, 3D-GPU-Bildraten und Langzeitbetrieb sind damit nicht nachgewiesen. Die lokalen Weltansichten verwenden echte Modell-/Texturdaten, approximieren jedoch Licht und lassen WebGL-Fog, Schattenmaps und Tonemapping aus. Fahrzeugansichten übernehmen die native Finish-/Tonemappingformel. Der eigene Atlas-Shader wird gegen die installierten Three-Shaderverträge geprüft; ein GPU-Compiler wurde hier nicht ausgeführt. Die integrierte Leistungsmessfahrt liefert Gerätewerte beim Kunden. Die konkret veröffentlichte Wix-Seite ist separat zu prüfen.

Das aktualisierte Quellcode-ZIP enthält Medien, APIs, Tests und Buildskripte. Ein separates Art-Masterpaket enthält die 15 Originalgenerationen. Private Fahrerpässe, Zugangsdaten, Browserbilder und heruntergeladene Ortsreferenzfotos werden nicht mitgeliefert. Der Wix-Link bleibt gültig.
