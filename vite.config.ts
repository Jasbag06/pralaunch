import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // './' -> semua aset dirujuk relatif, jadi build yang sama jalan baik di root
  // maupun di subdirektori GitHub Pages tanpa perlu tahu nama repo lebih dulu.
  // Dikunci ulang ke '/<nama-repo>/' di Tahap 6 kalau scope service worker
  // ternyata butuh path absolut.
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    // Logika murni Edge Function ikut diuji di sini. Ia berjalan di Deno saat
    // produksi, tapi isinya TypeScript biasa tanpa API Deno — jadi bisa diuji
    // bersama kode client daripada dibiarkan tanpa test sama sekali.
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
});
