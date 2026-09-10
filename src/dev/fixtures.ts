/**
 * Data contoh untuk rute pratinjau `#/preview`, HANYA di dev.
 *
 * Isinya sengaja sama dengan mockup yang di-approve
 * (pralaunch/mockup/dashboard.html) supaya hasil render komponen bisa
 * dibandingkan langsung dengan mockup itu — tanpa perlu login atau seed.
 *
 * Modul ini di-import secara dinamis di balik `import.meta.env.DEV`, jadi
 * tidak ikut ke bundle produksi.
 */

import type { AppSettings, Attachment, Milestone, Task, Workstream } from '../lib/types';

const OWNER = '00000000-0000-0000-0000-000000000001';
let n = 0;

function t(over: Partial<Task> & { key: string; title: string }): Task {
  n += 1;
  return {
    id: `fx-${n}`,
    owner_id: OWNER,
    description: null,
    scheduled_date: '2026-09-08',
    week_number: 2,
    workstream: 'Riset' as Workstream,
    priority: 'normal',
    is_deadline: false,
    milestone_id: null,
    status: 'todo',
    completed_at: null,
    depends_on: [],
    estimated_minutes: null,
    notes: null,
    result_hidden_at: null,
    sort_order: n,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function m(over: Partial<Milestone> & { key: string; title: string }): Milestone {
  return {
    id: `fm-${over.key}`,
    owner_id: OWNER,
    target_date: '2026-09-10',
    week_number: 2,
    status: 'pending',
    achieved_at: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

export const fixtureTasks: Task[] = [
  // --- telat ---
  t({
    key: 'w1-nama-toko',
    title: 'Kunci nama toko + cek ketersediaan di Shopee & Instagram',
    workstream: 'Branding',
    scheduled_date: '2026-09-05',
    week_number: 1,
    estimated_minutes: 45,
    is_deadline: true,
    priority: 'critical',
  }),
  t({
    key: 'w1-nib-dokumen',
    title: 'Kumpulkan dokumen NIB — KTP, NPWP, alamat usaha',
    workstream: 'Legal',
    scheduled_date: '2026-09-07',
    week_number: 1,
    estimated_minutes: 30,
  }),

  // --- hari ini ---
  t({
    key: 'w2-riset-kompetitor',
    title: 'Riset 10 kompetitor pet supplies di Shopee',
    workstream: 'Riset',
    estimated_minutes: 60,
    status: 'in_progress',
  }),
  t({
    key: 'w2-catat-harga',
    title: 'Catat harga jual & estimasi fee 10 SKU pembanding',
    workstream: 'Riset',
    estimated_minutes: 30,
  }),
  t({
    key: 'w2-brief-logo',
    title: 'Susun brief logo untuk desainer',
    workstream: 'Branding',
    estimated_minutes: 30,
    priority: 'buffer',
  }),
  t({
    key: 'w2-nib-daftar',
    title: 'Daftar NIB di OSS',
    workstream: 'Legal',
    estimated_minutes: 45,
    status: 'done',
    completed_at: '2026-09-08T02:12:00Z',
    notes: 'NIB terbit, nomor 0212250XXXXXX. PDF disimpan di Drive.',
  }),
  t({
    key: 'w1-nama-final',
    title: 'Nama toko final dikunci',
    workstream: 'Branding',
    scheduled_date: '2026-09-06',
    week_number: 1,
    priority: 'critical',
    estimated_minutes: 60,
    status: 'done',
    completed_at: '2026-09-06T09:00:00Z',
    // Hasilnya murni catatan, tanpa lampiran sama sekali.
    notes: 'nama fix: PetGo',
  }),

  // --- siap dikerjakan ---
  t({
    key: 'w2-shopee-seller',
    title: 'Daftar akun Shopee Seller',
    workstream: 'Listing',
    scheduled_date: '2026-09-11',
    estimated_minutes: 40,
    is_deadline: true,
    depends_on: ['w2-nib-daftar'],
  }),
  t({
    key: 'w2-deskripsi-sku',
    title: 'Tulis draft deskripsi 5 SKU utama',
    workstream: 'Konten',
    scheduled_date: '2026-09-12',
    estimated_minutes: 45,
  }),
  t({
    key: 'w2-tarif-kurir',
    title: 'Bandingkan tarif J&T, SiCepat, Anteraja untuk paket 1–3 kg',
    workstream: 'Operasional',
    scheduled_date: '2026-09-14',
    estimated_minutes: 30,
  }),

  // --- terkunci ---
  t({
    key: 'w3-foto-produk',
    title: 'Foto produk 5 SKU',
    workstream: 'Konten',
    scheduled_date: '2026-09-17',
    week_number: 3,
    estimated_minutes: 120,
  }),
  t({
    key: 'w3-upload-listing',
    title: 'Upload 5 listing pertama',
    workstream: 'Listing',
    scheduled_date: '2026-09-18',
    week_number: 3,
    depends_on: ['w3-foto-produk', 'w2-shopee-seller'],
  }),
  t({
    key: 'w3-ongkir-gudang',
    title: 'Set ongkir & alamat gudang',
    workstream: 'Operasional',
    scheduled_date: '2026-09-16',
    week_number: 3,
    depends_on: ['w2-shopee-seller'],
  }),
  t({
    key: 'w5-iklan-shopee',
    title: 'Aktifkan iklan Shopee untuk 3 SKU',
    workstream: 'Ads',
    scheduled_date: '2026-10-05',
    week_number: 5,
    depends_on: ['w3-upload-listing'],
  }),

  // --- minggu 1 yang sudah beres, biar progres tidak nol ---
  ...Array.from({ length: 8 }, (_, i) =>
    t({
      key: `w1-beres-${i}`,
      title: `Task minggu 1 #${i + 1}`,
      workstream: (['Legal', 'Riset', 'Supplier', 'Keuangan'] as Workstream[])[i % 4],
      scheduled_date: '2026-09-0' + ((i % 5) + 1),
      week_number: 1,
      status: 'done',
      // completed_at selalu terisi di produksi (trigger sync_completed_at),
      // jadi fixture pun harus punya — tanpa ini riwayat "Sudah dikerjakan"
      // tampak kosong padahal task-nya done.
      completed_at: `2026-09-0${(i % 5) + 1}T0${2 + (i % 6)}:15:00Z`,
    }),
  ),
  // --- branding tertinggal, memicu deteksi pola. Semuanya bergantung pada
  //     nama toko yang telat, jadi jalur "memblokir N task" ikut teruji. ---
  ...Array.from({ length: 5 }, (_, i) =>
    t({
      key: `w4-brand-${i}`,
      title: `Aset branding #${i + 1}`,
      workstream: 'Branding',
      scheduled_date: '2026-09-2' + (i + 2),
      week_number: 4,
      depends_on: ['w1-nama-toko'],
    }),
  ),
];

export const fixtureMilestones: Milestone[] = [
  m({ key: 'nib-terbit', title: 'NIB terbit', target_date: '2026-09-10', week_number: 2 }),
  m({
    key: 'shopee-aktif',
    title: 'Akun Shopee Seller aktif',
    target_date: '2026-09-15',
    week_number: 3,
  }),
  m({
    key: 'barang-tiba',
    title: 'Barang tiba di gudang',
    target_date: '2026-10-06',
    week_number: 5,
  }),
  m({
    key: 'listing-siap',
    title: 'Semua listing tayang',
    target_date: '2026-10-10',
    week_number: 5,
  }),
];

export const fixtureSettings: AppSettings = {
  owner_id: OWNER,
  target_arrival_date: '2026-10-06',
  reminder_enabled: true,
  reminder_hour: 7,
  deadline_alert_enabled: true,
  overdue_alert_enabled: true,
  email_fallback_enabled: false,
  email_address: null,
  timezone: 'Asia/Jakarta',
  created_at: '',
  updated_at: '',
};

export const fixtureToday = '2026-09-08';

/**
 * Lampiran contoh. Semuanya kind='link' — pratinjau tidak punya Storage,
 * dan link bisa dibuka sungguhan tanpa login.
 */
export const fixtureAttachments: Map<string, Attachment[]> = (() => {
  const cari = (key: string) => fixtureTasks.find((t) => t.key === key)?.id ?? '';
  const buat = (
    taskKey: string,
    list: { label: string; url: string }[],
  ): [string, Attachment[]] => [
    cari(taskKey),
    list.map((x, i) => ({
      id: `att-${taskKey}-${i}`,
      owner_id: OWNER,
      task_id: cari(taskKey),
      kind: 'link' as const,
      label: x.label,
      storage_path: null,
      mime_type: null,
      size_bytes: null,
      url: x.url,
      local_path: null,
      sort_order: i,
      created_at: '',
    })),
  ];

  const W = String.fromCharCode(92);
  const lokasi = (taskKey: string, path: string): [string, Attachment[]] => [
    cari(taskKey),
    [
      {
        id: `att-path-${taskKey}`,
        owner_id: OWNER,
        task_id: cari(taskKey),
        kind: 'path' as const,
        label: 'harga-v3.xlsx',
        storage_path: null,
        mime_type: null,
        size_bytes: null,
        url: null,
        local_path: path,
        sort_order: 9,
        created_at: '',
      },
    ],
  ];

  const gabung = (a: [string, Attachment[]], b: [string, Attachment[]]): [string, Attachment[]] => [
    a[0],
    [...a[1], ...b[1]],
  ];

  return new Map([
    buat('w2-nib-daftar', [
      { label: 'NIB terbit.pdf', url: 'https://drive.google.com/file/d/contoh' },
      { label: 'Bukti submit OSS', url: 'https://oss.go.id/' },
    ]),
    buat('w1-beres-0', [
      { label: 'Hasil riset supplier', url: 'https://docs.google.com/spreadsheets/' },
    ]),
    buat('w1-nib-dokumen', [
      { label: 'Folder scan dokumen', url: 'https://drive.google.com/drive/my-drive' },
    ]),
    buat('w2-riset-kompetitor', [
      { label: 'Sheet riset harga', url: 'https://docs.google.com/spreadsheets/' },
      { label: 'Kategori pet Shopee', url: 'https://shopee.co.id/' },
    ]),
    gabung(
      buat('w2-catat-harga', [
        { label: 'Kalkulator fee', url: 'https://docs.google.com/spreadsheets/' },
      ]),
      lokasi('w2-catat-harga', `D:${W}proyek${W}riset${W}harga-v3.xlsx`),
    ),
  ]);
})();
