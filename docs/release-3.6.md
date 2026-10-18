# Breuer Grand Prix · Release 3.6.0

Grafik- und MiniMap-Durchgang, geprüft und veröffentlicht am 16. Oktober 2026.

Zehn ergänzende Higgsfield-Atlanten verfeinern Fassaden, Dächer, Grünflächen und Pflaster, Fenster/Türen, Werkstatt-/Bäckereidetails, Straßenrequisiten, Vegetation, Fahrzeugteile, Bedienflächen und Medaillen. Kritische Materialausschnitte und der bisherige Rennasphalt bleiben erhalten. Alle 80 Fahrzeugansichten wurden mit derselben Geometrie, Kamera und Beleuchtung neu berechnet. Straßen-, Gebäude-, Physik-, Kamera-, Steuerungs- und Netzwerkgrundlagen bleiben gegenüber 3.5 unverändert.

Die MiniMap ist deutlich größer und per Klick oder Antippen aufklappbar. Spieler, Gegner und Start/Ziel erhalten klar unterscheidbare Marker; die Route stammt aus den tatsächlichen Kursdaten. Schließen und Escape verkleinern die Ansicht. Der statische Kartenhintergrund wird zwischengespeichert; das bestehende Aktualisierungsintervall bleibt erhalten. Pause, Bremse und Item bleiben erreichbar. Die Browserprüfung führte noch zu einer kleinen CSS-Korrektur: Streckenname und Schließen-Knopf erhalten getrennten Platz.

## Budget und Dateiumfang

Elf erfolgreiche Higgsfield-Bildaufträge: zehn Atlanten für zusammen 42,50 Credits und ein MiniMap-Rahmen für 2,75 Credits, insgesamt **45,25 Credits**. Guthaben nach Abschluss erneut mit **73 Credits** bestätigt. Keine neuen Video-, Sound- oder 3D-Aufträge. Die 22 bestehenden ElevenLabs-Sounds bleiben integriert.

Die zehn ergänzten Laufzeit-Atlanten einschließlich des zusätzlichen MiniMap-Rahmens benötigen 1.781.590 statt zuvor 1.823.274 Bytes. Es kommen keine zusätzlichen 3D-Materialpässe hinzu. Der finale Webbuild umfasst 136 Dateien mit insgesamt 7.183.532 Bytes, 21.940 Bytes weniger als 3.5. Dies ist kein Nachweis höherer Geräte-FPS.

## Nachweise

- Vollsuite: 40 Prüfprogramme, 105 PASS-Meldungen, Exit 0. Build und Bilddekodierung bestanden; 286 Eingabedateien blieben während dieses Laufs unverändert.
- Nach der isolierten CSS-Korrektur: MiniMap-Test erneut mit drei PASS-Meldungen bestanden und Produktionsbuild erneut erfolgreich. Nur die erzeugte index.html änderte sich; JavaScript und sämtliche Medien blieben bytegleich.
- Reale Cloud-Browserbedienung: drei Vorbereitungsschritte bei 568 × 260, Rennbriefing, Rennstart, auf- und zugeklappte Karte, Escape, Pause/Fortsetzen und Rückkehr zur Garage. Finale Kartenansichten bei 568 × 260, 667 × 375, 844 × 390, 1024 × 351 und Desktop geprüft. Die Desktop-Testeinbettung war durch ihren äußeren Container auf 1310 Pixel Breite begrenzt. Keine gemessenen Überlappungen mit Pause/Bremse/Item oder zwischen Streckenname und Schließen.
- Vercel-Produktion dpl_3RnvRCrzYYf2sGKqFJmawpGRjmww: READY. Alle 136 öffentlichen Dateien auf https://breuer-grand-prix-final.vercel.app/ stimmen in Größe und SHA-256 mit dem lokalen finalen Build überein.
- Der Datenbank-Healthcheck mit echtem SELECT 1 besteht; die bestehende Bestenliste wurde nach Veröffentlichung im Browser geladen. Keine neue Datenbank, kein zusätzlicher Tarif und keine neue Spielerregistrierung für diese Prüfung.

Die unveränderten Online-Handler werden lokal mit PGlite geprüft. Der historische Live-Test mit sechs Clients aus 3.3 wurde in diesem Durchgang nicht wiederholt. Cloud-Browserprüfung und CPU-Bildprüfungen ersetzen keine physische iPhone-/Android-Multitouch- oder WebGL-FPS-Messung. Der Cloud-Browser verwendete den 2D-Kompatibilitätsrenderer. Die optionale gruppierte Vercel-Fehlerstatistik lieferte mangels Endpointberechtigung HTTP 403; eine Vercel-CLI stand nicht zur Verfügung. Veröffentlichung, direkter Dateivergleich und Live-/Datenbankprüfungen waren davon unabhängig erfolgreich.

Die Kartenquellen und zuvor dokumentierten Ortsreferenzen gelten weiter. Es wurde kein neuer Street-View-Scan durchgeführt. Alle tatsächlich verwendeten Laufzeitgrafiken, Sounds, Fahrzeugansichten, Streckendaten und Quelldateien liegen im Projekt. Die höher aufgelösten Generierungsoriginale und die technische Atlasvorbereitung sind zusätzlich im separaten Paket Breuer-GP-Art-Ergaenzungen-3.6.zip gesichert.

## Repository und Betrieb

Node.js 24 verwenden, anschließend npm ci und npm run build:vercel ausführen. Die Ausgabe entsteht in public/. npm test startet die Funktionsprüfung; npm run test:art benötigt zusätzlich die im Rendering-Skript dokumentierten lokalen Grafikabhängigkeiten.

Für Mehrspieler, Profile und dauerhafte Bestenlisten DATABASE_URL oder POSTGRES_URL als geheime Umgebungsvariable konfigurieren. Das Datenbankschema wird über den bestehenden Backendcode vorbereitet. Keine Datenbankinhalte, Fahrerzugänge, lokalen Browserdaten oder Zugangsdaten gehören ins Repository. Die vorhandene Vercel-Veröffentlichung wird durch den Repository-Upload nicht umkonfiguriert.
