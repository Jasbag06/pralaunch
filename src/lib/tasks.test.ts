import { describe, expect, it } from 'vitest';
import {
  groupByWeek,
  slugKey,
  blockers,
  blocksCount,
  buildDashboard,
  byKey,
  completedLog,
  isBlocked,
  isOpen,
  laggingWorkstreams,
  progress,
  progressByWeek,
  progressByWorkstream,
  totalMinutes,
  upcomingMilestones,
  weekRange,
} from './tasks';
import type { Milestone, Task, TaskStatus, Workstream } from './types';

const TODAY = '2026-09-08';

let seq = 0;

function task(over: Partial<Task> & { key: string }): Task {
  seq += 1;
  return {
    id: `id-${seq}`,
    owner_id: 'owner',
    title: over.key,
    description: null,
    scheduled_date: TODAY,
    week_number: 2,
    workstream: 'Riset' as Workstream,
    priority: 'normal',
    is_deadline: false,
    milestone_id: null,
    status: 'todo' as TaskStatus,
    completed_at: null,
    depends_on: [],
    estimated_minutes: null,
    notes: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function milestone(over: Partial<Milestone> & { key: string }): Milestone {
  return {
    id: `m-${over.key}`,
    owner_id: 'owner',
    title: over.key,
    target_date: TODAY,
    week_number: 2,
    status: 'pending',
    achieved_at: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

describe('isOpen', () => {
  it('todo dan in_progress masih menuntut pekerjaan', () => {
    expect(isOpen(task({ key: 'a', status: 'todo' }))).toBe(true);
    expect(isOpen(task({ key: 'b', status: 'in_progress' }))).toBe(true);
  });

  it('done dan skipped tidak', () => {
    expect(isOpen(task({ key: 'c', status: 'done' }))).toBe(false);
    expect(isOpen(task({ key: 'd', status: 'skipped' }))).toBe(false);
  });
});

describe('blockers', () => {
  it('hanya dependensi yang belum beres yang memblokir', () => {
    const dep1 = task({ key: 'a', status: 'done' });
    const dep2 = task({ key: 'b', status: 'todo' });
    const t = task({ key: 'c', depends_on: ['a', 'b'] });
    const index = byKey([dep1, dep2, t]);

    expect(blockers(t, index).map((d) => d.key)).toEqual(['b']);
    expect(isBlocked(t, index)).toBe(true);
  });

  it('skipped dianggap beres, tidak memblokir', () => {
    const dep = task({ key: 'a', status: 'skipped' });
    const t = task({ key: 'b', depends_on: ['a'] });
    expect(isBlocked(t, byKey([dep, t]))).toBe(false);
  });

  it('key gantung diperlakukan beres, bukan pemblokir hantu', () => {
    const t = task({ key: 'b', depends_on: ['sudah-dihapus'] });
    expect(blockers(t, byKey([t]))).toEqual([]);
    expect(isBlocked(t, byKey([t]))).toBe(false);
  });

  it('tanpa dependensi berarti tidak terkunci', () => {
    const t = task({ key: 'a' });
    expect(isBlocked(t, byKey([t]))).toBe(false);
  });
});

describe('blocksCount', () => {
  it('menghitung task terbuka yang bergantung padanya', () => {
    const root = task({ key: 'root' });
    const all = [
      root,
      task({ key: 'x', depends_on: ['root'] }),
      task({ key: 'y', depends_on: ['root'] }),
      task({ key: 'z', depends_on: ['root'], status: 'done' }), // sudah selesai
      task({ key: 'w', depends_on: ['lain'] }),
    ];
    expect(blocksCount(root, all)).toBe(2);
  });

  it('task yang sudah beres tidak memblokir siapa pun', () => {
    const root = task({ key: 'root', status: 'done' });
    const all = [root, task({ key: 'x', depends_on: ['root'] })];
    expect(blocksCount(root, all)).toBe(0);
  });
});

describe('buildDashboard', () => {
  it('memisahkan overdue, hari ini, siap, dan terkunci', () => {
    const tasks = [
      task({ key: 'telat', scheduled_date: '2026-09-05' }),
      task({ key: 'hariini' }),
      task({ key: 'nanti', scheduled_date: '2026-09-12' }),
      task({ key: 'kunci', scheduled_date: '2026-09-14', depends_on: ['hariini'] }),
    ];
    const d = buildDashboard(tasks, TODAY);

    expect(d.overdue.map((t) => t.key)).toEqual(['telat']);
    expect(d.today.map((t) => t.key)).toEqual(['hariini']);
    expect(d.ready.map((t) => t.key)).toEqual(['nanti']);
    expect(d.locked.map((t) => t.key)).toEqual(['kunci']);
  });

  it('blok saling eksklusif — tidak ada task muncul dua kali', () => {
    const tasks = [
      task({ key: 'a', scheduled_date: '2026-09-01' }),
      task({ key: 'b' }),
      task({ key: 'c', scheduled_date: '2026-09-20', depends_on: ['b'] }),
      task({ key: 'd', scheduled_date: '2026-09-20' }),
      task({ key: 'e', status: 'done' }),
    ];
    const d = buildDashboard(tasks, TODAY);
    const semua = [...d.overdue, ...d.today, ...d.ready, ...d.locked].map((t) => t.key);

    expect(new Set(semua).size).toBe(semua.length);
  });

  it('task overdue tetap di blok overdue walau juga terkunci', () => {
    const tasks = [
      task({ key: 'dep' }),
      task({ key: 'telat', scheduled_date: '2026-09-01', depends_on: ['dep'] }),
    ];
    const d = buildDashboard(tasks, TODAY);

    expect(d.overdue.map((t) => t.key)).toEqual(['telat']);
    expect(d.locked).toEqual([]);
  });

  it('task hari ini yang masih terkunci masuk locked, bukan fokus hari ini', () => {
    const tasks = [
      task({ key: 'dep', status: 'todo' }),
      task({ key: 'kunci', depends_on: ['dep'] }),
    ];
    const d = buildDashboard(tasks, TODAY);

    expect(d.today.map((t) => t.key)).toEqual(['dep']);
    expect(d.locked.map((t) => t.key)).toEqual(['kunci']);
  });

  it('task selesai dan skipped tidak pernah jadi overdue', () => {
    const tasks = [
      task({ key: 'a', scheduled_date: '2026-09-01', status: 'done' }),
      task({ key: 'b', scheduled_date: '2026-09-01', status: 'skipped' }),
    ];
    expect(buildDashboard(tasks, TODAY).overdue).toEqual([]);
  });

  it('in_progress yang lewat tanggal tetap dihitung telat', () => {
    const tasks = [task({ key: 'a', scheduled_date: '2026-09-01', status: 'in_progress' })];
    expect(buildDashboard(tasks, TODAY).overdue.map((t) => t.key)).toEqual(['a']);
  });

  it('overdue diurutkan terlama dulu', () => {
    const tasks = [
      task({ key: 'baru', scheduled_date: '2026-09-07' }),
      task({ key: 'lama', scheduled_date: '2026-09-01' }),
    ];
    expect(buildDashboard(tasks, TODAY).overdue.map((t) => t.key)).toEqual(['lama', 'baru']);
  });

  it('fokus hari ini menaruh yang belum selesai di atas', () => {
    const tasks = [
      task({ key: 'sudah', status: 'done', sort_order: 0 }),
      task({ key: 'belum', status: 'todo', sort_order: 5 }),
    ];
    expect(buildDashboard(tasks, TODAY).today.map((t) => t.key)).toEqual(['belum', 'sudah']);
  });

  it('siap dikerjakan terbuka begitu dependensinya selesai', () => {
    const dep = task({ key: 'dep', status: 'todo' });
    const next = task({ key: 'next', scheduled_date: '2026-09-20', depends_on: ['dep'] });

    expect(buildDashboard([dep, next], TODAY).ready).toEqual([]);

    const depDone = { ...dep, status: 'done' as TaskStatus };
    expect(buildDashboard([depDone, next], TODAY).ready.map((t) => t.key)).toEqual(['next']);
  });

  it('daftar kosong tidak meledak', () => {
    expect(buildDashboard([], TODAY)).toEqual({
      overdue: [],
      today: [],
      ready: [],
      locked: [],
    });
  });
});

describe('progress', () => {
  it('menghitung persentase dasar', () => {
    const tasks = [
      task({ key: 'a', status: 'done' }),
      task({ key: 'b', status: 'done' }),
      task({ key: 'c', status: 'todo' }),
      task({ key: 'd', status: 'todo' }),
    ];
    expect(progress(tasks)).toEqual({ total: 4, done: 2, skipped: 0, pct: 50 });
  });

  it('skipped dikeluarkan dari penyebut, jadi 100% tetap mungkin', () => {
    const tasks = [
      task({ key: 'a', status: 'done' }),
      task({ key: 'b', status: 'skipped' }),
    ];
    expect(progress(tasks).pct).toBe(100);
  });

  it('nol task berarti 0%, bukan NaN', () => {
    expect(progress([]).pct).toBe(0);
  });

  it('semua skipped berarti 0%, bukan pembagian nol', () => {
    expect(progress([task({ key: 'a', status: 'skipped' })]).pct).toBe(0);
  });
});

describe('progressByWeek', () => {
  it('mengelompokkan dan mengurutkan berdasarkan nomor minggu', () => {
    const tasks = [
      task({ key: 'a', week_number: 3, status: 'done' }),
      task({ key: 'b', week_number: 1, status: 'done' }),
      task({ key: 'c', week_number: 1, status: 'todo' }),
    ];
    const byWeek = progressByWeek(tasks);

    expect([...byWeek.keys()]).toEqual([1, 3]);
    expect(byWeek.get(1)?.pct).toBe(50);
    expect(byWeek.get(3)?.pct).toBe(100);
  });
});

describe('progressByWorkstream & laggingWorkstreams', () => {
  it('menghitung per workstream', () => {
    const tasks = [
      task({ key: 'a', workstream: 'Legal', status: 'done' }),
      task({ key: 'b', workstream: 'Legal', status: 'todo' }),
    ];
    expect(progressByWorkstream(tasks).get('Legal')?.pct).toBe(50);
  });

  it('menandai workstream yang tertinggal jauh dari rata-rata', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) =>
        task({ key: `legal-${i}`, workstream: 'Legal', status: 'done' }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        task({ key: `brand-${i}`, workstream: 'Branding', status: 'todo' }),
      ),
    ];
    // keseluruhan 60%, Branding 0% -> selisih 60pp
    expect(laggingWorkstreams(tasks)).toEqual(['Branding']);
  });

  it('workstream terlalu kecil tidak ditandai — itu cuma kebisingan', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) =>
        task({ key: `legal-${i}`, workstream: 'Legal', status: 'done' }),
      ),
      task({ key: 'ads-0', workstream: 'Ads', status: 'todo' }),
    ];
    expect(laggingWorkstreams(tasks)).toEqual([]);
  });
});

describe('upcomingMilestones', () => {
  const list = [
    milestone({ key: 'jauh', target_date: '2026-10-06' }),
    milestone({ key: 'dekat', target_date: '2026-09-10' }),
    milestone({ key: 'tengah', target_date: '2026-09-15' }),
    milestone({ key: 'lewat', target_date: '2026-09-01' }),
    milestone({ key: 'tercapai', target_date: '2026-09-09', status: 'achieved' }),
  ];

  it('terdekat dulu, hanya yang pending dan belum lewat', () => {
    expect(upcomingMilestones(list, TODAY).map((m) => m.key)).toEqual([
      'dekat',
      'tengah',
      'jauh',
    ]);
  });

  it('menghormati limit', () => {
    expect(upcomingMilestones(list, TODAY, 1).map((m) => m.key)).toEqual(['dekat']);
  });

  it('milestone yang jatuh tepat hari ini masih ikut', () => {
    const m = [milestone({ key: 'now', target_date: TODAY })];
    expect(upcomingMilestones(m, TODAY).map((x) => x.key)).toEqual(['now']);
  });
});

describe('totalMinutes & weekRange', () => {
  it('menjumlahkan estimasi, null dihitung nol', () => {
    const tasks = [
      task({ key: 'a', estimated_minutes: 60 }),
      task({ key: 'b', estimated_minutes: 45 }),
      task({ key: 'c', estimated_minutes: null }),
    ];
    expect(totalMinutes(tasks)).toBe(105);
  });

  it('rentang minggu diturunkan dari task, bukan di-hardcode', () => {
    const tasks = [
      task({ key: 'a', week_number: 1, scheduled_date: '2026-09-03' }),
      task({ key: 'b', week_number: 1, scheduled_date: '2026-09-01' }),
      task({ key: 'c', week_number: 1, scheduled_date: '2026-09-07' }),
      task({ key: 'd', week_number: 2, scheduled_date: '2026-09-09' }),
    ];
    expect(weekRange(tasks, 1)).toEqual({ from: '2026-09-01', to: '2026-09-07' });
  });

  it('minggu tanpa task mengembalikan null', () => {
    expect(weekRange([], 4)).toBeNull();
  });
});

describe('groupByWeek', () => {
  const tasks = [
    task({ key: 'b', week_number: 1, scheduled_date: '2026-09-03', sort_order: 1 }),
    task({ key: 'a', week_number: 1, scheduled_date: '2026-09-01', sort_order: 2 }),
    task({ key: 'c', week_number: 1, scheduled_date: '2026-09-01', sort_order: 1 }),
    task({ key: 'd', week_number: 2, scheduled_date: '2026-09-09', status: 'done' }),
  ];
  const ms = [milestone({ key: 'nib', title: 'NIB terbit', target_date: '2026-09-03', week_number: 1 })];

  it('mengurutkan minggu lalu hari', () => {
    const weeks = groupByWeek(tasks, ms);
    expect(weeks.map((w) => w.week)).toEqual([1, 2]);
    expect(weeks[0].days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('mengurutkan task dalam satu hari lewat sort_order', () => {
    const hari = groupByWeek(tasks, ms)[0].days[0];
    expect(hari.tasks.map((t) => t.key)).toEqual(['c', 'a']);
  });

  it('menempelkan milestone ke harinya', () => {
    const weeks = groupByWeek(tasks, ms);
    expect(weeks[0].days[1].milestones.map((m) => m.key)).toEqual(['nib']);
    expect(weeks[0].days[0].milestones).toEqual([]);
  });

  it('rentang dan progres per minggu ikut dihitung', () => {
    const weeks = groupByWeek(tasks, ms);
    expect(weeks[0].from).toBe('2026-09-01');
    expect(weeks[0].to).toBe('2026-09-03');
    expect(weeks[1].progress.pct).toBe(100);
  });

  it('hari yang hanya berisi milestone tetap muncul', () => {
    const solo = [milestone({ key: 'x', title: 'X', target_date: '2026-09-20', week_number: 3 })];
    const weeks = groupByWeek([], solo);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].days[0].date).toBe('2026-09-20');
    expect(weeks[0].days[0].tasks).toEqual([]);
  });

  it('tanpa data menghasilkan daftar kosong', () => {
    expect(groupByWeek([], [])).toEqual([]);
  });
});

describe('slugKey', () => {
  it('membuat slug berprefiks minggu', () => {
    expect(slugKey('Riset 10 kompetitor di Shopee', 2)).toBe('w2-riset-10-kompetitor-di-shopee');
  });

  it('membuang tanda baca dan merapikan tanda hubung', () => {
    expect(slugKey('Kunci nama toko + cek — Shopee & IG!', 1)).toBe(
      'w1-kunci-nama-toko-cek-shopee-ig',
    );
  });

  it('mengubah huruf beraksen jadi huruf dasar, bukan memotongnya', () => {
    expect(slugKey('Café résumé', 3)).toBe('w3-cafe-resume');
  });

  it('menghindari tabrakan dengan key yang sudah ada', () => {
    const taken = ['w2-riset', 'w2-riset-2'];
    expect(slugKey('Riset', 2, taken)).toBe('w2-riset-3');
  });

  it('judul tanpa huruf/angka tetap menghasilkan key yang sah', () => {
    expect(slugKey('!!! ???', 4)).toBe('w4-task');
  });

  it('selalu lolos constraint slug di database', () => {
    const pola = /^[a-z0-9][a-z0-9._-]*$/;
    for (const judul of ['Riset 10 kompetitor', '—— ??', 'Café', 'A'.repeat(120)]) {
      expect(slugKey(judul, 5)).toMatch(pola);
    }
  });
});

describe('completedLog', () => {
  const t9 = task({ key: 'a', status: 'done', completed_at: '2026-09-09T03:00:00Z' });
  const t9b = task({ key: 'b', status: 'done', completed_at: '2026-09-09T08:00:00Z' });
  const t8 = task({ key: 'c', status: 'done', completed_at: '2026-09-08T02:00:00Z' });
  const belum = task({ key: 'd', status: 'todo' });
  const dilewati = task({ key: 'e', status: 'skipped' });
  const semua = [t8, t9, t9b, belum, dilewati];

  it('mengelompokkan per tanggal selesai, hari terbaru di atas', () => {
    const log = completedLog(semua);
    expect(log.map((d) => d.date)).toEqual(['2026-09-09', '2026-09-08']);
  });

  it('dalam satu hari, yang paling baru diselesaikan di atas', () => {
    const log = completedLog(semua);
    expect(log[0].tasks.map((t) => t.key)).toEqual(['b', 'a']);
  });

  it('hanya task done — todo dan skipped tidak ikut', () => {
    const keys = completedLog(semua).flatMap((d) => d.tasks.map((t) => t.key));
    expect(keys).toEqual(['b', 'a', 'c']);
  });

  it('mengelompokkan menurut completed_at, bukan scheduled_date', () => {
    // dijadwalkan 1 Sep tapi baru beres 9 Sep -> masuk hari 9 Sep
    const molor = task({
      key: 'molor',
      scheduled_date: '2026-09-01',
      status: 'done',
      completed_at: '2026-09-09T05:00:00Z',
    });
    const log = completedLog([molor]);
    expect(log[0].date).toBe('2026-09-09');
  });

  it('memakai tanggal Jakarta, bukan UTC', () => {
    // 2026-09-09T17:30Z = 10 Sep 00:30 WIB
    const malam = task({ key: 'malam', status: 'done', completed_at: '2026-09-09T17:30:00Z' });
    expect(completedLog([malam])[0].date).toBe('2026-09-10');
  });

  it('menghormati rentang tanggal', () => {
    const log = completedLog(semua, '2026-09-09', '2026-09-09');
    expect(log.map((d) => d.date)).toEqual(['2026-09-09']);
    expect(log[0].tasks).toHaveLength(2);
  });

  it('daftar kosong tidak meledak', () => {
    expect(completedLog([])).toEqual([]);
    expect(completedLog([belum])).toEqual([]);
  });
});
