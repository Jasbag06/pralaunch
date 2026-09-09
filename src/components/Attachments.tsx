import { useRef, useState } from 'react';
import { copyText, fmtBytes, MAX_BYTES, splitPath } from '../lib/attachments';
import type { Attachment } from '../lib/types';

const IconClip = (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L16 6" />
  </svg>
);

const IconLink = (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);

const IconFolder = (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  </svg>
);

interface Props {
  /** null saat task belum dibuat — lampiran menunggu task-nya disimpan dulu. */
  taskId: string | null;
  items: Attachment[];
  onUpload: (file: File) => Promise<void>;
  onAddLink: (url: string, label: string) => Promise<void>;
  onAddPath: (path: string, label: string) => Promise<void>;
  onRemove: (a: Attachment) => Promise<void>;
  onOpen: (a: Attachment) => void;
}

export function Attachments({
  taskId,
  items,
  onUpload,
  onAddLink,
  onAddPath,
  onRemove,
  onOpen,
}: Props) {
  const [url, setUrl] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [tersalin, setTersalin] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function jalankan(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!taskId) {
    return (
      <div className="field">
        <span className="field__k">Lampiran</span>
        <p className="attnote">
          Simpan task-nya dulu, lalu buka lagi untuk menambahkan file atau link.
        </p>
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__k">Lampiran</span>

      {items.length > 0 && (
        <div>
          {items.map((a) => (
            <div className="attrow" key={a.id}>
              {a.kind === 'link' ? IconLink : a.kind === 'path' ? IconFolder : IconClip}
              <span className="attrow__b">
                <span className="attrow__t">{a.label}</span>
                <span className="attrow__s">
                  {a.kind === 'link'
                    ? a.url
                    : a.kind === 'path'
                      ? (splitPath(a.local_path ?? '').folder || a.local_path)
                      : [a.size_bytes != null && fmtBytes(a.size_bytes), a.mime_type]
                          .filter(Boolean)
                          .join(' · ')}
                </span>
              </span>
              <span className="attrow__a">
                {a.kind === 'path' ? (
                  <button
                    type="button"
                    className="chipbtn"
                    onClick={async () => {
                      const ok = await copyText(a.local_path ?? '');
                      setTersalin(ok ? a.id : null);
                      window.setTimeout(() => setTersalin(null), 1600);
                    }}
                  >
                    {tersalin === a.id ? 'Tersalin' : 'Salin'}
                  </button>
                ) : (
                  <button type="button" className="chipbtn" onClick={() => onOpen(a)}>
                    Buka
                  </button>
                )}
                <button
                  type="button"
                  className="chipbtn"
                  disabled={busy}
                  onClick={() => jalankan(() => onRemove(a))}
                  aria-label={`Hapus lampiran ${a.label}`}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="linkrow">
        <input
          type="url"
          placeholder="Tempel link Drive / Sheet…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          className="chipbtn"
          disabled={busy || url.trim() === ''}
          onClick={() =>
            jalankan(async () => {
              await onAddLink(url, label);
              setUrl('');
              setLabel('');
            })
          }
        >
          Tambah link
        </button>
      </div>

      {url.trim() !== '' && (
        <div className="linkrow">
          <input
            placeholder="Nama tampilan (opsional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <span />
        </div>
      )}

      <div className="linkrow">
        <input
          placeholder="Catat lokasi file di komputer…"
          value={lokasi}
          onChange={(e) => setLokasi(e.target.value)}
        />
        <button
          type="button"
          className="chipbtn"
          disabled={busy || lokasi.trim() === ''}
          onClick={() =>
            jalankan(async () => {
              await onAddPath(lokasi, '');
              setLokasi('');
            })
          }
        >
          Catat lokasi
        </button>
      </div>

      <div className="quick">
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // supaya file yang sama bisa dipilih lagi
            if (f) jalankan(() => onUpload(f));
          }}
        />
        <button
          type="button"
          className="chipbtn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Memproses…' : '+ Upload file'}
        </button>
      </div>

      {error && <div className="formerr">{error}</div>}

      <p className="attnote">
        <b>File</b> di-upload jadi salinan (maks {fmtBytes(MAX_BYTES)}), bisa dibuka dan
        di-download dari HP maupun laptop. <b>Link</b> tidak menyalin apa pun dan selalu
        menunjuk versi terbaru — pakai ini untuk dokumen yang sering direvisi di Drive.{' '}
        <b>Lokasi</b> cuma catatan teks; diklik untuk menyalin path-nya, tidak bisa dibuka
        karena browser memblokir <code>file://</code> dari halaman web.
      </p>
    </div>
  );
}
