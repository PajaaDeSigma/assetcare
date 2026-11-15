'use strict';

/* ==============================================
   SYSTEM_PROMPT UNTUK AGEN AI
   TODO: ganti dengan panggilan API ke /api/asetcare — kirim SYSTEM_PROMPT ini
         sebagai bagian dari payload ke model bahasa pilihan Anda.
============================================== */
const SYSTEM_PROMPT = `
Kamu adalah AssetCare AI Agent — analis data aset, perencana perawatan, dan konsultan risiko IT.

## TUGAS NORMALISASI
Dari teks bebas yang diberikan, ekstrak:
  - nama, kategori (Komputer/Server/Jaringan/Periferal/Lisensi Perangkat Lunak/Lainnya),
    merek/model, no_seri, tgl_beli (YYYY-MM-DD), akhir_garansi (YYYY-MM-DD),
    lokasi, pemegang, status (Aktif/Cadangan/Diperbaiki/Dihapus).
Seragamkan format: tanggal ISO 8601, kapitalisasi konsisten.
Tandai duplikat berdasarkan no_seri (flag: "duplikat": true).
Isi field yang tidak diketahui dengan string "tidak diketahui".
Ajukan maksimal 3 pertanyaan klarifikasi jika data kritis tidak tersedia.

## TUGAS PENJADWALAN
- Tentukan tanggal perawatan berikutnya berdasarkan:
    * Komputer/Periferal: setiap 6 bulan
    * Server: setiap 3 bulan
    * Jaringan: setiap 4 bulan
    * Lisensi: perbarui 30 hari sebelum kedaluwarsa
- Tandai jadwal yang sudah lewat sebagai "terlambat": true.
- Buat pengingat garansi/lisensi yang berakhir <= 60 hari.
- Kelompokkan jadwal per lokasi untuk efisiensi teknisi.

## TUGAS PENILAIAN RISIKO
Hitung skor risiko 0–100 per aset berdasarkan:
  - Umur aset (> 4 th = +30 poin)
  - Frekuensi perbaikan (> 3 kali = +25 poin; 1-3 kali = +10 poin)
  - Garansi kedaluwarsa atau < 30 hari = +20 poin
  - Peran aset kritis (Server/Jaringan = +15 poin tambahan)
Kategori: 0-25 Rendah, 26-50 Sedang, 51-75 Tinggi, 76-100 Kritis.
Sertakan satu kalimat alasan dan satu rekomendasi:
  pantau | rawat | perbaiki | usulkan_penggantian.
Jika data tidak cukup: skor sementara, set "perlu_verifikasi": true.

## VALIDASI
- Tanggal beli harus sebelum akhir garansi.
- Skor risiko harus konsisten dengan alasan yang diberikan.
- Jangan mengarang data yang tidak tersedia dari teks input.

## ATURAN TETAP
1. Jangan mengarang data.
2. Jangan minta kata sandi atau kunci lisensi lengkap.
3. Penghapusan aset hanya usulan — menunggu persetujuan manusia.

## FORMAT KELUARAN JSON
{
  "aset": { /* semua field yang diekstrak */ },
  "jadwal": { "perawatan_berikutnya": "YYYY-MM-DD", "terlambat": false, "kelompok_lokasi": "..." },
  "risiko": { "skor": 0, "kategori": "Rendah", "alasan": "...", "rekomendasi": "pantau" },
  "pengingat_kedaluwarsa": [ { "jenis": "garansi|lisensi", "nama": "...", "tanggal": "...", "sisa_hari": 0 } ],
  "perlu_verifikasi": false,
  "ringkasan": {
    "admin": "...",
    "teknisi": "...",
    "manajer": "..."
  }
}
`;

/* ==============================================
   DATA ASET CONTOH (12 aset fiktif)
   Data hanya di memori — tidak ada localStorage
============================================== */
let asets = [
  {
    id: 'A001', nama: 'Laptop Dell Latitude 5420', kategori: 'Komputer',
    merek: 'Dell Latitude 5420', seri: 'DL54209X', tglBeli: '2020-03-15',
    akhirGaransi: '2023-03-15', lokasi: 'Lantai 2 - Ruang Kerja', pemegang: 'Budi Santoso',
    status: 'Aktif', jumlahPerbaikan: 3, catatan: 'RAM sudah di-upgrade 16GB',
    riwayat: [
      { tgl: '2021-04-10', jenis: 'Pemeliharaan Rutin', catatan: 'Bersih debu, update driver' },
      { tgl: '2022-08-22', jenis: 'Perbaikan', catatan: 'Ganti baterai' },
      { tgl: '2023-11-05', jenis: 'Pemeliharaan Rutin', catatan: 'Reinstall OS, optimasi' }
    ]
  },
  {
    id: 'A002', nama: 'Server HPE ProLiant DL380', kategori: 'Server',
    merek: 'HPE ProLiant DL380', seri: 'HPE38012A', tglBeli: '2019-07-01',
    akhirGaransi: '2024-07-01', lokasi: 'Lantai 3 - Ruang Server', pemegang: 'Tim IT',
    status: 'Aktif', jumlahPerbaikan: 1, catatan: 'Server utama ERP',
    riwayat: [
      { tgl: '2020-01-15', jenis: 'Pemeliharaan Rutin', catatan: 'Periksa log, update firmware' },
      { tgl: '2022-10-20', jenis: 'Perbaikan', catatan: 'Ganti HDD yang gagal' }
    ]
  },
  {
    id: 'A003', nama: 'Switch Cisco Catalyst 2960', kategori: 'Jaringan',
    merek: 'Cisco Catalyst 2960', seri: 'CC29608B', tglBeli: '2018-05-20',
    akhirGaransi: '2021-05-20', lokasi: 'Lantai 1 - Ruang MDF', pemegang: 'Tim Jaringan',
    status: 'Aktif', jumlahPerbaikan: 4, catatan: 'Port 12 tidak berfungsi',
    riwayat: [
      { tgl: '2019-05-20', jenis: 'Pemeliharaan Rutin', catatan: 'Periksa konfigurasi VLAN' },
      { tgl: '2020-11-11', jenis: 'Perbaikan', catatan: 'Reset konfigurasi' },
      { tgl: '2022-02-28', jenis: 'Perbaikan', catatan: 'Ganti SFP modul' },
      { tgl: '2023-07-14', jenis: 'Perbaikan', catatan: 'Port rusak, diagnostik' }
    ]
  },
  {
    id: 'A004', nama: 'Printer HP LaserJet Pro M404', kategori: 'Periferal',
    merek: 'HP LaserJet Pro M404', seri: 'HP4040X', tglBeli: '2022-01-10',
    akhirGaransi: '2026-01-10', lokasi: 'Lantai 2 - Area Print', pemegang: 'Divisi Keuangan',
    status: 'Aktif', jumlahPerbaikan: 0, catatan: 'Printer bersama divisi keuangan',
    riwayat: [
      { tgl: '2023-01-10', jenis: 'Pemeliharaan Rutin', catatan: 'Bersihkan drum, kalibrasi' }
    ]
  },
  {
    id: 'A005', nama: 'Lisensi Microsoft 365 Business', kategori: 'Lisensi Perangkat Lunak',
    merek: 'Microsoft 365', seri: 'MS365-ORG-50', tglBeli: '2024-02-01',
    akhirGaransi: '2025-02-01', lokasi: 'Cloud', pemegang: 'Tim IT',
    status: 'Aktif', jumlahPerbaikan: 0, catatan: '50 lisensi pengguna',
    riwayat: [
      { tgl: '2024-02-01', jenis: 'Pembaruan Lisensi', catatan: 'Perpanjang 1 tahun, 50 seat' }
    ]
  },
  {
    id: 'A006', nama: 'UPS APC Smart-UPS 1500', kategori: 'Lainnya',
    merek: 'APC Smart-UPS 1500', seri: 'APC15009Z', tglBeli: '2017-09-05',
    akhirGaransi: '2020-09-05', lokasi: 'Lantai 3 - Ruang Server', pemegang: 'Tim IT',
    status: 'Aktif', jumlahPerbaikan: 2, catatan: 'Baterai diganti 2021',
    riwayat: [
      { tgl: '2019-09-05', jenis: 'Pemeliharaan Rutin', catatan: 'Periksa baterai, uji transfer' },
      { tgl: '2021-03-18', jenis: 'Perbaikan', catatan: 'Ganti baterai VRLA' }
    ]
  },
  {
    id: 'A007', nama: 'Laptop Lenovo ThinkPad X1 Carbon', kategori: 'Komputer',
    merek: 'Lenovo ThinkPad X1 Carbon', seri: 'LNV-X1C-2023', tglBeli: '2023-04-12',
    akhirGaransi: '2026-04-12', lokasi: 'Lantai 4 - Ruang Direksi', pemegang: 'Direktur Operasional',
    status: 'Aktif', jumlahPerbaikan: 0, catatan: 'Laptop premium direksi',
    riwayat: []
  },
  {
    id: 'A008', nama: 'Router MikroTik RB4011', kategori: 'Jaringan',
    merek: 'MikroTik RB4011', seri: 'MT-RB40115C', tglBeli: '2021-11-01',
    akhirGaransi: '2024-11-01', lokasi: 'Lantai 1 - Ruang MDF', pemegang: 'Tim Jaringan',
    status: 'Aktif', jumlahPerbaikan: 1, catatan: 'Router utama internet',
    riwayat: [
      { tgl: '2022-11-01', jenis: 'Pemeliharaan Rutin', catatan: 'Update RouterOS, audit firewall' }
    ]
  },
  {
    id: 'A009', nama: 'Desktop PC HP EliteDesk 800', kategori: 'Komputer',
    merek: 'HP EliteDesk 800 G5', seri: 'HP-ED800-021', tglBeli: '2016-08-20',
    akhirGaransi: '2019-08-20', lokasi: 'Lantai 1 - Front Office', pemegang: 'Resepsionis',
    status: 'Diperbaiki', jumlahPerbaikan: 5, catatan: 'Sedang diperbaiki PSU rusak',
    riwayat: [
      { tgl: '2018-08-20', jenis: 'Pemeliharaan Rutin', catatan: 'Bersih debu, update OS' },
      { tgl: '2019-12-10', jenis: 'Perbaikan', catatan: 'Ganti HDD ke SSD' },
      { tgl: '2021-04-05', jenis: 'Perbaikan', catatan: 'Reinstall Windows, driver' },
      { tgl: '2022-09-14', jenis: 'Perbaikan', catatan: 'Ganti kapasitor motherboard' },
      { tgl: '2024-10-02', jenis: 'Perbaikan', catatan: 'PSU rusak, menunggu sparepart' }
    ]
  },
  {
    id: 'A010', nama: 'Server Dell PowerEdge R740', kategori: 'Server',
    merek: 'Dell PowerEdge R740', seri: 'DP-R740-007', tglBeli: '2022-06-15',
    akhirGaransi: '2027-06-15', lokasi: 'Lantai 3 - Ruang Server', pemegang: 'Tim IT',
    status: 'Aktif', jumlahPerbaikan: 0, catatan: 'Server virtualisasi VMware',
    riwayat: [
      { tgl: '2023-06-15', jenis: 'Pemeliharaan Rutin', catatan: 'Periksa RAID, update iDRAC' }
    ]
  },
  {
    id: 'A011', nama: 'Lisensi Adobe Creative Cloud', kategori: 'Lisensi Perangkat Lunak',
    merek: 'Adobe Creative Cloud', seri: 'ADOBE-CC-10', tglBeli: '2024-01-01',
    akhirGaransi: '2025-01-01', lokasi: 'Cloud', pemegang: 'Tim Desain',
    status: 'Aktif', jumlahPerbaikan: 0, catatan: '10 lisensi tim desain grafis',
    riwayat: [
      { tgl: '2024-01-01', jenis: 'Pembaruan Lisensi', catatan: 'Aktifkan 10 lisensi baru' }
    ]
  },
  {
    id: 'A012', nama: 'NAS Synology DS920+', kategori: 'Server',
    merek: 'Synology DS920+', seri: 'SYN-DS920-033', tglBeli: '2020-10-10',
    akhirGaransi: '2023-10-10', lokasi: 'Lantai 3 - Ruang Server', pemegang: 'Tim IT',
    status: 'Aktif', jumlahPerbaikan: 2, catatan: 'NAS backup, 4x4TB',
    riwayat: [
      { tgl: '2021-10-10', jenis: 'Pemeliharaan Rutin', catatan: 'Periksa SMART HDD, scrubbing' },
      { tgl: '2023-05-20', jenis: 'Perbaikan', catatan: 'Ganti 1 HDD yang gagal (RAID rebuild)' }
    ]
  }
];

/* ID counter untuk aset baru */
let nextId = 13;

/* ==============================================
   FUNGSI TIRUAN AGEN AI (RULE-BASED)
   TODO: ganti dengan panggilan API ke /api/asetcare
         Sertakan SYSTEM_PROMPT di payload request.
         Contoh fetch:
         fetch('/api/asetcare', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ system: SYSTEM_PROMPT, user: inputTeks })
         })
============================================== */

/**
 * Hitung skor risiko berdasarkan aturan (rule-based mock)
 * @param {Object} a - objek aset
 * @returns {{ skor: number, kategori: string, alasan: string, rekomendasi: string }}
 */
function hitungRisiko(a) {
  const today = new Date();
  const tglBeli = a.tglBeli ? new Date(a.tglBeli) : null;
  const akhirGaransi = a.akhirGaransi ? new Date(a.akhirGaransi) : null;

  let skor = 0;
  const alasanParts = [];

  // Umur aset
  if (tglBeli) {
    const tahun = (today - tglBeli) / (1000 * 60 * 60 * 24 * 365);
    if (tahun > 4) { skor += 30; alasanParts.push('aset berumur >4 tahun'); }
    else if (tahun > 2) { skor += 15; alasanParts.push('aset berumur >2 tahun'); }
  }

  // Frekuensi perbaikan
  const rep = Number(a.jumlahPerbaikan) || 0;
  if (rep > 3) { skor += 25; alasanParts.push('perbaikan >3 kali'); }
  else if (rep >= 1) { skor += 10; alasanParts.push('sudah pernah diperbaiki'); }

  // Status garansi
  if (akhirGaransi) {
    const sisaHariGar = Math.round((akhirGaransi - today) / (1000 * 60 * 60 * 24));
    if (sisaHariGar < 0)   { skor += 20; alasanParts.push('garansi sudah habis'); }
    else if (sisaHariGar < 30) { skor += 15; alasanParts.push('garansi hampir habis'); }
  } else { skor += 10; alasanParts.push('data garansi tidak diketahui'); }

  // Peran aset kritis
  if (['Server', 'Jaringan'].includes(a.kategori)) { skor += 15; alasanParts.push('aset kritis infrastruktur'); }

  // Status diperbaiki
  if (a.status === 'Diperbaiki') { skor += 10; alasanParts.push('sedang dalam perbaikan'); }

  skor = Math.min(skor, 100);

  let kategori, rekomendasi;
  if (skor <= 25)      { kategori = 'Rendah';   rekomendasi = 'pantau'; }
  else if (skor <= 50) { kategori = 'Sedang';   rekomendasi = 'rawat'; }
  else if (skor <= 75) { kategori = 'Tinggi';   rekomendasi = 'perbaiki'; }
  else                 { kategori = 'Kritis';   rekomendasi = 'usulkan_penggantian'; }

  const alasan = alasanParts.length
    ? 'Faktor risiko: ' + alasanParts.join(', ') + '.'
    : 'Aset dalam kondisi baik tanpa faktor risiko signifikan.';

  return { skor, kategori, alasan, rekomendasi };
}

/**
 * Hitung tanggal perawatan berikutnya
 * @param {Object} a - objek aset
 * @returns {{ perawatan_berikutnya: string, terlambat: boolean }}
 */
function jadwalBerikutnya(a) {
  const intervalBulan = { Server: 3, Jaringan: 4, 'Lisensi Perangkat Lunak': 1 };
  const bulan = intervalBulan[a.kategori] || 6;

  // Ambil tanggal perawatan terakhir dari riwayat
  let baseTgl = a.tglBeli ? new Date(a.tglBeli) : new Date();
  if (a.riwayat && a.riwayat.length > 0) {
    const sorted = [...a.riwayat].sort((x, y) => new Date(y.tgl) - new Date(x.tgl));
    baseTgl = new Date(sorted[0].tgl);
  }

  const next = new Date(baseTgl);
  next.setMonth(next.getMonth() + bulan);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Khusus lisensi: gunakan akhir garansi dikurangi 30 hari
  if (a.kategori === 'Lisensi Perangkat Lunak' && a.akhirGaransi) {
    const exp = new Date(a.akhirGaransi);
    exp.setDate(exp.getDate() - 30);
    return {
      perawatan_berikutnya: exp.toISOString().slice(0, 10),
      terlambat: exp < today
    };
  }

  return {
    perawatan_berikutnya: next.toISOString().slice(0, 10),
    terlambat: next < today
  };
}

/**
 * Normalisasi teks bebas menjadi objek aset (rule-based mock)
 * TODO: ganti dengan panggilan API ke /api/asetcare — kirim SYSTEM_PROMPT di sana.
 */
function prosesTeksBebas(teks) {
  const t = teks.toLowerCase();
  const aset = {
    nama: 'tidak diketahui', kategori: 'Lainnya', merek: 'tidak diketahui',
    seri: 'tidak diketahui', tglBeli: '', akhirGaransi: '',
    lokasi: 'tidak diketahui', pemegang: 'tidak diketahui',
    status: 'Aktif', jumlahPerbaikan: 0, catatan: '', riwayat: []
  };

  // Kategori dari kata kunci
  if (/laptop|notebook|macbook|thinkpad|latitude/.test(t))   aset.kategori = 'Komputer';
  else if (/server|poweredge|proliant|nas/.test(t))          aset.kategori = 'Server';
  else if (/switch|router|mikrotik|cisco|wifi|access point/.test(t)) aset.kategori = 'Jaringan';
  else if (/printer|scanner|proyektor|monitor|keyboard|mouse/.test(t)) aset.kategori = 'Periferal';
  else if (/lisensi|license|microsoft|adobe|office|windows/.test(t)) aset.kategori = 'Lisensi Perangkat Lunak';

  // Nomor seri: pola SN: atau S/N:
  const snMatch = teks.match(/(?:SN|S\/N|serial)[:\s]+([A-Z0-9\-]+)/i);
  if (snMatch) aset.seri = snMatch[1].trim();

  // Tanggal beli: pola "dibeli Jan 2022" atau "beli 2022-01-15"
  const tglBeliMatch = teks.match(/(?:dibeli|beli|pembelian|purchase)[^\d]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\w*\s+\d{4})/i);
  if (tglBeliMatch) {
    const parsed = parseTanggal(tglBeliMatch[1]);
    if (parsed) aset.tglBeli = parsed;
  }

  // Tanggal akhir garansi: pola "garansi s/d Jan 2025"
  const garMatch = teks.match(/(?:garansi\s+(?:s\/d|sampai|hingga|until)|akhir garansi)[^\d]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\w*\s+\d{4})/i);
  if (garMatch) {
    const parsed = parseTanggal(garMatch[1]);
    if (parsed) aset.akhirGaransi = parsed;
  }

  // Jumlah perbaikan: "diperbaiki X kali"
  const repMatch = teks.match(/diperbaiki\s+(\d+)\s*kali/i);
  if (repMatch) aset.jumlahPerbaikan = parseInt(repMatch[1]);

  // Nama: ekstrak model dari teks (heuristik sederhana)
  const namaMatch = teks.match(/^([A-Za-z0-9\s\-\.]+?)(?:SN|S\/N|serial|dibeli|beli|garansi)/i);
  if (namaMatch) aset.nama = namaMatch[1].trim().replace(/\s+/g, ' ') || 'tidak diketahui';
  else aset.nama = teks.split(',')[0].trim().slice(0, 50) || 'tidak diketahui';

  aset.merek = aset.nama;
  aset.catatan = 'Ditambahkan via teks bebas AI';

  // Hitung risiko dan jadwal
  const risiko = hitungRisiko(aset);
  const jadwal = jadwalBerikutnya(aset);

  // Siapkan output format agen
  return {
    aset,
    jadwal: { ...jadwal, kelompok_lokasi: aset.lokasi },
    risiko,
    pengingat_kedaluwarsa: cekPengingat(aset),
    perlu_verifikasi: aset.nama === 'tidak diketahui' || aset.seri === 'tidak diketahui',
    ringkasan: {
      admin: `Aset "${aset.nama}" berhasil diekstrak. Verifikasi no. seri dan tanggal jika diperlukan.`,
      teknisi: `Jadwal perawatan berikutnya: ${jadwal.perawatan_berikutnya}. ${jadwal.terlambat ? '[!] Sudah terlambat!' : ''}`,
      manajer: `Skor risiko: ${risiko.skor} (${risiko.kategori}). Rekomendasi: ${risiko.rekomendasi.replace('_', ' ')}.`
    }
  };
}

/** Konversi berbagai format tanggal ke YYYY-MM-DD */
function parseTanggal(str) {
  if (!str) return null;
  const bulanMap = {
    jan:1,feb:2,mar:3,apr:4,mei:5,jun:6,jul:7,agu:8,sep:9,okt:10,nov:11,des:12,
    may:5,aug:8,oct:10,dec:12
  };
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Nama bulan + tahun
  const nbMatch = str.match(/^(\w{3})\w*\s+(\d{4})$/i);
  if (nbMatch) {
    const m = bulanMap[nbMatch[1].toLowerCase()];
    if (m) return `${nbMatch[2]}-${String(m).padStart(2,'0')}-01`;
  }
  // dd/mm/yyyy atau dd-mm-yyyy
  const dmyMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`;
  return null;
}

/** Periksa pengingat kedaluwarsa (< 60 hari) */
function cekPengingat(a) {
  const result = [];
  const today = new Date();
  today.setHours(0,0,0,0);
  if (a.akhirGaransi) {
    const exp = new Date(a.akhirGaransi);
    const sisa = Math.round((exp - today) / (1000*60*60*24));
    if (sisa >= 0 && sisa <= 60) {
      result.push({ jenis: a.kategori === 'Lisensi Perangkat Lunak' ? 'lisensi' : 'garansi', nama: a.nama, tanggal: a.akhirGaransi, sisa_hari: sisa });
    }
  }
  return result;
}

/* ==============================================
   ROUTING HASH
============================================== */
const halaman = {
  landing:    { el: 'page-landing',    judul: 'Beranda' },
  dashboard:  { el: 'page-dashboard',  judul: 'Dashboard Ringkasan' },
  inventaris: { el: 'page-inventaris', judul: 'Inventaris Aset' },
  detail:     { el: 'page-detail',     judul: 'Detail Aset' },
  jadwal:     { el: 'page-jadwal',     judul: 'Jadwal Perawatan' },
  pengingat:  { el: 'page-pengingat',  judul: 'Pengingat' },
  laporan:    { el: 'page-laporan',    judul: 'Laporan Manajer' },
};

function navigate(key, param) {
  window.location.hash = param ? `#${key}/${param}` : `#${key}`;
}

function handleRoute() {
  const hash = window.location.hash.replace('#', '') || 'landing';
  const [key, param] = hash.split('/');
  const info = halaman[key] || halaman.landing;

  // Sembunyikan semua halaman, tampilkan yang aktif
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(info.el).classList.add('active');

  // Update judul topbar
  document.getElementById('page-title').textContent = info.judul;

  // Aktifkan nav-link
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href').replace('#','');
    a.classList.toggle('active', href === key);
    a.setAttribute('aria-current', href === key ? 'page' : 'false');
  });

  // Render konten sesuai halaman
  if (key === 'dashboard')  renderDashboard();
  if (key === 'inventaris') renderInventaris();
  if (key === 'detail' && param) renderDetail(param);
  if (key === 'jadwal')     renderJadwal();
  if (key === 'pengingat')  renderPengingat();
  if (key === 'laporan')    renderLaporan();
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('popstate', handleRoute);

/* ==============================================
   TEMA TERANG / GELAP
============================================== */
const toggleThemeBtn = document.getElementById('toggle-theme');
let isDark = false;
toggleThemeBtn.addEventListener('click', () => {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  toggleThemeBtn.innerHTML = isDark ? '&#9728;' : '&#9790;';
  toggleThemeBtn.setAttribute('aria-label', isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
  // Regenerasi grafik agar warna label ikut berubah
  if (chartKategori) { chartKategori.destroy(); chartKategori = null; }
  if (chartTrend)    { chartTrend.destroy();    chartTrend = null; }
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
});

/* ==============================================
   SIDEBAR TOGGLE (MOBILE)
============================================== */
const sidebarEl = document.getElementById('sidebar');
const backdropEl = document.getElementById('backdrop');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');

toggleSidebarBtn.addEventListener('click', () => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    sidebarEl.classList.toggle('open');
    backdropEl.classList.toggle('show');
    const isOpen = sidebarEl.classList.contains('open');
    toggleSidebarBtn.setAttribute('aria-expanded', isOpen);
  } else {
    sidebarEl.classList.toggle('hidden');
    const mainEl = document.getElementById('main-content');
    const topbar = document.getElementById('topbar');
    mainEl.classList.toggle('full');
    topbar.classList.toggle('full');
  }
});

backdropEl.addEventListener('click', () => {
  sidebarEl.classList.remove('open');
  backdropEl.classList.remove('show');
});

/* ==============================================
   PERAN PENGGUNA
============================================== */
document.getElementById('role-select').addEventListener('change', function() {
  document.getElementById('role-label').textContent = this.options[this.selectedIndex].text;
});

/* ==============================================
   HELPER UTILITY
============================================== */
function formatTgl(str) {
  if (!str) return '\u2014';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

function sisaHari(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / (1000*60*60*24));
}

function badgeRisiko(r) {
  const map = { Rendah:'low', Sedang:'medium', Tinggi:'high', Kritis:'critical' };
  return `<span class="badge badge-${map[r]||'low'}" aria-label="Risiko ${r}">${r}</span>`;
}

function badgeStatus(s) {
  const map = { Aktif:'active', Cadangan:'cadangan', Diperbaiki:'perbaiki', Dihapus:'dihapus' };
  return `<span class="badge badge-${map[s]||'active'}">${s}</span>`;
}

function rekomendasiLabel(r) {
  const map = {
    pantau: 'Pantau secara berkala',
    rawat: 'Jadwalkan perawatan rutin',
    perbaiki: 'Segera lakukan perbaikan',
    usulkan_penggantian: 'Usulkan penggantian aset'
  };
  return map[r] || r;
}

/* ==============================================
   HALAMAN DASHBOARD
============================================== */
let chartKategori = null;
let chartTrend    = null;

function renderDashboard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const d60 = new Date(); d60.setDate(d60.getDate() + 60); d60.setHours(0,0,0,0);

  // Hitung statistik
  const total = asets.length;
  const berisiko = asets.filter(a => {
    const r = hitungRisiko(a);
    return r.kategori === 'Tinggi' || r.kategori === 'Kritis';
  }).length;
  const terlambat = asets.filter(a => jadwalBerikutnya(a).terlambat).length;
  const garansiExpiring = asets.filter(a => {
    if (!a.akhirGaransi) return false;
    const exp = new Date(a.akhirGaransi + 'T00:00:00');
    return exp >= today && exp <= d60;
  }).length;

  // Kartu statistik
  document.getElementById('stat-cards').innerHTML = `
    <div class="stat-card" style="--accent:var(--clr-primary)">
      <div class="label">Total Aset</div>
      <div class="value" aria-label="${total} total aset">${total}</div>
      <div class="sub">Semua kategori</div>
    </div>
    <div class="stat-card" style="--accent:var(--clr-high)">
      <div class="label">Risiko Tinggi / Kritis</div>
      <div class="value" aria-label="${berisiko} aset berisiko tinggi">${berisiko}</div>
      <div class="sub">Perlu perhatian segera</div>
    </div>
    <div class="stat-card" style="--accent:var(--clr-critical)">
      <div class="label">Perawatan Terlambat</div>
      <div class="value" aria-label="${terlambat} perawatan terlambat">${terlambat}</div>
      <div class="sub">Jadwal terlewat</div>
    </div>
    <div class="stat-card" style="--accent:var(--clr-medium)">
      <div class="label">Garansi Berakhir 60 Hari</div>
      <div class="value" aria-label="${garansiExpiring} garansi berakhir">${garansiExpiring}</div>
      <div class="sub">Perlu perpanjangan</div>
    </div>
  `;

  // Grafik aset per kategori
  const katCount = {};
  asets.forEach(a => { katCount[a.kategori] = (katCount[a.kategori] || 0) + 1; });
  const katLabels = Object.keys(katCount);
  const katData   = Object.values(katCount);
  const katColors = ['#1a73e8','#0097a7','#f9a825','#e65100','#7c4dff','#43a047'];

  if (chartKategori) chartKategori.destroy();
  chartKategori = new Chart(document.getElementById('chart-kategori'), {
    type: 'doughnut',
    data: { labels: katLabels, datasets: [{ data: katData, backgroundColor: katColors, borderWidth: 2, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--clr-surface') }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--clr-text'), font: { size: 12 }, padding: 12 } }
      }
    }
  });

  // Grafik tren perawatan (simulasi data 6 bulan)
  const bulanLabels = [];
  const trendData   = [2, 3, 1, 4, 2, 3];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    bulanLabels.push(d.toLocaleDateString('id-ID', { month:'short', year:'2-digit' }));
  }

  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(document.getElementById('chart-trend'), {
    type: 'line',
    data: {
      labels: bulanLabels,
      datasets: [{
        label: 'Perawatan Selesai',
        data: trendData,
        borderColor: '#0097a7',
        backgroundColor: 'rgba(0,151,167,.12)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--clr-text'), font: { size: 12 } } }
      },
      scales: {
        x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--clr-muted') }, grid: { color: 'rgba(128,128,128,.1)' } },
        y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--clr-muted'), stepSize: 1 }, grid: { color: 'rgba(128,128,128,.1)' } }
      }
    }
  });

  // Tabel aset berisiko tinggi/kritis
  const asetBerisiko = asets
    .map(a => ({ a, r: hitungRisiko(a) }))
    .filter(x => x.r.kategori === 'Tinggi' || x.r.kategori === 'Kritis')
    .sort((x, y) => y.r.skor - x.r.skor);

  if (asetBerisiko.length === 0) {
    document.getElementById('dashboard-risk-table').innerHTML = '<p class="text-muted">Tidak ada aset berisiko tinggi atau kritis saat ini.</p>';
    return;
  }

  document.getElementById('dashboard-risk-table').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama Aset</th><th>Kategori</th><th>Lokasi</th><th>Risiko</th><th>Rekomendasi</th><th>Detail</th></tr></thead>
        <tbody>
          ${asetBerisiko.map(({a,r}) => `
            <tr>
              <td>${escHtml(a.nama)}</td>
              <td>${escHtml(a.kategori)}</td>
              <td>${escHtml(a.lokasi)}</td>
              <td>${badgeRisiko(r.kategori)}</td>
              <td style="font-size:.8rem;">${rekomendasiLabel(r.rekomendasi)}</td>
              <td><a href="#detail/${a.id}" class="btn btn-secondary btn-sm">Lihat</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ==============================================
   HALAMAN INVENTARIS
============================================== */
let invPage = 1;
const invPerPage = 8;
let invSort = { key: 'nama', asc: true };

function getFilteredAsets() {
  const q  = document.getElementById('inv-search').value.toLowerCase();
  const fK = document.getElementById('inv-filter-kategori').value;
  const fS = document.getElementById('inv-filter-status').value;
  const fR = document.getElementById('inv-filter-risiko').value;

  return asets.filter(a => {
    if (q && !`${a.nama} ${a.merek} ${a.seri}`.toLowerCase().includes(q)) return false;
    if (fK && a.kategori !== fK) return false;
    if (fS && a.status !== fS) return false;
    if (fR && hitungRisiko(a).kategori !== fR) return false;
    return true;
  }).sort((x, y) => {
    let vx = x[invSort.key] || '';
    let vy = y[invSort.key] || '';
    // Risiko: sort berdasarkan skor
    if (invSort.key === 'risiko') {
      vx = hitungRisiko(x).skor;
      vy = hitungRisiko(y).skor;
      return invSort.asc ? vx - vy : vy - vx;
    }
    return invSort.asc ? String(vx).localeCompare(String(vy)) : String(vy).localeCompare(String(vx));
  });
}

function renderInventaris() {
  const filtered = getFilteredAsets();
  const total = filtered.length;
  const totalPages = Math.ceil(total / invPerPage) || 1;
  if (invPage > totalPages) invPage = totalPages;
  const slice = filtered.slice((invPage - 1) * invPerPage, invPage * invPerPage);

  const tbody = document.getElementById('inv-tbody');
  tbody.innerHTML = slice.map(a => {
    const r = hitungRisiko(a);
    return `
      <tr>
        <td><a href="#detail/${a.id}" title="Lihat detail">${escHtml(a.nama)}</a></td>
        <td>${escHtml(a.kategori)}</td>
        <td>${escHtml(a.merek)}</td>
        <td>${escHtml(a.lokasi)}</td>
        <td>${badgeStatus(a.status)}</td>
        <td>${badgeRisiko(r.kategori)}</td>
        <td>
          <div class="flex-gap">
            <button class="btn btn-secondary btn-sm" onclick="openEditModal('${a.id}')" aria-label="Edit ${escHtml(a.nama)}">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="hapusAset('${a.id}')" aria-label="Hapus ${escHtml(a.nama)}">Hapus</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="7"><div class="empty-state"><div class="icon"></div><p>Tidak ada aset yang cocok dengan filter.</p></div></td></tr>`;

  // Pagination
  const pag = document.getElementById('inv-pagination');
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(p => `<button class="pg-btn${p === invPage ? ' active' : ''}" onclick="invGoPage(${p})" aria-label="Halaman ${p}" aria-current="${p === invPage ? 'page' : 'false'}">${p}</button>`)
    .join('');
  pag.innerHTML = `<span>Menampilkan ${slice.length} dari ${total} aset</span><div class="pages" role="navigation" aria-label="Navigasi halaman">${pages}</div>`;
}

function invGoPage(p) { invPage = p; renderInventaris(); }

// Sort kolom
document.querySelectorAll('thead th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (invSort.key === k) invSort.asc = !invSort.asc;
    else { invSort.key = k; invSort.asc = true; }
    invPage = 1;
    renderInventaris();
  });
  th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); } });
});

// Filter live
['inv-search','inv-filter-kategori','inv-filter-status','inv-filter-risiko'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { invPage = 1; renderInventaris(); });
});

/* ==============================================
   MODAL FORM ASET (TAMBAH / UBAH)
============================================== */
function openAddModal() {
  document.getElementById('modal-title').textContent = 'Tambah Aset Baru';
  document.getElementById('asset-form').reset();
  document.getElementById('form-id').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('form-nama').focus();
}

function openEditModal(id) {
  const a = asets.find(x => x.id === id);
  if (!a) return;
  document.getElementById('modal-title').textContent = 'Ubah Aset: ' + a.nama;
  document.getElementById('form-id').value         = a.id;
  document.getElementById('form-nama').value        = a.nama;
  document.getElementById('form-kategori').value    = a.kategori;
  document.getElementById('form-merek').value       = a.merek;
  document.getElementById('form-seri').value        = a.seri;
  document.getElementById('form-tgl-beli').value    = a.tglBeli || '';
  document.getElementById('form-akhir-garansi').value = a.akhirGaransi || '';
  document.getElementById('form-lokasi').value      = a.lokasi;
  document.getElementById('form-pemegang').value    = a.pemegang;
  document.getElementById('form-status').value      = a.status;
  document.getElementById('form-perbaikan').value   = a.jumlahPerbaikan || 0;
  document.getElementById('form-catatan').value     = a.catatan || '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('form-nama').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function saveModal() {
  const nama = document.getElementById('form-nama').value.trim();
  const kat  = document.getElementById('form-kategori').value;
  if (!nama) { document.getElementById('form-nama').focus(); return; }
  if (!kat)  { document.getElementById('form-kategori').focus(); return; }

  const id = document.getElementById('form-id').value;
  const data = {
    nama, kategori: kat,
    merek:       document.getElementById('form-merek').value.trim() || 'tidak diketahui',
    seri:        document.getElementById('form-seri').value.trim()  || 'tidak diketahui',
    tglBeli:     document.getElementById('form-tgl-beli').value,
    akhirGaransi:document.getElementById('form-akhir-garansi').value,
    lokasi:      document.getElementById('form-lokasi').value.trim()   || 'tidak diketahui',
    pemegang:    document.getElementById('form-pemegang').value.trim() || 'tidak diketahui',
    status:      document.getElementById('form-status').value,
    jumlahPerbaikan: parseInt(document.getElementById('form-perbaikan').value) || 0,
    catatan:     document.getElementById('form-catatan').value.trim(),
    riwayat:     []
  };

  if (id) {
    // Update aset
    const idx = asets.findIndex(x => x.id === id);
    if (idx > -1) { data.id = id; data.riwayat = asets[idx].riwayat; asets[idx] = data; }
  } else {
    // Tambah aset baru
    data.id = 'A' + String(nextId++).padStart(3,'0');
    asets.push(data);
  }
  closeModal();
  renderInventaris();
}

function hapusAset(id) {
  // Hanya usulan — menunggu konfirmasi (sesuai aturan agen AI)
  if (!confirm('Ini hanya usulan penghapusan. Aset akan ditandai "Dihapus" dan menunggu persetujuan admin.\n\nLanjutkan?')) return;
  const a = asets.find(x => x.id === id);
  if (a) { a.status = 'Dihapus'; renderInventaris(); }
}

document.getElementById('btn-tambah-aset').addEventListener('click', openAddModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-save').addEventListener('click', saveModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) closeModal(); });

/* ==============================================
   TEKS BEBAS AGEN AI
============================================== */
document.getElementById('btn-proses-ai').addEventListener('click', () => {
  const teks = document.getElementById('ai-input').value.trim();
  if (!teks) { document.getElementById('ai-input').focus(); return; }

  const loadingEl = document.getElementById('ai-loading');
  const resultEl  = document.getElementById('ai-result');
  loadingEl.classList.add('show');
  resultEl.classList.remove('show');

  // Simulasi delay agen AI
  // TODO: ganti dengan panggilan API ke /api/asetcare — sertakan SYSTEM_PROMPT di payload
  setTimeout(() => {
    const output = prosesTeksBebas(teks);
    loadingEl.classList.remove('show');

    const r = output.risiko;
    const j = output.jadwal;
    const a = output.aset;

    resultEl.innerHTML = `
      <strong>Hasil Ekstraksi Agen AI</strong>
      <table class="spec-table" style="margin-top:8px;">
        <tr><td>Nama</td><td>${escHtml(a.nama)}</td></tr>
        <tr><td>Kategori</td><td>${escHtml(a.kategori)}</td></tr>
        <tr><td>No. Seri</td><td>${escHtml(a.seri)}</td></tr>
        <tr><td>Tgl Beli</td><td>${formatTgl(a.tglBeli) || '\u2014'}</td></tr>
        <tr><td>Akhir Garansi</td><td>${formatTgl(a.akhirGaransi) || '\u2014'}</td></tr>
        <tr><td>Pemegang</td><td>${escHtml(a.pemegang)}</td></tr>
        <tr><td>Lokasi</td><td>${escHtml(a.lokasi)}</td></tr>
        <tr><td>Status</td><td>${a.status}</td></tr>
        <tr><td>Perbaikan</td><td>${a.jumlahPerbaikan}x</td></tr>
      </table>
      <div style="margin-top:10px;padding:8px 10px;background:var(--clr-bg);border-radius:6px;">
        <div><strong>Skor Risiko:</strong> ${r.skor} &mdash; ${r.kategori}</div>
        <div style="font-size:.82rem;color:var(--clr-muted);">${r.alasan}</div>
        <div style="font-size:.82rem;margin-top:4px;">${rekomendasiLabel(r.rekomendasi)}</div>
      </div>
      <div style="margin-top:8px;font-size:.82rem;color:var(--clr-muted);">
        Perawatan berikutnya: ${formatTgl(j.perawatan_berikutnya)}${j.terlambat?' <span class="text-danger">[Terlambat]</span>':''}
        ${output.perlu_verifikasi ? '<br><em>Perlu verifikasi data lebih lanjut.</em>' : ''}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="tambahDariAI(${JSON.stringify(output.aset).replace(/"/g,'&quot;')})">+ Tambahkan ke Inventaris</button>
      </div>
    `;
    resultEl.classList.add('show');
  }, 900);
});

function tambahDariAI(aObj) {
  aObj.id = 'A' + String(nextId++).padStart(3,'0');
  if (!aObj.riwayat) aObj.riwayat = [];
  asets.push(aObj);
  document.getElementById('ai-result').innerHTML = '<strong>Aset berhasil ditambahkan ke inventaris.</strong>';
  document.getElementById('ai-input').value = '';
  renderInventaris();
}

/* ==============================================
   HALAMAN DETAIL ASET
============================================== */
function renderDetail(id) {
  const a = asets.find(x => x.id === id);
  if (!a) {
    document.getElementById('detail-spec').innerHTML = '<p class="text-muted">Aset tidak ditemukan.</p>';
    return;
  }
  const r = hitungRisiko(a);
  const risVal = sisaHari(a.akhirGaransi);

  // Spesifikasi
  document.getElementById('detail-spec-body').innerHTML = `
    <tr><td>Nama Aset</td><td><strong>${escHtml(a.nama)}</strong></td></tr>
    <tr><td>Kategori</td><td>${escHtml(a.kategori)}</td></tr>
    <tr><td>Merek / Model</td><td>${escHtml(a.merek)}</td></tr>
    <tr><td>No. Seri</td><td>${escHtml(a.seri)}</td></tr>
    <tr><td>Tanggal Beli</td><td>${formatTgl(a.tglBeli)}</td></tr>
    <tr><td>Status</td><td>${badgeStatus(a.status)}</td></tr>
    <tr><td>Jumlah Perbaikan</td><td>${a.jumlahPerbaikan || 0}x</td></tr>
    <tr><td>Catatan</td><td>${escHtml(a.catatan) || '\u2014'}</td></tr>
  `;

  // Pemegang & lokasi
  document.getElementById('detail-holder').innerHTML = `
    <tr><td>Pemegang</td><td>${escHtml(a.pemegang)}</td></tr>
    <tr><td>Lokasi</td><td>${escHtml(a.lokasi)}</td></tr>
  `;

  // Garansi
  const garansiHtml = a.akhirGaransi
    ? `<tr><td>Akhir Garansi</td><td>${formatTgl(a.akhirGaransi)}${risVal !== null ? ` <span class="${risVal < 0 ? 'text-danger' : ''}">(${risVal < 0 ? 'sudah habis' : risVal + ' hari lagi'})</span>` : ''}</td></tr>`
    : `<tr><td>Akhir Garansi</td><td>\u2014</td></tr>`;
  document.getElementById('detail-warranty').innerHTML = garansiHtml;

  // Skor risiko
  const rColor = { Rendah: 'var(--clr-low)', Sedang: '#f9a825', Tinggi: 'var(--clr-high)', Kritis: 'var(--clr-critical)' };
  document.getElementById('detail-risk-score').textContent = r.skor;
  document.getElementById('detail-risk-score').style.color = rColor[r.kategori] || 'var(--clr-primary)';
  document.getElementById('detail-risk-label').textContent = r.kategori;
  document.getElementById('detail-risk-reason').textContent = r.alasan;
  document.getElementById('detail-recommendation').textContent = rekomendasiLabel(r.rekomendasi);

  // Riwayat / timeline
  const tl = document.getElementById('detail-timeline');
  if (!a.riwayat || a.riwayat.length === 0) {
    tl.innerHTML = '<li><span class="tl-date">\u2014</span>Belum ada riwayat perawatan.</li>';
  } else {
    const sorted = [...a.riwayat].sort((x, y) => new Date(y.tgl) - new Date(x.tgl));
    tl.innerHTML = sorted.map(h => `
      <li>
        <span class="tl-date">${formatTgl(h.tgl)}</span>
        <span class="tl-type">${escHtml(h.jenis)}</span>
        &mdash; ${escHtml(h.catatan)}
      </li>
    `).join('');
  }
}

/* ==============================================
   HALAMAN JADWAL PERAWATAN
============================================== */
function renderJadwal() {
  const filter = document.getElementById('sch-filter').value;
  const today = new Date(); today.setHours(0,0,0,0);
  const d30   = new Date(); d30.setDate(d30.getDate() + 30); d30.setHours(0,0,0,0);

  const items = asets
    .filter(a => a.status !== 'Dihapus')
    .map(a => {
      const j = jadwalBerikutnya(a);
      const tgl = new Date(j.perawatan_berikutnya + 'T00:00:00');
      let type = 'ok';
      if (j.terlambat) type = 'overdue';
      else if (tgl <= d30) type = 'upcoming';
      return { a, j, tgl, type };
    })
    .filter(x => !filter || x.type === filter)
    .sort((x, y) => x.tgl - y.tgl);

  document.getElementById('sch-count').textContent = `${items.length} tugas`;

  const list = document.getElementById('schedule-list');
  if (items.length === 0) {
    list.innerHTML = '<li><div class="empty-state"><div class="icon"></div><p>Tidak ada jadwal yang perlu ditampilkan.</p></div></li>';
    return;
  }

  list.innerHTML = items.map(({ a, j, type }) => {
    const badge = type === 'overdue'
      ? '<span class="badge badge-critical">Terlambat</span>'
      : type === 'upcoming'
      ? '<span class="badge badge-medium" style="color:#7a5500">Akan Datang</span>'
      : '<span class="badge badge-low">Mendatang</span>';
    return `
      <li class="schedule-item ${type}" role="listitem">
        <div class="sch-info">
          <div class="asset-name">${escHtml(a.nama)} ${badge}</div>
          <div class="sch-meta">
            ${escHtml(a.kategori)} &middot; ${escHtml(a.lokasi)} &middot; Jadwal: <strong>${formatTgl(j.perawatan_berikutnya)}</strong>
            &middot; Perbaikan: ${a.jumlahPerbaikan}x
          </div>
        </div>
        <div class="sch-actions">
          <a href="#detail/${a.id}" class="btn btn-secondary btn-sm" aria-label="Detail ${escHtml(a.nama)}">Detail</a>
          <button class="btn btn-success btn-sm" onclick="openDoneModal('${a.id}')" aria-label="Tandai selesai ${escHtml(a.nama)}">Selesai</button>
        </div>
      </li>
    `;
  }).join('');
}

document.getElementById('sch-filter').addEventListener('change', renderJadwal);

/* ==============================================
   MODAL TANDAI SELESAI
============================================== */
function openDoneModal(id) {
  document.getElementById('done-asset-id').value = id;
  document.getElementById('done-catatan').value = '';
  document.getElementById('modal-done-overlay').classList.remove('hidden');
  document.getElementById('done-catatan').focus();
}

function closeDoneModal() {
  document.getElementById('modal-done-overlay').classList.add('hidden');
}

function saveDone() {
  const id  = document.getElementById('done-asset-id').value;
  const cat = document.getElementById('done-catatan').value.trim() || 'Perawatan rutin selesai';
  const a   = asets.find(x => x.id === id);
  if (!a) return;
  if (!a.riwayat) a.riwayat = [];
  a.riwayat.push({
    tgl: new Date().toISOString().slice(0,10),
    jenis: 'Pemeliharaan Rutin',
    catatan: cat
  });
  closeDoneModal();
  renderJadwal();
}

document.getElementById('modal-done-close').addEventListener('click', closeDoneModal);
document.getElementById('modal-done-cancel').addEventListener('click', closeDoneModal);
document.getElementById('modal-done-save').addEventListener('click', saveDone);
document.getElementById('modal-done-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-done-overlay')) closeDoneModal(); });

/* ==============================================
   HALAMAN PENGINGAT
============================================== */
function renderPengingat() {
  const today = new Date(); today.setHours(0,0,0,0);

  const reminders = [];
  asets.forEach(a => {
    if (!a.akhirGaransi) return;
    const exp  = new Date(a.akhirGaransi + 'T00:00:00');
    const sisa = Math.round((exp - today) / (1000*60*60*24));
    if (sisa >= 0 && sisa <= 60) {
      reminders.push({ a, sisa, jenis: a.kategori === 'Lisensi Perangkat Lunak' ? 'Lisensi' : 'Garansi' });
    } else if (sisa < 0 && sisa >= -30) {
      // Juga tampilkan yang baru saja habis (< 30 hari lalu)
      reminders.push({ a, sisa, jenis: a.kategori === 'Lisensi Perangkat Lunak' ? 'Lisensi' : 'Garansi' });
    }
  });

  reminders.sort((x, y) => x.sisa - y.sisa);

  const list = document.getElementById('reminder-list');
  if (reminders.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon"></div><p>Tidak ada garansi atau lisensi yang berakhir dalam 60 hari ke depan.</p></div>';
    return;
  }

  list.innerHTML = reminders.map(({ a, sisa, jenis }) => {
    let dayClass = 'days-medium';
    let dayLabel;
    if (sisa < 0)        { dayClass = 'days-critical'; dayLabel = `Sudah habis ${Math.abs(sisa)} hari lalu`; }
    else if (sisa <= 14) { dayClass = 'days-critical'; dayLabel = `${sisa} hari lagi`; }
    else if (sisa <= 30) { dayClass = 'days-high';     dayLabel = `${sisa} hari lagi`; }
    else                 { dayClass = 'days-medium';   dayLabel = `${sisa} hari lagi`; }

    return `
      <div class="reminder-item" role="listitem">
        <div class="reminder-info">
          <div class="reminder-name">${escHtml(a.nama)}</div>
          <div class="reminder-meta">${jenis} &middot; Berakhir: ${formatTgl(a.akhirGaransi)} &middot; ${escHtml(a.lokasi)}</div>
        </div>
        <span class="days-left ${dayClass}" aria-label="${dayLabel}">${dayLabel}</span>
        <a href="#detail/${a.id}" class="btn btn-secondary btn-sm" aria-label="Detail ${escHtml(a.nama)}">Detail</a>
      </div>
    `;
  }).join('');
}

/* ==============================================
   HALAMAN LAPORAN MANAJER
============================================== */
function renderLaporan() {
  const today = new Date();

  // Statistik umum
  const total = asets.length;
  const aktif = asets.filter(a => a.status === 'Aktif').length;
  const diperbaiki = asets.filter(a => a.status === 'Diperbaiki').length;

  // Risiko per kategori
  const withRisk = asets.map(a => ({ a, r: hitungRisiko(a) }));
  const kritis  = withRisk.filter(x => x.r.kategori === 'Kritis');
  const tinggi  = withRisk.filter(x => x.r.kategori === 'Tinggi');
  const sedang  = withRisk.filter(x => x.r.kategori === 'Sedang');
  const rendah  = withRisk.filter(x => x.r.kategori === 'Rendah');

  // Usulan penggantian
  const penggantian = withRisk.filter(x => x.r.rekomendasi === 'usulkan_penggantian');

  // Perawatan terlambat
  const terlambatList = asets.filter(a => jadwalBerikutnya(a).terlambat && a.status !== 'Dihapus');

  document.getElementById('report-content').innerHTML = `
    <div class="card report-section">
      <h3>Ringkasan Kondisi Aset &mdash; ${today.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</h3>
      <div class="stat-cards" style="margin-bottom:0;">
        <div class="stat-card" style="--accent:var(--clr-primary)">
          <div class="label">Total Aset</div>
          <div class="value">${total}</div>
        </div>
        <div class="stat-card" style="--accent:var(--clr-low)">
          <div class="label">Aktif</div>
          <div class="value">${aktif}</div>
        </div>
        <div class="stat-card" style="--accent:var(--clr-high)">
          <div class="label">Diperbaiki</div>
          <div class="value">${diperbaiki}</div>
        </div>
        <div class="stat-card" style="--accent:var(--clr-critical)">
          <div class="label">Kritis / Tinggi</div>
          <div class="value">${kritis.length + tinggi.length}</div>
        </div>
      </div>
    </div>

    <div class="card report-section">
      <h3>Distribusi Risiko</h3>
      <table class="spec-table" style="font-size:.88rem;">
        <tr><td>Kritis</td><td><strong>${kritis.length} aset</strong></td></tr>
        <tr><td>Tinggi</td><td><strong>${tinggi.length} aset</strong></td></tr>
        <tr><td>Sedang</td><td><strong>${sedang.length} aset</strong></td></tr>
        <tr><td>Rendah</td><td><strong>${rendah.length} aset</strong></td></tr>
      </table>
    </div>

    <div class="card report-section">
      <h3>Aset Risiko Tinggi &amp; Kritis</h3>
      ${[...kritis,...tinggi].length === 0 ? '<p class="text-muted">Tidak ada aset berisiko tinggi atau kritis.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Kategori</th><th>Lokasi</th><th>Risiko</th><th>Alasan</th></tr></thead>
            <tbody>
              ${[...kritis,...tinggi].sort((x,y)=>y.r.skor-x.r.skor).map(({a,r})=>`
                <tr>
                  <td>${escHtml(a.nama)}</td>
                  <td>${escHtml(a.kategori)}</td>
                  <td>${escHtml(a.lokasi)}</td>
                  <td>${badgeRisiko(r.kategori)}</td>
                  <td style="font-size:.8rem;">${escHtml(r.alasan)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div class="card report-section">
      <h3>Usulan Penggantian Aset</h3>
      ${penggantian.length === 0 ? '<p class="text-muted">Tidak ada aset yang diusulkan untuk diganti saat ini.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Kategori</th><th>Tgl Beli</th><th>Perbaikan</th><th>Skor Risiko</th></tr></thead>
            <tbody>
              ${penggantian.map(({a,r})=>`
                <tr>
                  <td>${escHtml(a.nama)}</td>
                  <td>${escHtml(a.kategori)}</td>
                  <td>${formatTgl(a.tglBeli)}</td>
                  <td>${a.jumlahPerbaikan}x</td>
                  <td><span style="color:var(--clr-critical);font-weight:700;">${r.skor}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-muted" style="margin-top:8px;font-size:.82rem;">Semua usulan penggantian memerlukan persetujuan manajer dan prosedur pengadaan resmi.</p>
      `}
    </div>

    <div class="card report-section">
      <h3>Perawatan Terlambat</h3>
      ${terlambatList.length === 0 ? '<p class="text-muted">Semua jadwal perawatan sudah terpenuhi.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Kategori</th><th>Lokasi</th><th>Jadwal Seharusnya</th></tr></thead>
            <tbody>
              ${terlambatList.map(a=>{const j=jadwalBerikutnya(a);return`
                <tr>
                  <td>${escHtml(a.nama)}</td>
                  <td>${escHtml(a.kategori)}</td>
                  <td>${escHtml(a.lokasi)}</td>
                  <td class="text-danger">${formatTgl(j.perawatan_berikutnya)}</td>
                </tr>
              `;}).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div class="card">
      <h3>Ringkasan untuk Manajer</h3>
      <ul style="padding-left:18px;font-size:.88rem;line-height:2;">
        <li>Dari <strong>${total}</strong> aset terdaftar, <strong>${kritis.length+tinggi.length}</strong> memerlukan perhatian segera (Tinggi/Kritis).</li>
        <li><strong>${penggantian.length}</strong> aset diusulkan untuk diganti berdasarkan analisis risiko.</li>
        <li><strong>${terlambatList.length}</strong> aset memiliki jadwal perawatan yang sudah terlewat.</li>
        <li>Prioritaskan anggaran untuk kategori Server dan Jaringan yang mendukung infrastruktur kritis.</li>
      </ul>
    </div>
  `;
}

/* ==============================================
   SANITASI HTML (mencegah XSS)
============================================== */
function escHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ==============================================
   KEYBOARD NAVIGATION — ESCAPE UNTUK TUTUP MODAL
============================================== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDoneModal();
    if (sidebarEl.classList.contains('open')) {
      sidebarEl.classList.remove('open');
      backdropEl.classList.remove('show');
    }
  }
});

/* ==============================================
   INISIALISASI APLIKASI
============================================== */
function init() {
  handleRoute();
}

init();
