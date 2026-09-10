import { describe, expect, it } from 'vitest';
import { elementLines, exportJson, parseImport, planImport } from './importer';
import type { ImportRow } from './importer';
import type { Task, Workstream } from './types';

let seq = 0;
function task(over: Partial<Task> & { key: string }): Task {
  seq += 1;
  return {
    id: `id-${seq}`,
    owner_id: 'owner',
    title: over.key,
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
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

/** Payload contoh. Sengaja longgar tipenya — sebagian test justru membangun
 *  JSON yang tidak valid untuk memastikan validator menolaknya. */
const sah = (over: Record<string, unknown> = {}) => ({
  key: 'w2-contoh',
  title: 'Contoh task',
  scheduled_date: '2026-09-08',
  week_number: 2,
  workstream: 'Riset',
  ...over,
});

describe('elementLines', () => {
  it('memetakan tiap elemen ke baris awalnya', () => {
    const raw = '[\n  {"a":1},\n  {"b":2},\n  {"c":3}\n]';
    expect(elementLines(raw)).toEqual([2, 3, 4]);
  });

  it('tahan terhadap objek bersarang dan array di dalam', () => {
    const raw = '[\n  {\n    "a": [1,2],\n    "b": {"c": 3}\n  },\n  {"d":4}\n]';
    expect(elementLines(raw)).toEqual([2, 6]);
  });

  it('tidak tertipu kurung atau koma di dalam string', () => {
    const raw = '[\n  {"t":"a, b } ] {"},\n  {"t":"biasa"}\n]';
    expect(elementLines(raw)).toEqual([2, 3]);
  });

  it('tidak tertipu tanda kutip yang di-escape', () => {
    const raw = '[\n  {"t":"dia bilang \\"halo\\""},\n  {"t":"x"}\n]';
    expect(elementLines(raw)).toEqual([2, 3]);
  });

  it('array kosong tidak menghasilkan baris', () => {
    expect(elementLines('[]')).toEqual([]);
  });

  it('semua di satu baris tetap terpetakan', () => {
    expect(elementLines('[{"a":1},{"b":2}]')).toEqual([1, 1]);
  });
});

describe('parseImport — kegagalan', () => {
  it('teks kosong ditolak', () => {
    const r = parseImport('   ');
    expect(r.fatal).toBe(true);
    expect(r.issues[0].message).toMatch(/Belum ada JSON/);
  });

  it('JSON rusak melaporkan baris', () => {
    const r = parseImport('[\n  {"key": "a",\n  {"key":"b"}\n]');
    expect(r.fatal).toBe(true);
    expect(r.issues[0].message).toMatch(/JSON tidak valid/);
    expect(r.issues[0].line).toBeGreaterThan(1);
  });

  it('bukan array ditolak', () => {
    const r = parseImport('{"key":"a"}');
    expect(r.fatal).toBe(true);
    expect(r.issues[0].message).toMatch(/harus berupa array/);
  });

  it('key tidak sesuai pola ditolak dan menyebut barisnya', () => {
    const raw = JSON.stringify([sah({ key: 'W2 Contoh!' })], null, 2);
    const r = parseImport(raw);
    expect(r.fatal).toBe(true);
    const e = r.issues.find((x) => x.message.includes('`key`'));
    expect(e?.line).toBe(2);
    expect(e?.index).toBe(0);
  });

  it('week_number di luar 1–5 ditolak', () => {
    const r = parseImport(JSON.stringify([sah({ week_number: 7 })]));
    expect(r.issues.some((x) => x.message.includes('week_number'))).toBe(true);
    expect(r.fatal).toBe(true);
  });

  it('workstream tidak dikenal ditolak', () => {
    const r = parseImport(JSON.stringify([sah({ workstream: 'Marketing' })]));
    expect(r.issues.some((x) => x.message.includes('workstream'))).toBe(true);
  });

  it('tanggal yang tidak benar-benar ada ditolak', () => {
    const r = parseImport(JSON.stringify([sah({ scheduled_date: '2026-02-31' })]));
    expect(r.issues.some((x) => x.message.includes('scheduled_date'))).toBe(true);
  });

  it('estimasi nol atau negatif ditolak', () => {
    const r = parseImport(JSON.stringify([sah({ estimated_minutes: 0 })]));
    expect(r.issues.some((x) => x.message.includes('estimated_minutes'))).toBe(true);
  });

  it('dependensi ke diri sendiri ditolak', () => {
    const r = parseImport(JSON.stringify([sah({ depends_on: ['w2-contoh'] })]));
    expect(r.issues.some((x) => x.message.includes('dirinya sendiri'))).toBe(true);
  });

  it('key dobel ditolak dan menunjuk elemen sebelumnya', () => {
    const r = parseImport(JSON.stringify([sah(), sah({ title: 'Lain' })], null, 2));
    const e = r.issues.find((x) => x.message.includes('dobel'));
    expect(e).toBeDefined();
    expect(e?.message).toMatch(/elemen ke-1/);
    expect(r.rows).toHaveLength(1);
  });

  it('elemen yang bukan objek ditolak', () => {
    const r = parseImport('[\n  "bukan objek",\n  42\n]');
    expect(r.issues.filter((x) => x.severity === 'error')).toHaveLength(2);
  });
});

describe('parseImport — keberhasilan', () => {
  it('mengisi default untuk field opsional', () => {
    const r = parseImport(JSON.stringify([sah()]));
    expect(r.fatal).toBe(false);
    expect(r.rows[0]).toMatchObject({
      key: 'w2-contoh',
      priority: 'normal',
      status: 'todo',
      is_deadline: false,
      depends_on: [],
      estimated_minutes: null,
      notes: null,
      description: null,
      sort_order: 0,
    });
  });

  it('field asing jadi peringatan, bukan error', () => {
    const r = parseImport(JSON.stringify([{ ...sah(), warna: 'merah' }]));
    expect(r.fatal).toBe(false);
    expect(r.issues.some((x) => x.severity === 'warning' && x.message.includes('warna'))).toBe(true);
  });

  it('field hasil Ekspor boleh ikut tanpa peringatan', () => {
    const r = parseImport(
      JSON.stringify([{ ...sah(), id: 'x', owner_id: 'y', completed_at: null }]),
    );
    expect(r.issues).toHaveLength(0);
  });

  it('judul dirapikan spasinya', () => {
    const r = parseImport(JSON.stringify([sah({ title: '  Riset harga  ' })]));
    expect(r.rows[0].title).toBe('Riset harga');
  });
});

describe('planImport', () => {
  const existing = [
    task({ key: 'w2-lama-a', week_number: 2 }),
    task({ key: 'w2-lama-b', week_number: 2 }),
    task({ key: 'w3-lain', week_number: 3 }),
  ];
  const rows = parseImport(
    JSON.stringify([
      sah({ key: 'w2-lama-a', title: 'Diperbarui' }),
      sah({ key: 'w2-baru', title: 'Baru' }),
    ]),
  ).rows;

  it('append hanya menambah dan memperbarui', () => {
    const p = planImport(rows, existing, 'append');
    expect(p.update.map((r) => r.key)).toEqual(['w2-lama-a']);
    expect(p.insert.map((r) => r.key)).toEqual(['w2-baru']);
    expect(p.deleteKeys).toEqual([]);
  });

  it('replace_week menghapus yang tidak lagi disebut, hanya di minggu itu', () => {
    const p = planImport(rows, existing, 'replace_week');
    expect(p.weeks).toEqual([2]);
    expect(p.deleteKeys).toEqual(['w2-lama-b']);
  });

  it('replace_week tidak menghapus task yang key-nya ada di payload', () => {
    // w2-lama-a diperbarui di tempat, jadi lampiran & completed_at-nya selamat
    const p = planImport(rows, existing, 'replace_week');
    expect(p.deleteKeys).not.toContain('w2-lama-a');
    expect(p.update.map((r) => r.key)).toContain('w2-lama-a');
  });

  it('replace_week tidak menyentuh minggu lain', () => {
    const p = planImport(rows, existing, 'replace_week');
    expect(p.deleteKeys).not.toContain('w3-lain');
  });

  it('menandai dependensi yang menunjuk key tidak dikenal', () => {
    const r = parseImport(JSON.stringify([sah({ depends_on: ['tidak-ada', 'w3-lain'] })])).rows;
    const p = planImport(r, existing, 'append');
    expect(p.danglingDeps).toEqual(['tidak-ada']);
  });

  it('dependensi ke task yang justru akan dihapus ikut ditandai', () => {
    const r = parseImport(JSON.stringify([sah({ key: 'w2-baru', depends_on: ['w2-lama-b'] })])).rows;
    const p = planImport(r, existing, 'replace_week');
    expect(p.deleteKeys).toContain('w2-lama-b');
    expect(p.danglingDeps).toContain('w2-lama-b');
  });
});

describe('exportJson', () => {
  it('urut per minggu lalu tanggal, dan membuang field internal', () => {
    const out = JSON.parse(
      exportJson([
        task({ key: 'b', week_number: 3, scheduled_date: '2026-09-16' }),
        task({ key: 'a', week_number: 2, scheduled_date: '2026-09-08' }),
      ]),
    );
    expect(out.map((x: ImportRow) => x.key)).toEqual(['a', 'b']);
    expect(Object.keys(out[0])).not.toContain('id');
    expect(Object.keys(out[0])).not.toContain('owner_id');
  });

  it('hasil Ekspor bisa langsung di-impor ulang tanpa error', () => {
    const json = exportJson([task({ key: 'w2-a', estimated_minutes: 30, depends_on: [] })]);
    const r = parseImport(json);
    expect(r.fatal).toBe(false);
    expect(r.issues).toHaveLength(0);
    expect(r.rows[0].key).toBe('w2-a');
  });
});

describe('parseImport — bentuk objek dengan milestone', () => {
  const obj = (over: Record<string, unknown> = {}) => ({
    tasks: [sah()],
    milestones: [
      { key: 'nib-terbit', title: 'NIB terbit', target_date: '2026-09-15', week_number: 1 },
    ],
    ...over,
  });

  it('array polos tetap diterima — bentuk lama tidak dipatahkan', () => {
    const r = parseImport(JSON.stringify([sah()]));
    expect(r.fatal).toBe(false);
    expect(r.rows).toHaveLength(1);
    expect(r.milestones).toEqual([]);
  });

  it('bentuk objek membaca tasks dan milestones sekaligus', () => {
    const r = parseImport(JSON.stringify(obj()));
    expect(r.fatal).toBe(false);
    expect(r.rows.map((x) => x.key)).toEqual(['w2-contoh']);
    expect(r.milestones.map((m) => m.key)).toEqual(['nib-terbit']);
  });

  it('milestones boleh tidak ada', () => {
    const r = parseImport(JSON.stringify({ tasks: [sah()] }));
    expect(r.fatal).toBe(false);
    expect(r.milestones).toEqual([]);
  });

  it('objek tanpa tasks ditolak dengan pesan yang menjelaskan dua bentuknya', () => {
    const r = parseImport(JSON.stringify({ milestones: [] }));
    expect(r.fatal).toBe(true);
    expect(r.issues[0].message).toMatch(/array task, atau objek/);
  });

  it('milestone dengan tanggal palsu ditolak dan diberi awalan "milestone:"', () => {
    const r = parseImport(
      JSON.stringify(
        obj({ milestones: [{ key: 'x', title: 'X', target_date: '2026-02-31', week_number: 1 }] }),
      ),
    );
    expect(r.fatal).toBe(true);
    expect(r.issues.some((i) => i.message.startsWith('milestone:'))).toBe(true);
  });

  it('key milestone dobel ditolak', () => {
    const m = { key: 'sama', title: 'A', target_date: '2026-09-15', week_number: 1 };
    const r = parseImport(JSON.stringify(obj({ milestones: [m, { ...m, title: 'B' }] })));
    expect(r.issues.some((i) => i.message.includes('dobel'))).toBe(true);
    expect(r.milestones).toHaveLength(1);
  });

  it('nomor baris milestone dibaca dari array milestones, bukan array tasks', () => {
    const raw = JSON.stringify(obj({ milestones: [{ key: 'x', title: 'X', target_date: 'bukan' , week_number: 1 }] }), null, 2);
    const r = parseImport(raw);
    const e = r.issues.find((i) => i.message.startsWith('milestone:'));
    const barisMilestone = raw.split('\n').findIndex((l) => l.includes('"milestones"')) + 1;
    expect(e?.line).toBeGreaterThan(barisMilestone);
  });

  it('milestone ikut ke rencana dan tidak pernah masuk daftar hapus', () => {
    const r = parseImport(JSON.stringify(obj()));
    const p = planImport(r.rows, [], 'replace_week', r.milestones);
    expect(p.milestones.map((m) => m.key)).toEqual(['nib-terbit']);
    expect(p.deleteKeys).toEqual([]);
  });
});
