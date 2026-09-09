import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { ensureSettings, updateSettings } from './lib/settings';
import { ensureServiceWorker, resubscribeIfNeeded } from './lib/push';
import {
  applyImport,
  createTask,
  deleteTask,
  fetchAll,
  setStatus,
  updateTask,
  type NewTask,
  type TaskPatch,
} from './lib/tasksApi';
import type { ImportPlan } from './lib/importer';
import { Login } from './components/Login';
import { Shell } from './components/Shell';
import { Dashboard } from './components/Dashboard';
import { Timeline } from './components/Timeline';
import { TaskSheet } from './components/TaskSheet';
import { ImportPage } from './components/ImportPage';
import { ExportPage } from './components/ExportPage';
import { ProgressPage } from './components/ProgressPage';
import { SettingsPage } from './components/SettingsPage';
import { fmtDayShort, fmtFull, todayJakarta } from './lib/date';
import { buildDashboard, progress } from './lib/tasks';
import type { AppSettings, Attachment, Milestone, Task } from './lib/types';
import {
  addLink,
  addPath,
  fetchAttachments,
  openAttachment,
  removeAttachment,
  splitPath,
  uploadFile,
} from './lib/attachments';

/**
 * Pratinjau tampilan dengan data contoh, tanpa login. Hanya ada di dev.
 * Semua perubahan cuma di memori — tidak ada yang menyentuh database.
 * `#/preview` membuka Dasbor, `#/preview-timeline` membuka Timeline.
 */
type PreviewView = 'dashboard' | 'timeline' | 'progres' | 'impor' | 'ekspor' | 'pengaturan';

function DevPreview({ view }: { view: PreviewView }) {
  const [data, setData] = useState<{
    tasks: Task[];
    milestones: Milestone[];
    settings: AppSettings;
    today: string;
  } | null>(null);
  const [sheet, setSheet] = useState<{ task: Task | null; date?: string; week?: number } | null>(
    null,
  );
  const [atts, setAtts] = useState<Map<string, Attachment[]>>(new Map());

  useEffect(() => {
    // Dinamis supaya fixture tidak ikut ke bundle produksi.
    import('./dev/fixtures').then((f) =>
      setData({
        tasks: f.fixtureTasks,
        milestones: f.fixtureMilestones,
        settings: f.fixtureSettings,
        today: f.fixtureToday,
      }),
    );
    import('./dev/fixtures').then((f) => setAtts(f.fixtureAttachments));
  }, []);

  if (!data) return <div className="splash">Memuat pratinjau…</div>;

  const { tasks, milestones, settings, today } = data;
  const buckets = buildDashboard(tasks, today);
  const setTasks = (next: Task[]) => setData({ ...data, tasks: next });

  // Di pratinjau tidak ada Storage; link tetap dibuka sungguhan.
  const previewOpen = (a: Attachment) => {
    if (a.kind === 'link' && a.url) window.open(a.url, '_blank', 'noopener,noreferrer');
  };

  const onToggle = (t: Task) =>
    setTasks(
      tasks.map((x) =>
        x.id === t.id ? { ...x, status: x.status === 'done' ? 'todo' : 'done' } : x,
      ),
    );

  return (
    <Shell
      today={today}
      route={view === 'dashboard' ? '#/' : `#/${view}`}
      email="pratinjau — data contoh"
      overdueCount={buckets.overdue.length}
      totalTasks={tasks.length}
      progressPct={progress(tasks).pct}
      arrivalLabel={settings.target_arrival_date ? fmtDayShort(settings.target_arrival_date) : null}
      reminderHour={settings.reminder_hour}
      title={
        { dashboard: 'Hari ini', timeline: 'Timeline', progres: 'Progres',
          impor: 'Impor JSON', ekspor: 'Ekspor JSON', pengaturan: 'Pengaturan' }[view]
      }
      subtitle={
        view === 'dashboard' ? fmtFull(today) : `${tasks.length} task contoh`
      }
      onNewTask={() => setSheet({ task: null })}
    >
      {view === 'progres' && (
        <ProgressPage tasks={tasks} milestones={milestones} today={today} />
      )}

      {view === 'ekspor' && <ExportPage tasks={tasks} />}

      {view === 'pengaturan' && (
        <SettingsPage
          settings={settings}
          email="pratinjau@contoh.id"
          onSave={async (patch) => setData({ ...data, settings: { ...settings, ...patch } })}
        />
      )}

      {view === 'impor' && (
        <ImportPage
          tasks={tasks}
          attachments={atts}
          onApply={async () => {
            throw new Error('Impor tidak diterapkan di pratinjau — butuh login.');
          }}
        />
      )}

      {view === 'timeline' ? (
        <Timeline
          tasks={tasks}
          milestones={milestones}
          today={today}
          onToggle={onToggle}
          onOpen={(t) => setSheet({ task: t })}
          onAddOn={(date, week) => setSheet({ task: null, date, week })}
          attachments={atts}
          onOpenAttachment={previewOpen}
        />
      ) : view === 'dashboard' ? (
        <Dashboard
          tasks={tasks}
          milestones={milestones}
          settings={settings}
          today={today}
          onToggle={onToggle}
          onOpen={(t) => setSheet({ task: t })}
          attachments={atts}
          onOpenAttachment={previewOpen}
        />
      ) : null}

      {sheet && (
        <TaskSheet
          key={sheet.task?.id ?? 'baru'}
          task={sheet.task}
          allTasks={tasks}
          today={today}
          defaultDate={sheet.date}
          defaultWeek={sheet.week}
          onClose={() => setSheet(null)}
          onSave={async (id, patch) => {
            setTasks(tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)));
          }}
          onCreate={async (input) => {
            setTasks([
              ...tasks,
              {
                ...tasks[0],
                ...input,
                id: `fx-baru-${Date.now()}`,
                depends_on: [],
                completed_at: null,
              } as Task,
            ]);
          }}
          onDelete={async (t) => {
            setTasks(
              tasks
                .filter((x) => x.id !== t.id)
                // meniru trigger prune_depends_on di database
                .map((x) => ({ ...x, depends_on: x.depends_on.filter((k) => k !== t.key) })),
            );
          }}
          attachments={sheet.task ? (atts.get(sheet.task.id) ?? []) : []}
          onUpload={async () => {
            throw new Error('Upload tidak aktif di pratinjau — butuh login.');
          }}
          onAddLink={async (taskId, url, label) => {
            const next = new Map(atts);
            next.set(taskId, [
              ...(next.get(taskId) ?? []),
              {
                id: `att-${Date.now()}`,
                owner_id: 'preview',
                task_id: taskId,
                kind: 'link',
                label: label || url,
                storage_path: null,
                mime_type: null,
                size_bytes: null,
                url,
                local_path: null,
                sort_order: 0,
                created_at: '',
              },
            ]);
            setAtts(next);
          }}
          onAddPath={async (taskId, path) => {
            const next = new Map(atts);
            next.set(taskId, [
              ...(next.get(taskId) ?? []),
              {
                id: `att-${Date.now()}`,
                owner_id: 'preview',
                task_id: taskId,
                kind: 'path',
                label: splitPath(path).name,
                storage_path: null,
                mime_type: null,
                size_bytes: null,
                url: null,
                local_path: path,
                sort_order: 0,
                created_at: '',
              },
            ]);
            setAtts(next);
          }}
          onRemoveAttachment={async (a) => {
            const next = new Map(atts);
            next.set(a.task_id, (next.get(a.task_id) ?? []).filter((x) => x.id !== a.id));
            setAtts(next);
          }}
          onOpenAttachment={previewOpen}
        />
      )}
    </Shell>
  );
}

/** Judul halaman per rute. Yang belum dibangun tetap punya nama supaya
 *  navigasinya tidak terasa buntu. */
const JUDUL: Record<string, string> = {
  '#/': 'Hari ini',
  '#/timeline': 'Timeline',
  '#/progres': 'Progres',
  '#/impor': 'Impor JSON',
  '#/ekspor': 'Ekspor JSON',
  '#/pengaturan': 'Pengaturan',
};

/** Routing berbasis hash: GitHub Pages tidak punya rewrite server, jadi
 *  refresh di path biasa akan 404. Hash menghindarinya tanpa trik 404.html. */
function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return route === '#' ? '#/' : route;
}

export function App() {
  const route = useHashRoute();

  // Service worker didaftarkan lebih awal dan terpisah dari izin notifikasi —
  // app shell tetap bisa di-cache walau push tidak pernah dinyalakan.
  useEffect(() => {
    void ensureServiceWorker();
  }, []);
  const PREVIEW: Record<string, PreviewView> = {
    '#/preview': 'dashboard',
    '#/preview-timeline': 'timeline',
    '#/preview-progres': 'progres',
    '#/preview-impor': 'impor',
    '#/preview-ekspor': 'ekspor',
    '#/preview-pengaturan': 'pengaturan',
  };
  const preview = import.meta.env.DEV ? (PREVIEW[route] ?? null) : null;
  const isPreview = preview !== null;

  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [attachments, setAttachments] = useState<Map<string, Attachment[]>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Satu kali per render pass. Tidak dipanggil berulang supaya tidak ada
  // kemungkinan dua bagian layar memakai "hari ini" yang berbeda saat
  // aplikasi kebetulan terbuka melewati tengah malam.
  const today = todayJakarta();

  useEffect(() => {
    if (isPreview) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setSettings(null);
        setTasks([]);
        setMilestones([]);
        setAttachments(new Map());
        setLoaded(false);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [isPreview]);

  const load = useCallback(async (ownerId: string) => {
    const [s, all, att] = await Promise.all([
      ensureSettings(ownerId),
      fetchAll(),
      fetchAttachments(),
    ]);
    setSettings(s);
    setTasks(all.tasks);
    setMilestones(all.milestones);
    setAttachments(att);
    setLoaded(true);
  }, []);

  // iOS bisa membuang langganan push diam-diam. Izin tetap 'granted' tapi
  // notifikasi berhenti tanpa tanda apa pun — jadi diperiksa tiap app dibuka.
  useEffect(() => {
    if (!session || isPreview) return;
    void resubscribeIfNeeded();
  }, [session, isPreview]);

  useEffect(() => {
    if (!session) return;
    let alive = true;

    load(session.user.id).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      alive = false;
    };
  }, [session, load]);

  // Ganti Realtime: begitu app dibuka lagi (balik dari app lain, layar nyala),
  // data disegarkan. Untuk satu user di satu-dua perangkat ini cukup, dan tidak
  // menambah websocket beserta penanganan reconnect-nya.
  useEffect(() => {
    if (!session || isPreview) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        Promise.all([fetchAll(), fetchAttachments()])
          .then(([all, att]) => {
            setTasks(all.tasks);
            setMilestones(all.milestones);
            setAttachments(att);
          })
          .catch(() => {
            /* biarkan data lama tampil; pemuatan berikutnya akan mencoba lagi */
          });
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session, isPreview]);

  // null = tertutup; { task: null } = mode buat baru.
  const [sheet, setSheet] = useState<{
    task: Task | null;
    date?: string;
    week?: number;
  } | null>(null);

  const refetch = useCallback(async () => {
    const [all, att] = await Promise.all([fetchAll(), fetchAttachments()]);
    setTasks(all.tasks);
    setMilestones(all.milestones);
    setAttachments(att);
  }, []);

  const onUpload = useCallback(
    async (taskId: string, file: File) => {
      if (!session) return;
      await uploadFile(session.user.id, taskId, file);
      setAttachments(await fetchAttachments());
    },
    [session],
  );

  const onAddLink = useCallback(async (taskId: string, url: string, label: string) => {
    await addLink(taskId, url, label);
    setAttachments(await fetchAttachments());
  }, []);

  const onAddPath = useCallback(async (taskId: string, path: string, label: string) => {
    await addPath(taskId, path, label);
    setAttachments(await fetchAttachments());
  }, []);

  const onRemoveAttachment = useCallback(async (a: Attachment) => {
    await removeAttachment(a);
    setAttachments(await fetchAttachments());
  }, []);

  /** Centang optimistik: UI berubah dulu, dikembalikan kalau server menolak. */
  const onToggle = useCallback(async (task: Task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));

    try {
      const saved = await setStatus(task.id, next);
      setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }, []);

  const onApplyImport = useCallback(
    async (plan: ImportPlan) => {
      if (!session) return;
      await applyImport(session.user.id, plan);
      // Impor bisa menghapus task dan trigger prune_depends_on ikut mengubah
      // baris lain, jadi muat ulang semuanya alih-alih menebak state baru.
      await refetch();
    },
    [session, refetch],
  );

  const onSaveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!session) return;
      setSettings(await updateSettings(session.user.id, patch));
    },
    [session],
  );

  const onSave = useCallback(async (id: string, patch: TaskPatch) => {
    const saved = await updateTask(id, patch);
    setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
  }, []);

  const onCreate = useCallback(async (input: NewTask) => {
    const created = await createTask(input);
    setTasks((prev) => [...prev, created]);
  }, []);

  /**
   * Hapus lalu muat ulang, bukan sekadar buang dari state.
   * Trigger prune_depends_on di database ikut mengubah baris LAIN — mencabut
   * key yang dihapus dari depends_on mereka — jadi salinan lokal task lain
   * sudah basi begitu penghapusan berhasil.
   */
  const onDelete = useCallback(
    async (task: Task) => {
      await deleteTask(task.id);
      await refetch();
    },
    [refetch],
  );

  if (preview) return <DevPreview view={preview} />;

  if (!ready) return <div className="splash">Memuat…</div>;
  if (!session) return <Login />;

  if (error) {
    return (
      <div className="auth">
        <div className="fatal">
          <h2>Gagal memuat data</h2>
          <p>
            Biasanya ini berarti migrasi database belum dijalankan, atau RLS menolak
            akses. Jalankan <code>supabase/migrations/0001_init.sql</code> dan{' '}
            <code>0002_rls.sql</code> di SQL editor.
          </p>
          <p>
            <code>{error}</code>
          </p>
        </div>
      </div>
    );
  }

  if (!settings || !loaded) return <div className="splash">Memuat data…</div>;

  const buckets = buildDashboard(tasks, today);
  const judul = JUDUL[route] ?? 'Tidak ditemukan';

  return (
    <Shell
      today={today}
      route={route}
      email={session.user.email ?? ''}
      overdueCount={buckets.overdue.length}
      totalTasks={tasks.length}
      progressPct={progress(tasks).pct}
      arrivalLabel={settings.target_arrival_date ? fmtDayShort(settings.target_arrival_date) : null}
      reminderHour={settings.reminder_hour}
      title={judul}
      subtitle={
        route === '#/'
          ? fmtFull(today)
          : route === '#/timeline'
            ? `${tasks.length} task · ${milestones.length} milestone`
            : route === '#/progres'
              ? `${progress(tasks).pct}% selesai`
              : route === '#/impor'
                ? 'Tempel JSON dari chat, lihat dampaknya, baru terapkan'
                : route === '#/ekspor'
                  ? 'Salin seluruh task untuk dibawa ke chat'
                  : route === '#/pengaturan'
                    ? 'Jadwal, pengingat, dan notifikasi'
                    : 'Belum dibangun'
      }
      onNewTask={() => setSheet({ task: null })}
      onSettings={() => { window.location.hash = '#/pengaturan'; }}
    >
      {route === '#/' && (
        <Dashboard
          tasks={tasks}
          milestones={milestones}
          settings={settings}
          today={today}
          onToggle={onToggle}
          onOpen={(t) => setSheet({ task: t })}
          attachments={attachments}
          onOpenAttachment={openAttachment}
        />
      )}

      {route === '#/timeline' && (
        <Timeline
          tasks={tasks}
          milestones={milestones}
          today={today}
          onToggle={onToggle}
          onOpen={(t) => setSheet({ task: t })}
          onAddOn={(date, week) => setSheet({ task: null, date, week })}
          attachments={attachments}
          onOpenAttachment={openAttachment}
        />
      )}

      {route === '#/progres' && (
        <ProgressPage tasks={tasks} milestones={milestones} today={today} />
      )}

      {route === '#/impor' && (
        <ImportPage tasks={tasks} attachments={attachments} onApply={onApplyImport} />
      )}

      {route === '#/ekspor' && <ExportPage tasks={tasks} />}

      {route === '#/pengaturan' && (
        <SettingsPage
          settings={settings}
          email={session.user.email ?? ''}
          onSave={onSaveSettings}
        />
      )}

      {!['#/', '#/timeline', '#/progres', '#/impor', '#/ekspor', '#/pengaturan'].includes(route) && (
        <div className="wrap">
          <div className="col col--main">
            <section className="sec">
              <p className="empty">
                Halaman ini menyusul di tahap berikutnya.{' '}
                <a href="#/">Kembali ke Hari ini</a>.
              </p>
            </section>
          </div>
        </div>
      )}

      {sheet && (
        <TaskSheet
          key={sheet.task?.id ?? 'baru'}
          task={sheet.task}
          allTasks={tasks}
          today={today}
          defaultDate={sheet.date}
          defaultWeek={sheet.week}
          onClose={() => setSheet(null)}
          onSave={onSave}
          onCreate={onCreate}
          onDelete={onDelete}
          attachments={sheet.task ? (attachments.get(sheet.task.id) ?? []) : []}
          onUpload={onUpload}
          onAddLink={onAddLink}
          onAddPath={onAddPath}
          onRemoveAttachment={onRemoveAttachment}
          onOpenAttachment={openAttachment}
        />
      )}
    </Shell>
  );
}
