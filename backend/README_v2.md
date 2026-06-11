# Lietuvos 112 įvykių analizės sistema

Žemėlapio pagrindu veikianti analitikos aplikacija Lietuvos bendrojo pagalbos centro (112) skambučių duomenims už 2021-09 iki 2023-06 laikotarpį. Sistema apjungia geografinį vizualizavimą, statistinę analizę, klasterizavimą ir prognozavimo modelį.

---

## Turinys

1. [Projekto apžvalga](#projekto-apžvalga)
2. [Architektūra](#architektūra)
3. [Duomenų rinkinys](#duomenų-rinkinys)
4. [Funkcijos](#funkcijos)
5. [Klasterizavimo metodologija](#klasterizavimo-metodologija)
6. [Prognozavimo modelis](#prognozavimo-modelis)
7. [Paleidimas vietoje](#paleidimas-vietoje)
8. [Failų struktūra](#failų-struktūra)
9. [Apribojimai ir ateities darbai](#apribojimai-ir-ateities-darbai)

---

## Projekto apžvalga

1,97 milijono 112 skambučių duomenų rinkinys paverstas interaktyvia analitikos platforma. Naudotojas gali:

- naršyti įvykius Lietuvos žemėlapyje (taškais arba šilumos žemėlapiu)
- filtruoti pagal įvykio tipą ir metus
- matyti pavojaus zonų vizualizaciją (smurtas, viešosios tvarkos pažeidimai)
- spustelėti bet kurią vietą žemėlapyje ir gauti hibridinę prognozę: artimiausių istorinių įvykių statistiką ir modelio prognozę
- palyginti du Lietuvos miestus pagal įvykių pasiskirstymą
- peržiūrėti duomenų analitiką diagramose

Sistemos tikslas — duomenų eksploratyvi analizė ir metodologinė demonstracija, ne realaus laiko dispečerinis įrankis.

---

## Architektūra

Trijų sluoksnių sistema:

### Backend (FastAPI + SQLite)
Python serveris, kuris pateikia 12 endpointų agreguotiems duomenims. Naudoja SQLite duomenų bazę su R-Tree erdviniu indeksu, kuris žemėlapio užklausoms duoda ~5x pagreitėjimą (240ms → 50ms).

### Duomenų bazė (SQLite + R-Tree)
Vienas failas `events.db` saugo visus 1,97M įvykių. R-Tree (`events_rtree`) yra erdvinis indeksas, kuris leidžia greitai rasti įvykius bounding box užklausomis. Papildomi indeksai ant `year`, `higher_level_incident_type`, `cluster_id` ir `data_quality_flag` stulpelių.

### Frontend (React + Google Maps)
Vite + React aplikacija. Google Maps integracija per `@vis.gl/react-google-maps`. Diagramos su `recharts`. Vienas pagrindinis komponentas `App.jsx`, suskaidytas į kelis funkcinius blokus (Stats, Analytics, Compare, MapView, PredictionPanel ir t.t.).

---

## Duomenų rinkinys

**Apimtis**: 1 970 922 įvykiai nuo 2021 m. rugsėjo iki 2023 m. birželio.

**Stulpeliai**:
- `incident_type_code`, `incident_id` — identifikatoriai
- `year`, `month` — vieninteliai laiko žymėjimai (nėra dienos ar valandos)
- `higher_level_incident_type` — 15 plačių kategorijų (BPC-GMP, Policijos įvykiai, ir t.t.)
- `lower_level_incident_type` — 154 siauresnės kategorijos (GMP įvykis, KET pažeidimas, Smurtas artimoje aplinkoje ir t.t.)
- `latitude`, `longitude` — WGS-84 koordinatės (perkeltos iš LKS-94)
- `data_quality_flag` — žymi nešvarius mėnesius
- `cluster_id` — pridėtas po klasterizavimo

**Duomenų kokybės problema**: 2022 m. rugsėjis–lapkritis ir 2021 m. rugsėjis turi nepaprastai mažai įvykių (~5 000/mėn vietoj ~100 000). Šie mėnesiai pažymėti `data_quality_flag = 'incomplete'` ir paprastai filtruojami iš analizės. Iš viso 22 mėnesių laikotarpio, tik 18 mėnesių yra švarūs duomenys.

**Apdorojimas**: pradinis `112.csv` failas (lietuviški stulpeliai, LKS-94 koordinatės) apdorotas:
1. Stulpelių vertimas į anglų kalbą
2. Koordinačių perkėlimas iš LKS-94 į WGS-84 (`pyproj`)
3. Duomenų kokybės žymių pridėjimas
4. Įrašymas į SQLite duomenų bazę
5. R-Tree erdvinio indekso sukūrimas
6. DBSCAN klasterizavimas ir `cluster_id` įrašymas atgal į duomenų bazę

---

## Funkcijos

### Statistikos puslapis
Visos 154 įvykių tipų kategorijos su jų suminiu skaičiumi. Galimi filtrai pagal įvykio tipą ir metus.

### Žemėlapio puslapis
**Trys režimai**:
- **Pins** — atskiri įvykiai kaip žymekliai (apriboti iki 100 vienu metu, kad neapsunkintų naršyklės)
- **Heatmap** — visi įvykiai agreguoti į tinklelio langelius, spalvomis nuo geltonos iki raudonos
- **Pavojaus zonos** — tas pats kaip heatmap, bet tik smurto ir viešosios tvarkos pažeidimų tipai (9 konkrečios kategorijos)

**Papildomos funkcijos**:
- Google eismo sluoksnio perjungiklis
- Spustelėjus bet kurią vietą — atsidaro popup su hibridine prognoze
- Tinklelio dydžio reguliavimas (~1 km / ~5 km / ~10 km)

### Hibridinis prognozės popup
Spustelėjus bet kurią vietą žemėlapyje, lygiagrečiai užklausiami du backend endpoints:
1. `/historical-near-point` — grąžina top 3 įvykių tipus 500m spinduliu apie spustelėtą tašką
2. `/predict` — grąžina top 3 prognozes iš klasifikatoriaus

Popup rodo abu skyrius vienu metu — istorinius skaičius (mėlynos juostos) ir modelio tikimybes (oranžinės juostos). Tai sąžiningas sprendimas: modelio tikimybės yra mažos (top ~35%), bet istoriniai skaičiai duoda konkretumo. Spustelėjamo popup įjungimo/išjungimo perjungiklis.

### Analitikos puslapis
Keturios diagramos su `recharts`:
1. Įvykiai per mėnesį (linijos diagrama) — pastebimai matomas duomenų spragas
2. Top 10 įvykių kategorijų (horizontali stulpelinė)
3. Kategorijų pasiskirstymas (donut)
4. Įvykių pasiskirstymas pagal metus (grupuotos stulpelės)

### Regionų palyginimo puslapis
Dviejų Lietuvos miestų palyginimas. Septyni galimi miestai: Vilnius, Kaunas, Klaipėda, Šiauliai, Panevėžys, Alytus, Marijampolė. Kiekvienas miestas apibrėžiamas 5 km spindulio apie centrą. Pateikiama:
- Bendras įvykių skaičius (didelis skaičius)
- Top 5 įvykių kategorijos (greta stulpelinės diagramos)
- Mėnesinė laiko serija (dvi linijos)

Statistika apskaičiuota iš anksto serverio paleidimo metu (cache) — užklausa instantani.

---

## Klasterizavimo metodologija

**Problema**: kai įvyksta realus incidentas, dažnai keli liudininkai paskambina 112. Duomenyse atsiranda kelios eilutės, kurios atvaizduoja tą patį realų įvykį.

**Algoritmas**: DBSCAN su Haversine atstumu (sferinis, ne Euklidinis).

**Parametrai**:
- `eps = 30 m` (konvertuotas į radianus per Žemės spindulį)
- `min_samples = 2`

**Strategija**: duomenys padalinti į 11 grupių pagal `higher_level_incident_type`, ir DBSCAN paleistas atskirai kiekvienoje grupėje. Tai užtikrina, kad medicinos įvykiai neklasterizuojami su policijos įvykiais vien dėl geografinio artumo.

**Spindulių analizė**:

| Spindulys | Didžiausio klasterio dydis | Pastaba |
|-----------|----------------------------|---------|
| 150 m | 7 031 | Grandinės efektas (nepriimtina) |
| 50 m | 92 | Per platus |
| **30 m** | **10** | **Pasirinkta** |
| 20 m | 7 | Per siauras |

**Rezultatas**: 232 558 įvykiai pateko į klasterius, 1 576 566 yra vieniši (singletons), iš viso 111 662 unikalūs klasteriai. Didžiausias klasteris turi 40 narių. Pilnas klasterizavimas trunka ~2 min ant 1,97M eilučių.

**Vertinimas**: duomenų rinkinys turi kategoriją `Dubliuotas kvietimas` — tai įvykiai, kuriuos operatoriai patys pažymėjo kaip dublikatus. Tai mūsų ground truth. Ant 2022 m. kovo duomenų (~106 ground truth eilutės), 30 m klasterizavimas teisingai sugrupavo 19% jų. 50 m — 33%, 150 m — 57,5%, 300 m — 80,2%.

**Sąžiningas sprendimas**: pasirinkome 30 m precision-over-recall kompromisą. Platesnis spindulys sugaut daugiau realių dublikatų, bet kurtų grandinės efekto klasterius su tūkstančiais nesusijusių įvykių. Geriau under-cluster nei over-cluster.

---

## Prognozavimo modelis

**Algoritmas**: scikit-learn `HistGradientBoostingClassifier` — gradient boosted decision trees su histogram-based binning pagreitinimui.

**Hiperparametrai**:
- `max_iter = 100` (100 boosting iteracijų)
- `max_depth = 8`
- `learning_rate = 0.1`
- `random_state = 42`

**Požymiai (4)**:
- `latitude`
- `longitude`
- `month`
- `year`

**Tikslas**: `lower_level_incident_type` — 112 klasių (po retųjų klasių filtravimo).

**Mokymo duomenys**: 1 353 642 eilutės po filtravimo (`data_quality_flag = 'ok'`, ne administracinė kategorija, klasė turi ≥10 pavyzdžių). 80/20 train/test split su stratifikacija.

**Mokymo laikas**: ~1,4 minutės.

**Tikslumas**:
- Top-1: **39,8%**
- Top-3: **59,7%**

### Eksperimentai

Bandyti keturi variantai:

| Variantas | Požymiai | Klasių balansas | Top-1 | Top-3 |
|-----------|----------|------------------|-------|-------|
| **v1 (gamyba)** | 4 (paprasti) | Ne | **39,8%** | **59,7%** |
| v2 (ciklinis mėnuo) | 5 (sin/cos kodavimas) | Ne | 37,6% | 59,2% |
| v3 (balansas) | 12 (+geografija) | **Taip** | **2,5%** | **9,6%** |
| v4 (geografija) | 12 (+geografija) | Ne | 39,3% | 59,2% |

**Išvados**:
- **Ciklinis mėnesio kodavimas** (sin/cos vietoj sveiko skaičiaus) nepagerino. Permutation importance parodė, kad mėnesio svarba yra 0,001 (latituda 0,082) — mėnuo praktiškai nieko nesako modeliui.
- **Klasių balansavimas** (`sample_weight='balanced'`) sugriovė modelį. Disbalansas yra 60 000× — `GMP įvykis` sudaro 41% duomenų, retosios klasės turi ~10 pavyzdžių. Toks per didelis disbalansas yra per agresyvus `sample_weight` priemonei.
- **Geografiniai požymiai** (atstumai iki 5 miestų + 5×5 tinklelio koordinatės) nepagerino, nes lat/lon medžiams jau implicitiškai turi tą informaciją.

**Pagrindinė išvada**: 60% top-3 yra duomenų riba, ne modelio nustatymo problema. Su minutiniais laiko žymekliais ir tekstiniais aprašymais tas pats algoritmas tikriausiai pasiektų 75-85% top-3.

---

## Paleidimas vietoje

### Reikalavimai
- Python 3.14
- Node.js 22+
- Google Maps API raktas

### Backend
```bash
cd backend
python -m venv myenv
.\myenv\Scripts\Activate.ps1   # Windows PowerShell
pip install fastapi uvicorn scikit-learn pandas joblib pyproj
uvicorn server:app --reload
```

Serveris paleidžiamas adresu `http://127.0.0.1:8000`. Endpoint dokumentacija pasiekiama `http://127.0.0.1:8000/docs`.

### Frontend
```bash
cd frontend
npm install
# Sukurti .env failą su VITE_GOOGLE_MAPS_API_KEY=...
npm run dev
```

Aplikacija pasiekiama `http://localhost:5173`.

### Backend endpoints

| Endpoint | Paskirtis |
|----------|-----------|
| `GET /stats/by-type` | Įvykių skaičiai pagal žemesnio lygio tipą |
| `GET /stats/by-month` | Įvykių skaičiai pagal mėnesį |
| `GET /stats/by-higher-type` | Įvykių skaičiai pagal aukštesnio lygio tipą |
| `GET /stats/by-year-and-type` | Įvykiai pagal metus ir tipą |
| `GET /events` | Įvykiai bounding box (su R-Tree) |
| `GET /heatmap` | Agreguotas tinklelis heatmap |
| `GET /danger-zones` | Smurto/viešosios tvarkos tinklelis |
| `GET /predict` | Modelio prognozė konkrečioje vietoje |
| `GET /historical-near-point` | Istoriniai įvykiai 500m spinduliu |
| `GET /region-stats` | Miesto statistika (iš cache) |

---

## Failų struktūra

```
projecct/
├── backend/
│   ├── server.py              # FastAPI serveris, visi endpointai
│   ├── main.py                # Pradinis duomenų apdorojimas
│   ├── build_db.py            # SQLite duomenų bazės sukūrimas
│   ├── add_rtree.py           # R-Tree indekso pridėjimas
│   ├── cluster_events.py      # DBSCAN klasterizavimo logika
│   ├── cluster_full.py        # Pilnas klasterizavimo paleidimas
│   ├── inject_clusters.py     # cluster_id įrašymas į duomenų bazę
│   ├── precompute_cities.py   # Miestų statistikos cache
│   ├── train_predictor.ipynb  # Modelio mokymo notebook
│   ├── predictor.joblib       # Apmokytas modelis (v1)
│   ├── predictor_classes.joblib  # Klasių pavadinimai
│   ├── city_stats.json        # Iš anksto apskaičiuoti miestų duomenys
│   ├── events.db              # SQLite duomenų bazė (~200MB)
│   ├── 112_final.csv          # Išvalyti duomenys (~158MB)
│   ├── README_CLUSTERING.md   # Klasterizavimo dokumentacija
│   └── README_RTREE.md        # R-Tree dokumentacija
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Pagrindinis komponentas
│   │   └── main.jsx
│   ├── package.json
│   └── .env                   # Google Maps API raktas
├── 112_analysis.ipynb         # Komandos draugės analizė
└── README.md
```

---

## Apribojimai ir ateities darbai

### Žinomi apribojimai
- **Mėnesinė laiko skiriamoji geba** — be valandos, dienos ar net savaitės informacijos. Tai didžiausias apribojimas prognozavimo modeliui.
- **Nėra įvykio aprašymų** — tik kategorijos. Negalima naudoti NLP papildomam signalui.
- **Duomenų spragas 2022-09 iki 2022-11** — keturių mėnesių laikotarpis turi tik ~5% normalių duomenų. Filtruojama iš analizės, bet sukuria akivaizdų gap diagramose.
- **Klasterizavimo recall yra 19%** — sąmoningas precision-over-recall pasirinkimas.
- **Statinis duomenų rinkinys** — sistema neturi realaus laiko duomenų gavimo.

### Ateities darbai
- **Valandinis arba minutinis laikas** — leistų modeliui mokytis dienos ir savaitės dėsningumus. Numatomas top-3 tikslumas: 75–85%.
- **Tekstiniai aprašymai** — NLP požymiai (embedded vektoriai, raktiniai žodžiai) reikšmingai praturtintų prognozes.
- **Realaus laiko ingest** — Kafka/Pub-Sub topologija nuolat įvedanti naujus įvykius.
- **Konkrečių įvykių susiejimas su realiais straipsniais** — naujienų portalų informacijos integravimas (Delfi, 15min, LRT).
- **Anomalijų aptikimas** — su minutiniais duomenimis būtų galima identifikuoti anomalias įvykių sankaupas realiu laiku.

---

## Naudotos technologijos

**Backend**: Python, FastAPI, SQLite, scikit-learn, pandas, joblib, pyproj
**Frontend**: React, Vite, Google Maps Platform (`@vis.gl/react-google-maps`), recharts
**Duomenų bazė**: SQLite su R-Tree extension
**ML**: HistGradientBoostingClassifier, DBSCAN, Haversine atstumas
