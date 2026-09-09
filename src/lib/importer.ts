/**
 * Validasi dan perencanaan impor JSON — murni, tanpa React maupun Supabase.
 *
 * JSON yang kamu bawa dari chat tidak punya uuid, jadi `key` yang jadi jangkar:
 * key yang sudah ada diperbarui, yang belum ada dibuat. Impor ulang file yang
 * sama tidak menghasilkan duplikat.
 */

import { PRIORITIES, TASK_STATUSES, WORKSTREAMS } from './types';
import type { Priority, Task, TaskStatus, Workstream } from './types';

export type ImportMode = 'append' | 'replace_week';

export interface ImportIssue {
  /** Nomor baris di teks yang ditempel; null kalau tidak bisa dipetakan. */
  line: number | null;
  /** Posisi elemen dalam array, 0-based. */
  index: number | null;
  message: string;
  severity: 'error' | 'warning';
}

/** Baris yang sudah lolos validasi dan siap ditulis. */
export interface ImportRow {
  key: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  week_number: number;
  workstream: Workstream;
  priority: Priority;
  is_deadline: boolean;
  status: TaskStatus;
  depends_on: string[];
  estimated_minutes: number | null;
  notes: string | null;
  sort_order: number;
}

/** Milestone yang sudah lolos validasi. */
export interface MilestoneRow {
  key: string;
  title: string;
  target_date: string;
  week_number: number;
  sort_order: number;
}

export interface ParsedImport {
  rows: ImportRow[];
  milestones: MilestoneRow[];
  issues: ImportIssue[];
  /** true kalau ada issue severity 'error' — commit harus diblokir. */
  fatal: boolean;
}

// ------------------------------------------------------- peta baris -------

/**
 * Nomor baris (1-based) tempat tiap elemen array teratas dimulai.
 *
 * JSON.parse tidak memberi tahu ini, padahal "error di baris berapa" jauh
 * lebih berguna daripada "error di elemen ke-7" saat kamu menatap 300 baris
 * hasil tempel.
 */
export function elementLines(raw: string, afterKey?: string): number[] {
  const lines: number[] = [];
  let line = 1;
  let i = 0;
  const n = raw.length;

  // Bentuk objek { tasks: [...], milestones: [...] } punya dua array. `afterKey`
  // memindahkan titik awal pemindaian supaya nomor baris milestone tidak
  // terbaca dari array tasks.
  if (afterKey) {
    const pos = raw.indexOf(`"${afterKey}"`);
    if (pos < 0) return lines;
    for (let k = 0; k < pos; k++) if (raw[k] === '\n') line++;
    i = pos;
  }

  while (i < n && raw[i] !== '[') {
    if (raw[i] === '\n') line++;
    i++;
  }
  if (i >= n) return lines;
  i++; // lewati '[' terluar

  let depth = 0;
  let inStr = false;
  let esc = false;
  let menunggu = true;

  for (; i < n; i++) {
    const c = raw[i];

    if (c === '\n') {
      line++;
      continue;
    }

    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\r') continue;

    if (depth === 0 && c === ']') break;
    if (depth === 0 && c === ',') {
      menunggu = true;
      continue;
    }

    if (menunggu && depth === 0) {
      lines.push(line);
      menunggu = false;
    }

    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }

  return lines;
}

/** Ubah "position N" dari pesan JSON.parse jadi nomor baris. */
function lineOfPosition(raw: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < raw.length; i++) {
    if (raw[i] === '\n') line++;
  }
  return line;
}

// -------------------------------------------------------- validasi -------

const KEY_RE = /^[a-z0-9][a-z0-9._-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function validateOne(
  item: unknown,
  index: number,
  line: number | null,
  issues: ImportIssue[],
): ImportRow | null {
  const err = (message: string) => issues.push({ line, index, message, severity: 'error' });

  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    err('Bukan objek task.');
    return null;
  }
  const o = item as Record<string, unknown>;
  let ok = true;

  // --- key ---
  const key = o.key;
  if (typeof key !== 'string' || !KEY_RE.test(key)) {
    err(
      `\`key\` wajib berupa slug huruf kecil (a-z, 0-9, . _ -) dan diawali huruf/angka. Dapat: ${JSON.stringify(key)}`,
    );
    ok = false;
  }

  // --- title ---
  const title = o.title;
  if (typeof title !== 'string' || title.trim() === '') {
    err('`title` wajib diisi.');
    ok = false;
  }

  // --- scheduled_date ---
  const date = o.scheduled_date;
  if (typeof date !== 'string' || !isRealDate(date)) {
    err(`\`scheduled_date\` wajib format YYYY-MM-DD dan tanggal yang benar-benar ada. Dapat: ${JSON.stringify(date)}`);
    ok = false;
  }

  // --- week_number ---
  const week = o.week_number;
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > 5) {
    err(`\`week_number\` wajib bilangan bulat 1–5. Dapat: ${JSON.stringify(week)}`);
    ok = false;
  }

  // --- workstream ---
  const ws = o.workstream;
  if (typeof ws !== 'string' || !(WORKSTREAMS as readonly string[]).includes(ws)) {
    err(`\`workstream\` tidak dikenal: ${JSON.stringify(ws)}. Pilihan: ${WORKSTREAMS.join(', ')}`);
    ok = false;
  }

  // --- opsional, punya default ---
  const priority = o.priority ?? 'normal';
  if (typeof priority !== 'string' || !(PRIORITIES as readonly string[]).includes(priority)) {
    err(`\`priority\` tidak dikenal: ${JSON.stringify(o.priority)}. Pilihan: ${PRIORITIES.join(', ')}`);
    ok = false;
  }

  const status = o.status ?? 'todo';
  if (typeof status !== 'string' || !(TASK_STATUSES as readonly string[]).includes(status)) {
    err(`\`status\` tidak dikenal: ${JSON.stringify(o.status)}. Pilihan: ${TASK_STATUSES.join(', ')}`);
    ok = false;
  }

  const isDeadline = o.is_deadline ?? false;
  if (typeof isDeadline !== 'boolean') {
    err(`\`is_deadline\` wajib true/false. Dapat: ${JSON.stringify(o.is_deadline)}`);
    ok = false;
  }

  const est = o.estimated_minutes ?? null;
  if (est !== null && (typeof est !== 'number' || !Number.isInteger(est) || est <= 0)) {
    err(`\`estimated_minutes\` wajib bilangan bulat > 0 atau null. Dapat: ${JSON.stringify(est)}`);
    ok = false;
  }

  const deps = o.depends_on ?? [];
  if (!Array.isArray(deps) || deps.some((d) => typeof d !== 'string')) {
    err('`depends_on` wajib array berisi key task (string).');
    ok = false;
  } else if (typeof key === 'string' && deps.includes(key)) {
    err('`depends_on` menunjuk ke dirinya sendiri.');
    ok = false;
  }

  const sort = o.sort_order ?? index;
  if (typeof sort !== 'number' || !Number.isInteger(sort)) {
    err(`\`sort_order\` wajib bilangan bulat. Dapat: ${JSON.stringify(o.sort_order)}`);
    ok = false;
  }

  const desc = o.description ?? null;
  if (desc !== null && typeof desc !== 'string') {
    err('`description` wajib string atau null.');
    ok = false;
  }

  const notes = o.notes ?? null;
  if (notes !== null && typeof notes !== 'string') {
    err('`notes` wajib string atau null.');
    ok = false;
  }

  // Kolom asing biasanya salah ketik nama field — diberitahu, tapi tidak fatal.
  const dikenal = new Set([
    'key', 'title', 'description', 'scheduled_date', 'week_number', 'workstream',
    'priority', 'is_deadline', 'status', 'depends_on', 'estimated_minutes',
    'notes', 'sort_order',
    // field turunan yang wajar ikut terbawa dari hasil Ekspor
    'id', 'owner_id', 'completed_at', 'created_at', 'updated_at', 'milestone_id',
  ]);
  for (const k of Object.keys(o)) {
    if (!dikenal.has(k)) {
      issues.push({ line, index, message: `Field \`${k}\` tidak dikenal, diabaikan.`, severity: 'warning' });
    }
  }

  if (!ok) return null;

  return {
    key: key as string,
    title: (title as string).trim(),
    description: desc as string | null,
    scheduled_date: date as string,
    week_number: week as number,
    workstream: ws as Workstream,
    priority: priority as Priority,
    is_deadline: isDeadline as boolean,
    status: status as TaskStatus,
    depends_on: deps as string[],
    estimated_minutes: est as number | null,
    notes: notes as string | null,
    sort_order: sort as number,
  };
}

function validateMilestone(
  item: unknown,
  index: number,
  line: number | null,
  issues: ImportIssue[],
): MilestoneRow | null {
  const err = (message: string) =>
    issues.push({ line, index, message: `milestone: ${message}`, severity: 'error' });

  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    err('Bukan objek milestone.');
    return null;
  }
  const o = item as Record<string, unknown>;
  let ok = true;

  const key = o.key;
  if (typeof key !== 'string' || !KEY_RE.test(key)) {
    err(`\`key\` wajib slug huruf kecil. Dapat: ${JSON.stringify(key)}`);
    ok = false;
  }

  const title = o.title;
  if (typeof title !== 'string' || title.trim() === '') {
    err('`title` wajib diisi.');
    ok = false;
  }

  const date = o.target_date;
  if (typeof date !== 'string' || !isRealDate(date)) {
    err(`\`target_date\` wajib YYYY-MM-DD yang benar-benar ada. Dapat: ${JSON.stringify(date)}`);
    ok = false;
  }

  const week = o.week_number;
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > 5) {
    err(`\`week_number\` wajib bilangan bulat 1–5. Dapat: ${JSON.stringify(week)}`);
    ok = false;
  }

  const sort = o.sort_order ?? index;
  if (typeof sort !== 'number' || !Number.isInteger(sort)) {
    err('`sort_order` wajib bilangan bulat.');
    ok = false;
  }

  if (!ok) return null;
  return {
    key: key as string,
    title: (title as string).trim(),
    target_date: date as string,
    week_number: week as number,
    sort_order: sort as number,
  };
}

export function parseImport(raw: string): ParsedImport {
  const issues: ImportIssue[] = [];
  const teks = raw.trim();
  const kosong = (extra: ImportIssue): ParsedImport => ({
    rows: [],
    milestones: [],
    issues: [extra],
    fatal: true,
  });

  if (teks === '') {
    return kosong({ line: null, index: null, message: 'Belum ada JSON yang ditempel.', severity: 'error' });
  }

  let data: unknown;
  try {
    data = JSON.parse(teks);
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    const m = /position (\d+)/.exec(pesan);
    return kosong({
      line: m ? lineOfPosition(teks, Number(m[1])) : null,
      index: null,
      message: `JSON tidak valid — ${pesan}`,
      severity: 'error',
    });
  }

  // Dua bentuk diterima: array task polos (bentuk lama, tetap didukung), atau
  // objek { tasks, milestones } supaya milestone bisa ikut satu tempelan.
  let daftarTask: unknown;
  let daftarMs: unknown = [];
  let objekForm = false;

  if (Array.isArray(data)) {
    daftarTask = data;
  } else if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    if (!('tasks' in o)) {
      return kosong({
        line: 1,
        index: null,
        message: 'JSON harus berupa array task, atau objek { "tasks": [...], "milestones": [...] }.',
        severity: 'error',
      });
    }
    daftarTask = o.tasks;
    daftarMs = o.milestones ?? [];
    objekForm = true;
  } else {
    return kosong({
      line: 1,
      index: null,
      message: 'JSON harus berupa array task, atau objek { "tasks": [...], "milestones": [...] }.',
      severity: 'error',
    });
  }

  if (!Array.isArray(daftarTask)) {
    return kosong({ line: 1, index: null, message: '`tasks` harus berupa array.', severity: 'error' });
  }
  if (!Array.isArray(daftarMs)) {
    return kosong({ line: 1, index: null, message: '`milestones` harus berupa array.', severity: 'error' });
  }

  // --- tasks ---
  const lines = elementLines(teks, objekForm ? 'tasks' : undefined);
  const rows: ImportRow[] = [];
  const terlihat = new Map<string, number>();

  daftarTask.forEach((item, i) => {
    const line = lines[i] ?? null;
    const row = validateOne(item, i, line, issues);
    if (!row) return;

    const sebelumnya = terlihat.get(row.key);
    if (sebelumnya !== undefined) {
      issues.push({
        line,
        index: i,
        message: `Key \`${row.key}\` dobel — sudah dipakai di elemen ke-${sebelumnya + 1}.`,
        severity: 'error',
      });
      return;
    }
    terlihat.set(row.key, i);
    rows.push(row);
  });

  // --- milestones ---
  const msLines = objekForm ? elementLines(teks, 'milestones') : [];
  const milestones: MilestoneRow[] = [];
  const msTerlihat = new Set<string>();

  daftarMs.forEach((item, i) => {
    const line = msLines[i] ?? null;
    const m = validateMilestone(item, i, line, issues);
    if (!m) return;
    if (msTerlihat.has(m.key)) {
      issues.push({
        line,
        index: i,
        message: `milestone: key \`${m.key}\` dobel.`,
        severity: 'error',
      });
      return;
    }
    msTerlihat.add(m.key);
    milestones.push(m);
  });

  return { rows, milestones, issues, fatal: issues.some((x) => x.severity === 'error') };
}

// ----------------------------------------------------------- rencana -----

export interface ImportPlan {
  insert: ImportRow[];
  update: ImportRow[];
  /** Milestone selalu upsert — tidak pernah dihapus, bahkan di replace_week.
   *  Milestone itu sedikit dan stabil; menghapusnya karena satu minggu
   *  di-replace akan mengejutkan dan sulit dibatalkan. */
  milestones: MilestoneRow[];
  /** Hanya terisi di mode replace_week. */
  deleteKeys: string[];
  /** Minggu yang tersentuh replace_week. */
  weeks: number[];
  /** Key dependensi yang tidak ada di payload maupun di database. */
  danglingDeps: string[];
}

/**
 * Hitung apa yang akan terjadi, sebelum apa pun ditulis.
 *
 * `replace_week` sengaja TIDAK menghapus-lalu-membuat-ulang seluruh minggu:
 * task yang key-nya ada di payload diperbarui di tempat. Kalau dihapus dulu,
 * lampirannya ikut terhapus (attachments punya on delete cascade) dan
 * riwayat completed_at-nya hilang — padahal task-nya sebenarnya masih ada.
 * Yang dihapus hanya task di minggu itu yang tidak lagi disebut payload.
 */
export function planImport(
  rows: ImportRow[],
  existing: Task[],
  mode: ImportMode,
  milestones: MilestoneRow[] = [],
): ImportPlan {
  const adaDiDb = new Map(existing.map((t) => [t.key, t]));
  const keyPayload = new Set(rows.map((r) => r.key));

  const insert: ImportRow[] = [];
  const update: ImportRow[] = [];
  for (const r of rows) {
    if (adaDiDb.has(r.key)) update.push(r);
    else insert.push(r);
  }

  const weeks = [...new Set(rows.map((r) => r.week_number))].sort((a, b) => a - b);

  const deleteKeys =
    mode === 'replace_week'
      ? existing
          .filter((t) => weeks.includes(t.week_number) && !keyPayload.has(t.key))
          .map((t) => t.key)
      : [];

  const dihapus = new Set(deleteKeys);
  const danglingDeps = [
    ...new Set(
      rows
        .flatMap((r) => r.depends_on)
        .filter((k) => !keyPayload.has(k) && (!adaDiDb.has(k) || dihapus.has(k))),
    ),
  ].sort();

  return { insert, update, milestones, deleteKeys, weeks, danglingDeps };
}

// ------------------------------------------------------------ ekspor -----

/** Field yang ikut Ekspor. id/owner_id/timestamp sengaja dibuang supaya
 *  hasilnya bisa dibawa ke chat dan dikembalikan tanpa membawa data internal. */
export function toExport(tasks: Task[]): ImportRow[] {
  return [...tasks]
    .sort(
      (a, b) =>
        a.week_number - b.week_number ||
        a.scheduled_date.localeCompare(b.scheduled_date) ||
        a.sort_order - b.sort_order ||
        a.key.localeCompare(b.key),
    )
    .map((t) => ({
      key: t.key,
      title: t.title,
      description: t.description,
      scheduled_date: t.scheduled_date,
      week_number: t.week_number,
      workstream: t.workstream,
      priority: t.priority,
      is_deadline: t.is_deadline,
      status: t.status,
      depends_on: t.depends_on,
      estimated_minutes: t.estimated_minutes,
      notes: t.notes,
      sort_order: t.sort_order,
    }));
}

export function exportJson(tasks: Task[]): string {
  return JSON.stringify(toExport(tasks), null, 2);
}
