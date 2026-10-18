# Online-Prüfung · Release 2.0.1

Die lokalen Prüfungen verwenden die unveränderte produktive Raum- und SQL-Logik mit PGlite als echter PostgreSQL-Testengine. Die Datenbank benötigt dafür keine Zugangsdaten. Zwei unabhängig erzeugte WebSocket-Server teilen sich nur diese Datenbank, sodass die Prüfung auch die Synchronisierung zwischen Serverinstanzen erfasst.

## Prüfungen

`node tests/postgres.mjs` prüft sechs Fahrer bei konkurrierenden Beitrittsanfragen, die zulässigen Website-Herkünfte, Authentifizierung, Bereitstatus und Konfigurationsrevisionen, Gastgeberwechsel, unveränderte Fahreridentität bei Wiederverbindung, Rennen mit zwölf Kontrollpunkten, monotone Sequenznummern, bestätigte Zieleinläufe, Datenbank-Neustart, Ablauf und vollständiges Verlassen eigener Räume.

`node tests/realtime.mjs` prüft sechs Fahrer auf zwei unabhängigen Serverinstanzen, gemeinsam gespeicherte Zustände, Wechsel zwischen HTTP und WebSocket, Wiederverbindung, Ersetzen doppelter Verbindungen, ungültige Zugänge und Streckenversionen, Authentifizierungsfrist, JSON- und Binärnachrichten, maximale 12-KB-Nachrichten und maximal 24 Frames pro Sekunde. Außerdem werden Verbindungsrotation, Datenbankfehler mit weiter funktionsfähigem HTTP-Kanal, sechs plausible Zieleinläufe mit gemischten Transportwegen sowie Zugriffsentzug beim Verlassen geprüft.

Die Prüfungen enthalten eine gezielte Regression für kurze Verbindungshänger: Eine reine Anwesenheitsmeldung darf den Zeitpunkt der letzten Fahrzeugposition nicht überschreiben. Der Zustandszeitpunkt wird ausschließlich vom Server gesetzt; ein übermittelter `updatedAt`-Wert des Clients darf ihn nicht verändern.

Weitere Regressionen bilden die im Live-Test gefundenen Verzögerungen nach:
Während einer Socket-Anmeldung bestätigt die Datenbank bereits einen neueren
HTTP-Zustand; der Socket muss genau diesen Zustand übernehmen. Ein bei Sekunde
16 erzeugtes Positionspaket kommt erst bei Sekunde 21 an, das nächste Paket
wurde bei Sekunde 22,15 erzeugt und kommt bei Sekunde 22,15 an. Der tatsächliche
Bewegungszeitraum wird über eine unabhängig begrenzte Sendezeit geprüft.
Zeitstempel in der Zukunft, rückläufige Zeiten und neue unzulässige Positions-
sprünge bleiben ungültig. Veraltete Pakete verändern keine bestätigte Position.

Ein sechs Sekunden verspäteter Zieleinlauf darf seine ursprüngliche Zielzeit
behalten. Die Prüfung umfasst außerdem das erneute Übertragen derselben
Zielmeldung nach einer zunächst unbestätigten Endpunktposition, widersprüchliche
Ereigniszeiten, Mindestfahrzeit und fehlende Kontrollpunkte. Der tatsächliche
Client-Serializer wird ebenfalls geprüft: Nach sechs Sekunden Wartezeit bleiben
Rennergebnis und einmalig gespeicherte Ereigniszeit gleich, während Paketzeit
und Sequenznummer weiterlaufen.

## Prüfung einer öffentlichen Bereitstellung

Nach Veröffentlichung der neuen Version kann die tatsächliche Vercel-/Neon-Verbindung so geprüft werden:

```sh
node tests/live-online.mjs https://breuer-grand-prix.vercel.app --race --require-ws --output /absolute/path/online-live-results.json
```

Ohne `--race` läuft ein kurzer Synchronisierungstest. Mit `--race` fahren sechs eigenständige Protokollclients eine komplette Runde auf den öffentlich geladenen Streckenkoordinaten. Mindestens ein Fahrer verwendet bewusst HTTP; ein weiterer verbindet seinen bestehenden Fahrerzugang erneut. `--require-ws` verlangt, dass zunächst alle sechs WebSocket-Verbindungen angenommen werden. Ohne diese Option wird eine nicht verfügbare Direktverbindung als HTTP-Betrieb dokumentiert.

Der Test erstellt ausschließlich einen eigenen kurzlebigen Raum und lässt am Ende alle eigenen Fahrer austreten. Er verwendet keine Datenbank- oder Vercel-Zugangsdaten und unterstützt keine Umgehung geschützter Vorschauversionen. Berichte enthalten keine Fahrer-Tokens.

## Aussagekraft

Die lokalen Tests belegen die Raum-, Datenbank- und Transportlogik. Der Live-Test belegt zusätzlich die tatsächlich veröffentlichte API und die angeschlossene Datenbank. Sechs Protokollclients ersetzen keine Prüfung mit sechs geöffneten Spieloberflächen, keine Prüfung echter Mobilgeräte und keine Messung der Grafikleistung oder längerfristigen Serverkosten.

Der frühere öffentliche Live-Test von Version 2.0.0 am 9. Oktober 2026 um 10:45 Uhr deutscher Zeit hat
auf Produktionsdeployment `dpl_8VtQi2hBxkRFBVk5iShTJaTCYLvC` bestanden:
sechs WebSocket-Anmeldungen, eine Wiederverbindung, 926 empfangene Snapshots,
1.863 gesendete Zustandsframes und sechs bestätigte Zieleinläufe mit unveränderten
ursprünglichen Zielzeiten. Gastgeberwechsel und vollständiges Verlassen des
eigenen Raums haben ebenfalls bestanden. 349 HTTP-Anfragen ergaben einen
Median von 220 ms und p95 von 5.047 ms; dies ist keine Zusage niedriger Latenz.
Der Bericht `verification/online-live-results.json` enthält die tatsächlichen
Befunde ohne Fahrer-Tokens. Frühere Fehlversuche bleiben separat dokumentiert.

## Aktuelle Prüfung von Version 2.0.1

Die lokale Rundenprüfung schickt 214.496 tatsächlich gefahrene 10-Hz-Pakete durch
denselben Validator. Normale Bewegung am Rand und ein geometrischer Wechsel
zwischen benachbarten Segmenten einer scharfen Kurve werden angenommen. Neue
große Sprünge in Weltkoordinaten oder Kursfortschritt, rückläufige Zeitstempel,
fehlende Kontrollpunkte und Änderungen bestätigter Zielzeiten bleiben gesperrt.
Die gezielten PostgreSQL- und WebSocket-Regressionsprüfungen sind bestanden.

Am 9. Oktober 2026 um 12:34 Uhr deutscher Zeit bestand der öffentliche Test von
Version 2.0.1: sechs WebSocket-Anmeldungen, eine Wiederverbindung, 917 empfangene
Snapshots, 1.868 gesendete Zustandsframes und sechs bestätigte unveränderliche
Zieleinläufe über zwölf Kontrollpunkte. Das Rennen dauerte 40,439 Sekunden.
Gastgeberwechsel und vollständiges Verlassen des eigenen Testraums bestanden.
288 HTTP-Anfragen ergaben 222 ms Median und 6.642 ms p95. Die hohen Ausreißer
bleiben dokumentiert; diese Prüfung belegt keine durchgehend niedrige Latenz.

Der Bericht `verification/online-live-fix.json` gehört zu Deployment
`dpl_7mfBVE5khWkdaX3RoYMDAsSAdGz7`. Die abschließende Bereitstellung
`dpl_H4MsxeKiR2xiGRiS3FJE4zPsA7sw` ändert danach ausschließlich die sichtbaren
Start-/Online-Beschriftungen und ihre zugänglichen Namen. Die geprüfte
Backend-/Transportlogik bleibt bytegleich. Live-HTML, gebündeltes JavaScript und
iframe-Test der letzten Bereitstellung stimmen bytegenau mit dem lokalen Build
überein; der Health-Endpunkt antwortet mit HTTP 200.


## Aktuelle Prüfung von Version 3.3.0 · 15. Oktober 2026

Neues Projekt und angeschlossene bestehende Neon-Datenbank: https://breuer-grand-prix-final.vercel.app/. Sechs Protokollclients beendeten eine vollständige Runde über zwölf Kontrollpunkte; Wiederverbindung, HTTP-Fallback und Gastgeberwechsel bestanden. Sechs WebSocket-Anmeldungen, 942 Snapshots, 1.891 gesendete Zustandsframes; vollständiger eigener Raum bereinigt. HTTP-Median 416 ms, p95 6.909 ms. Keine Socket-Serverfehler im vollständigen Rennen. `verification/live-online-race.json` hält die Befunde fest. Der abschließende Deploymentwechsel ändert nur Profil-/Bestenlistenlayout, die geprüfte Backendlogik bleibt bytegleich.

Die neuen Profil-/Bestenlistenhandler bestanden die isolierte PostgreSQL-Prüfung einschließlich konkurrierender Namen und Ergebnisse. Live wurde ein ungewertetes QA-Profil reserviert, eine normalisierte Doppelbelegung mit 409 abgewiesen und der gespeicherte Zugang unabhängig authentifiziert; `verification/live-profiles.json`. Keine künstlichen Bestenlistenzeiten.
