/**
 * Memvalidasi seed/jadwal-30-hari.json dengan parser dan logika app sendiri.
 *
 * Bukan test sekali pakai: kalau kamu mengedit jadwalnya, ini yang menangkap
 * dependensi melingkar, task yang bergantung pada sesuatu yang dijadwalkan
 * lebih lambat, atau hari yang beban estimasinya tidak masuk akal.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseImport, planImport } from './importer';
import { buildDashboard, byKey, groupByWeek } from './tasks';
import type { Task } from './types';

const raw = readFileSync('seed/jadwal-30-hari.json', 'utf8');
const p = parseImport(raw);

describe('seed jadwal-30-hari.json', () => {
  it('lolos validator tanpa error maupun peringatan', () => {
    expect(p.issues).toEqual([]);
    expect(p.fatal).toBe(false);
  });

  it('punya task dan milestone', () => {
    console.log('  task:', p.rows.length, '| milestone:', p.milestones.length);
    expect(p.rows.length).toBeGreaterThan(30);
    expect(p.milestones.length).toBe(5);
  });

  it('tidak ada dependensi yang menunjuk key tak dikenal', () => {
    const plan = planImport(p.rows, [], 'append', p.milestones);
    expect(plan.danglingDeps).toEqual([]);
  });

  it('tidak ada dependensi yang menunjuk task berjadwal LEBIH LAMBAT', () => {
    // Bergantung pada sesuatu yang dijadwalkan belakangan = jadwal mustahil.
    const tgl = new Map(p.rows.map((r) => [r.key, r.scheduled_date]));
    const salah = p.rows.flatMap((r) =>
      r.depends_on
        .filter((d) => (tgl.get(d) ?? '') > r.scheduled_date)
        .map((d) => `${r.key} (${r.scheduled_date}) <- ${d} (${tgl.get(d)})`),
    );
    expect(salah).toEqual([]);
  });

  it('tidak ada dependensi melingkar', () => {
    const dep = new Map(p.rows.map((r) => [r.key, r.depends_on]));
    const warna = new Map<string, number>();
    const siklus: string[] = [];
    const kunjung = (k: string, jalur: string[]) => {
      if (warna.get(k) === 1) { siklus.push([...jalur, k].join(' -> ')); return; }
      if (warna.get(k) === 2) return;
      warna.set(k, 1);
      for (const d of dep.get(k) ?? []) kunjung(d, [...jalur, k]);
      warna.set(k, 2);
    };
    for (const r of p.rows) kunjung(r.key, []);
    expect(siklus).toEqual([]);
  });

  it('beban harian masuk akal untuk 1–2 jam/hari', () => {
    const perHari = new Map<string, number>();
    for (const r of p.rows) {
      perHari.set(r.scheduled_date, (perHari.get(r.scheduled_date) ?? 0) + (r.estimated_minutes ?? 0));
    }
    const berat = [...perHari].filter(([, m]) => m > 150).map(([d, m]) => `${d}: ${m}m`);
    console.log('  hari terpakai:', perHari.size, '| total jam:',
      ([...perHari.values()].reduce((a, b) => a + b, 0) / 60).toFixed(1));
    expect(berat).toEqual([]);
  });

  it('minggu 1–5 semuanya terisi dan berurutan tanggalnya', () => {
    const tasks = p.rows.map((r, i) => ({ ...r, id: String(i), owner_id: 'o', milestone_id: null,
      completed_at: null, created_at: '', updated_at: '' })) as Task[];
    const weeks = groupByWeek(tasks, []);
    console.log('  minggu:', weeks.map((w) => `${w.week}: ${w.from}..${w.to} (${w.progress.total})`).join(' | '));
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].from > weeks[i - 1].to).toBe(true);
    }
  });

  it('di hari pertama ada yang bisa langsung dikerjakan, tidak semua terkunci', () => {
    const tasks = p.rows.map((r, i) => ({ ...r, id: String(i), owner_id: 'o', milestone_id: null,
      completed_at: null, created_at: '', updated_at: '' })) as Task[];
    const d = buildDashboard(tasks, '2026-09-09');
    console.log('  9 Sep -> fokus:', d.today.map((t) => t.key).join(', '),
      '| siap:', d.ready.length, '| terkunci:', d.locked.length);
    expect(d.today.length).toBeGreaterThan(0);
    expect(d.overdue).toEqual([]);
    expect(byKey(tasks).size).toBe(p.rows.length);
  });

  it('semua milestone punya task pendamping is_deadline di tanggal yang sama', () => {
    const deadlineDates = new Set(p.rows.filter((r) => r.is_deadline).map((r) => r.scheduled_date));
    const yatim = p.milestones.filter((m) => !deadlineDates.has(m.target_date)).map((m) => m.key);
    expect(yatim).toEqual([]);
  });
});
