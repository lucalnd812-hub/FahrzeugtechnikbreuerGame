# Fahrzeugmodelle – Breuer Grand Prix

Stand: 9. Oktober 2026. Modellversion: `classics-2`.

Die drei Fahrzeuge wurden als eigene Three.js-Geometrie neu aufgebaut. Die
Fotos unten dienten zur Kontrolle der Silhouette, Fenster, Leuchten und
Karosseriedetails. Herstellerfotos oder fremde 3D-Modelle werden nicht im Spiel
ausgeliefert. Die Lackierung, Felgen und Tuningdetails sind eine Interpretation
für dieses Spiel; die Modelle sind kein Scan von Max' konkreten Fahrzeugen.

## Opel Kadett C Coupé

- [Opel/Stellantis: 50 Jahre Opel Kadett C](https://www.media.stellantis.com/de-de/opel/press/50-jahre-opel-kadett-c-der-erfolgstyp-fuer-sport-und-alltag), 14. September 2023.
- [Offizielles Opel-Classic-Bild: historische gelbe Rallyefahrzeuge](https://www.opel.ch/content/dam/opel/switzerland/de/experience-opel/hub/stories/03-heritage/HUB_Contentbilder_884x664px_Heritage_02.jpg?imwidth=768). Tatsächlich heruntergeladen und betrachtet; das ältere Heritage-Seitenziel leitet mittlerweile auf die Kooperationsseite um.

Übernommen wurden die flache schwarze Front mit runden Hauptscheinwerfern,
schmale Chromstoßfänger, Blinker unter den Scheinwerfern, der lange Vorderwagen,
die abfallende Coupé-Heckscheibe und die schmalen seitlichen Chromleisten.
Gelbe gewölbte Radbogenfalze, schwarze kleine Hecklippe und tiefere klassische
Felgen ergänzen die spielbezogene gelbe Variante. Die verwendete Länge von
4,18 m und die übrigen Kadett-Abmessungen sind Näherungen zur Modellierung;
sie wurden nicht als genaue Maße eines konkreten Umbaus verifiziert.

## AC Schnitzer BMW E30 M3

- [BMW AG Presse: technische Daten M3 1986–1990](https://www.press.bmwgroup.com/austria/article/attachment/T0082318DE/125287), Seite 1: Länge 4.345 mm, Breite 1.680 mm, Höhe 1.370 mm, Radstand 2.562 mm.
- [BMW PressClub: The BMW M3 (E30), September 2016, P90233617](https://www.press.bmwgroup.com/global/photo/detail/P90233617/the-bmw-m3-e30-09-2016).
- [Direktes BMW-Pressebild P90233617](https://mediapool.bmwgroup.com/cache/P9/201609/P90233617/P90233617-the-bmw-m3-e30-09-2016-2253px.jpg). Heruntergeladen und betrachtet, insbesondere Heckleuchten, niedrige M3-Spoilerbrücke und Heckscheibe.

Länge, Höhe und Radstand folgen der BMW-Datengrundlage. Das Spielmodell
verwendet eine etwas breitere Motorsport-Karosserie von 1,76 m. Es enthält
modellierte ausgestellte Kotflügel mit offenen Radbögen, vier runde
Frontscheinwerfer, schmale Nieren, schwarze Stoßfängerleisten, die kleine
Dreiecks-Seitenscheibe, schmale Fugen und eine kompakte M3-Heckflügelbrücke.
Weiße Farbe, Motorsportstreifen und sportliche Räder setzen die gewünschte
Spielvariante um. Ein bestimmter AC-Schnitzer-S3-Umbau, dessen Dekor oder
Max' Fahrzeug wurde damit nicht millimetergenau reproduziert.

## BMW M1 Procar

- [BMW M: Das BMW M1 Procar](https://www.bmw-m.com/de/topics/magazine-article-pool/das-bmw-m1-procar.html), 31. Mai 2019.
- [BMW M: Vom Procar zur Ikone](https://www.bmw-m.com/de/topics/magazine-article-pool/bmw-m1-vom-procar-zur-ikone.html), nennt die sehr niedrige Dachhöhe von 1,14 m.
- [Offizielles Bild: Heckdetails und Frontansicht von oben](https://www.bmw-m.com/content/dam/bmw/marketBMW_M/www_bmw-m_com/topics/magazine-article-pool/2019/bmw-m1-procar/bmw-m1-procar-visual-1-left.jpg).
- [Offizielles Bild: Seitenansicht](https://www.bmw-m.com/content/dam/bmw/marketBMW_M/www_bmw-m_com/topics/magazine-article-pool/2019/bmw-m1-procar/bmw-m1-procar-visual-2-right.jpg).
- [Offizielles Bild: Front und Heck](https://www.bmw-m.com/content/dam/bmw/marketBMW_M/www_bmw-m_com/topics/magazine-article-pool/2019/bmw-m1-procar/bmw-m1-procar-visual-3-full.jpg).

Alle drei Bilder wurden heruntergeladen und betrachtet. Die lange niedrige
Keilfront, eingezogenen Lampendeckel, kleinen Nieren, rechteckigen Frontleuchten,
breiten Kotflügel, goldenen feinen Speichen, schwarzen seitlichen Lufteinlässe,
Motorabdeckung mit Lamellen und der große hintere Rennflügel orientieren sich
an diesen Ansichten. Die Motorsportstreifen sind als eigene Flächen direkt auf
der Karosserie modelliert. Frontkotflügel steigen über den echten Radöffnungen
an; Haube und Lampendeckel folgen der flacheren mittleren Keilfläche. Die
grafische Länge 4,36 m und Breite 2,02 m sind Modellierungsmaße, kein vermessenes
Fahrzeug; die Dachhöhe orientiert sich an der offiziellen Angabe von 1,14 m.

## Geometrie- und Qualitätsbudget

| Modell | Stufe 0: Dreiecke | Stufe 0: Draws | Stufe 1/2: Dreiecke | Stufe 1/2: Draws |
|---|---:|---:|---:|---:|
| Kadett C | 1.582 | 6 | 6.402 | 15 |
| E30 M3 | 1.844 | 6 | 7.212 | 15 |
| M1 Procar | 1.646 | 6 | 7.798 | 15 |

Gezählt werden sichtbare Basismodelle mit vier animierbaren Rädern und weichem
Kontaktschatten; kurzzeitig sichtbare Schild-, Boost- und Drift-Effekte kommen
hinzu. Auf Stufe 0 besteht die Karosserie aus einem einzigen Mesh mit
Vertexfarben, dazu vier Räder und ein Schatten. Stufe 1/2 verwendet detaillierte
Geometrie und getrennte Lack-, Glas-, Chrom-, Gummi- und Lampenmaterialien.
Die drei Fahrzeuge benötigen keine Bildtexturen und keine Netzwerkzugriffe.

Die Geometrien beider Qualitätsstufen werden einmal angelegt; Umschalten
ändert nur Sichtbarkeit und Schattenoptionen. Vier Radinstanzen teilen sich
pro Auto dieselben Geometrien und Materialien bei unabhängigen Lenk- und
Rolltransformationen. `disposeVehicleModel` entsorgt gemeinsam verwendete
Ressourcen genau einmal. Die Ebenen sind im Objektbaum enthalten, sodass
die allgemeine Szenenentsorgung auch verdeckte Geometrien findet.

## Prüfung

`node tests/vehicle-models.mjs` prüft alle drei Fahrzeuge: endliche Attribute
und Bounding-Spheres, echte offene Radbögen per Raycast, lackierte Flächen über
den Rädern, Bodenkontakt der Reifen, vier unabhängige Radtransformationen,
Dreiecks- und Drawbudgets, 60 Qualitätswechsel ohne neue Ressourcen und genau
ein Disposal pro gemeinsam genutzter Geometrie/Material. Zusätzlich wurden
Front, Seite, Heck und insgesamt 48 echte Modellansichten als Software-Render
kontrolliert. Diese Prüfungen sind keine FPS-Messung auf einem Zielgerät.

## Integration

```js
import {createVehicleModel,setVehicleQuality,disposeVehicleModel}
  from './vehicle-models.js';

const car=createVehicleModel(0,{quality:0,parked:false});
setVehicleQuality(car,2);
// Beim Animieren den tatsächlichen Radius verwenden:
const wheelRadius=car.userData.wheelRadius;
disposeVehicleModel(car);
```

Front: +Z. Boden: Y=0. Radgruppen sind `userData.wheels` mit
`{group,spinning,front}`. Bestehende Effektaufrufe finden weiter
`userData.shield`, `userData.flames` und `userData.sparks`.
