/**
 * Logika murni Dashboard — tanpa React, tanpa Supabase, jadi bisa diuji penuh.
 *
 * Semua fungsi di sini menerima `today` sebagai argumen, tidak pernah memanggil
 * jam sendiri. Itu yang membuat perilakunya bisa diuji di batas tengah malam
 * WIB, dan memaksa pemanggil mengambil "hari ini" dari todayJakarta() satu kali
 * saja per render — bukan berkali-kali dengan hasil yang bisa berbeda.
 *
 * Tanggal dibandingkan sebagai string. Format 'YYYY-MM-DD' berurutan secara
 * leksikografis persis seperti urutan kronologisnya, jadi `a < b` benar tanpa
 * perlu mem-parse apa pun.
 */

import { jakartaDateOf, type IsoDate } from './date';
import type { Milestone, Task, Workstream } from './types';

// ---------------------------------------------------------- timeline ------

export interface DayGroup {
  date: IsoDate;
  tasks: Task[];
  /** Milestone yang jatuh tepat di hari ini — penanda deadline di timeline. */
  milestones: Milestone[];
}

export interface WeekGroup {
  week: number;
  from: IsoDate;
  to: IsoDate;
  days: DayGroup[];
  progress: Progress;
}

/**
 * Struktur Timeline: minggu -> hari -> task.
 *
 * Hari yang hanya berisi milestone tanpa task tetap muncul. Hari deadline yang
 * kebetulan kosong justru yang paling perlu terlihat, dan kalau disaring
 * berdasarkan ada-tidaknya task, ia hilang diam-diam.
 */
export function groupByWeek(tasks: Task[], milestones: Milestone[]): WeekGroup[] {
  const weeks = new Map<number, { tasks: Task[]; milestones: Milestone[] }>();

  const slot = (w: number) => {
    let s = weeks.get(w);
    if (!s) {
      s = { tasks: [], milestones: [] };
      weeks.set(w, s);
    }
    return s;
  };

  for (const t of tasks) slot(t.week_number).tasks.push(t);
  for (const m of milestones) slot(m.week_number).milestones.push(m);

  const out: WeekGroup[] = [];

  for (const [week, { tasks: wt, milestones: wm }] of weeks) {
    const dates = new Set<IsoDate>();
    for (const t of wt) dates.add(t.scheduled_date);
    for (const m of wm) dates.add(m.target_date);

    const days = [...dates]
      .sort()
      .map<DayGroup>((date) => ({
        date,
        tasks: wt.filter((t) => t.scheduled_date === date).sort(bySortOrder),
        milestones: wm.filter((m) => m.target_date === date),
      }));

    out.push({
      week,
      from: days[0]?.date ?? '',
      to: days[days.length - 1]?.date ?? '',
      days,
      progress: progress(wt),
    });
  }

  return out.sort((a, b) => a.week - b.week);
}

// -------------------------------------------------------------- key -------

/**
 * Slug stabil untuk task baru, mis. 'w2-riset-kompetitor-shopee'.
 *
 * Harus lolos constraint `task_key_slug` di database: diawali huruf/angka,
 * lalu hanya a-z 0-9 . _ -. Prefiks minggu membuat key mudah dibaca saat
 * menulis `depends_on` secara manual di JSON.
 */
export function slugKey(title: string, week: number, taken: Iterable<string> = []): string {
  const body =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '') // buang diakritik hasil NFD
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'task';

  const base = `w${week}-${body}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Task yang masih menuntut pekerjaan. */
export function isOpen(t: Task): boolean {
  return t.status === 'todo' || t.status === 'in_progress';
}

/**
 * Dependensi dianggap beres kalau `done` ATAU `skipped`.
 *
 * `skipped` ikut karena melewatkan task adalah keputusan sadar — kalau ia tetap
 * memblokir, satu keputusan "tidak jadi" akan mengunci rantai di belakangnya
 * selamanya dan blok "Siap dikerjakan" perlahan mengering tanpa sebab yang
 * kelihatan.
 */
function isSatisfied(t: Task): boolean {
  return t.status === 'done' || t.status === 'skipped';
}

/** Index key -> Task. Bangun sekali, oper ke selektor dependensi. */
export function byKey(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.key, t]));
}

/**
 * Dependensi yang belum beres — inilah yang membuat task terkunci, dan
 * namanya yang ditampilkan di blok "Terkunci".
 *
 * Key yang tidak ketemu diperlakukan sebagai beres, bukan sebagai pemblokir.
 * Trigger di database sudah mencabut key gantung saat task dihapus, tapi
 * import JSON bisa menyebut key yang belum ada; menahan task karena hantu
 * lebih buruk daripada melepasnya.
 */
export function blockers(t: Task, index: Map<string, Task>): Task[] {
  const out: Task[] = [];
  for (const key of t.depends_on) {
    const dep = index.get(key);
    if (dep && !isSatisfied(dep)) out.push(dep);
  }
  return out;
}

export function isBlocked(t: Task, index: Map<string, Task>): boolean {
  return blockers(t, index).length > 0;
}

/** Berapa task lain yang langsung terkunci gara-gara task ini belum beres. */
export function blocksCount(t: Task, tasks: Task[]): number {
  if (isSatisfied(t)) return 0;
  return tasks.filter((o) => isOpen(o) && o.depends_on.includes(t.key)).length;
}

// ------------------------------------------------------------- urutan ------

/** Urutan stabil: sort_order, lalu key sebagai pemecah seri. */
function bySortOrder(a: Task, b: Task): number {
  return a.sort_order - b.sort_order || a.key.localeCompare(b.key);
}

/** Tanggal dulu, baru sort_order. Untuk daftar yang melintasi hari. */
function byDate(a: Task, b: Task): number {
  return a.scheduled_date.localeCompare(b.scheduled_date) || bySortOrder(a, b);
}

// ---------------------------------------------------------- dashboard ------

export interface DashboardBuckets {
  /** Lewat tanggal dan masih terbuka. Terlama dulu — itu yang paling mendesak. */
  overdue: Task[];
  /** Dijadwalkan hari ini dan bisa dikerjakan, plus yang sudah selesai hari ini. */
  today: Task[];
  /** Masa depan, semua dependensi beres. Ini yang boleh dicicil kalau ada waktu. */
  ready: Task[];
  /** Masih menunggu dependensi. */
  locked: Task[];
}

/**
 * Empat blok Dashboard, saling eksklusif — satu task tidak pernah muncul di
 * dua tempat. Menampilkan task yang sama dua kali membuat hitungan di kepala
 * jadi salah, dan itu justru yang app ini seharusnya cegah.
 *
 * Task terjadwal hari ini tapi masih terkunci masuk ke `locked`, bukan
 * `today` — menaruhnya di "Fokus hari ini" berarti menyuruh mengerjakan
 * sesuatu yang belum bisa dikerjakan.
 */
export function buildDashboard(tasks: Task[], today: IsoDate): DashboardBuckets {
  const index = byKey(tasks);

  const overdue: Task[] = [];
  const todayList: Task[] = [];
  const ready: Task[] = [];
  const locked: Task[] = [];

  for (const t of tasks) {
    const open = isOpen(t);

    if (open && t.scheduled_date < today) {
      overdue.push(t);
      continue;
    }

    if (open && isBlocked(t, index)) {
      locked.push(t);
      continue;
    }

    if (t.scheduled_date === today) {
      todayList.push(t);
      continue;
    }

    if (open && t.scheduled_date > today) ready.push(t);
  }

  overdue.sort(byDate);
  locked.sort(byDate);
  ready.sort(byDate);

  // Yang belum selesai naik ke atas; yang sudah dicentang mengendap di bawah
  // sebagai bukti kerja, bukan sebagai gangguan.
  todayList.sort((a, b) => {
    const ao = isOpen(a) ? 0 : 1;
    const bo = isOpen(b) ? 0 : 1;
    return ao - bo || bySortOrder(a, b);
  });

  return { overdue, today: todayList, ready, locked };
}

// ----------------------------------------------------------- progres -------

export interface Progress {
  total: number;
  done: number;
  skipped: number;
  /** done / (total - skipped), dibulatkan. 0 kalau tidak ada yang relevan. */
  pct: number;
}

/**
 * `skipped` dikeluarkan dari penyebut, bukan dihitung sebagai belum selesai.
 * Kalau ikut penyebut, melewatkan satu task membuat progres mustahil mencapai
 * 100% selamanya — angka yang menghukum keputusan yang wajar.
 */
export function progress(tasks: Task[]): Progress {
  let done = 0;
  let skipped = 0;
  for (const t of tasks) {
    if (t.status === 'done') done++;
    else if (t.status === 'skipped') skipped++;
  }
  const relevant = tasks.length - skipped;
  return {
    total: tasks.length,
    done,
    skipped,
    pct: relevant > 0 ? Math.round((done / relevant) * 100) : 0,
  };
}

function groupBy<K>(tasks: Task[], key: (t: Task) => K): Map<K, Task[]> {
  const out = new Map<K, Task[]>();
  for (const t of tasks) {
    const k = key(t);
    const list = out.get(k);
    if (list) list.push(t);
    else out.set(k, [t]);
  }
  return out;
}

export function progressByWeek(tasks: Task[]): Map<number, Progress> {
  const out = new Map<number, Progress>();
  for (const [week, list] of groupBy(tasks, (t) => t.week_number)) {
    out.set(week, progress(list));
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]));
}

export function progressByWorkstream(tasks: Task[]): Map<Workstream, Progress> {
  const out = new Map<Workstream, Progress>();
  for (const [ws, list] of groupBy(tasks, (t) => t.workstream)) {
    out.set(ws, progress(list));
  }
  return out;
}

/**
 * Workstream yang tertinggal jauh di bawah rata-rata keseluruhan.
 *
 * `minTasks` menyaring kebisingan: workstream berisi 1 task yang belum
 * dikerjakan selalu 0% dan akan selamanya ditandai, padahal tidak berarti apa-apa.
 */
export function laggingWorkstreams(
  tasks: Task[],
  { thresholdPp = 20, minTasks = 3 }: { thresholdPp?: number; minTasks?: number } = {},
): Workstream[] {
  const overall = progress(tasks).pct;
  const out: Workstream[] = [];

  for (const [ws, p] of progressByWorkstream(tasks)) {
    if (p.total >= minTasks && overall - p.pct >= thresholdPp) out.push(ws);
  }
  return out.sort();
}

/**
 * Task yang selesai dalam rentang tanggal (inklusif), terbaru dulu.
 *
 * `completed_at` itu timestamptz, jadi harus dikonversi ke tanggal Jakarta
 * dulu — kalau dibandingkan mentah sebagai UTC, task yang dicentang jam 8
 * malam WIB akan tercatat di hari berikutnya.
 */
export function completedInRange(tasks: Task[], from: IsoDate, to: IsoDate): Task[] {
  return tasks
    .filter((t) => {
      if (t.status !== 'done' || !t.completed_at) return false;
      const d = jakartaDateOf(t.completed_at);
      return d >= from && d <= to;
    })
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
}

/** Satu hari dalam catatan riwayat, beserta task yang selesai di hari itu. */
export interface LogDay {
  date: IsoDate;
  tasks: Task[];
}

/**
 * Catatan "apa yang sudah aku kerjakan": task selesai, dikelompokkan per
 * tanggal penyelesaian di Asia/Jakarta, hari terbaru di atas.
 *
 * Dikelompokkan menurut `completed_at`, BUKAN `scheduled_date` — yang ingin
 * kamu ingat adalah kapan sesuatu benar-benar beres, bukan kapan ia semula
 * dijadwalkan. Task yang molor tiga hari muncul di hari kamu menyelesaikannya.
 *
 * `skipped` sengaja tidak masuk: ini catatan hasil kerja, bukan daftar semua
 * yang pernah hilang dari layar. Yang dilewati tetap bisa ditemukan di Timeline.
 */
export function completedLog(tasks: Task[], from?: IsoDate, to?: IsoDate): LogDay[] {
  const perHari = new Map<IsoDate, Task[]>();

  for (const t of tasks) {
    if (t.status !== 'done' || !t.completed_at) continue;
    const d = jakartaDateOf(t.completed_at);
    if (from && d < from) continue;
    if (to && d > to) continue;

    const list = perHari.get(d);
    if (list) list.push(t);
    else perHari.set(d, [t]);
  }

  return [...perHari]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      tasks: list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    }));
}

// --------------------------------------------------------- milestone -------

/** Milestone berikutnya yang belum tercapai, terdekat dulu. */
export function upcomingMilestones(
  milestones: Milestone[],
  today: IsoDate,
  limit = 3,
): Milestone[] {
  return milestones
    .filter((m) => m.status === 'pending' && m.target_date >= today)
    .sort((a, b) => a.target_date.localeCompare(b.target_date) || a.sort_order - b.sort_order)
    .slice(0, limit);
}

// ------------------------------------------------------------- misc --------

/** Total estimasi menit; task tanpa estimasi dihitung nol. */
export function totalMinutes(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0);
}

/**
 * Rentang tanggal satu minggu, diturunkan dari task-nya sendiri — bukan dari
 * batas minggu yang di-hardcode. Jadwalnya boleh digeser tanpa membuat label
 * "01–07 Sep" jadi bohong.
 */
export function weekRange(tasks: Task[], week: number): { from: IsoDate; to: IsoDate } | null {
  const dates = tasks.filter((t) => t.week_number === week).map((t) => t.scheduled_date);
  if (dates.length === 0) return null;
  return { from: dates.reduce((a, b) => (a < b ? a : b)), to: dates.reduce((a, b) => (a > b ? a : b)) };
}
