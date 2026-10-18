# Breuer Grand Prix · Arcade 3.0.0

Stand: 12. Oktober 2026. Die Version ist öffentlich auf https://breuer-grand-prix.vercel.app/ veröffentlicht. Vercel-Deployment dpl_GK3iVmCo2yMHhqKXG1n7iEZRhXN7 ist READY (Node 24, Region fra1).

## Änderungen

- Moderner gezeichneter Arcade-Look: Cel-Shading, gemalte Highlights, kräftige Lackfarben und blaues Glas. Fünf unterscheidbare echte 3D-Spielmodelle, sparsame Varianten und 80 neu gerenderte Fahrzeugansichten.
- Gelber Kadett C, AC Schnitzer E30 M3, BMW M1 Procar, grauer M2 Competition F87 und blauer 911 GT3 RS 992.
- Eigener Einstieg mit echtem Breuer-Logo, eigener Button-Gestaltung, Animation, Poster-Fallback und stummem Hintergrundvideo. Video pausiert in Garage/Rennen, bei verstecktem Dokument und reduzierter Bewegung.
- Auto → Strecke → Rennen, Zurückknopf, sichtbare Schrittanzeige und getrennte erweiterte Einstellungen. Fünf Auto-Tabs in einer kompakten Reihe.
- Mobile Links-/Rechts-Steuerung über beide Bildschirmhälften, fester Gas-Assistent, Bremse/Item mittig und Erklärung vor jedem Spielerstart. Lokale Zeit läuft erst nach der Bestätigung; online erfolgt die Erklärung vor dem Bereitsignal.
- Geschwindigkeitsabhängige Lenkung, nachvollziehbarer Gripverlust, dosierbare Bremse, recoverbare Drifts und Boost. Karosserie neigt sich getrennt von Rädern und Bodenschatten.
- Acht Hausfamilien plus historisches Schulhaus, gemeinsamer Fenster-/Türatlas, Gärten, Klappläden und unterschiedliche Materialoberflächen. Werkstatt mit offenen Buchten, Hebebühnen, Werkzeugen und sparsam dargestellten Deckenleuchten.
- Alle fünf Autos online; die alte Datenbank-Fahrzeugbegrenzung wird transaktional erweitert. Bestehende Fahrer, Zugangstokens und Räume bleiben erhalten. Bestzeiten/Geister sind nach neuer Physikversion getrennt.

## Ortsgenauigkeit

Straßen-/Routenvertices, Grundrisse und amtliche Dachgeometrien sind unverändert. Je nach Kurs wurden 3.981, 5.364 oder 5.832 tatsächliche Dachvertices in den finalen Sammelmeshes nachgeprüft. Neue Gärten liegen außerhalb der kartierten Straßen. Nicht vermessene Fassadenfarben und Fenster sind eine ortstypische künstlerische Interpretation. Offizielle Orts-/Gebäudequellen stehen in docs/landmark-references.md. Es wurde kein vollständiger Google-Street-View-Scan durchgeführt.

## Bisherige Prüfung

Alle 24 lokalen Prüfprogramme wurden mit dem aktuellen Quellcode bestanden. PostgreSQL und WebSocket wurden nach der tatsächlich notwendigen Katalogmigration gesondert erneut geprüft. Der ursprüngliche Testkettenlauf hatte diese bisher auf drei Autos begrenzte Datenbankregel entdeckt; sie wurde samt Migrations-/Datenerhaltungstest korrigiert.

81 tatsächlich gefahrene Einzelfahrerfälle, 30 Rennen mit Kollisionen und ein Zielrempler im Stand prüfen Rundenzählung, Rücksetzung und unveränderliche Zieleinläufe. Weitere 90 Handling-Rennen verwenden fünf Autos, drei Kurse, zwei/drei/fünf Runden und beide Regelsets. 335.763 tatsächliche 10-Hz-Zustandspakete wurden von der Serverprüfung akzeptiert. Es werden keine künstlichen Zielwerte zum Beenden gesetzt.

Controllerprüfungen decken Einstieg, fünf Autoauswahlen, Abbruch/Neustart der Erklärung, Zeit-/Eingabesperren, verpflichtendes Handy-Gas, Pause, Tour, Geister, Cup, Demo und Messfahrt ab. Diese Tests nutzen einen kleinen DOM/Renderer-Ersatz und belegen keine reale Browserbildrate.

774 Straßenrays und 12.395 Ölrays prüfen Oberflächenlage und sichtbare Ölspuren. Zehn Weltwechsel mit 30 Qualitätswechseln prüfen räumliche Sichtbarkeit und Ressourcenfreigabe. Low-Autos benötigen jeweils sechs Material-Zeichenaufrufe und etwa 1.600–3.500 Dreiecke. 80 WebP-Fahrzeugansichten brauchen insgesamt 1.498.794 Bytes. Das neue Menüvideo ist rund 273 kB groß und läuft nur im Einstieg.

## Reale Browserabnahme und Grenzen

Die ausgelieferte Oberfläche wurde im Cloud-Chrome bedient und vermessen: Einstieg, alle fünf Autoauswahlen, Schrittfolge, Zurück, Start/Online, alle drei Einstellungsseiten, echte Ladephase, Steuerungserklärung, Renn-HUD und Pause. Bei 568×260, 568×320, 667×375 und 844×390 bleiben die geprüften Bedienelemente vollständig im Spielfenster; die Dokumenthöhe entspricht der Viewporthöhe. Der Laptop-Test ergab tatsächlich 1310×768 (der äußere Browser begrenzt die 1366er Testauswahl); auch dort waren die Bedienelemente vollständig sichtbar. Der Gas-Schalter erscheint nur auf Desktop. Das Menüvideo war nach dem Einstieg nachweislich pausiert.

Die Umgebung bietet keinen funktionierenden WebGL-Kontext. Die Browserprüfung lief deshalb mit dem tatsächlichen 2D-Kompatibilitätsrenderer und den aktuellen gerenderten Fahrzeugmodellen. Sein Einsatz wurde nicht als echte 3D-Prüfung ausgegeben. Die 3D-Geometrie-, Sichtbarkeits-, Kamera-, Straßen-/Öl- und Ressourcenprüfungen führen den echten Code unter Node aus. Eine echte 3D-Bildrate auf einem schwachen PC oder physischen Smartphone ist noch nicht nachgewiesen. 60 FPS auf beliebigen Geräten werden nicht behauptet.

## Medienbudget

Ursprüngliches Limit: 600 Higgsfield-Credits. Vor der Stilkorrektur: 49,5 verbraucht. Neue Arcade-Assets: 19,5 einschließlich einer gezielten Texturkorrektur. Bestätigter Gesamtverbrauch: 69; bestätigter Rest: 531. Es gibt keine weiteren geplanten Generierungen. Der geänderte Look hat davon 19,5 Credits benötigt.

## Öffentlicher Online-Test

Der sechs-Protokoll-Client-Test gegen die öffentliche Spieladresse ist bestanden. 6 WebSocket-Verbindungen, 1 Wiederverbindungen und 964 bestätigte Snapshots. Alle sechs Fahrer beenden den getesteten Umlauf; die Testsessions wurden vollständig entfernt. HTTP-Diagnose: 341 Anfragen, Median 170 ms, P95 4395 ms. Diese Netzwerkwerte enthalten den Testablauf und sind keine 3D-Bildrate. Es handelt sich um sechs echte Netzwerk-Protokollclients mit plausiblen Positions-/Checkpoint-Daten, nicht um sechs physische Endgeräte. Die geschützte Preview wurde für diesen öffentlichen Test nicht freigeschaltet.
