# League Info API (Deno) – Dokumentasi Lengkap

> **Versi kode**: `league-info.ts`
>
> **Platform**: Deno (Edge/Server), menggunakan `undici` Agent untuk keep‑alive.

---

## 1) Ringkasan

Endpoint ini menyajikan data ringkasan kompetisi sepakbola (league/competition) dalam **mode hibrida**: ia dapat mengembalikan satu atau beberapa "tab" data sekaligus (overview, standings, topScorers, statistics, matches, transfers). Fitur khusus:

* Mendukung `season=latest` untuk otomatis memilih **season terkini** dari daftar yang disediakan oleh header kompetisi.
* Mendukung tab `all` yang akan diekspansi menjadi seluruh tab yang tersedia.
* Menggunakan **POST** ke API upstream `igscore` dengan payload standar (`lang`, `timeZone`, dll.).
* Menggunakan **AbortController** untuk timeout per request (default: 8000 ms) dan **undici.Agent** untuk koneksi keep‑alive.

Keluaran berupa JSON yang mengandung `metadata` (leagueId, seasonId, daftar season, tabs aktif) serta `data` terstruktur per tab.

---

## 2) Arsitektur & Alur Tinggi

1. **Parse Query**: baca `leagueId`, `seasonId`, `season`, dan `tabs` dari URL.
2. **Validasi**: `leagueId` wajib dan harus alfanumerik.
3. **Ekspansi Tabs**: bila `tabs=all`, konversi ke `[overview, standings, topScorers, statistics, matches, transfers]`.
4. **Ambil Header** bila salah satu kondisi terpenuhi:

   * `seasonId` kosong, atau
   * `season=latest`, atau
   * `tabs` berisi `overview`.
5. **Tentukan `seasonId`**: jika `season=latest` atau `seasonId` kosong **dan** header menyediakan `seasons`, gunakan `seasons[0].id`.
6. **Ambil Data per Tab** secara serial/parallel terkontrol (statistics paralel player/team):

   * `standings`, `topScorers`, `statistics (player & team)`, `matches`, `transfers`.
7. **Bangun Response**: sertakan `executionTime`, `timestamp`, `metadata`, dan `data`.

---

## 3) Endpoint & Metode

* **Metode**: `GET`
* **Path**: sesuai deployment (mis. `/league-info` bila file di-map ke route itu)

> Kode menggunakan `Deno.serve` sehingga path sama dengan lokasi deploy. Pastikan reverse proxy/route Anda mengarah ke file ini.

---

## 4) Query Parameters

| Nama       | Wajib | Tipe                 | Contoh               | Keterangan                                                                                                      |
| ---------- | ----: | -------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `leagueId` |    Ya | string (alfanumerik) | `vl7oqdehlyr510j`    | ID kompetisi (competitionId) untuk semua panggilan upstream. Divalidasi regex `^[a-zA-Z0-9]+$`.                 |
| `seasonId` | Tidak | string               | `56ypq3nhxw7md7o`    | ID musim spesifik. Jika kosong dan `season=latest` atau `overview` di-request, akan diisi otomatis dari header. |
| `season`   | Tidak | enum                 | `latest`             | Nilai yang didukung: `latest` (opsional). Bila `latest`, sistem akan pilih season paling baru dari header.      |
| `tabs`     | Tidak | daftar koma          | `overview,standings` | Default: `overview,standings`. Nilai khusus: `all` → diekspansi ke semua tab. Daftar tab valid lihat §5.        |

> **Catatan**: `seasonId` **diutamakan** bila disediakan. `season=latest` hanya digunakan saat `seasonId` kosong atau Anda memang ingin mengabaikan `seasonId` manual.

---

## 5) Daftar Tab & Perilaku

* `overview` → mengembalikan `header` dari endpoint header kompetisi:

  * Upstream: `/v1/football/competition/detail/header`
  * Payload tambahan: `{ competitionId, includeMvp: false }`
* `standings` → klasemen untuk season aktif:

  * Upstream: `/v1/football/competition/detail/standings`
  * Syarat: membutuhkan `seasonId`
* `topScorers` → daftar pencetak gol terbanyak:

  * Upstream: `/v1/football/competition/detail/topScorers`
  * Syarat: `seasonId`; parameter default `orderBy:0, pageNum:0, pageSize:20`
* `statistics` → statistik pemain & tim (dipanggil paralel):

  * Upstream pemain: `/statistics/player`
  * Upstream tim: `/statistics/team`
  * Syarat: `seasonId`
* `matches` → daftar pertandingan untuk season aktif:

  * Upstream: `/v1/football/competition/detail/matches`
  * Syarat: `seasonId`; default `pageNum:0, pageSize:20`
* `transfers` → perpindahan pemain (tidak butuh `seasonId`):

  * Upstream: `/v1/football/competition/detail/transfers`
  * Parameter default: `seasonId:""`, `teamId:""`, `year: String(tahunBerjalan)`

**Nilai khusus**: `tabs=all` diekspansi menjadi: `["overview","standings","topScorers","statistics","matches","transfers"]`.

---

## 6) Payload Upstream (Default)

Semua panggilan POST ke API upstream mengikutkan payload standar berikut:

```json
{
  "lang": "en",
  "timeZone": "+07:00",
  "platform": "web",
  "agentType": null,
  "appVersion": null,
  "sign": null
}
```

Field tambahan (`competitionId`, `seasonId`, dll.) ditambahkan sesuai tab.

---

## 7) Struktur Respons

### 7.1 Contoh Respons Sukses (dipersingkat)

```json
{
  "success": true,
  "executionTime": "0.73",
  "timestamp": "2025-09-21T11:03:41.168Z",
  "metadata": {
    "leagueId": "vl7oqdehlyr510j",
    "seasonId": "56ypq3nhxw7md7o",
    "availableSeasons": [
      { "id": "56ypq3nhxw7md7o", "year": "2025-2026", "isCurrent": 1 },
      { "id": "kjw2r09ho2jrz84", "year": "2024-2025", "isCurrent": 0 }
    ],
    "tabs": ["overview","standings"]
  },
  "data": {
    "overview": { "header": { "result": { /* ... */ } } },
    "standings": { "result": { /* ... */ } }
  }
}
```

### 7.2 Respons Error

* **Tanpa `leagueId`**

```json
{ "success": false, "error": "League ID is required" }
```

* **Format `leagueId` tidak valid**

```json
{ "success": false, "error": "Invalid League ID format" }
```

> Kode HTTP 400 untuk error validasi, 200 untuk sukses. Error jaringan upstream ditangani dengan `null` sehingga tab yang gagal dapat berupa `null` pada `data`.

---

## 8) Contoh Penggunaan

### 8.1 Ambil overview + standings (default)

```bash
curl "https://<host>/league-info?leagueId=vl7oqdehlyr510j"
```

### 8.2 Pakai season tertentu

```bash
curl "https://<host>/league-info?leagueId=vl7oqdehlyr510j&seasonId=56ypq3nhxw7md7o&tabs=standings,topScorers"
```

### 8.3 Pakai season terbaru otomatis

```bash
curl "https://<host>/league-info?leagueId=vl7oqdehlyr510j&season=latest&tabs=all"
```

### 8.4 Ambil hanya transfers tahun berjalan

```bash
curl "https://<host>/league-info?leagueId=vl7oqdehlyr510j&tabs=transfers"
```

### 8.5 Fetch via JavaScript

```js
const res = await fetch("/league-info?leagueId=vl7oqdehlyr510j&season=latest&tabs=overview,statistics");
const json = await res.json();
console.log(json.data.statistics.playerStats);
```

---

## 9) Detail Implementasi Penting

* **Timeout per request**: `AbortController` dengan default `8000 ms`. Jika request melebihi waktu, akan di-abort dan fungsi `callApi` mengembalikan `null`.
* **Keep‑Alive**: menggunakan `undici.Agent` dengan `keepAliveTimeout: 10000` dan `keepAliveMaxTimeout: 15000` untuk efisiensi koneksi HTTP.
* **User‑Agent**: di-set ke `Mozilla/5.0 (Deno)`.
* **Parallel Calls**: khusus `statistics`, dua endpoint (player & team) dipanggil bersamaan via `Promise.all` untuk mempercepat.
* **Eksekusi waktu**: `executionTime` dihitung dengan `performance.now()` (detik, 2 desimal).
* **Serial vs Paralel**: Tab lain dieksekusi berurutan untuk kesederhanaan; dapat dioptimalkan tergantung kebutuhan QPS.

---

## 10) Keamanan & Validasi

* **Validasi `leagueId`**: regex ketat alfanumerik mencegah karakter berbahaya dalam query.
* **CORS**: response bertipe `application/json` tanpa header CORS eksplisit. Tambahkan sesuai kebutuhan gateway/frontend Anda.
* **Upstream Trust**: response upstream tidak difilter; konsumsi data harus mengantisipasi `null`/struktur berubah.

**Saran tambahan**:

* Tambahkan rate‑limit di edge (mis. Deno Deploy/Cloudflare) untuk mencegah abuse.
* Tambahkan cache (local/edge KV/HTTP cache) terutama untuk tab `overview`, `standings`, `topScorers` yang relatif stabil intra‑hari.

---

## 11) Deployment

### 11.1 Deno (Self‑host / VM / Bare metal)

* Pastikan Deno ≥ 1.41.
* Jalankan: `deno run -A league-info.ts`
* Reverse proxy (Nginx/Caddy) arahkan path ke port service.

### 11.2 Deno Deploy

* Unggah file `league-info.ts`.
* Pastikan import `npm:undici` didukung runtime Deploy (atau ganti dengan native fetch tanpa dispatcher bila perlu).

> **Catatan**: Pada beberapa environment edge, opsi `dispatcher` bisa diabaikan. Uji tanpa `dispatcher` jika terjadi incompatibility.

---

## 12) Penanganan Error & Degradasi

* **Upstream gagal** → field tab terkait menjadi `null`.
* **Header gagal** saat `overview` diminta → `data.overview.header = null`.
* **`season=latest` namun `seasons` kosong** → `seasonId` tetap kosong; tab yang butuh season tidak dipanggil atau mengembalikan `null`.

> Konsumen disarankan memeriksa `data.<tab> === null` sebagai indikator masalah upstream atau ketiadaan data.

---

## 13) Kustomisasi & Ekstensi

* **Pagination**: tambahkan `pageNum/pageSize` via query dan teruskan ke `matches`/`topScorers`.
* **Sorting**: expose `orderBy` untuk `topScorers`.
* **Localization**: ubah `lang` via query param.
* **Time zone**: expose `timeZone` via query param bila dibutuhkan.
* **Caching**: edge cache per kombinasi `(leagueId, seasonId, tabs)` dengan TTL.

---

## 14) OpenAPI 3.1 (Contoh Spesifikasi)

```yaml
openapi: 3.1.0
info:
  title: League Info API (Deno)
  version: 1.0.0
paths:
  /league-info:
    get:
      summary: Ambil data kompetisi (multi-tab)
      parameters:
        - in: query
          name: leagueId
          required: true
          schema: { type: string, pattern: "^[a-zA-Z0-9]+$" }
        - in: query
          name: seasonId
          required: false
          schema: { type: string }
        - in: query
          name: season
          required: false
          schema: { type: string, enum: [latest] }
        - in: query
          name: tabs
          required: false
          schema:
            type: string
            description: Daftar tab dipisahkan koma; gunakan "all" untuk semua.
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  executionTime: { type: string }
                  timestamp: { type: string, format: date-time }
                  metadata:
                    type: object
                    properties:
                      leagueId: { type: string }
                      seasonId: { type: string }
                      availableSeasons: { type: array, items: { type: object } }
                      tabs: { type: array, items: { type: string } }
                  data:
                    type: object
        "400":
          description: Bad Request
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  error: { type: string }
```

---

## 15) FAQ

**Q1. Apakah `seasonId` override `season=latest`?**

> Ya. Jika `seasonId` dikirim dan valid, itu yang digunakan.

**Q2. Jika `tabs` berisi tab yang butuh `seasonId` tapi season tidak tersedia?**

> Tab tersebut akan mengembalikan `null` pada `data`. Periksa dan tangani di UI.

**Q3. Bolehkah menambah tab baru?**

> Boleh. Tambahkan blok serupa dengan `callApi(...)` dan definisikan upstream & payload.

**Q4. Bagaimana jika upstream lambat?**

> Sesuaikan `timeout` parameter di `callApi(apiUrl, postData, timeout)` per tab bila perlu.

---

## 16) Pengujian Cepat (Checklist)

* [ ] `leagueId` kosong → 400
* [ ] `leagueId` non‑alfanumerik → 400
* [ ] `season=latest` tanpa `seasonId` → seasonId terisi dari header (bila tersedia)
* [ ] `tabs=all` → seluruh tab ada di output
* [ ] Upstream mati → tab terkait `null`, API tetap `success:true`

---

## 17) Catatan Performa

* Gunakan edge caching untuk mengurangi latensi & beban upstream.
* Pertimbangkan parallelisasi lebih lanjut untuk tab non‑dependent.
* Log `executionTime` untuk observabilitas; integrasikan metrics (OpenTelemetry) bila perlu.

---

## 18) Perubahan (Changelog)

* **v1.0.0**: Rilis awal dengan dukungan `season=latest`, `tabs=all`, dan 6 tab utama.

---

## 19) Lisensi

Dokumentasi ini dirilis bebas digunakan dalam proyek internal Anda. Endpoint upstream mengikuti ketentuan penyedia masing‑masing.
