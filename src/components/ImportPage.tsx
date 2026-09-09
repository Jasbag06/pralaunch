import { useMemo, useState } from 'react';
import { parseImport, planImport, type ImportMode } from '../lib/importer';
import type { Attachment, Task } from '../lib/types';

interface Props {
  tasks: Task[];
  attachments: Map<string, Attachment[]>;
  onApply: (plan: ReturnType<typeof planImport>) => Promise<void>;
}

const CONTOH = `[
  {
    "key": "w3-foto-produk",
    "title": "Foto produk 5 SKU",
    "scheduled_date": "2026-09-17",
    "week_number": 3,
    "workstream": "Konten",
    "priority": "normal",
    "estimated_minutes": 120,
    "depends_on": ["w2-shopee-seller"]
  }
]`;

export function ImportPage({ tasks, attachments, onApply }: Props) {
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<ImportMode>('append');
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<string | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);

  const parsed = useMemo(() => (raw.trim() === '' ? null : parseImport(raw)), [raw]);
  const plan = useMemo(
    () => (parsed && !parsed.fatal ? planImport(parsed.rows, tasks, mode, parsed.milestones) : null),
    [parsed, tasks, mode],
  );

  // Task yang akan dihapus DAN punya lampiran — lampirannya ikut hilang
  // (attachments punya on delete cascade), jadi itu harus disebut lebih dulu.
  const lampiranHilang = useMemo(() => {
    if (!plan) return 0;
    const byKey = new Map(tasks.map((t) => [t.key, t]));
    return plan.deleteKeys.reduce((n, k) => {
      const t = byKey.get(k);
      return n + (t ? (attachments.get(t.id)?.length ?? 0) : 0);
    }, 0);
  }, [plan, tasks, attachments]);

  const errors = parsed?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = parsed?.issues.filter((i) => i.severity === 'warning') ?? [];

  async function commit() {
    if (!plan) return;
    setBusy(true);
    setGagal(null);
    try {
      await onApply(plan);
      setHasil(
        `${plan.insert.length} ditambah · ${plan.update.length} diperbarui` +
          (plan.deleteKeys.length > 0 ? ` · ${plan.deleteKeys.length} dihapus` : '') +
          (plan.milestones.length > 0 ? ` · ${plan.milestones.length} milestone` : ''),
      );
      setRaw('');
    } catch (e: unknown) {
      setGagal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="col col--main">
        <section className="sec">
          <div className="sec__head">
            <h2>Tempel JSON</h2>
            {parsed && <span className="count">{parsed.rows.length} task terbaca</span>}
          </div>

          <textarea
            className="jsonbox"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setHasil(null);
            }}
            placeholder={CONTOH}
            spellCheck={false}
          />

          <div className="field" style={{ marginTop: 14 }}>
            <span className="field__k">Mode</span>
            <div className="seg seg--2">
              <button type="button" aria-pressed={mode === 'append'} onClick={() => setMode('append')}>
                Tambah
              </button>
              <button
                type="button"
                aria-pressed={mode === 'replace_week'}
                onClick={() => setMode('replace_week')}
              >
                Ganti per minggu
              </button>
            </div>
            <p className="attnote">
              {mode === 'append'
                ? 'Task dengan key yang sudah ada diperbarui, sisanya dibuat baru. Tidak ada yang dihapus.'
                : 'Minggu yang muncul di JSON dibuat sama persis dengan isi JSON. Task lain di minggu itu dihapus — beserta lampirannya.'}
            </p>
          </div>
        </section>

        {/* -------- MASALAH -------- */}
        {errors.length > 0 && (
          <section className="sec">
            <div className="sec__head">
              <h2>Tidak bisa diimpor</h2>
              <span className="count count--alert">{errors.length} error</span>
            </div>
            <div className="issues">
              {errors.map((e, i) => (
                <div className="issue issue--err" key={i}>
                  <span className="issue__l">
                    {e.line != null ? `baris ${e.line}` : '—'}
                    {e.index != null && <s>elemen {e.index + 1}</s>}
                  </span>
                  <span className="issue__m">{e.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {warnings.length > 0 && (
          <section className="sec">
            <div className="sec__head">
              <h2>Peringatan</h2>
              <span className="count">{warnings.length}</span>
            </div>
            <div className="issues">
              {warnings.map((e, i) => (
                <div className="issue" key={i}>
                  <span className="issue__l">
                    {e.line != null ? `baris ${e.line}` : '—'}
                  </span>
                  <span className="issue__m">{e.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* -------- PREVIEW -------- */}
        {plan && (
          <section className="sec">
            <div className="sec__head">
              <h2>Yang akan terjadi</h2>
            </div>

            <div className="props">
              <div className="prop">
                <span className="prop__k">Task baru</span>
                <span className="prop__v">{plan.insert.length}</span>
              </div>
              <div className="prop">
                <span className="prop__k">Diperbarui<span className="s">key sudah ada</span></span>
                <span className="prop__v">{plan.update.length}</span>
              </div>
              {plan.milestones.length > 0 && (
                <div className="prop">
                  <span className="prop__k">
                    Milestone<span className="s">selalu ditambah/diperbarui, tidak pernah dihapus</span>
                  </span>
                  <span className="prop__v">{plan.milestones.length}</span>
                </div>
              )}
              {mode === 'replace_week' && (
                <div className="prop">
                  <span className="prop__k">
                    Dihapus
                    <span className="s">
                      minggu {plan.weeks.join(', ') || '—'}, tidak disebut JSON
                    </span>
                  </span>
                  <span className="prop__v" style={{ color: plan.deleteKeys.length ? 'var(--alert)' : undefined }}>
                    {plan.deleteKeys.length}
                  </span>
                </div>
              )}
            </div>

            {plan.deleteKeys.length > 0 && (
              <div className="callout">
                <span className="ic">!</span>
                <span>
                  Akan dihapus: {plan.deleteKeys.map((k) => <b key={k}>{k} </b>)}
                  {lampiranHilang > 0 && (
                    <>
                      {' '}— termasuk <b>{lampiranHilang} lampiran</b> yang menempel padanya.
                    </>
                  )}
                </span>
              </div>
            )}

            {plan.danglingDeps.length > 0 && (
              <div className="callout">
                <span className="ic">~</span>
                <span>
                  Dependensi menunjuk key yang tidak ada:{' '}
                  {plan.danglingDeps.map((k) => <b key={k}>{k} </b>)}. Task-nya tetap
                  masuk, tapi tidak akan terkunci oleh key itu.
                </span>
              </div>
            )}

            <div className="callout callout--info">
              <span className="ic">i</span>
              <span>
                Impor bukan satu transaksi. Kalau ini mengubah banyak hal, buka{' '}
                <a href="#/ekspor">Ekspor JSON</a> dulu dan simpan hasilnya sebagai
                cadangan.
              </span>
            </div>

            <button
              type="button"
              className="btn"
              style={{ maxWidth: 220 }}
              disabled={
                busy ||
                (plan.insert.length === 0 &&
                  plan.update.length === 0 &&
                  plan.deleteKeys.length === 0 &&
                  plan.milestones.length === 0)
              }
              onClick={commit}
            >
              {busy ? 'Menerapkan…' : 'Terapkan impor'}
            </button>

            {gagal && <div className="formerr">{gagal}</div>}
          </section>
        )}

        {hasil && (
          <section className="sec">
            <div className="callout callout--info">
              <span className="ic">✓</span>
              <span>
                Impor selesai — <b>{hasil}</b>. <a href="#/">Lihat Hari ini</a>
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
