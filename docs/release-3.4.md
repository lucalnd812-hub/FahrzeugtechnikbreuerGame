# Breuer Grand Prix · Release 3.4.0

Stand: 15. Oktober 2026. Spieladresse: https://breuer-grand-prix-final.vercel.app/

## Grafik und Garage

Alle fünf Fahrzeugmodelle sind überarbeitet: differenzierte Karosseriekonturen, gewölbte Scheiben, breites Reflexionsband, sichtbare Sitze und Armaturen, geschlossene Dachübergänge und feinere Leuchten/Räder. Die 80 Vorschauansichten wurden aus genau diesen Modellen neu gerendert. Eine feste Kamera mit 18° Höhe, ein gemeinsamer Weltmaßstab und ein fester Bodenpunkt ersetzen das bisherige Einpassen pro Drehwinkel. Beleuchtung und Kontaktschatten bleiben zur Garage ausgerichtet. Die Fahrzeugbank umfasst 1.368.552 Bytes. Vorschaubilder laden mit höchstens zwei parallelen Jobs und begrenztem Cache. Fünf unbenutzte Garagenmodelle werden beim Start nicht mehr erzeugt.

Die eigene Garage ist neu und weicher gezeichnet. Zwei gemeinsame Higgsfield-Materialatlanten ergänzen 16 unterschiedliche Fassadenflächen und vier Bodenflächen. Verwendet werden Putz, Eifeler Naturstein, Klinker, Schiefer, Holz, Pflaster, Gras und Asphalt. Gebäude-/Bodenkontakte und Farb-/Lichtabstimmung wurden überarbeitet. Die Regenrinnen folgen nun den Hauskanten; der Werkstattboden folgt dem Gelände, damit kein Gras durch die Halle wächst. Das niedrigste Grafikprofil nutzt sparsamere, ungeteilte Wandflächen. Keine zusätzlichen Nachbearbeitungspässe, Normalmaps oder Paketabhängigkeiten.

Betreiberfotos der Werkstatt, kommunale Schulfotos und eine historische Kirchstraßenaufnahme dienten als Referenzen. Straßen-, Gelände- und Dachgrundlagen bleiben erhalten. Google Maps verlangte in diesem Browser eine Menschlichkeitsprüfung; ein vollständiger aktueller Street-View-Scan wurde nicht durchgeführt. Gebäude bleiben stilisierte Nachbildungen und einzelne Fassaden/Anbauten künstlerische Näherungen. Die Menügarage ist kein vermessener Blick auf die echte Werkstatt.

## Handy und Bedienung

Der bewährte Ablauf Auto → Strecke → Rennen bleibt erhalten. Die mobile Ansicht zeigt eine große Auto-Bühne und eine flache Auswahlleiste mit fester Weiter-/Startaktion. Profil und Mehr sitzen im kompakten Header; Ton und Vollbild stehen unter Mehr. Namen und Auswahlflächen haben eigene Bereiche. Die Aktionen wurden auf 44–48 CSS-Pixel Höhe mit Abstand vereinheitlicht.

Fahrername und Fahrerpass haben getrennte Ansichten. Die Namensaktion steht in einem festen Fußbereich; der native Dateiwähler belegt dort keinen Platz mehr. Die Tastaturansicht berücksichtigt den tatsächlich sichtbaren Viewport und hält die Speichern-Aktion auch beim Fokuswechsel stabil. Eingabeentwürfe bleiben beim Wechsel zum Fahrerpass erhalten.

Spieloberflächen unterdrücken Langdruck-Auswahl, Kontextmenü und Bildziehen; Namens- und andere Eingabefelder behalten ihre üblichen Bearbeitungsfunktionen. Escape schließt einen Dialog auch bei Fokus im Feld. Touch-Lenken bleibt links/rechts halten mit automatischem Gas und kurzer Erklärung vor Rennstart.

## Online und Bestand

Dasselbe Vercel-Projekt breuer-grand-prix-final und dieselbe angeschlossene Neon-Datenbank breuer-grand-prix-db bleiben erhalten. Fahrerprofile, eindeutige Namen, dauerhafte Bestzeiten, Mehrspieler und private Fahrerpässe werden weiterverwendet. Keine neue Datenbank und kein zusätzlicher Tarif. Sensible Zugangsdaten sind nicht Teil der Übergabe.

Der Online-Kern ist gegenüber 3.3 unverändert. Der damalige Live-Protokolltest belegte sechs Clients, Wiederverbindung, HTTP-Fallback und sechs bestätigte Zieleinläufe über zwölf Kontrollpunkte. Dieser frühere Test wird nicht als erneut ausgeführtes 3.4-Online-Rennen ausgegeben. Die aktuellen lokalen Backendtests verwenden die produktiven Handler mit PostgreSQL-kompatibler PGlite-Engine.

Medaillenziele bleiben: Lammersdorf pro Runde 35/40/50 Sekunden für Gold/Silber/Bronze; Bahnhof 47,29/54,04/67,55; Krämer 46,91/53,61/67,02. Mehrere Runden skalieren die Zeiten. Die Fahrphysik wurde in diesem Grafik-/UI-Durchgang nicht verändert.

## Medienbudget

Aktueller Durchgang: 8,25 Higgsfield-Credits, drei Bildaufträge zu je 2,75. Bestätigter Stand danach 177,5. Keine neuen Video- oder Soundgenerierungen. Die vorhandenen 22 ElevenLabs-Effekte bleiben eingebunden. Fahrzeugansichten entstanden ohne Generierungscredits aus den eigenen Modellen. Job-IDs, Bytezahlen und frühere Durchgänge stehen im separaten Medienbudget.

## Prüfung und Veröffentlichung

Veröffentlicht auf dem bisherigen Vercel-Projekt und derselben öffentlichen Adresse. Finale Bereitstellung: dpl_6wUrPdQyQxqcnLTj64dnokyLCAoT, Status READY. Der Health-Endpunkt bestätigt 3.4.0, Multiplayer und Bestenlisten. Alle 122 öffentlichen Dateien wurden über HTTPS mit dem lokalen endgültigen Build verglichen: 5.419.020 Bytes, keine Abweichung.

Vollständiger Testlauf: 37 Programme, 100 PASS-Meldungen, Exit 0; Produktionsbuild erfolgreich. 247 Eingabedateien blieben während dieses Laufs identisch. Nach den anschließend im Browser gefundenen Anpassungen an Vorschaugröße und kurzem Header bestanden Garage-Flow, Karussell, Vorschau und vollständiger Controller erneut; der abschließende Build bestand ebenfalls. Keine unnötige Wiederholung der unveränderten Backendtests. 117 Assetdateien stimmen mit dem Deploymentmanifest überein.

Finales Bundle: game-8a3c4b6baa52.js, 1.056.135 Bytes, SHA-256 8a3c4b6baa524e3e7aecd04a5afa38a57b2a4629807e74e8985a14407a799fd8. HTML: 316.024 Bytes, SHA-256 db3b814ef604cb06bc15538f599b0f00dcae9846cbb8696a6412f137fc29f310.

Reale Browserbedienung: Desktopgarage, 1024×351, 844×390, 667×375, 568×320 und 568×260; Auto-/Strecken-/Rennschritte, Einstellungen, Profil/Fahrerpass, Doppelnamefehler, Escape, Steuerungshinweis, echter Rennstart und Pause. Die finale 568×260-Garage hat keine außerhalb des Viewports liegenden Auswahlknöpfe; alle sichtbaren Garagenaktionen sind mindestens 44×44 CSS-Pixel groß. Der Porsche wurde in der finalen Produktionsansicht vollständig geladen und sichtbar bestätigt. Sofortmessungen während Größenwechseln werden als solche erhalten und nicht als fertig gerenderte Bildabnahme ausgegeben.

Die Cloud stellt nur den 2D-Kompatibilitätsrenderer bereit. Echte iPhone-/Android-Multitouchtests, Safari-Langdruck auf physischer Hardware, 3D-GPU-Bildraten und Langzeitbetrieb sind damit nicht gemessen. Die modell-/texturgenauen CPU-Ansichten sind Näherungen ohne tatsächliches WebGL-Tonemapping, Fog oder Schattenmaps. Die konkrete Wix-Seite muss separat geprüft werden. Die integrierte 60-Sekunden-Messfahrt liefert Gerätewerte beim Kunden.

Das aktualisierte Quellcode-ZIP enthält alle Medien, APIs, Tests, Buildskripte und aktuelle Prüfbelege. Der unveränderte Wix-Link bleibt gültig. Zugangsdaten, private Fahrerpässe, Browserbilder und heruntergeladene Referenzfotos sind nicht Bestandteil der Quellcode-Sicherung.
