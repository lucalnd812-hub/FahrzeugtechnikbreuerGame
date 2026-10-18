# Version 3.3: echte Browserabnahme

`3.3-browser-probes.mjs` enthält eine eigenständige, rein lesende DOM-Funktion. Sie lässt sich im unterstützten geteilten Browser auf der regulär geöffneten HTTPS-Spieladresse auswerten. Sie verändert weder DOM noch Spielzustand und liest keine Zugangsdaten. Ausgegeben werden tatsächliche Viewportmaße, aktive Oberfläche, abgeschnittene/überdeckte Bedienelemente, Touchgrößen, Vorschaugröße und Bild-Ladestatus sowie Videozustand.

`3.3-browser-checks.mjs` verwendet einen tatsächlich gestarteten Playwright-Browser mit einem neuen temporären Profil. Es installiert keinen Browser, übernimmt keine Anmeldung und verwendet weder CDP, Netzwerk-Mocks, Proxy noch Schutzumgehung. Das Ziel muss der eigene lokale Server oder eine ausdrücklich autorisierte reguläre Bereitstellung sein.

```sh
node qa/3.3-browser-checks.mjs --url https://breuer-grand-prix.vercel.app/ --case phone --output verification/3.3-browser
```

Ohne `--case` werden 568×320, 667×375, 844×390, 1024×351 mit Touch, 1180×360 mit Touch, 1024×351 mit Maus sowie Laptop/Desktop geprüft. Ein Browseremulator ersetzt weder ein physisches Smartphone noch einen schwachen PC. Der Bericht enthält keine behauptete Geräte-Bildrate. Die verwendete Engine ist ausdrücklich genannt; Chromium wird nicht als Safari ausgegeben.

Der Ablauf prüft Einstieg, alle fünf Autos mit echten Screenshots des großen Vorschau-Slots, Drehen/Licht, drei Strecken, Einstellungen, Steuerungserklärung, HUD, Pause und Rückkehr. Fünf identische Slotbilder gelten als Fehler: Damit fällt die in den Nutzerscreenshots gezeigte vollständig leere Vorschau auf. Bilder und `report.json` dokumentieren den jeweiligen echten Browserzustand. Erforderliche Profilanmeldung wird als blockierter Schritt dokumentiert; das Skript reserviert keine dauerhaft öffentlichen Testnamen.

Am 15. Oktober 2026 war der reguläre lokale Chromium-Start **blockiert**, weil das Playwright-Browserprogramm fehlt. Der Versuch steht unter `verification/3.3-browser-runtime-probe/report.json`. Die installierte Node-Bibliothek allein ist keine Browserabnahme. Es wurde kein Browser nachinstalliert und keine Seite als erfolgreich geprüft ausgegeben.

Die unabhängige API-Prüfung läuft so:

```sh
node tests/3.3-profile-leaderboards.mjs
```

Sie führt den produktiven Profil-/Bestenlisten-Handler und SQL in einer eigenen echten PostgreSQL-Testengine aus, prüft Namen und Namenskollisionen, Zugangsdaten, Kategorien, Sektoren, Zeitplausibilität, Tickets, Ränge, doppelte/parallele Ergebnisse, Ablauf und Neustart. Der Serverzeitgeber wird dafür kontrolliert weitergestellt. Es entstehen keine öffentlichen Profile oder Ergebnisse. Erfolgreiche API-Tests belegen weder reale Browserdarstellung noch Manipulationssicherheit eines vollständig autoritativ simulierten Rennens.
