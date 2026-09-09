import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi. ' +
      'Salin .env.example jadi .env.local lalu isi dari Supabase Dashboard.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Sesi disimpan di localStorage supaya PWA yang di-install ke home screen
    // tidak minta login ulang tiap dibuka.
    persistSession: true,
    autoRefreshToken: true,
    // true: dibutuhkan supaya link magic-link / reset password dari email
    // Supabase (yang membawa token di URL hash) bisa membentuk sesi begitu
    // dibuka. Supabase-js membersihkan hash itu sendiri setelah diproses,
    // jadi tidak bentrok lama dengan router hash milik app ini.
    detectSessionInUrl: true,
  },
});
