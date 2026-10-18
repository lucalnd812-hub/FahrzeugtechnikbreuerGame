# Lammersdorf: Ortsidentität und Bildreferenzen

Aktualisierung: 12. Oktober 2026. Der sichtbare Stil ist bewusst ein freundliches,
farbenfrohes Arcade-Spiel mit gemalten Oberflächen. Bildquellen helfen bei der
Architektur; sie werden nicht als Fototexturen, künstliche Straßenkarten oder
angebliche Vermessung verwendet.

## Geometrische Grundlage

`src/tracks/base.json` enthält 447 reale Gebäudegrundrisse. 316 Gebäude besitzen
zugeordnete Dachflächen aus Geobasis NRW LoD2; Datenstand und Zuordnungsqualität
stehen am jeweiligen Gebäude. Die vorhandenen Straßenkoordinaten, Grundrisse,
Terrainwerte und amtlichen Dachflächen bleiben unverändert. Die drei Kurse laden
jeweils ihren bestehenden Ausschnitt dieses Dorfmodells.

Dachgeometrie wird aus den überlieferten Flächen trianguliert. Kollineare Punkte
und Nullflächen können bei der Triangulierung entfallen; jeder tatsächlich
angezeigte Dachvertex stammt weiterhin aus der ursprünglichen Fläche. Fenster,
Fassadenfarben, Gartenmöbel und Renntagsausstattung sind ergänzte Interpretation.
Eine echte Vermessung jeder Fassade und ein vollständiger aktueller Street-View-
Scan wurden in diesem Arbeitsschritt nicht durchgeführt.

## Neu gesichtete Primärquellen

| Quelle | Belegte Grundlage | Verwendung und Grenze |
| --- | --- | --- |
| [Fahrzeugtechnik Breuer, Über uns](https://www.fahrzeugtechnikbreuer.de/blank) | Betreiber-Fotogalerie der Werkstatt; helle Klinker, schwarze lange Beschilderung, Glas, oberer Terrassenbereich | Mapped Hauptkörper, niedrige Halle, offene Arbeitsbuchten, Hof und Breuer-Schilder. Zwei Hebebühnen, LED-Leisten, Diagnosewagen und Reifen gehören zur erfundenen Rennkulisse. |
| [Gemeinde Simmerath, Schulen](https://www.simmerath.de/wohnen-und-leben/bildung-und-erziehung/schulen/) | Öffentliches Eingangsbild der Kalltalschule: heller Putz, graue Holzverkleidung, flach geneigtes blaues Metalldach, lila Fenster-/Türrahmen | Niedriger gegliederter Anbau neben dem amtlichen Schulkomplex; farbige Rahmen und lesbarer Schulname. Das Eingangsbild belegt keine millimetergenaue Platzierung aller Fenster. |
| [Kalltalschule, OGS-Konzeption](https://kalltalschule.de/ogs-betreuung/leitbild/) | Gruppenräume auf zwei Ebenen, abtrennbarer Innenhof, Schulhof und angrenzender Spielplatz | Hof und getrennte Spielfläche liefern den Charakter; konkrete Spielgeräte und Positionen sind stilisierte Ergänzungen. |
| [Verein für Heimatgeschichte: Bauernmuseum](https://www.lammersdorf-bauernmuseum.de/museum/) | Erhaltenes altes Bauernhaus als Ortsmuseum | Historischer Fachwerkcharakter, dunkle Balken, helle Gefache, Dach und Gartenrand; das Gebäude bleibt an seinem kartierten Standort. |
| [NRW-Stiftung: Bauernmuseum](https://www.nrw-stiftung.de/entdecken/foerderprojekte/bauernmuseum-lammersdorf.html) | Wohnstallhaus von 1889, Fachwerkkonstruktion, historische Kastenfenster | Form und Fassadenunterteilung des bereits vorhandenen Museumsmodells. |
| [StädteRegion Aachen: Dorfrundgang Lammersdorf](https://www.freizeitportal.staedteregion-aachen.de/touren/dorfrundgang-lammersdorf) | Dorfkern, Bahnhof-/Zollhausgeschichte, Museum, alte Volksschule von 1864, Kirche | Bahnhofstraße und Kirchstraße erhalten stärker historische Stein-/Schiefer-/Putzfamilien. Das frühere Schulhaus bei der mobilen Sparkasse wird gezielt als historische Natursteinfassade behandelt. |
| [LEO: Standorte](https://leo-der-baecker.de/standorte/) | Aktuelle Betreiber-Standortseite | Café-Beschilderung; architektonische Bogenfenster und Terrasse beruhen zusätzlich auf der bereits vorhandenen historischen Prümmer-Aufnahme. Historische Beschilderung wird nicht als heutiger Betreiber ausgegeben. |

Die neu abgerufenen Betreiber- und Gemeindeaufnahmen wurden tatsächlich
angesehen. Die aktuelle Schul-Homepage-Galerie enthält auch Ausflugsfotos; ein
solches Bild wird ausdrücklich nicht als Gebäudereferenz verwendet. Vorhandene
historische Projektbilder der Kirchenfront, Bäckerei und Kreisverkehrsplanung
wurden erneut als Formreferenzen betrachtet. Die offiziellen Dorfrundgang-
Galeriebilder zeigen überwiegend Landschaft und Industriegeschichte, keine
vollständige Fassadensammlung entlang jeder Rennstraße.

## Unterschiedliche Häuser statt eines Wiederholungsmodells

`src/village-identity.js` ordnet jeder kartierten Gebäude-ID dauerhaft eine
Fassadenfamilie zu. Ein Haus wechselt seine Farbe oder Ausstattung beim
Streckenwechsel nicht zufällig. Explizite Materialangaben in den Ortsdaten haben
Vorrang. Fehlt eine Fassadenbeschreibung, ist die Zuordnung eine regional
passende Interpretation; sie behauptet nicht die echte Farbe dieses Hauses.

Es gibt acht Wohnhausfamilien: Eifeler Bruchsteinhaus, heller Putz mit Schiefer-
Obergeschoss, cremefarbiges Landhaus, roter Klinker, renovierter Schieferbau,
heller Klinker, ockerfarbenes Haus und moderner heller Putzbau. Sie unterscheiden
sich zusätzlich bei Fensterformat, Rahmen, Fensterteilung, Fensterabständen,
Haustür, Sockel, Schieferfarbe, Klappläden, Blumenkästen und Gartenbegrenzung.
Die echten unterschiedlichen Höhen und Dachformen werden dafür nicht ersetzt.

Alle acht Fensterbilder, vier Türen und Solarpanel-Pixel liegen in einem einzigen
512 × 512 Pixel großen, eigens programmierten Atlas. Dadurch brauchen
unterschiedliche Häuser keine eigenen Fenster-Materialien. Mauerwerk, Putz und
Schiefer werden mit Vertexfarben getönt und räumlich gesammelt. Die vier
zusätzlichen gemalten Diffuskarten liegen unter `nextlevel/{stone,slate,brick,
plaster}.webp`; bis sie geladen sind oder wenn ein Download scheitert, bleiben
die prozeduralen gemalten Ersatzflächen sichtbar. Es gibt keine Normalmaps.

Neue Hecken, Steinmauern, Holz-/Metallzäune und Pflanzkübel stehen ausschließlich
neben den Fahrbahnen. Sie werden gegen den ausgewählten Kurs und alle anderen
kartierten Straßen geprüft. Fenster, Türen und Zäune werden in 96-m-Batches
zusammengefasst, werfen keine zusätzlichen Schatten und verschwinden auf Distanz.
Die generierten Bilder verändern keine Gebäudeform und keine Straßenposition.

## Nachweis und Grenzen

`tests/scenery-identity.mjs` prüft alle drei Kurse: dauerhaft gleiche Haus-
Identitäten, verschiedene Fenster-/Türpixel bei einem gemeinsamen Material,
unveränderte tatsächliche Dachvertices, Gartengeometrie außerhalb der Straßen,
begrenzte Ressourcen sowie korrektes Laden und Freigeben der Texturen.

Die Texturen teilen nur einmal dekodierte Bildpixel; jede Welt besitzt eigene
Three.js-Texturen. Der Wechsel von gemalten Ersatzpixeln zu einem geladenen Bild
behält die Texturidentität für alle Qualitätsstufen. Bereits freigegebene Welten
nehmen keine verspäteten Bilder mehr an.

Die vorhandene Offline-Formprüfung mit Three.js SVGRenderer wurde erneut auf
Werkstatt, Schule, Museum und Bäckerei angewandt und angesehen. Sie zeigt reale
Modellgeometrie, aber keine echten WebGL-Texturdetails, PBR-Schatten oder GPU-FPS.
Dafür ist die veröffentlichte WebGL-Ansicht auf realen Geräten maßgeblich.

## Material- und Referenzabgleich3.4 · 15. Oktober2026

Für diesen Durchgang erneut gesichtet: Betreiberseite https://www.fahrzeugtechnikbreuer.de/ einschließlich Galerie auf /blank; Außenansicht mit heller Klinkerfront, langem schwarzem Schriftband und Oberterrasse sowie Werkstattaufnahme mit rotgrauem Pflaster und blauen Wandbereichen. Diese Beobachtungen fließen in die stilisierte Fassaden-/Werkstattdarstellung ein. Die Galerie ist keine vollständig vermessene Gebäudeaufnahme.

Die kommunale Schulseite https://www.simmerath.de/wohnen-und-leben/bildung-und-erziehung/schulen/ und das dortige Foto der Kalltalschule dienen als Schulreferenz. Das historische Bruchsteinhaus Kirchstraße31 wurde anhand des Commons-Fotos https://commons.wikimedia.org/wiki/File:Simmerath_Lammersdorf_Bruchsteinhaus_Kirchstra%C3%9Fe_31.jpg betrachtet; Aufnahmejahr2012, daher kein Nachweis des heutigen Fassadenzustands.

Der bereitgestellte Google-Maps-Link verlangte in diesem Cloud-Browser eine Menschlichkeitsprüfung. Es wurde kein CAPTCHA gelöst und kein vollständiger aktueller Street-View-Scan durchgeführt. Verfügbare OSM-Straßen, amtliche Dachgrundlagen und die oben genannten erreichbaren Bilder wurden weiterverwendet. Die Map bleibt eine spielbare, stilisierte Darstellung; Fassaden, Gärten und einzelne Anbauten sind künstlerische Näherungen. Fremde Referenzfotos werden nicht als Texturdateien ausgeliefert.
