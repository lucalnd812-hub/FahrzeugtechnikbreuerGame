# Breuer Grand Prix: technische Prüfung

Stand: 9. Oktober 2026, Version 2.0.1. Alle 20 lokalen Prüfprogramme sind bestanden. Diese Prüfungen führen den ausgelieferten Quellcode und die drei echten Streckendatensätze aus. Sie messen keine Bildrate auf einem schwachen Endgerät.

## Prüfungen

| Befehl | Geprüftes Verhalten |
| --- | --- |
| `node tests/race-visibility.mjs` | Prüft den tatsächlichen automatischen Matrix-Einstieg des WebGLRenderers, ohne manuelle Aktualisierung zu erzwingen. 216 bewegte Rennwagenposen, je 36 Geister, animierte Kisten und nachträglich eingefügte Öl-Meshes auf drei Strecken bei Qualitätswechseln 0→2→1→0. Karosserien liegen im Kamerafrustum und werden an ihrer erwarteten Position von echten Geometrie-Raycasts getroffen. Statische Straßen bleiben eingefroren. |
| `node tests/course-races.mjs` | Sechs Fahrer beenden jede Strecke im klassischen Rennen und im Action-Modus. Zehn Sekunden bei 10, 30 und 60 Darstellungsbildern je Sekunde ergeben exakt 600 identische Simulationsschritte. Zielzeiten und Rangfolge bei 30 und 60 Hz stimmen überein. |
| `node tests/course-races.mjs` | Fünf Runden auf der langsamsten Schwierigkeitsstufe ergeben 60 durchfahrene Kontrollpunkte pro Auto. Mit echten Werkzeugkisten, Schilden, Boost und Öl kommen ebenfalls alle sechs Fahrer an. |
| `node tests/refinement.mjs` | Streckensuche stimmt mit einer vollständigen unabhängigen Suche überein. Zwei Sekunden Stillstand abseits der Straße lösen die Rücksetzung aus; Bewegung unterbricht den Timer. Auf der Straße stehende Autos bleiben stehen. Rücksetzung schenkt keinen Rennfortschritt. Alle drei Autos können driften und den geladenen Boost auslösen. |
| `node tests/chase-camera.mjs` | Kamera und sichtbares Auto verwenden dieselbe interpolierte Pose. Gleichmäßige Bewegung bei 30/60/120 Hz, Übergänge über ±π, weich wechselnde Ansichten, Rücksetzung und Standruhe. Die 2D-Kamera nutzt denselben Anker. |
| `node tests/finish-regression.mjs` | 51 Einzelfahrerfälle und 18 Zielankünfte mit echten Kollisionen auf drei Strecken mit drei Autos. Zwei, drei und fünf tatsächlich gefahrene Runden, Grasrand, scharfe Innenkurven, Rücksetzung, Zielrempler im Stand und Schutz vor Abkürzungen. 214.496 tatsächliche 10-Hz-Zustandspakete bestehen den aktuellen Servervalidator. |
| `node tests/road-surfaces.mjs` | 774 echte Straßen-Raycasts und 12.395 Öl-Dreiecks-Raycasts für 78 Ölspuren. Rennasphalt und Hintergrundasphalt überlappen nicht auf gleicher Höhe; Randsteine liegen außerhalb sämtlicher Fahrbahnflächen. Öl folgt den tatsächlich gerenderten Flächen und liegt einen Zentimeter darüber, einschließlich Startfläche, Gefälle und Kreisverkehr. |
| `node --expose-gc tests/performance-production.mjs` | Zehn Wechsel zwischen den drei echten Welten mit jeweils sechs Autos. Stufen 0, 1 und 2 sowie dreißig weitere Qualitätswechsel je Welt erzeugen keine wachsende Sammlung von Geometrien oder Materialien. Aktive und inaktive Materialien, Texturen, Geometrien und Instanzpuffer werden beim Weltenwechsel genau einmal freigegeben. |
| `node --expose-gc tests/performance-production.mjs` | Eine unabhängige Segment-/Rechteckprüfung kontrolliert die gesamte Route: harte Absperrungen liegen mindestens 6,50 Meter von der Kursmitte entfernt, Randsteine mindestens 5,09 Meter. Der Rennasphalt folgt den tatsächlichen Höhendaten. Entfernte Szenenteile werden ausgeblendet; Nebel und Schatten folgen dem gewählten Profil. |
| `node tests/canvas-renderer.mjs` | Der echte 2D-Renderer zeichnet jeden ursprünglichen Streckenpunkt und die realen Gebäudegrundrisse. Die Prüfung erfasst tatsächliche Canvas-Pfade, Clipping, Pixeldichte und Transformationen. Sie prüft Sichtbarkeitsgrenzen, Spielerfokus, echte Hindernisse, Werkzeugkisten, Öl und den klassischen Modus. Renn- und Kartendaten werden durch die Darstellung nicht verändert. |
| `node tests/canvas-renderer.mjs` | Die 2D-Garage lädt Bilder der tatsächlichen neuen Spielmodelle. Alle drei Fahrzeugauswahlen zeichnen genau die zum Kamerawinkel und zur Modelldrehung gehörende Ansicht mit korrekten Proportionen. Der Ladezustand verschwindet nach erfolgreichem Laden. Erste Ansichten werden vorab geladen und laden die Darstellung über einen Rückruf neu; 48 Ansichten erzeugen genau 48 Bildanfragen. |

Die Weltenprüfung wurde nach der Anbindung der neuen Kadett-, E30- und M1-Modelle erneut erfolgreich ausgeführt. Sie prüft ausdrücklich, dass der Weltbauer das jeweils ausgewählte neue Modell liefert. Das sparsame Autoprofil benötigt höchstens acht sichtbare Meshes; bewegliche Vorderräder lenken, und alle Räder drehen mit dem zum Modell passenden Radius.

Die fünf geprüften Kamerastandorte je Strecke ergaben mit sechs neuen Autos diese CPU-Sichtbarkeitszählungen:

| Strecke | Stufe 0: sichtbare Dreiecke | Stufe 0: sichtbare Meshes | Stufe 2: sichtbare Dreiecke |
| --- | --- | --- | --- |
| Lammersdorf Klassiker | 42.358–127.141 | 82–251 | 54.130–212.531 |
| Bahnhof-Runde | 58.637–66.668 | 117–132 | 71.843–156.616 |
| Krämer-Kurven | 31.327–91.282 | 68–201 | 44.405–153.528 |

Der Node-Speicher lag nach dem Aufwärmen und nach expliziter Speicherbereinigung zwischen ungefähr 31,7 und 36,4 MB. Dies beschreibt den Testprozess und die geladenen CPU-Objekte, nicht das Speicherverhalten eines Handybrowsers oder der GPU. Die genauere, am Gelände geteilte Oberfläche kostet zusätzliche CPU-Geometrie. Rennasphalt und Gehwege sind in 96-Meter-Abschnitte geteilt; die bestehende Sichtbarkeitsprüfung blendet entfernte Abschnitte aus.

Der vollständige abschließende Testlauf maß Weltaufbauzeiten von 1.102,1 ms (Lammersdorf), 824,5 ms (Bahnhof) und 795,6 ms (Krämer). Je 20.000 Abfragen der tatsächlichen Straßenhöhe benötigten 20,8 / 22,1 / 18,3 ms. Die Abfrage wird auch für die Rennwagen, Kamera und Ölspuren verwendet. Dies sind CPU-Kosten im Node-Testprozess, keine FPS-Messung.

## Grenzen der Aussage

Der Nutzerbericht über unsichtbare Rennwagen deckte einen Fehler der
Matrixoptimierung auf: Der Weltbauer hatte auch den Scene-Root eingefroren.
Dadurch übersprang der echte WebGLRenderer die Positionsaktualisierung der
später hinzugefügten Rennwagen. Der Root behält nun automatische Updates,
während statische Gebäude und Straßen eingefroren bleiben. Der neue
Sichtbarkeitstest scheiterte vor dieser Korrektur und besteht danach. Frühere
Geometriezählungen erzwangen Matrixupdates und konnten diesen Fehler deshalb
nicht aufdecken. Der neue Test prüft den tatsächlichen Renderer-Einstieg und
die Geometriepositionen; eine visuelle GPU-Abnahme auf Endgeräten bleibt offen.

Sichtbare Dreiecke und Meshes wurden mit echten Three.js-Geometrien und Kamerafrustum auf der CPU gezählt. Eine solche Zählung ist keine Messung der WebGL-Zeichenaufrufe, der GPU-Auslastung oder der Bildrate. Ebenso beschreibt der nach einer expliziten Speicherbereinigung ermittelte Node-Speicher keinen Grafikspeicher eines Endgeräts.

Die Weltprüfung verwendet einen kleinen Canvas-Ersatz ausschließlich für prozedurale Beschriftungs- und Oberflächentexturen. Die Rennprüfung nutzt unveränderte Physik, Bots, Kollisionen, Kontrollpunkte und Geländeabfrage. Der Canvas-Ersatz protokolliert Befehle und Koordinaten, rendert aber keine Bildschirm-Pixel; die visuelle Prüfung erfolgt separat im Browser.

Zur Geräteabnahme die integrierte 60-Sekunden-Messfahrt auf dem Zielgerät durchführen, nach zehn Minuten Spielbetrieb wiederholen und den JSON-Bericht sichern. Ein Bericht aus der 2D-Kompatibilitätsdarstellung prüft ausschließlich diese Darstellung. Für eine belastbare Freigabe der 3D-Grafik sind ein normaler Rechner mit integrierter Grafik und echte Android-/iOS-Geräte erforderlich.

## Frühere Browser-Messung am 9. Oktober 2026, Version 2.0.0

Der Prüf-Browser meldete deaktivierte Grafikbeschleunigung. Das Spiel wechselte
deshalb tatsächlich in die Canvas-Darstellung. Die Messfahrt lief in der
veröffentlichten Vorschau mit sechs Fahrzeugen, 1363 × 936 CSS-Pixeln, Pixelfaktor
0,8 und einem Ziel von 30 Darstellungsbildern pro Sekunde.

| Lauf | Gesamtzeit | Gemessene Gesamtbildrate | p95 der letzten zehn Sekunden |
| --- | ---: | ---: | ---: |
| Mehrere Spiel-/Quelltabs im selben Prüf-Browser | 59,74 s | 1,91 FPS | 666,5 ms |
| Ein einzelner Spieltab nach Schließen der anderen Tabs | 60,12 s | 28,38 FPS | 50,0 ms |

Der schwache Mehrtab-Befund bleibt Teil der Messdaten. Die Einzelmessung
belegt für die damalige Version annähernd 30 FPS in dieser konkreten 2D-Umgebung, mit einzelnen längeren
Frames. Sie begründet weder eine flächendeckende Gerätefreigabe noch eine
60-FPS-Aussage für die 3D-Darstellung.

Während der Browserprüfung wurden zwei Fehler der Messfunktion behoben:
Der Bericht berücksichtigt nun das tatsächlich aktive 30-/60-FPS-Ziel je
Frame; die beendete Messfahrt kehrt vor Anzeige des Berichts zur Garage zurück,
sodass kein Pausendialog die Schaltfläche zum Herunterladen verdeckt. Beide
Korrekturen sind durch Funktionsprüfungen und einen echten Browserdownload
belegt. Die Rohberichte stehen im Quellpaket unter `verification/`. Diese ältere Messung wird nicht als neue Messung von Version 2.0.1 ausgegeben.

Die aktuelle Version wurde zusätzlich im echten Browser in 568×320, 667×375, 844×390 und tatsächlich 1310×768 Pixeln bedient. Alle 28 Garageansichten sowie die kompakten Hilfe-, Karten-, Online-, Pause- und Ergebnisansichten bestehen die Prüfung auf vollständig sichtbare, unverdeckte Schaltflächen und fehlende innere Scrollbereiche. Ein Rennen wurde über den sichtbaren Startknopf im kleinsten Querformat gestartet; eine vollständige Vorführfahrt erreichte dort den bedienbaren Zielbildschirm. Der Browser verwendete weiterhin die 2D-Kompatibilitätsdarstellung. Eine neue 3D-Bildratenmessung auf echten Endgeräten liegt nicht vor.
