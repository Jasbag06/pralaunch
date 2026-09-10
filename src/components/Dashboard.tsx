import { useMemo } from 'react';
import {
  addDays,
  daysBetween,
  fmtDayShort,
  fmtDuration,
  fmtFull,
  fmtRange,
  fmtShort,
  jakartaDateOf,
  type IsoDate,
} from '../lib/date';
import {
  blockers,
  blocksCount,
  buildDashboard,
  byKey,
  isOpen,
  laggingWorkstreams,
  progress,
  progressByWeek,
  savedResults,
  totalMinutes,
  upcomingMilestones,
  weekRange,
} from '../lib/tasks';
import type { AppSettings, Attachment, Milestone, Task } from '../lib/types';
import { TaskRow } from './TaskRow';

interface Props {
  tasks: Task[];
  milestones: Milestone[];
  settings: AppSettings;
  today: IsoDate;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  attachments: Map<string, Attachment[]>;
  onOpenAttachment: (a: Attachment) => void;
}

/** Milestone < 3 hari merah, < 10 hari oranye. */
function milestoneVariant(days: number): string {
  if (days <= 3) return ' mst--soon';
  if (days <= 10) return ' mst--near';
  return '';
}

export function Dashboard({
  tasks,
  milestones,
  settings,
  today,
  onToggle,
  onOpen,
  attachments,
  onOpenAttachment,
}: Props) {
  const view = useMemo(() => {
    const buckets = buildDashboard(tasks, today);
    const index = byKey(tasks);
    return {
      ...buckets,
      index,
      overall: progress(tasks),
      byWeek: progressByWeek(tasks),
      lagging: laggingWorkstreams(tasks),
      upcoming: upcomingMilestones(milestones, today),
    };
  }, [tasks, milestones, today]);

  // Hasil kerja yang tersimpan: task selesai yang punya lampiran, supaya
  // berkasnya bisa ditemukan lagi tanpa menggali Timeline atau Progres.
  const hasil = useMemo(() => {
    const punya = new Set(
      [...attachments].filter(([, list]) => list.length > 0).map(([id]) => id),
    );
    return {
      teratas: savedResults(tasks, punya),
      total: tasks.filter((t) => t.status === 'done' && punya.has(t.id)).length,
      adaSelesai: tasks.some((t) => t.status === 'done'),
    };
  }, [tasks, attachments]);

  const { overdue, today: fokus, ready, locked, index, overall, byWeek, lagging, upcoming } = view;

  const arrival = settings.target_arrival_date;
  const daysToArrival = arrival ? daysBetween(today, arrival) : null;

  const fokusDone = fokus.filter((t) => !isOpen(t)).length;
  const fokusMinutes = totalMinutes(fokus.filter(isOpen));
  const currentWeek = fokus[0]?.week_number ?? overdue[0]?.week_number ?? null;

  // Berapa task lain yang tertahan oleh yang telat — ini yang membuat "telat"
  // terasa mendesak, bukan sekadar tanggalnya lewat.
  const overdueBlocks = useMemo(
    () => overdue.reduce((sum, t) => sum + blocksCount(t, tasks), 0),
    [overdue, tasks],
  );

  if (tasks.length === 0) {
    return (
      <div className="wrap">
        <div className="col col--main">
          <section className="sec">
            <div className="sec__head">
              <h2>Belum ada task</h2>
            </div>
            <p className="empty">
              Jadwal 30 hari belum dimuat. Jalankan seed dari file jadwal, atau tempel
              JSON lewat halaman Impor.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="col col--main">
        {/* -------- COUNTDOWN + PROGRES -------- */}
        <section className="sec">
          <div className="head2">
            <div>
              {daysToArrival != null && arrival ? (
                <>
                  <div className="herorow">
                    <span className="hero">
                      {Math.max(daysToArrival, 0)}
                      <span className="u">{daysToArrival >= 0 ? 'hari lagi' : 'hari lalu'}</span>
                    </span>
                    {daysToArrival >= 0 && (
                      <span className="pill pill--out">
                        {Math.ceil(daysToArrival / 7)} minggu
                      </span>
                    )}
                  </div>
                  <div className="herosub">Barang tiba di gudang · {fmtFull(arrival)}</div>
                </>
              ) : (
                <>
                  <div className="herorow">
                    <span className="hero">
                      —<span className="u">hari</span>
                    </span>
                  </div>
                  <div className="herosub">
                    Tanggal barang tiba belum diisi — atur di Pengaturan.
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="meter">
                <i style={{ width: `${overall.pct}%` }} />
              </div>
              <div className="progline">
                <span className="v">{overall.pct}%</span>
                <span className="s">
                  {overall.done} dari {overall.total} task selesai
                  {overall.skipped > 0 && ` · ${overall.skipped} dilewati`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* -------- TELAT — hilang total kalau kosong -------- */}
        {overdue.length > 0 && (
          <section className="sec">
            <div className="sec__head">
              <h2>Telat</h2>
              <span className="count count--alert">{overdue.length} task</span>
              {overdueBlocks > 0 && (
                <span className="sec__note">memblokir {overdueBlocks} task lain</span>
              )}
            </div>

            <div className="overdue">
              <div className="tsks">
                {overdue.map((t) => {
                  const late = daysBetween(t.scheduled_date, today);
                  return (
                    <TaskRow
                      key={t.id}
                      task={t}
                      variant="crit"
                      blocks={blocksCount(t, tasks)}
                      onToggle={onToggle}
                      onOpen={onOpen}
                      attachments={attachments.get(t.id)}
                      onOpenAttachment={onOpenAttachment}
                      right={
                        <>
                          telat {late} hari
                          <br />
                          {fmtShort(t.scheduled_date)}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* -------- FOKUS HARI INI -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Fokus hari ini</h2>
            <span className="count count--accent">
              {fokusDone} / {fokus.length}
            </span>
            {fokusMinutes > 0 && (
              <span className="sec__note">est. {fmtDuration(fokusMinutes)}</span>
            )}
          </div>

          {fokus.length === 0 ? (
            <p className="empty">
              Tidak ada yang dijadwalkan hari ini. Ambil dari “Siap dikerjakan” kalau
              masih ada waktu.
            </p>
          ) : (
            <div className="tsks">
              {fokus.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  variant={t.status === 'in_progress' ? 'now' : undefined}
                  onToggle={onToggle}
                  onOpen={onOpen}
                      attachments={attachments.get(t.id)}
                      onOpenAttachment={onOpenAttachment}
                  right={
                    t.status === 'in_progress'
                      ? 'berjalan'
                      : t.status === 'done'
                        ? 'selesai'
                        : t.status === 'skipped'
                          ? 'dilewati'
                          : t.priority === 'buffer'
                            ? 'boleh geser'
                            : 'hari ini'
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* -------- SIAP DIKERJAKAN -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Siap dikerjakan</h2>
            <span className="count">{ready.length} task</span>
            <span className="sec__note">dependensi sudah beres</span>
          </div>

          {ready.length === 0 ? (
            <p className="empty">
              Belum ada task masa depan yang bisa dicicil — semuanya masih menunggu
              sesuatu.
            </p>
          ) : (
            <div className="tsks">
              {ready.slice(0, 6).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={onToggle}
                  onOpen={onOpen}
                      attachments={attachments.get(t.id)}
                      onOpenAttachment={onOpenAttachment}
                  right={fmtShort(t.scheduled_date)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ==================== RAIL KANAN ==================== */}
      <div className="col col--rail">
        {/* -------- TERKUNCI -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Terkunci</h2>
            <span className="count">{locked.length} task</span>
          </div>

          {locked.length === 0 ? (
            <p className="empty">Tidak ada yang tertahan dependensi.</p>
          ) : (
            <div className="tsks">
              {locked.slice(0, 6).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  variant="lock"
                  onOpen={onOpen}
                      attachments={attachments.get(t.id)}
                      onOpenAttachment={onOpenAttachment}
                  blockedBy={blockers(t, index)}
                  right={fmtShort(t.scheduled_date)}
                />
              ))}
            </div>
          )}
        </section>

        {/* -------- HASIL TERSIMPAN -------- */}
        {(hasil.total > 0 || hasil.adaSelesai) && (
          <section className="sec">
            <div className="sec__head">
              <h2>Hasil tersimpan</h2>
              {hasil.total > 0 && <span className="count">{hasil.total} task</span>}
            </div>

            {hasil.total === 0 ? (
              <p className="empty">
                Belum ada hasil yang dilampirkan. Buka task yang sudah selesai, lalu
                simpan file, link Drive, atau catatan lokasinya — nanti muncul di sini.
              </p>
            ) : (
              <>
                <div className="tsks">
                  {hasil.teratas.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onOpen={onOpen}
                      attachments={attachments.get(t.id)}
                      onOpenAttachment={onOpenAttachment}
                      right={
                        t.completed_at ? fmtShort(jakartaDateOf(t.completed_at)) : undefined
                      }
                    />
                  ))}
                </div>
                {hasil.total > hasil.teratas.length && (
                  <p className="attnote">
                    <a href="#/progres">
                      Lihat semua {hasil.total} hasil di Progres
                    </a>
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {/* -------- DEADLINE TERDEKAT -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Deadline terdekat</h2>
            <span className="count">
              {upcoming.length} dari {milestones.length}
            </span>
          </div>

          {upcoming.length === 0 ? (
            <p className="empty">Tidak ada milestone yang menunggu.</p>
          ) : (
            upcoming.map((m) => {
              const days = daysBetween(today, m.target_date);
              return (
                <div className={`mst${milestoneVariant(days)}`} key={m.id}>
                  <span className="mst__k">
                    {m.title}
                    <span className="s">{fmtDayShort(m.target_date)}</span>
                  </span>
                  <span className="mst__v">
                    {days}
                    <span className="s">hari</span>
                  </span>
                </div>
              );
            })
          )}
        </section>

        {/* -------- PROGRES PER MINGGU -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Progres per minggu</h2>
            <span className="count">
              {overall.done} / {overall.total}
            </span>
          </div>

          <div className="wks">
            {[...byWeek].map(([week, p]) => {
              const range = weekRange(tasks, week);
              const now = week === currentWeek;
              return (
                <div className={`wk${now ? ' wk--now' : ''}`} key={week}>
                  <span className="wk__k">
                    Minggu {week}
                    {range && <s>{fmtRange(range.from, range.to)}</s>}
                  </span>
                  <span className="wk__p">{p.pct}%</span>
                  <span className="wk__b">
                    <span className={`meter${now ? '' : ' meter--q'}`}>
                      <i style={{ width: `${p.pct}%` }} />
                    </span>
                    <span className="wk__n">
                      {p.done} / {p.total}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {lagging.length > 0 && (
            <div className="callout">
              <span className="ic">~</span>
              <span>
                Workstream <b>{lagging.join(', ')}</b> tertinggal jauh di bawah rata-rata
                keseluruhan <b>{overall.pct}%</b>.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Label tanggal besok — dipakai tombol reschedule cepat di Tahap berikutnya. */
export const besok = (today: IsoDate) => addDays(today, 1);
