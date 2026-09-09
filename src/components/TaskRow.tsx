import { useState, type ReactNode } from 'react';
import { fmtDuration } from '../lib/date';
import { copyText, splitPath } from '../lib/attachments';
import type { Attachment, Task } from '../lib/types';

/** Warna garis kiri + bobot teks. Status `done` diturunkan dari task sendiri. */
export type RowVariant = 'crit' | 'now' | 'lock';

interface Props {
  task: Task;
  variant?: RowVariant;
  /** Teks kolom kanan — tanggal, "telat 3 hari", status. */
  right?: ReactNode;
  /** Dependensi yang belum beres; ditampilkan sebagai alasan terkunci. */
  blockedBy?: Task[];
  /** Berapa task lain yang tertahan gara-gara task ini. */
  blocks?: number;
  attachments?: Attachment[];
  onToggle?: (task: Task) => void;
  /** Klik badan baris untuk membuka detail. */
  onOpen?: (task: Task) => void;
  /** Klik chip lampiran — buka file/link langsung dari daftar. */
  onOpenAttachment?: (a: Attachment) => void;
}

const CHECK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12l5 5L20 7" />
  </svg>
);

const IconClip = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L16 6" />
  </svg>
);

const IconLink = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);

const IconFolder = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  </svg>
);

function iconFor(kind: Attachment['kind']) {
  if (kind === 'link') return IconLink;
  if (kind === 'path') return IconFolder;
  return IconClip;
}

export function TaskRow({
  task,
  variant,
  right,
  blockedBy,
  blocks,
  attachments,
  onToggle,
  onOpen,
  onOpenAttachment,
}: Props) {
  // Path lokal tidak bisa dibuka dari halaman web, jadi mengkliknya menyalin.
  // State-nya lokal per baris supaya konfirmasi "tersalin" tidak perlu
  // dialirkan lewat Dashboard dan Timeline.
  const [copied, setCopied] = useState<string | null>(null);

  const done = task.status === 'done';
  const locked = variant === 'lock';

  async function klikLampiran(a: Attachment) {
    if (a.kind === 'path') {
      const ok = await copyText(a.local_path ?? '');
      setCopied(ok ? a.id : null);
      window.setTimeout(() => setCopied(null), 1600);
      return;
    }
    onOpenAttachment?.(a);
  }

  const cls = ['tsk', variant && `tsk--${variant}`, done && 'tsk--done']
    .filter(Boolean)
    .join(' ');

  const isi = (
    <>
      <span className="tsk__t">{task.title}</span>

      {!locked && (
        <span className="tsk__m">
          <span className="chip">{task.workstream}</span>
          {task.estimated_minutes != null && (
            <span className="chip chip--time">{fmtDuration(task.estimated_minutes)}</span>
          )}
          {task.is_deadline && <span className="chip chip--dl">Deadline</span>}
          {task.priority === 'buffer' && <span className="chip">Buffer</span>}
        </span>
      )}

      {blockedBy && blockedBy.length > 0 && (
        <span className="blk">
          Menunggu{' '}
          {blockedBy.map((b, i) => (
            <span key={b.key}>
              {i > 0 && (i === blockedBy.length - 1 ? ' dan ' : ', ')}
              <b>{b.title}</b>
            </span>
          ))}
        </span>
      )}

      {blocks != null && blocks > 0 && (
        <span className="blk">
          Memblokir <b>{blocks} task</b> lain
        </span>
      )}
    </>
  );

  return (
    <div className={cls}>
      <button
        type="button"
        className="tsk__c"
        disabled={locked || !onToggle}
        onClick={() => onToggle?.(task)}
        aria-pressed={done}
        aria-label={done ? `Batalkan: ${task.title}` : `Tandai selesai: ${task.title}`}
        title={locked ? 'Masih menunggu dependensi' : undefined}
      >
        {CHECK}
      </button>

      {/* Chip lampiran adalah tombol tersendiri, jadi ia TIDAK boleh berada di
          dalam tombol pembuka detail — tombol bersarang itu HTML tidak sah dan
          kliknya jadi tidak bisa ditebak. */}
      <div className="tsk__b">
        {onOpen ? (
          <button
            type="button"
            className="tsk__open"
            onClick={() => onOpen(task)}
            aria-label={`Buka detail: ${task.title}`}
          >
            {isi}
          </button>
        ) : (
          isi
        )}

        {attachments && attachments.length > 0 && (
          <div className="atts">
            {attachments.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`att att--${a.kind}`}
                onClick={() => klikLampiran(a)}
                disabled={!onOpenAttachment && a.kind !== 'path'}
                title={
                  a.kind === 'link'
                    ? (a.url ?? '')
                    : a.kind === 'path'
                      ? `${a.local_path} — klik untuk menyalin`
                      : a.label
                }
              >
                {iconFor(a.kind)}
                <span>
                  {copied === a.id
                    ? 'tersalin'
                    : a.kind === 'path'
                      ? splitPath(a.local_path ?? '').name
                      : a.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="tsk__r">{right}</span>
    </div>
  );
}
