# Papan Kanban Kolaboratif Realtime

Papan Kanban (mirip Trello) yang bisa diedit banyak orang secara bersamaan.
Perubahan kartu (pindah kolom, tambah, hapus) tersinkron realtime lewat
**CRDT ([Yjs](https://docs.yjs.dev/))**, sehingga dua orang yang memindahkan
kartu yang sama pada saat bersamaan tidak saling menimpa data — semua klien
konvergen ke state akhir yang sama secara otomatis.

## Arsitektur

```
Browser (Y.Doc lokal + WebsocketProvider)
        │  WebSocket: /yjs/:boardId (autentikasi via cookie session)
        ▼
Custom server (server/index.ts) — Next.js + WebSocket dalam satu proses
        │
        ├─ Otorisasi: cek BoardMember sebelum upgrade koneksi diterima
        ├─ y-websocket/bin/utils: protokol sync CRDT (sync step 1/2 + update)
        └─ Persistensi: snapshot Y.Doc (biner) disimpan ke BoardSnapshot (DB)
```

Setiap board = satu `Y.Doc` dengan struktur:

```
columnOrder: Y.Array<string>            // urutan kolom
columns:     Y.Map<columnId, Y.Map>      // { title }
cards:       Y.Map<cardId, Y.Map>        // { title, columnId, order, updatedAt }
```

Memindahkan kartu = mengubah `columnId`/`order` pada `cards.get(cardId)`.
Karena `Y.Map` menyelesaikan konflik per-key secara CRDT (deterministik di
semua klien), dua user yang memindahkan kartu yang sama pada saat bersamaan
**tidak saling merusak data** — begitu update saling bertukar, semua klien
konvergen ke hasil akhir yang identik tanpa locking di server.

### Optimistic UI

Yjs menerapkan perubahan ke `Y.Doc` lokal secara **sinkron** sebelum update
dikirim ke server, sehingga kartu berpindah kolom seketika di layar user yang
melakukan drag — tanpa menunggu round-trip jaringan.

## Bug non-trivial yang ditemukan & diperbaiki saat verifikasi

**Race condition pada pemuatan snapshot dari database.** API persistensi
bawaan `y-websocket` (`setPersistence({bindState, writeState})`) TIDAK
di-*await* oleh `getYDoc()` sebelum server mengirim *sync step 1* ke klien
yang baru connect. Akibatnya, klien pertama yang membuka board setelah
server restart bisa menerima **state kosong** terlebih dahulu (karena query
database untuk memuat snapshot belum selesai), sebelum akhirnya menyusul
lewat broadcast update terpisah beberapa saat kemudian.

Ini ditemukan lewat pengujian nyata (`scripts/verify-persistence.ts`), bukan
asumsi — percobaan pertama gagal dengan kartu `undefined` setelah server
displit meskipun data di database sudah benar.

**Perbaikan:** memakai hook `setContentInitializor()` (yang hasilnya
disimpan sebagai `doc.whenInitialized`, sebuah Promise) alih-alih
`setPersistence()`, lalu di `server/index.ts` secara eksplisit:

```ts
const doc = getYDoc(docName);
await doc.whenInitialized; // tunggu snapshot selesai dimuat dari DB
wss.handleUpgrade(request, socket, head, (ws) => {
  setupWSConnection(ws, request, { docName });
});
```

Ini memastikan *sync step 1* pertama yang dikirim ke klien manapun sudah
merefleksikan state final dari database — tidak ada lagi state kosong yang
"tiba-tiba terisi". Diverifikasi ulang dan lolos setelah perbaikan.

## Verifikasi (hasil nyata, bukan simulasi kode)

Tiga skrip di `scripts/` menjalankan **koneksi WebSocket sungguhan** ke
server yang benar-benar berjalan (bukan unit test dengan mock):

- **`verify-crdt-conflict.ts`** — dua klien Yjs terpisah (Alice & Bob)
  konek ke board yang sama, keduanya memindahkan kartu **yang sama** ke
  kolom berbeda pada saat nyaris bersamaan. Hasil aktual:
  ```
  State akhir di klien Alice: columnId=done, order=0
  State akhir di klien Bob:   columnId=done, order=0
  BERHASIL: kedua klien konvergen ke state identik
  ```
- **`verify-persistence.ts`** — setelah server displit total (proses lama
  dimatikan, proses baru dijalankan), klien yang connect ulang menerima
  state kartu terakhir (`columnId=done`) langsung dari snapshot database,
  bukan state kosong.
- **`verify-ws-auth.ts`** — memverifikasi koneksi WebSocket ditolak untuk:
  tanpa token (401), token tidak valid (401), dan user yang login tapi
  bukan anggota board tersebut (403).

Ketiganya dijalankan terhadap server dalam mode development **dan**
production (`NODE_ENV=production tsx server/index.ts`), keduanya lolos.

## Menjalankan secara lokal

```bash
cp .env.example .env
npm install

npx prisma db push
npm run prisma:seed     # user demo + board "demo-board" dengan 3 kartu

npm run dev              # custom server (Next.js + WebSocket) di :3000
```

Login demo: `alice@kanban.dev` (owner) / `bob@kanban.dev` (member),
password `password123` untuk keduanya.

### Menjalankan skrip verifikasi

```bash
npm run dev   # di terminal lain, biarkan berjalan
npx tsx scripts/verify-crdt-conflict.ts
npx tsx scripts/verify-persistence.ts   # jalankan setelah restart server
npx tsx scripts/verify-ws-auth.ts
```

## Kenapa custom server, bukan `next dev` biasa?

WebSocket untuk sinkronisasi Yjs perlu menempel pada HTTP server yang sama
dengan Next.js (agar satu port, satu proses). `server/index.ts` menjalankan
`next()` secara programatik lalu menambahkan handler `upgrade` khusus untuk
path `/yjs/:boardId`.

Untuk menghindari isu `AsyncLocalStorage` yang pernah ditemukan di proyek
chat realtime sebelumnya (import `next/headers` di proses server yang
dijalankan lewat `tsx`), logika JWT dipisah ke `src/lib/session-token.ts`
(tanpa dependensi `next/headers` sama sekali) dan hanya file itu yang
diimpor oleh `server/index.ts`. `src/lib/auth.ts` (yang memakai
`next/headers`) hanya dipakai di dalam API routes/pages Next.js, tidak
pernah oleh `server/index.ts`.

## Struktur proyek

```
server/index.ts           Custom server: Next.js + WebSocket Yjs
src/lib/
  session-token.ts          JWT tanpa next/headers (dipakai server/index.ts)
  auth.ts                    Auth dengan next/headers (dipakai API routes)
  yjs-persistence.ts         Load/simpan snapshot Y.Doc ke database
  default-board-state.ts     State awal (kolom default) untuk board baru
src/app/
  api/                        REST API (auth, boards, members)
  boards/[id]/                Halaman papan Kanban + hook useYjsBoard (Yjs client)
  dashboard/                  Daftar board & buat board baru
scripts/
  verify-crdt-conflict.ts     Bukti resolusi konflik CRDT
  verify-persistence.ts       Bukti persistensi snapshot ke database
  verify-ws-auth.ts           Bukti otorisasi koneksi WebSocket
prisma/
  schema.prisma, seed.ts
```

## Di luar cakupan (v1)

- Multi-instance server (Redis-backed Yjs sync untuk skala horizontal) —
  v1 berjalan satu proses Node, cukup untuk tim kecil.
- Riwayat versi/undo lintas sesi, komentar per kartu, lampiran file,
  reorder kolom.
