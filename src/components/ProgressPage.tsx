import { fmtDayShort, fmtRange, jakartaDateOf, type IsoDate } from '../lib/date';
import {
  completedInRange,
  groupByWeek,
  laggingWorkstreams,
  progress,
  progressByWorkstream,
} from '../lib/tasks';
import type { Milestone, Task } from '../lib/types';

interface Props {
  tasks: Task[];
  milestones: Milestone[];
  today: IsoDate;
}

export function ProgressPage({ tasks, milestones, today }: Props) {
  const overall = progress(tasks);
  const weeks = groupByWeek(tasks, milestones);
  const byWs = progressByWorkstream(tasks);
  const lagging = new Set(laggingWorkstreams(tasks));

  const mingguIni =
    weeks.find((w) => w.from <= today && today <= w.to) ??
    weeks.find((w) => w.from > today) ??
    weeks[weeks.length - 1];

  const riwayat = mingguIni
    ? completedInRange(tasks, mingguIni.from, mingguIni.to)
    : [];

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
            {lagging.size > 0 && (
              <span className="sec__note">{lagging.size} tertinggal</span>
            )}
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

        {/* -------- RIWAYAT MINGGU INI -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Selesai minggu ini</h2>
            <span className="count count--accent">{riwayat.length}</span>
            {mingguIni && (
              <span className="sec__note">
                Minggu {mingguIni.week} · {fmtRange(mingguIni.from, mingguIni.to)}
              </span>
            )}
          </div>

          {riwayat.length === 0 ? (
            <p className="empty">Belum ada yang diselesaikan minggu ini.</p>
          ) : (
            <div className="tsks">
              {riwayat.map((t) => (
                <div className="tsk tsk--done" key={t.id}>
                  <span className="tsk__c" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span className="tsk__b">
                    <span className="tsk__t">{t.title}</span>
                    <span className="tsk__m">
                      <span className="chip">{t.workstream}</span>
                    </span>
                  </span>
                  <span className="tsk__r">
                    {t.completed_at ? fmtDayShort(jakartaDateOf(t.completed_at)) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
