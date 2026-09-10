import { useMemo, useState } from 'react';
import { fmtRange, fmtShort, type IsoDate } from '../lib/date';
import {
  completedLog,
  groupByWeek,
  laggingWorkstreams,
  progress,
  progressByWorkstream,
} from '../lib/tasks';
import type { Attachment, Milestone, Task } from '../lib/types';
import { TaskRow } from './TaskRow';

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function weekdayLabel(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return HARI_PENDEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

type Lingkup = 'minggu' | 'semua';

interface Props {
  tasks: Task[];
  milestones: Milestone[];
  today: IsoDate;
  attachments: Map<string, Attachment[]>;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onOpenAttachment: (a: Attachment) => void;
}

export function ProgressPage({
  tasks,
  milestones,
  today,
  attachments,
  onToggle,
  onOpen,
  onOpenAttachment,
}: Props) {
  const [lingkup, setLingkup] = useState<Lingkup>('minggu');

  const overall = progress(tasks);
  const weeks = groupByWeek(tasks, milestones);
  const byWs = progressByWorkstream(tasks);
  const lagging = new Set(laggingWorkstreams(tasks));

  const mingguIni =
    weeks.find((w) => w.from <= today && today <= w.to) ??
    weeks.find((w) => w.from > today) ??
    weeks[weeks.length - 1];

  const log = useMemo(
    () =>
      lingkup === 'minggu' && mingguIni
        ? completedLog(tasks, mingguIni.from, mingguIni.to)
        : completedLog(tasks),
    [tasks, lingkup, mingguIni],
  );

  const jumlahSelesai = log.reduce((n, d) => n + d.tasks.length, 0);

  // Berapa lampiran yang menempel pada task-task itu — inilah alasan utama
  // riwayat ini ada: menemukan lagi hasil kerja yang sudah dilampirkan.
  const jumlahLampiran = useMemo(
    () =>
      log.reduce(
        (n, d) => n + d.tasks.reduce((m, t) => m + (attachments.get(t.id)?.length ?? 0), 0),
        0,
      ),
    [log, attachments],
  );

  if (tasks.length === 0) {
    return (
      <div className="wrap">
        <div className="col col--main">
          <section className="sec">
            <p className="empty">Belum ada task, jadi belum ada yang bisa dihitung.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="col col--main">
        {/* -------- KESELURUHAN -------- */}
        <section className="sec">
          <div className="head2">
            <div>
              <div className="herorow">
                <span className="hero">
                  {overall.pct}
                  <span className="u">persen</span>
                </span>
              </div>
              <div className="herosub">
                {overall.done} dari {overall.total} task selesai
                {overall.skipped > 0 && ` · ${overall.skipped} dilewati`}
              </div>
            </div>
            <div>
              <div className="meter">
                <i style={{ width: `${overall.pct}%` }} />
              </div>
              <div className="progline">
                <span className="s">
                  Task yang dilewati tidak ikut penyebut, jadi 100% tetap mungkin dicapai.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* -------- RIWAYAT: apa yang sudah dikerjakan -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Sudah dikerjakan</h2>
            <span className="count count--accent">{jumlahSelesai}</span>
            {jumlahLampiran > 0 && (
              <span className="sec__note">{jumlahLampiran} lampiran tersimpan</span>
            )}
          </div>

          <div className="seg seg--2" style={{ marginBottom: 14 }}>
            <button
              type="button"
              aria-pressed={lingkup === 'minggu'}
              onClick={() => setLingkup('minggu')}
            >
              {mingguIni ? `Minggu ${mingguIni.week}` : 'Minggu ini'}
            </button>
            <button
              type="button"
              aria-pressed={lingkup === 'semua'}
              onClick={() => setLingkup('semua')}
            >
              Semua
            </button>
          </div>

          {log.length === 0 ? (
            <p className="empty">
              {lingkup === 'minggu'
                ? 'Belum ada yang diselesaikan di minggu ini.'
                : 'Belum ada task yang diselesaikan.'}
            </p>
          ) : (
            <>
              {log.map((hari) => (
                <div className={`day${hari.date === today ? ' day--today' : ''}`} key={hari.date}>
                  <div className="day__d">
                    {weekdayLabel(hari.date)}
                    <b>{fmtShort(hari.date)}</b>
                  </div>
                  <div className="day__b">
                    <div className="tsks">
                      {hari.tasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onToggle={onToggle}
                          onOpen={onOpen}
                          attachments={attachments.get(t.id)}
                          onOpenAttachment={onOpenAttachment}
                          right={
                            t.scheduled_date !== hari.date
                              ? `jadwal ${fmtShort(t.scheduled_date)}`
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <p className="attnote">
                Klik judulnya untuk membuka detail — catatan, estimasi, dan lampiran yang
                kamu simpan waktu mengerjakan masih utuh di sana. Kotak centangnya masih
                bisa dibatalkan kalau ternyata belum benar-benar selesai.
              </p>
            </>
          )}
        </section>

        {/* -------- PER MINGGU -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Per minggu</h2>
            <span className="count">{weeks.length} minggu</span>
          </div>

          <div className="wks">
            {weeks.map((w) => {
              const now = w.week === mingguIni?.week;
              return (
                <div className={`wk${now ? ' wk--now' : ''}`} key={w.week}>
                  <span className="wk__k">
                    Minggu {w.week}
                    <s>{w.from && fmtRange(w.from, w.to)}</s>
                  </span>
                  <span className="wk__p">{w.progress.pct}%</span>
                  <span className="wk__b">
                    <span className={`meter${now ? '' : ' meter--q'}`}>
                      <i style={{ width: `${w.progress.pct}%` }} />
                    </span>
                    <span className="wk__n">
                      {w.progress.done} / {w.progress.total}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* -------- PER WORKSTREAM -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Per workstream</h2>
            <span className="count">{byWs.size} kategori</span>
            {lagging.size > 0 && <span className="sec__note">{lagging.size} tertinggal</span>}
          </div>

          <div className="wks">
            {[...byWs]
              .sort((a, b) => a[1].pct - b[1].pct)
              .map(([ws, p]) => (
                <div className={`wk${lagging.has(ws) ? ' wk--lag' : ''}`} key={ws}>
                  <span className="wk__k">
                    {ws}
                    {lagging.has(ws) && <s>tertinggal jauh dari rata-rata</s>}
                  </span>
                  <span className="wk__p">{p.pct}%</span>
                  <span className="wk__b">
                    <span className="meter meter--q">
                      <i style={{ width: `${p.pct}%` }} />
                    </span>
                    <span className="wk__n">
                      {p.done} / {p.total}
                    </span>
                  </span>
                </div>
              ))}
          </div>

          {lagging.size > 0 && (
            <div className="callout">
              <span className="ic">~</span>
              <span>
                <b>{[...lagging].join(', ')}</b> tertinggal lebih dari 20 poin di bawah
                rata-rata keseluruhan <b>{overall.pct}%</b>. Workstream berisi kurang dari
                3 task tidak pernah ditandai — terlalu kecil untuk berarti.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
