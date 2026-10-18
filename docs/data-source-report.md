# Ortsdaten und Genauigkeit

Stand der vorverarbeiteten Daten: 8. Oktober 2026. Der Bezugspunkt liegt bei
50,63067° N / 6,27689° E an Fahrzeugtechnik Breuer. Im Spiel zeigen X nach Osten
und Z nach Süden. Die fertigen Dateien liegen unter `src/tracks/`.

| Daten | Verwendung | Umfang / Genauigkeit |
| --- | --- | --- |
| OpenStreetMap | Straßenachsen, Grundrisse, Grünflächen, Orte | Drei geschlossene Kurse auf vorhandenen Straßenachsen; 447 Gebäude in der gemeinsamen Basis |
| Geobasis NRW LoD2 | Dachgeometrie und Gebäudehöhen | 316 zugeordnete Gebäude; andere Höhen bleiben angenähert |
| Geobasis NRW DGM1 | Geländehöhe, Straße, Fahrzeugneigung | Bilinear auf ein Raster mit 10 m Abstand reduziert, 85 × 81 Punkte; Bezugshöhe 544,21 m |
| Fotografien und Street View | Formen wichtiger Gebäude | Architektur als eigenes Spielmodell; keine übernommenen Foto- oder Street-View-Texturen |

| Kurs | Länge | Straßen |
| --- | --- | --- |
| Lammersdorf | 1.195,01 m | Kirchstraße, Im Pohl, In Lammersdorf, Johannesweg |
| Bahnhof | 1.614,52 m | Kirchstraße, Hoscheiter Straße, Bahnhofstraße, Im Pohl |
| Krämer | 1.601,74 m | Zusätzliche Schleife über die kartierten Krämer-/Kirchgassenabschnitte |

Die Routen speichern die ursprünglichen OSM-Straßen- und Gebäude-IDs.
Die Darstellung lädt je Kurs nur Gebäude innerhalb des Streckenkorridors.
Fahrbahnbreiten, Gehwege, kleine Anbauten, Fassadendetails und die Rennausstattung
sind angenähert. Das Spiel ist kein vermessener digitaler Zwilling des Dorfes.

OSM-Daten: [OpenStreetMap, ODbL 1.0](https://www.openstreetmap.org/copyright).
Amtliche Daten: [NRW-3D-Gebäude](https://ogc-api.nrw.de/3dg/v1/),
[NRW-DGM](https://www.wcs.nrw.de/geobasis/wcs_nw_dgm),
[Datenlizenz Deutschland – Zero 2.0](https://www.govdata.de/dl-de/zero-2-0).
Die Quellen-URLs, Lizenzangaben und das Abrufdatum stehen zusätzlich in
`src/tracks/base.json`. `scripts/build-tracks.mjs` und
`scripts/enrich-geodata.mjs` dokumentieren die Verarbeitung.
