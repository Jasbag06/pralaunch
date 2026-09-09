import { useEffect, useState } from 'react';
import { disablePush, enablePush, readStatus, type PushStatus } from '../lib/push';
import { supabase } from '../lib/supabase';
import type { AppSettings } from '../lib/types';

interface Props {
  settings: AppSettings;
  email: string;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
}

const JAM = Array.from({ length: 24 }, (_, i) => i);

export function SettingsPage({ settings, email, onSave }: Props) {
  const [arrival, setArrival] = useState(settings.target_arrival_date ?? '');
  const [hour, setHour] = useState(settings.reminder_hour);
  const [reminderOn, setReminderOn] = useState(settings.reminder_enabled);
  const [emailOn, setEmailOn] = useState(settings.email_fallback_enabled);
  const [emailAddr, setEmailAddr] = useState(settings.email_address ?? email);

  const [push, setPush] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readStatus().then(setPush);
  }, []);

  async function simpan() {
    setBusy(true);
    setError(null);
    setPesan(null);
    try {
      await onSave({
        target_arrival_date: arrival === '' ? null : arrival,
        reminder_hour: hour,
        reminder_enabled: reminderOn,
        email_fallback_enabled: emailOn,
        email_address: emailAddr.trim() === '' ? null : emailAddr.trim(),
      });
      setPesan('Pengaturan tersimpan.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function togglePush() {
    setBusy(true);
    setError(null);
    setPesan(null);
    try {
      if (push?.subscribed) {
        await disablePush();
        setPesan('Notifikasi dimatikan di perangkat ini.');
      } else {
        await enablePush();
        setPesan('Perangkat ini sekarang menerima notifikasi.');
      }
      setPush(await readStatus());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="col col--main">
        {/* -------- JADWAL -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Jadwal</h2>
          </div>

          <label className="field">
            <span className="field__k">Tanggal barang tiba</span>
            <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </label>
          <p className="attnote" style={{ marginTop: 0 }}>
            Ini sumber angka hitung mundur di Dasbor. Kalau kosong, countdown-nya
            menampilkan strip.
          </p>
        </section>

        {/* -------- REMINDER -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Pengingat harian</h2>
          </div>

          <label className="field cek">
            <input
              type="checkbox"
              checked={reminderOn}
              onChange={(e) => setReminderOn(e.target.checked)}
            />
            <span className="field__k">Kirim ringkasan task setiap hari</span>
          </label>

          <label className="field">
            <span className="field__k">Jam kirim (WIB)</span>
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {JAM.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <p className="attnote" style={{ marginTop: 0 }}>
            Cron di server berjalan tiap 15 menit dan memeriksa jam ini, jadi mengubah
            jam di sini langsung berlaku — tidak perlu menyentuh database.
          </p>
        </section>

        {/* -------- PUSH -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Notifikasi perangkat ini</h2>
            {push && (
              <span
                className={`count ${
                  push.subscribed ? 'count--accent' : push.verdict.state === 'siap' ? '' : 'count--alert'
                }`}
              >
                {push.subscribed
                  ? 'aktif'
                  : push.permission === 'denied'
                    ? 'ditolak'
                    : push.verdict.state === 'siap'
                      ? 'belum aktif'
                      : 'tidak tersedia'}
              </span>
            )}
          </div>

          {!push ? (
            <p className="empty">Memeriksa dukungan perangkat…</p>
          ) : (
            <>
              <p className="attnote" style={{ marginTop: 0 }}>
                {push.verdict.alasan}
              </p>

              {push.verdict.langkah && (
                <ol className="langkah">
                  {push.verdict.langkah.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ol>
              )}

              {push.vapidMissing && push.verdict.state === 'siap' && (
                <div className="callout">
                  <span className="ic">!</span>
                  <span>
                    <b>VITE_VAPID_PUBLIC_KEY</b> belum diisi di <b>.env.local</b>, jadi
                    tombol di bawah pasti gagal. Hasilkan kuncinya dengan{' '}
                    <b>npx web-push generate-vapid-keys</b>.
                  </span>
                </div>
              )}

              {push.permission === 'denied' && (
                <div className="callout">
                  <span className="ic">!</span>
                  <span>
                    Izin pernah ditolak, dan halaman web <b>tidak bisa</b> memintanya
                    lagi. Reset lewat pengaturan situs di browser, atau hapus PWA dari
                    Home Screen lalu pasang ulang.
                  </span>
                </div>
              )}

              {push.verdict.state === 'siap' && push.permission !== 'denied' && (
                <button
                  type="button"
                  className={push.subscribed ? 'btn btn--ghost' : 'btn'}
                  style={{ maxWidth: 260 }}
                  disabled={busy}
                  onClick={togglePush}
                >
                  {push.subscribed ? 'Matikan di perangkat ini' : 'Nyalakan notifikasi'}
                </button>
              )}

              <p className="attnote">
                Notifikasi terdaftar per perangkat, jadi HP dan iPad perlu dinyalakan
                masing-masing. Pengiriman di iOS tidak dijamin instan — ini pengingat,
                bukan alarm.
              </p>
            </>
          )}
        </section>

        {/* -------- EMAIL -------- */}
        <section className="sec">
          <div className="sec__head">
            <h2>Cadangan lewat email</h2>
          </div>

          <label className="field cek">
            <input
              type="checkbox"
              checked={emailOn}
              onChange={(e) => setEmailOn(e.target.checked)}
            />
            <span className="field__k">Kirim ringkasan yang sama lewat email</span>
          </label>

          <label className="field">
            <span className="field__k">Alamat email</span>
            <input
              type="email"
              value={emailAddr}
              onChange={(e) => setEmailAddr(e.target.value)}
              placeholder="nama@email.com"
            />
          </label>

          <p className="attnote" style={{ marginTop: 0 }}>
            Email adalah jaring pengaman kalau push tidak berjalan — dan di iOS itu
            cukup sering terjadi tanpa tanda apa pun. Database menolak menyimpan toggle
            ini kalau alamatnya kosong, supaya tidak ada keadaan "nyala tapi diam".
          </p>
        </section>

        <section className="sec">
          <button
            type="button"
            className="btn"
            style={{ maxWidth: 200 }}
            disabled={busy}
            onClick={simpan}
          >
            {busy ? 'Menyimpan…' : 'Simpan pengaturan'}
          </button>

          {pesan && (
            <div className="callout callout--info" style={{ marginTop: 12 }}>
              <span className="ic">✓</span>
              <span>{pesan}</span>
            </div>
          )}
          {error && <div className="formerr">{error}</div>}
        </section>

        <section className="sec">
          <div className="sec__head">
            <h2>Akun</h2>
          </div>
          <p className="attnote" style={{ marginTop: 0 }}>
            Masuk sebagai <b>{email}</b>
          </p>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ maxWidth: 140 }}
            onClick={() => supabase.auth.signOut()}
          >
            Keluar
          </button>
        </section>
      </div>
    </div>
  );
}
