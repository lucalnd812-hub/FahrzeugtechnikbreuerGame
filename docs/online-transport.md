# Online-Transport

Bis zu sechs menschliche Fahrer teilen ein Einzelrennen. Der Gastgeber wählt
Kurs, Runden, Schwierigkeit und Action/Klassisch. Solo-Modi und KI-Gegner werden
für einen Online-Raum normalisiert. Alle bestätigen dieselbe Konfigurations-
revision; der Server legt anschließend einen gemeinsamen Startzeitpunkt fest.

Die Raum-, Fahrer- und Rennzustände liegen im Schema `breuer_gp` der eigenen
Neon-PostgreSQL-Datenbank. Dadurch teilen mehrere API-/WebSocket-Instanzen
denselben Zustand. Fahrer-Tokens werden serverseitig gehasht; sie gehören
nicht in Einladungs-URLs oder Berichte.

Ein Browser sendet über eine verfügbare WebSocket-Verbindung etwa zehn
Zustände je Sekunde. Der Server bestätigt und verteilt gespeicherte Zustände.
Die Verbindung rotiert vor Ablauf der 300-Sekunden-Funktionsdauer. Ohne Socket
bleibt derselbe HTTP-Tick-Kanal verfügbar: etwa 220 ms im Rennen und 800 ms in
der Lobby, jeweils zuzüglich der Antwortzeit. Ein alter Fahrerzugang kann nach
Neuladen wieder verbunden werden; beim Verlassen erfolgt ein Gastgeberwechsel.

Der Server prüft Zugang, Sequenz, plausible Bewegung, Kontrollpunkte und
Zieleinlauf. Anwesenheitsmeldungen ändern nicht den Zeitstempel der letzten
Fahrzeugposition. Positionspakete enthalten zusätzlich eine monotone Sendezeit,
die der Server gegen seine eigene Rennzeit begrenzt: höchstens eine Sekunde
in der Zukunft und zehn Sekunden in der Vergangenheit. Ältere Pakete ändern
keine bestätigte Position. Ohne diesen Zusatz bleibt die serverseitige
Empfangszeit der Zeitmaßstab für bestehende Clients. Beim Wechsel zurück zum
Socket dient der tatsächlich bestätigte Datenbankstand als Ausgangspunkt.

Die erste Zielmeldung hält Rennergebnis und Ereigniszeit fest. Innerhalb des
begrenzten Verzögerungsfensters kann dieselbe Zielmeldung erneut übertragen
werden, ohne die Zielzeit nachträglich zu erhöhen. Mindestfahrzeit, vollständige
Kontrollpunkte und plausibler Rennfortschritt bleiben erforderlich; ein bereits
bestätigtes Ergebnis bleibt unverändert. Ein kurzer Antwortausfall bis zur
45-Sekunden-Gastgeberfrist überträgt die Raumleitung nicht an einen anderen
Fahrer. Sichtbare Anwesenheit wird nach zwölf Sekunden ohne Meldung aktualisiert.

Die Browser simulieren weiterhin ihre eigenen Autos; das
ist keine vollständig autoritative Anti-Cheat-Engine für bezahlte Wettbewerbe.

Offizielle Plattformreferenzen, am 9. Oktober 2026 geprüft:
[WebSockets auf Vercel, Public Beta vom 22. Juni 2026](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
und [Dauer / mehrere Funktionsinstanzen](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections).
Die tatsächlichen Ergebnisse der Veröffentlichung stehen in
`online-verification.md` und im Releasebericht.
