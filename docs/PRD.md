# PRD — Papan Kanban Kolaboratif Realtime

## 1. Latar Belakang

Tim kecil butuh papan Kanban (Trello-style) yang bisa diedit **banyak orang
secara bersamaan** pada board yang sama — memindahkan kartu antar kolom,
mengubah judul, menambah kartu — tanpa saling menimpa perubahan orang lain
dan tanpa perlu me-refresh halaman. Studi kasus utama: dua orang memindahkan
kartu yang sama ke kolom berbeda pada saat yang (hampir) bersamaan — sistem
harus konsisten di semua klien pada akhirnya (*eventually consistent*) tanpa
kehilangan data atau menampilkan state yang berbeda antar klien.

## 2. Tujuan

1. Edit board bersifat realtime: perubahan satu user langsung terlihat oleh
   user lain yang sedang membuka board yang sama, tanpa refresh.
2. Perubahan lokal terasa instan (*optimistic UI*) — user tidak menunggu
   round-trip ke server sebelum melihat kartu berpindah.
3. Konflik (dua orang mengubah kartu yang sama secara bersamaan) diselesaikan
   secara otomatis dan deterministik memakai CRDT, sehingga semua klien
   konvergen ke state akhir yang sama tanpa dialog "merge conflict" manual.
4. State board persisten di database, bukan hanya di memori server.

## 3. Solusi Teknis

### 3.1 CRDT dengan Yjs

Setiap board direpresentasikan sebagai satu **Y.Doc** (dokumen CRDT dari
[Yjs](https://docs.yjs.dev/)) dengan struktur:

```
Y.Doc
 ├─ columnOrder: Y.Array<string>              // urutan kolom
 ├─ columns: Y.Map<columnId, Y.Map>            // { title }
 └─ cards: Y.Map<cardId, Y.Map>                 // { title, columnId, order, updatedAt }
```

Memindahkan kartu antar kolom = mengubah field `columnId` & `order` pada
`cards.get(cardId)`. Karena `Y.Map` menyelesaikan konflik per-key dengan
algoritma CRDT (setiap operasi punya *Lamport clock* + `clientID`, key yang
sama diselesaikan dengan aturan *last-writer-wins* yang deterministik dan
sama di semua klien), dua user yang memindahkan kartu yang sama pada saat
bersamaan **tidak saling merusak data** — kedua klien akan konvergen ke hasil
akhir yang identik begitu update saling bertukar, tanpa perlu penguncian
(locking) di server.

### 3.2 Transport realtime

- WebSocket server terpisah dari request handler Next.js biasa, dijalankan
  lewat custom server (`server/index.ts`), path `/yjs?board=<id>`.
- Protokol sync memakai `y-protocols` (sync + awareness) via helper
  `setupWSConnection` dari `y-websocket/bin/utils`, yang menangani pertukaran
  update biner CRDT secara efisien (hanya delta, bukan full state, setelah
  sync awal).
- **Awareness** dipakai untuk menampilkan siapa saja yang sedang membuka
  board (presence), bukan untuk data kartu — data kartu selalu lewat
  `Y.Doc` agar persisten.

### 3.3 Persistensi

Update CRDT (biner) di-*debounce* lalu disimpan sebagai snapshot
(`Y.encodeStateAsUpdate`) ke tabel `BoardSnapshot` di database. Saat board
pertama kali dibuka setelah server restart / tidak ada koneksi aktif,
snapshot dimuat kembali dengan `Y.applyUpdate`, sehingga state tidak hilang.

### 3.4 Optimistic UI

Karena Yjs menerapkan perubahan ke `Y.Doc` lokal **secara sinkron** sebelum
dikirim ke server, UI kartu berpindah kolom seketika di sisi user yang
melakukan drag — tanpa menunggu konfirmasi server. Jika koneksi terputus,
perubahan tetap tersimpan lokal dan otomatis disinkronkan ulang begitu
koneksi pulih (reconnect bawaan `y-websocket` provider).

### 3.5 Autentikasi & otorisasi board

- Autentikasi: JWT di httpOnly cookie (pola yang sama dengan proyek
  sebelumnya). Koneksi WebSocket memvalidasi cookie session sebelum
  mengizinkan `setupWSConnection`.
- Hanya user yang menjadi *member* board (tabel `BoardMember`) yang boleh
  membuka/mengedit board tersebut, dicek baik di REST API maupun saat
  handshake WebSocket.

## 4. Model Data (ringkas)

- `User` — akun.
- `Board` — papan Kanban, punya `ownerId`.
- `BoardMember` — relasi user ↔ board + role (OWNER/MEMBER).
- `BoardSnapshot` — snapshot biner CRDT per board (`state: Bytes`,
  `updatedAt`).

## 5. Verifikasi yang direncanakan

Sebuah skrip (`scripts/verify-crdt-conflict.ts`) akan membuat dua koneksi
Yjs client sungguhan (bukan simulasi/asumsi) ke board yang sama, keduanya
memindahkan kartu yang sama ke kolom berbeda secara nyaris bersamaan, lalu
memverifikasi bahwa **kedua** dokumen klien konvergen ke state akhir yang
identik (persis sama field `columnId`/`order` di kedua sisi) setelah sinkron
— membuktikan resolusi konflik CRDT bekerja, bukan sekadar diklaim di kode.

## 6. Di luar cakupan (v1)

- Multi-instance server (Redis-backed Yjs sync) — v1 berjalan satu proses
  Node (cukup untuk skala tim kecil; didokumentasikan sebagai batasan yang
  sama seperti proyek chat realtime sebelumnya).
- Riwayat versi/undo lintas sesi, komentar per kartu, lampiran file.
