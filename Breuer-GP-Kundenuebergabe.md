# Breuer Grand Prix · Kundenübergabe

**Spieladresse:** https://breuer-grand-prix-final.vercel.app/

Version 3.6.0 · 16. Oktober 2026. Für PC und Handy im Querformat.

## Schnell starten

1. Los geht’s wählen.
2. Auto auswählen, dann Weiter.
3. Strecke auswählen, dann Weiter.
4. Bei Bedarf Erweiterte Einstellungen öffnen: Runden, Gegner, Fahrstil und Grafik.
5. Rennen starten und die kurze Erklärung bestätigen.

Am Handy die linke oder rechte Bildschirmhälfte halten. Das Auto gibt automatisch Gas. Bremse und das eingesammelte Item liegen in der Mitte. Hochkant erscheint die Querformatmeldung. Am PC mit WASD/Pfeilen fahren, mit E das Item einsetzen, mit Leertaste driften. Pause steht oben rechts.

Ton ist zunächst aus; über Mehr → Ton einschalten. „Mehr“ führt zu Hilfe, Rangliste und zusätzlichen Spieloptionen. Bei langsamer Grafik unter Erweiterte Einstellungen → Grafik „Flüssig“ wählen. „Leistung prüfen“ fährt automatisch und erstellt einen Bericht vom tatsächlichen Gerät.

## Größere MiniMap

Die Karte zeigt den tatsächlichen Rundkurs und deutlichere Fahrerpositionen. Antippen oder Anklicken vergrößert die Ansicht; mit Schließen oder Escape wieder einklappen. Die Karte ändert weder Rennregeln noch Bestenlisten.

## Name und Bestenliste

Über Profil einen Namen wählen. Jeder Name ist nur einmal verfügbar; bei Doppelbelegung einen anderen wählen. Nach einem normalen gewerteten Rennen wird die bessere Zeit gespeichert. Wer als Gast startet, kann seinen Namen auch nach dem Zieleinlauf wählen. Jede Kombination aus Auto, Kurs und Rennregeln hat eine getrennte Liste. Deshalb kann eine andere Einstellung eine leere Liste zeigen.

Im Profil → Fahrerpass verwalten den privaten Fahrerpass speichern. Damit lässt sich derselbe Name auf einem weiteren Gerät verwenden. Diese Datei privat aufbewahren, denn sie enthält den Zugang zum Profil. Nach dem Löschen der Browserdaten wird sie zur Wiederherstellung benötigt.

Die Bestzeiten liegen dauerhaft in der angeschlossenen Neon-Datenbank; Geist und Einstellungen liegen auf dem Gerät. Ohne Verbindung bleibt das lokale Spiel verfügbar; eine Onlinefehlermeldung ist kein gesicherter Ranglisteneintrag.

## Gemeinsam fahren

Strecke und Runden wählen, Mit Freunden öffnen, Raum erstellen und Code teilen. Die Mitspieler geben den Code ein und bestätigen Bereit. Sobald alle bereit sind, startet der Gastgeber. Es spielen bis zu sechs Fahrer. Nach einer kurzen Unterbrechung lässt sich die gespeicherte Session erneut verbinden.

## Medaillenziele

| Eine Runde | Gold bis | Silber bis | Bronze bis |
| --- | ---: | ---: | ---: |
| Lammersdorf GP | 35 s | 40 s | 50 s |
| Bahnhof-Runde | 47,29 s | 54,04 s | 67,55 s |
| Krämer-Sprint | 46,91 s | 53,61 s | 67,02 s |

Bei zwei Runden gelten die doppelten Zeiten, entsprechend bei mehr Runden.

## In Wix per Button öffnen

1. Im Wix-Editor einen Button hinzufügen, z. B. „Breuer Grand Prix spielen“.
2. Button auswählen → Link → Webadresse.
3. `https://breuer-grand-prix-final.vercel.app/` eintragen.
4. „In neuem Tab öffnen“ auswählen und die Wix-Seite veröffentlichen.

Das ist für Handys die großzügigste Ansicht. Eine komplett eigene Wix-Unterseite geht ebenfalls: neue Seite „Grand Prix“ anlegen, ein Website-/HTML-Einbettungselement einsetzen und die Spieladresse bzw. das mitgelieferte Snippet verwenden. Den Button anschließend mit dieser Wix-Seite verknüpfen. Das Einbettungselement braucht ausreichend Höhe; im Handy-Querformat möglichst den gesamten verfügbaren Raum und Vollbild erlauben.

Das ZIP dient als vollständige Quellcode-Sicherung. Es wird nicht als ausführbares Spiel in Wix hochgeladen; Onlinefunktionen und Bestenlisten laufen auf Vercel mit der verbundenen Datenbank.

## Technische Übergabe

Projekt: `breuer-grand-prix-final`. Datenbank: bestehende `breuer-grand-prix-db`, für Production und Preview verbunden. Quellcode, Tests, Bau- und Veröffentlichungshelfer liegen im ZIP. Zugangsdaten und private Fahrerpässe sind dort nicht enthalten. Für spätere Updates die README im ZIP beachten und dieses neue Projekt verwenden.

Der Releasebericht nennt die tatsächlich bestandenen Prüfungen. Die mobile Größenprüfung wurde im Browser durchgeführt. Ein abschließender Test auf dem eigenen iPhone/Android und dem Zielrechner sowie auf der tatsächlichen Wix-Seite bleibt sinnvoll; eine gemessene 3D-Bildrate echter Mobilgeräte liegt hier nicht vor.
