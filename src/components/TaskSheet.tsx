import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, fmtDayShort, nextWeekend, type IsoDate } from '../lib/date';
import { blockers, byKey, slugKey } from '../lib/tasks';
import { PRIORITIES, TASK_STATUSES, WORKSTREAMS } from '../lib/types';
import type { Priority, Task, TaskStatus, Workstream } from '../lib/types';
import type { NewTask, TaskPatch } from '../lib/tasksApi';
import type { Attachment } from '../lib/types';
import { Attachments } from './Attachments';

const LABEL_STATUS: Record<TaskStatus, string> = {
  todo: 'Belum',
  in_progress: 'Jalan',
  done: 'Selesai',
  skipped: 'Lewati',
};

const LABEL_PRIORITY: Record<Priority, string> = {
  critical: 'Kritis',
  normal: 'Normal',
  buffer: 'Buffer',
};

interface Props {
  /** null = mode buat task baru. */
  task: Task | null;
  allTasks: Task[];
  today: IsoDate;
  /** Tanggal awal untuk task baru — biasanya hari yang diklik di Timeline. */
  defaultDate?: IsoDate;
  defaultWeek?: number;
  onClose: () => void;
  onSave: (id: string, patch: TaskPatch) => Promise<void>;
  onCreate: (input: NewTask) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  attachments: Attachment[];
  onUpload: (taskId: string, file: File) => Promise<void>;
  onAddLink: (taskId: string, url: string, label: string) => Promise<void>;
  onAddPath: (taskId: string, path: string, label: string) => Promise<void>;
  onRemoveAttachment: (a: Attachment) => Promise<void>;
  onOpenAttachment: (a: Attachment) => void;
}

export function TaskSheet({
  task,
  allTasks,
  today,
  defaultDate,
  defaultWeek,
  onClose,
  onSave,
  onCreate,
  onDelete,
  attachments,
  onUpload,
  onAddLink,
  onAddPath,
  onRemoveAttachment,
  onOpenAttachment,
}: Props) {
  const isNew = task === null;

  const [title, setTitle] = useState(task?.title ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [date, setDate] = useState<IsoDate>(task?.scheduled_date ?? defaultDate ?? today);
  const [week, setWeek] = useState(task?.week_number ?? defaultWeek ?? 1);
  const [workstream, setWorkstream] = useState<Workstream>(task?.workstream ?? 'Legal');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [minutes, setMinutes] = useState(
    task?.estimated_minutes != null ? String(task.estimated_minutes) : '',
  );
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [isDeadline, setIsDeadline] = useState(task?.is_deadline ?? false);

  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  // Escape menutup panel — jalan pintas yang diharapkan dari dialog apa pun.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const menunggu = useMemo(
    () => (task ? blockers(task, byKey(allTasks)) : []),
    [task, allTasks],
  );

  async function submit() {
    if (!title.trim()) {
      setError('Judul tidak boleh kosong.');
      return;
    }
    setBusy(true);
    setError(null);

    const est = minutes.trim() === '' ? null : Number(minutes);
    if (est != null && (!Number.isFinite(est) || est <= 0)) {
      setError('Estimasi harus angka menit lebih dari 0.');
      setBusy(false);
      return;
    }

    const common = {
      title: title.trim(),
      scheduled_date: date,
      week_number: week,
      workstream,
      priority,
      status,
      is_deadline: isDeadline,
      estimated_minutes: est,
      notes: notes.trim() === '' ? null : notes.trim(),
    };

    try {
      if (isNew) {
        await onCreate({
          ...common,
          key: slugKey(common.title, week, allTasks.map((t) => t.key)),
        });
      } else {
        await onSave(task.id, common);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function hapus() {
    if (!task) return;
    setBusy(true);
    try {
      await onDelete(task);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const besok = addDays(today, 1);
  const weekend = nextWeekend(today);

  return (
    <div
      className="sheet-bd"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={isNew ? 'Task baru' : title}>
        <div className="sheet__h">
          <h2>{isNew ? 'Task baru' : 'Detail task'}</h2>
          <button type="button" className="iconbtn x" onClick={onClose} aria-label="Tutup">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="sheet__body">
          <label className="field">
            <span className="field__k">Judul</span>
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <div className="field">
            <span className="field__k">Status</span>
            <div className="seg">
              {TASK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                >
                  {LABEL_STATUS[s]}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__k">Tanggal</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {/* Geser cepat — realistis jadwal akan sering meleset. */}
          <div className="quick">
            <button type="button" className="chipbtn" onClick={() => setDate(besok)}>
              Besok <b>{fmtDayShort(besok).slice(0, 8)}</b>
            </button>
            <button type="button" className="chipbtn" onClick={() => setDate(weekend)}>
              Weekend <b>{fmtDayShort(weekend).slice(0, 8)}</b>
            </button>
            <button type="button" className="chipbtn" onClick={() => setDate(addDays(date, 7))}>
              +7 hari
            </button>
          </div>

          <div className="field2" style={{ marginTop: 12 }}>
            <label className="field">
              <span className="field__k">Minggu</span>
              <select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((w) => (
                  <option key={w} value={w}>
                    Minggu {w}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--num">
              <span className="field__k">Estimasi (menit)</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="—"
              />
            </label>
          </div>

          <div className="field2">
            <label className="field">
              <span className="field__k">Workstream</span>
              <select
                value={workstream}
                onChange={(e) => setWorkstream(e.target.value as Workstream)}
              >
                {WORKSTREAMS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__k">Prioritas</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {LABEL_PRIORITY[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={isDeadline}
              onChange={(e) => setIsDeadline(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span className="field__k" style={{ margin: 0 }}>
              Milestone deadline kritis
            </span>
          </label>

          <label className="field">
            <span className="field__k">Catatan</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan bebas saat mengerjakan…"
            />
          </label>

          <Attachments
            taskId={task?.id ?? null}
            items={attachments}
            onUpload={(f) => onUpload(task!.id, f)}
            onAddLink={(u, l) => onAddLink(task!.id, u, l)}
            onAddPath={(p, l) => onAddPath(task!.id, p, l)}
            onRemove={onRemoveAttachment}
            onOpen={onOpenAttachment}
          />

          {menunggu.length > 0 && (
            <p className="deps">
              Menunggu{' '}
              {menunggu.map((b, i) => (
                <span key={b.key}>
                  {i > 0 && (i === menunggu.length - 1 ? ' dan ' : ', ')}
                  <b>{b.title}</b>
                </span>
              ))}
              .
            </p>
          )}

          {!isNew && (
            <p className="deps">
              Key <b>{task.key}</b>
            </p>
          )}

          {error && <div className="formerr">{error}</div>}
        </div>

        <div className="sheet__foot">
          {!isNew &&
            (confirmDelete ? (
              <button type="button" className="btn btn--danger" disabled={busy} onClick={hapus}>
                Yakin hapus?
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Hapus
              </button>
            ))}
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn" disabled={busy} onClick={submit}>
            {busy ? 'Menyimpan…' : isNew ? 'Tambah' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
