# Breuer Grand Prix – Audio

Stand: 13. Oktober 2026. Anbieter: ElevenLabs, Modell `eleven_text_to_sound_v2`.

Für dieses Update wurden 22 eigenständige Effekte erzeugt, je eine Aufnahme pro
Effekt. Insgesamt wurden 59,1 Sekunden angefordert. Die Vorabschätzung betrug
591 ElevenLabs-Credits. Die abgeschlossenen Generierungen meldeten zusammen
197 ElevenLabs-Credits. Diese Zahlen stammen aus dem Connector; Higgsfield wurde
für Audio nicht verwendet. Es gab keine kostenpflichtige Wiederholung.

Die vom Anbieter akzeptierte Obergrenze von 20 Nodes pro Lauf erforderte zwei
Teilläufe (20 + 2 Nodes) innerhalb desselben Flows. Ein zunächst mit 22 Nodes
übermittelter Lauf wurde vor Ausführung mit `INVALID_ARGUMENT` zurückgewiesen.
Er erzeugte keine zusätzlichen Aufnahmen. Alle 22 eigentlichen Generierungen
sind abgeschlossen. Flow: `uXJbMygp7zWrOj011y7J`.

## Aufnahmen und Einsatz

| Datei | Einsatz / Klangrichtung |
| --- | --- |
| engine-kadett.mp3 | Opel Kadett C: rauer Vergaser-Vierzylinder |
| engine-e30.mp3 | E30 M3: heller, mechanischer Tourenwagen-Vierzylinder |
| engine-m1.mp3 | BMW M1: voller, frei saugender Reihensechszylinder |
| engine-m2.mp3 | M2 Competition: tieferer Turbo-Reihensechszylinder |
| engine-gt3rs.mp3 | GT3 RS: trockener, heller Boxer-Sechszylinder |
| drift.mp3 | Reifenquietschen während tatsächlicher Driftzustände |
| wind.mp3 | Fahrtwind, abhängig von Geschwindigkeit |
| crowd.mp3 | Entfernte Dorf-Zuschauer, rhythmisches wortloses Anfeuern |
| impact.mp3 | Echte Fahrzeug- und Hinderniskollisionen |
| ui-click.mp3 | Normale Menüknöpfe |
| ui-select.mp3 | Fahrzeug- / Streckenauswahl |
| ui-back.mp3 | Zurück-Navigation |
| pickup.mp3 | Einsammeln eines Gadgets |
| boost.mp3 | Boost und Drift-Boost |
| shield.mp3 | Schutzschild aktivieren |
| oil.mp3 | Ölspur legen |
| oil-hit.mp3 | In fremde Ölspur fahren |
| countdown.mp3 | Countdown-Schritte |
| go.mp3 | Rennstart |
| lap.mp3 | Neue Runde |
| reset.mp3 | Zurück auf die Strecke |
| finish.mp3 | Rennziel |

Die Motoraufnahmen wurden mit unterschiedlichen Vorgaben erzeugt. Sie sind
stilistische Klanginterpretationen für das Arcade-Spiel, keine dokumentierten
Originalaufnahmen der realen Fahrzeugmodelle. Jeder Motor besitzt eine eigene
Generierungs-ID und einen eigenen Datei-Hash.

## Auslieferung und Mischung

Die 22 MP3-Dateien umfassen insgesamt 454.863 Bytes (rund 444 KiB), ohne JSON-
Manifest. Sie werden mit 64 kbit/s, 44,1 kHz und einem Kanal ausgeliefert.
Originaldateien wurden dekodiert, tatsächliche Stille am Anfang und Ende kurzer
Effekte gekürzt, Lautstärken mit Spitzenbegrenzung angeglichen und Loop-Grenzen
überblendet. Der Browser schützt zusätzlich die ersten und letzten vier
Millisekunden jedes dekodierten Loops, damit MP3-Vorklingeln keinen harten
Grenzsprung erzeugt. Alle geprüften dekodierten Dateien enthalten null geclippte
Samples und besitzen mindestens rund 3 dB Spitzenreserve.

`assets/audio/manifest.json` enthält für jede Datei die Generierungs-ID, SHA-256,
Größe, Dauer, Pegel und Formatprüfung. Es enthält keine signierten Download-URLs,
API-Schlüssel oder Anbieter-Anmeldeinformationen.

Der Spielcode benötigt zur Laufzeit keinen ElevenLabs-Zugang. Ton startet nach
einer Nutzeraktion. Die Audiobank erzeugt beim Start keinen AudioContext und
lädt keine Datei. Nach Ton-Aktivierung werden zuerst nur Menü-Klick und aktuell
ausgewählter Motor geladen. Weitere Effekte werden einmal bei Bedarf geladen
und dekodiert. Motoren wechseln mit kurzer Überblendung; Tempo verändert die
Tonhöhe kontinuierlich. Bis zu vier Umgebungsloops und acht einzelne Effekte
können gleichzeitig laufen. Stumm, Pause, unsichtbarer Tab und Entsorgung
beenden Stimmen; nachträglich fertig werdende Downloads starten keine Stimme.

## Prüfung und Grenzen

`node tests/racing-audio.mjs` prüft alle 22 Dateien und ihre Hashes, fünf
unterschiedliche Motoraufnahmen, Dateibudget, Klangpegel, Null Clipping sowie
die WebAudio-Lebenszyklen mit einem AudioContext-Testmodell. Mehr als 1.200
kontinuierliche Updates dürfen dabei keine neuen Quellen oder Decodes erzeugen.
Asynchrone Ladeabbruchfälle, Effekt-Cooldowns, maximale Stimmenzahl und
Fehlerisolation sind ebenfalls geprüft.

Die numerischen Audioprüfungen ersetzen keinen Hörtest auf den Lautsprechern
und Bluetooth-/Kopfhörer-Verbindungen echter Mobilgeräte. Der tatsächliche
Autoplay-Unlock und die Android-/iOS-Latenz werden im Browser-/Gerätetest
beurteilt. Die Datei `engine-preview.mp3` außerhalb der Laufzeitassets ist eine
kurze Montage der fünf Motoren zur Hörabnahme in der Reihenfolge Kadett, E30,
M1, M2, GT3 RS; dafür wurde keine weitere Generierung vorgenommen.
