import { useMemo, useState } from 'react';
import { exportJson } from '../lib/importer';
import { copyText } from '../lib/attachments';
import { todayJakarta } from '../lib/date';
import type { Task } from '../lib/types';

interface Props {
  tasks: Task[];
}

export function ExportPage({ tasks }: Props) {
  const json = useMemo(() => exportJson(tasks), [tasks]);
  const [status, setStatus] = useState<'idle' | 'ok' | 'gagal'>('idle');

  async function salin() {
    const ok = await copyText(json);
    setStatus(ok ? 'ok' : 'gagal');
    window.setTimeout(() => setStatus('idle'), 2000);
  }

  function unduh() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pralaunch-${todayJakarta()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="wrap">
      <div className="col col--main">
        <section className="sec">
          <div className="sec__head">
            <h2>Semua task</h2>
            <span className="count">{tasks.length} task</span>
            <span className="sec__note">{new Blob([json]).size.toLocaleString('id-ID')} byte</span>
          </div>

          <p className="attnote" style={{ marginTop: 0 }}>
            Diurutkan per minggu lalu tanggal. Field internal (id, owner_id, timestamp)
            sengaja dibuang, jadi hasilnya bisa langsung dibawa ke chat untuk direvisi
            lalu dikembalikan lewat <a href="#/impor">Impor JSON</a> tanpa perlu diedit
            manual.
          </p>

          <div className="quick" style={{ marginBottom: 12 }}>
            <button type="button" className="btn" style={{ maxWidth: 190, marginTop: 0 }} onClick={salin}>
              {status === 'ok' ? 'Tersalin' : status === 'gagal' ? 'Gagal menyalin' : 'Salin ke clipboard'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ maxWidth: 130, marginTop: 0 }}
              onClick={unduh}
            >
              Unduh .json
            </button>
          </div>

          <textarea className="jsonbox" value={json} readOnly spellCheck={false} />
        </section>
      </div>
    </div>
  );
}
