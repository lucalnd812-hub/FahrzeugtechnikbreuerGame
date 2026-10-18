# Breuer Grand Prix · Release 3.3.0

Stand: 15. Oktober 2026. Live: https://breuer-grand-prix-final.vercel.app/

## Veröffentlichung

Das vollständige Spiel läuft öffentlich auf dem neuen Vercel-Projekt `breuer-grand-prix-final`. Finale Bereitstellung: `dpl_H2XJVZcaNymdVUPiWSF1kCPuS7Xr`. Die bestehende Neon-Datenbank `breuer-grand-prix-db` wurde für Preview und Production verbunden; das ältere Projekt bleibt bestehen. Der Health-Endpunkt bestätigt Release 3.3.0, Multiplayer und Bestenlisten. Keine neue Datenbank und kein neuer kostenpflichtiger Tarif wurden angelegt.

Alle 120 öffentlichen Dateien wurden nach dem letzten Dialogfix per HTTPS gegen den lokalen Build geprüft: 4.502.751 Bytes, keine Abweichung. JavaScript: `game-8e888cd96349.js`, 1.022.403 Bytes, SHA-256 `8e888cd963497627e3ddfe1916268a32c3182a5f1ba909a842a930f95fc387cc`. HTML: 289.880 Bytes, SHA-256 `335b75f5f367e04ba9e6cd70199b375a269411f91a54d4e9d9b21d5061c08e87`.

## Handy und Bedienung

Die eingesendeten Bilder zeigen bei Safari mit Leisten ungefähr 1024 × 351 CSS-Pixel. Dafür greift jetzt die Höhe des Fensters in die Menüaufteilung ein. Auto- und Streckenauswahl zeigen im kurzen Querformat eine aktive Karte mit großen Pfeilen. Der feste Aktionsbereich hält Zurück, Weiter und Start sichtbar. Erweiterte Einstellungen nutzen den vorhandenen Platz über eigene Tabs.

Die große Autoansicht wird unabhängig vom 3D-Renderer aus 16 Modellansichten je Auto zusammengesetzt. Sie ist auch ohne WebGL sichtbar und lädt begrenzt weitere Winkel nach. Alle fünf Autos wurden im Browser umgeschaltet; der Porsche wurde mit bestätigtem fertigem Bild geprüft. Die Kursvorschau zeichnet in ihrer tatsächlichen Größe.

Live-Browserprüfung: Desktopgarage; 1024 × 351, 844 × 390 und 568 × 320; zusätzlich Profil-Dialog bei 568 × 260. Auto-/Strecken-/Rennschritte, Pfeile, Start, Runden- und Grafikeinstellungen, Steuerungshinweis, Rennstart und Pause wurden bedient. Eine beobachtete Überlappung bei 260 px Höhe wurde korrigiert und erneut vermessen: Reservieren und Später liegen getrennt im Dialog. Ein echtes 1-Runden-Rennen zeigte nach dem Countdown 1/1. In der Cloud lief die 2D-Kompatibilitätsansicht; die Touchdarstellung ersetzt keinen echten Mehrfingertest auf iOS/Android.

## Fahrerprofile und dauerhafte Ranglisten

Namen mit 2–20 Zeichen werden normalisiert und per eindeutiger Datenbankbedingung reserviert. Auch Groß-/Kleinschreibung, Unicodevarianten und zusätzliche Leerzeichen erzeugen keine zweite Identität. Ein vergebener Name ergibt `NAME_TAKEN` und eine verständliche Meldung. Ein privater Fahrerpass erlaubt die Wiederherstellung auf einem anderen Gerät. Der geheime Zugriffsschlüssel erscheint weder in der öffentlichen Liste noch in der URL; gespeichert wird sein Hash.

Ranglisten trennen Auto, Strecke, Rundenzahl, Regeln, Schwierigkeit, Fahrhilfen, Physikversion und Solo/Online. Die eigene Platzierung bleibt außerhalb der Spitzengruppe sichtbar. In kurzen Fenstern wird die Spitzengruppe auf zwei bzw. drei Einträge begrenzt. Ein Gast kann nach dem Zieleinlauf einen Namen wählen und den bereits begonnenen Wertungslauf zuordnen. Beim Online-Wiederverbinden bleibt das ursprüngliche Wertungsticket erhalten.

Produktionsprüfung: ein ungewertetes Profil `Release QA 1510` reserviert; normalisierte Doppelbelegung mit HTTP 409 abgewiesen; Profil über eine neue HTTP-Anfrage authentifiziert und Rangliste erfolgreich gelesen. Es wurden keine künstlichen Bestenlistenzeiten angelegt. Die vollständigen Abschluss-/Bestzeitprüfungen liefen isoliert mit dem produktiven HTTP-Handler und echter PostgreSQL-kompatibler PGlite-Engine: konkurrierende Reservierung, Authentifizierung, Sektoren, Zeitplausibilität, anonymer Abschluss, wiederholte Antwort, bessere Zeit unter Konkurrenz, Kategorien und Wiederanlauf bestanden. Dies ist kein manipulationssicherer serverautoritativ berechneter Rennsport.

## Karte und Grafik

Zusätzliche Werkstattdetails im offenen Hof: Werkzeugwände, rote Schränke, Bodenmarkierungen und ein Mechaniker. Bäckerei mit Brotfenster und Café-Sonnenschirmen, Schulholzflächen und Hüpfkästchen, Sparkassenautomat. Eigene Grundrissdarstellung der Werkstatt samt Bühnen auch im 2D-Renderer. Ein gemeinsamer gemalter Detailatlas belegt 84.342 Bytes WebP. Die Erweiterungen benötigen zusammen 422 zusätzliche Umgebungsdreiecke; in 45 Vergleichsansichten maximal +0,112 % sichtbare Dreiecke und einen zusätzlichen sichtbaren Mesh. Straßen-, Dach- und Geländegrundlagen bleiben unverändert.

Diese Zahlen belegen den begrenzten Zusatzaufwand, keine Hardware-FPS. Gebäude bleiben stilisierte Nachbildungen; keine Behauptung eines vollständigen aktuellen Street-View-Scans oder fotogenauer Fassaden. Der gezeichnete Look bleibt erhalten. Vorhandene 80 Autoansichten und 22 ElevenLabs-Effekte werden weiterverwendet.

## Medaillen

Eine Runde Lammersdorf: Gold bis 35,00 s, Silber bis 40,00 s, Bronze bis 50,00 s. Bahnhof: 47,29 / 54,04 / 67,55 s. Krämer: 46,91 / 53,61 / 67,02 s. Mehrere Runden skalieren diese Ziele exakt. Ziele stehen vor dem Rennen und gelten auch für normale gewertete Rennen. Alte Medaillen werden nicht entfernt. Eine menschlich gefahrene 35-Sekunden-Runde ist noch nicht nachgewiesen.

## Verifikation

36 Programme im vollständigen Testlauf: erfolgreich, 98 PASS-Meldungen. Nach dem letzten reinen Dialog-/Listenfix zusätzlich `tests/online-records.mjs`: erfolgreich. Build: erfolgreich. HTTP-Dateivergleich der finalen Version: 120/120 exakt.

Live-Onlineprüfung auf der neuen Produktionsadresse: sechs eigenständige Protokollclients, sechs WebSocket-Anmeldungen, eine Wiederverbindung, bewusst gemischter HTTP-Betrieb, sechs unveränderte Zieleinläufe über zwölf Kontrollpunkte, Gastgeberwechsel und vollständiges Verlassen des Testraums. 942 Snapshots, 1.891 gesendete Zustandsframes; keine Socket-Serverfehler im vollständigen Rennen. 323 HTTP-Anfragen: Median 416 ms, p95 6.909 ms. Die hohen Ausreißer bleiben als Befund erhalten; dies ist keine Zusage gleichmäßiger Internetlatenz. Ein vorheriger kurzer Test nutzte bei einzelnen gedrosselten Socketverbindungen erfolgreich den HTTP-Fallback.

Echte schwache PCs, physische iPhones/Android-Geräte, längerer Serverbetrieb und die konkrete Wix-Seite wurden hier nicht abgenommen. Die integrierte Messfahrt hilft bei der Geräteabnahme. Insbesondere wurde keine stabile 60-FPS-3D-Leistung auf einem echten Handy gemessen.

## Übergabe

Das Quellcode-ZIP enthält App, APIs, Daten-/Medienassets, Tests, Bauanleitung und aktuelle Prüfbelege; keine Datenbankzugänge oder privaten Fahrerpässe. `Breuer-GP-Kundenuebergabe.md` enthält Spieladresse, Steuerung, Fahrerpass und Wix-Schritte. `Breuer-GP-Wix-Einbettung.html` verwendet die neue Produktionsadresse. Der CLI-Helfer ist auf das neue Projekt und Version 3.3.0 begrenzt.
