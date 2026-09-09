import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Sign-in saja, tanpa sign-up.
 *
 * App ini live di URL publik. Kalau pendaftaran dibuka, siapa pun bisa
 * membuat akun — memang mereka tidak akan melihat data apa pun (RLS
 * memisahkan per owner_id), tapi tetap saja itu permukaan yang tidak
 * dibutuhkan untuk app satu orang. User dibuat sekali lewat
 * Supabase Dashboard -> Authentication -> Users -> Add user.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email atau password salah.'
          : error.message,
      );
      setBusy(false);
      return;
    }
    // Sesi tersimpan; App akan ikut berubah lewat onAuthStateChange.
  }

  return (
    <div className="auth">
      <div className="auth__box">
        <div className="auth__brand">
          <span className="auth__av">P</span>
          <span className="nm">
            Pra-Launch
            <span className="cr">Toko Pet Supplies</span>
          </span>
        </div>

        <h1>Masuk</h1>
        <p className="auth__sub">Satu tempat untuk semua persiapan sebelum barang tiba.</p>

        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="field__k">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field__k">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Memeriksa…' : 'Masuk'}
          </button>

          {error && <div className="formerr">{error}</div>}
        </form>

        <p className="authnote">
          Akun dibuat sekali lewat Supabase Dashboard → Authentication → Users.
          Tidak ada pendaftaran dari halaman ini.
        </p>
      </div>
    </div>
  );
}
