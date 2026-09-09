import { useState } from 'react';
import { fmtRange, fmtShort, type IsoDate } from '../lib/date';
import { blockers, byKey, groupByWeek, isBlocked } from '../lib/tasks';
import type { Attachment, Milestone, Task } from '../lib/types';
import { TaskRow } from './TaskRow';

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function weekdayLabel(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return HARI_PENDEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const Caret = (
  <svg className="wkblk__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

interface Props {
  tasks: Task[];
  milestones: Milestone[];
  today: IsoDate;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onAddOn: (date: IsoDate, week: number) => void;
  attachments: Map<string, Attachment[]>;
  onOpenAttachment: (a: Attachment) => void;
}

export function Timeline({
  tasks,
  milestones,
  today,
  onToggle,
  onOpen,
  onAddOn,
  attachments,
  onOpenAttachment,
}: Props) {
  const weeks = groupByWeek(tasks, milestones);
  const index = byKey(tasks);

  // Minggu yang sedang berjalan terbuka; sisanya tertutup. Membuka semuanya
  // mengubur minggu ini di tengah gulungan panjang.
  //
  // Dicari lewat rentang tanggal minggu, bukan lewat "ada task tepat hari ini" —
  // begitu jadwal meleset sedikit, hari ini sering tidak punya task sama sekali
  // dan minggu yang terbuka jadi salah. Kalau hari ini di luar semua rentang
  // (belum mulai, atau sudah lewat), ambil minggu terdekat yang masih di depan.
  const currentWeek =
    weeks.find((w) => w.from <= today && today <= w.to)?.week ??
    weeks.find((w) => w.from > today)?.week ??
    weeks[weeks.length - 1]?.week;
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(currentWeek != null ? [currentWeek] : []),
  );

  const toggleWeek = (w: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });

  if (weeks.length === 0) {
    return (
      <div className="wrap">
        <div className="col col--main">
          <section className="sec">
            <p className="empty">Belum ada task. Jalankan seed atau tempel JSON lewat Impor.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="col col--main">
        {weeks.map((w) => {
          const expanded = open.has(w.week);
          return (
            <div className="wkblk" key={w.week}>
              <button
                type="button"
                className="wkblk__h"
                aria-expanded={expanded}
                onClick={() => toggleWeek(w.week)}
              >
                {Caret}
                <span className="wkblk__t">
                  Minggu {w.week}
                  <s>{w.from && fmtRange(w.from, w.to)}</s>
                </span>
                <span className="wkblk__r">
                  <span className={`meter${w.week === currentWeek ? '' : ' meter--q'}`}>
                    <i style={{ width: `${w.progress.pct}%` }} />
                  </span>
                  <span className="wkblk__n">
                    {w.progress.done}/{w.progress.total}
                  </span>
                </span>
              </button>

              {expanded && (
                <div className="wkblk__body">
                  {w.days.map((day) => {
                    const cls = [
                      'day',
                      day.date === today && 'day--today',
                      day.date < today && 'day--past',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <div className={cls} key={day.date}>
                        <div className="day__d">
                          {weekdayLabel(day.date)}
                          <b>{fmtShort(day.date)}</b>
                        </div>

                        <div className="day__b">
                          {day.milestones.map((m) => (
                            <div
                              className={`mstmark${m.status === 'achieved' ? ' mstmark--done' : ''}`}
                              key={m.id}
                            >
                              <span className="k">
                                {m.status === 'achieved' ? 'tercapai' : 'deadline'}
                              </span>
                              <span>{m.title}</span>
                            </div>
                          ))}

                          {day.tasks.length > 0 && (
                            <div className="tsks">
                              {day.tasks.map((t) => {
                                const locked =
                                  (t.status === 'todo' || t.status === 'in_progress') &&
                                  isBlocked(t, index);
                                return (
                                  <TaskRow
                                    key={t.id}
                                    task={t}
                                    variant={
                                      locked
                                        ? 'lock'
                                        : t.status === 'in_progress'
                                          ? 'now'
                                          : undefined
                                    }
                                    onToggle={locked ? undefined : onToggle}
                                    onOpen={onOpen}
                                    attachments={attachments.get(t.id)}
                                    onOpenAttachment={onOpenAttachment}
                                    blockedBy={locked ? blockers(t, index) : undefined}
                                    // Chip "Deadline" sudah menyampaikan itu;
                                    // kolom kanan dipakai untuk status saja.
                                    right={
                                      t.status === 'done'
                                        ? 'selesai'
                                        : t.status === 'skipped'
                                          ? 'dilewati'
                                          : t.status === 'in_progress'
                                            ? 'berjalan'
                                            : undefined
                                    }
                                  />
                                );
                              })}
                            </div>
                          )}

                          <button
                            type="button"
                            className="chipbtn"
                            style={{ marginTop: 6 }}
                            onClick={() => onAddOn(day.date, w.week)}
                          >
                            + Task di hari ini
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
