# Assets

`garage.webp`: original generated 16:9 garage artwork, converted and compressed for web use from the generated PNG. Used only as the menu backdrop, not as a geographically accurate depiction of Lammersdorf. In-game world geometry uses actual map coordinates.

Generation prompt:

Use case: stylized-concept. Asset type: wide 16:9 cover/background for a polished small browser racing game called Breuer GP, a motorsport workshop in the German Eifel. Create a premium cinematic stylized 3D miniature racing garage image, NOT a UI screenshot, no text, no interface, no lettering. Three recognisable classic cars lined up side by side, 3/4 front view at ground level: on left a bright yellow Opel Kadett C coupe with black wheels and boxy small 1970s body; in middle a white AC Schnitzer BMW E30 M3 race car with subtle red and dark blue stripes and square headlights; on right a low wide BMW M1 Procar in white with BMW red blue racing stripes and large rear wing. Cars occupy the right two-thirds and lower middle of frame, leave upper left dark breathing room for interface copy. Dark industrial workshop at night with large shutter doors, charcoal concrete, warm amber overhead practical lighting, glossy yellow paint, crisp tire and wheel details, soft haze. High-quality artistic low-poly 3D game look with detailed materials like an indie arcade racing game, realistic car proportions, moody camera, no people, no invented buildings of a specific place, no visible logos, no text, no watermark. No Nintendo characters or references.

`breuer-logo.png`: existing white workshop logo from the user-supplied vehicle workshop website, retained unchanged for the game UI.

`barlow.woff2`: Barlow Condensed Latin, weight 700, distributed by Fontsource under SIL OFL.

`vehicles/{kadett,e30,m1,m2,gt3rs}/00.webp` through `15.webp`: sixteen transparent views
per vehicle, rendered from the actual game meshes by
`scripts/render-vehicles.mjs`. The shared geometry is defined in
`src/vehicle-models.js`; `vehicles/manifest.json` records geometry/art hashes,
camera angles and dimensions. These previews use original modeled geometry
rather than source-photo pixels. Model references are documented in
`docs/vehicle-model-references.md`.

## Material- und Garagenpass 3.4 · 15. Oktober 2026

`nextlevel/village-facades.webp`: eigens erzeugter gemalter 4×4-Materialatlas, 1024×1024, 312.366 Bytes. 16 Putz-, Stein-, Klinker-, Schiefer-, Holz- und Sockelflächen, ohne gebackene Fenster oder Schrift. Higgsfield GPT Image2.5 high/2k; Job48a37e72-cb66-44d3-8a0a-9ad46b7a5696, 2,75 Credits.

`nextlevel/village-ground.webp`: eigens erzeugter gemalter 2×2-Atlas, 1024×1024, 412.282 Bytes, für wiederverwendete Bodenmaterialien. Higgsfield GPT Image2.5 high/2k; Jobdc05bbb6-2803-4595-ba9f-eb22e5231f67, 2,75 Credits.

`nextlevel/garage-painted.webp`: weichere gezeichnete Neufassung der bisherigen eigenen Garage, 1600 Pixel breit, 203.518 Bytes. Stilisiertes Menübild, keine belegte Ansicht des echten Werkstattgebäudes oder Dorfpanoramas. Higgsfield GPT Image2.5 high/2k, Referenz eigenes bisheriges Menübild; Job32a3187f-0a69-42e0-a645-cb45e3ebae50, 2,75 Credits.

Alle drei Originalgenerationen wurden für die Webauslieferung in WebP komprimiert. Der aktuelle Durchgang verbrauchte 8,25 Credits; bestätigter Kontostand danach177,5. Keine neuen Videos oder Audios. Die 80 Fahrzeugansichten wurden aus den eigenen tatsächlichen Spielmodellen neu gerendert und benötigen keine Generierungscredits. Aktuelle Hashes und Kameraparameter stehen in `vehicles/manifest.json`.

## Artisan-Grafikpass 3.5 · 15. Oktober 2026

15 eigens erzeugte Originalbilder mit GPT Image 2.5: zehn große Material-/Dekorationsmaster zu je 4,25 und fünf UI-Master zu je 2,75 Higgsfield-Credits. Insgesamt 56,25 Credits; bestätigter Kontostand danach 121,25. Die neue Fassung von village-facades.webp und village-ground.webp ersetzt im Runtime-Paket die 3.4-Fassung. Die obigen Werte zu 3.4 dokumentieren den damaligen Durchgang.

Die Stilreferenz wurde vom Nutzer bereitgestellt: plastische, handbemalte Spielgrafik mit abgerundeten Volumen. Fremde Fahrzeugform, Logo und Bildkomposition wurden nicht übernommen. Die individuelle Fahrzeuggeometrie bleibt in vehicle-models.js. 80 Vorschauansichten werden aus den tatsächlichen Modellen mit gemeinsamer Kameraposition, Materialien und NeutralToneMapping erzeugt.

Die Originale, Generierungsprompts, Job-IDs, Abmessungen und Hashes sind im separaten Art-Masterpaket enthalten. Das Webspiel nutzt die folgenden komprimierten Dateien; sie teilen Atlanten anstelle individueller Texturen für jedes Gebäude. Die Matcap-Sphäre wurde vor dem Verkleinern technisch aus dem generierten Bildrand ausgeschnitten; Original und Parameter bleiben erhalten. UI-Schrift und interaktive Flächen werden weiterhin nativ gerendert. Kursillustrationen und Mechaniker sind dekorativ und stellen keine vermessene Ortschaft bzw. reale Person dar.

| Datei | Bytes | SHA-256 |
| --- | ---: | --- |
| village-facades.webp | 213774 | 26c18911f189ef2a84a1b772cf5359f9e1257036c55c05a6daf6a4133f8c54b8 |
| artisan-roofs.webp | 134544 | 3e6e290de8d0a4af34e815ae7cbf18b920fb5c4ceb616c5918e838d054615a73 |
| village-ground.webp | 166748 | e42e69845b07216b43e79fd3d9f1c1565b402c7d6a779d680a59a9d76385cb0d |
| artisan-foliage.webp | 356958 | 7207d1ecb70998d6959b1bea0ff1afc9a152616f1232c0c7814e24973dba461c |
| artisan-windows.webp | 126278 | bf6420bc33a39dcba2db830667ab55a13447bef67c2e621b2c30c9720f65da91 |
| artisan-workshop.webp | 190894 | aee161a3c5b0cf05521598ec695972c88414cb4731e7c89f5f2032a5cd193588 |
| artisan-roadside.webp | 241212 | 52ac5498c049c15a49529eda5ee0d0e5b7e91d4cfd823502bcb4b5249c45e846 |
| artisan-sky.webp | 66390 | df65edec73ff5374630d6903617f2461663f61f2c86874c278ca4065691a6118 |
| car-finish.webp | 13624 | f5ca4778c44499456f56ae5a98617d836618ed9356acb920f894e9df48d6ac94 |
| car-details.webp | 145112 | 50c8e227eabaa18ce5f380e2ee8aee40329a9324f38e125ca4e71b76a47c3344 |
| artisan-items.webp | 167200 | f93ee767a1b18de77e54f57d2ff2094aee972ae15e0a3aba25a91c48c51945ea |
| artisan-medals.webp | 198058 | f0fd4f6784e3c7906a7031b4626a9218bd7b7bfd745586bb52168f192b81cc86 |
| artisan-panels.webp | 49696 | 3c4d64919c489c85151953ecb30f2bd2818049d27361e8628d00a1732f760001 |
| artisan-courses.webp | 370322 | 55057a9deb09c62fe872eecfdc1d6d90feaca61b00d37075bc91754c1cb7963c |
| artisan-mechanic.webp | 96020 | cb471088161be5bea44c47da2cc54f4e647f6fb2636bae76f9cc58a20f53dd00 |


## Ergänzungen 3.6 · 16. Oktober 2026

Elf Higgsfield-Originale für 45,25 Credits; zehn vorhandene Atlanten wurden zellenweise ergänzt, hinzu kommt ein MiniMap-Rahmen. Originale und technische Bildvorbereitung sind separat gesichert. Keine neuen Sound-/Videogenerierungen.

| Datei | Generierungsjob | WebP-Bytes |
| --- | --- | ---: |
| assets/nextlevel/village-facades.webp | 80103b65-b01e-475e-97d8-19398f781cb3 | 185092 |
| assets/nextlevel/artisan-roofs.webp | 8df071ff-a55f-4738-83ce-8a27ccac2f1e | 130936 |
| assets/nextlevel/village-ground.webp | ef4c8c5f-d46a-4750-838f-7b4d17c456fb | 185892 |
| assets/nextlevel/artisan-windows.webp | 4fa9fb09-da32-4345-83e5-9dcafb94539f | 113382 |
| assets/nextlevel/artisan-workshop.webp | 3b32f9fa-2b78-4bef-b7ad-de49b4331f00 | 166276 |
| assets/nextlevel/artisan-roadside.webp | de5b2e6e-a034-4a35-aed2-5ed636b18c34 | 214880 |
| assets/nextlevel/artisan-foliage.webp | 03c6cc45-3ea7-4fb3-8dc7-3034df7aa19a | 410096 |
| assets/nextlevel/car-details.webp | 6a1cfd43-b5a7-430e-ab6c-d1cc94988ab0 | 123870 |
| assets/nextlevel/artisan-panels.webp | a9d03002-04e0-4b3a-9efe-29217ba6fda9 | 51924 |
| assets/nextlevel/artisan-medals.webp | b98ae23e-a767-4f62-9e38-50888592eff0 | 189908 |
| assets/nextlevel/minimap-frame.webp | 3a49d0a6-994b-42c9-bdd3-c12731cba3d2 | 9334 |
