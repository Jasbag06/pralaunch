import type { ReactNode } from 'react';
import { fmtDayShort } from '../lib/date';
import type { IsoDate } from '../lib/date';
import { resolveTheme, setThemePref, useThemePref } from '../lib/theme';

/**
 * Kerangka navigasi: sidebar di desktop, bottom nav di mobile.
 * Rute lain (Timeline, Progres, Impor) menyusul; link-nya sudah ada supaya
 * bentuk navigasinya tidak berubah lagi nanti.
 */

interface Props {
  today: IsoDate;
  /** Hash rute aktif, mis. '#/timeline'. Menentukan item nav yang disorot. */
  route: string;
  email: string;
  /** Jumlah task telat — dipakai sebagai lencana peringatan di sidebar. */
  overdueCount: number;
  totalTasks: number;
  progressPct: number;
  arrivalLabel: string | null;
  reminderHour: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  onNewTask?: () => void;
  onSettings?: () => void;
}

const IconToday = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);
const IconTimeline = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5h16v16H4z" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
const IconProgress = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 18l5-6 4 3 7-9" />
  </svg>
);
const IconImport = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12M8 11l4 4 4-4" />
    <path d="M4 19h16" />
  </svg>
);
const IconExport = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 17V5M8 9l4-4 4 4" />
    <path d="M4 19h16" />
  </svg>
);
const IconGear = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </svg>
);
const IconSun = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
);
const IconMoon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** Toggle cepat di bilah atas: klik langsung balik terang<->gelap.
 *  Pilihan detail (termasuk "ikut sistem") ada di halaman Pengaturan. */
function ThemeToggle() {
  const pref = useThemePref();
  const eff = resolveTheme(pref);
  return (
    <button
      type="button"
      className="iconbtn"
      aria-label={eff === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
      onClick={() => setThemePref(eff === 'dark' ? 'light' : 'dark')}
    >
      {eff === 'dark' ? IconSun : IconMoon}
    </button>
  );
}

export function Shell({
  today,
  route,
  email,
  overdueCount,
  totalTasks,
  progressPct,
  arrivalLabel,
  reminderHour,
  title,
  subtitle,
  children,
  onNewTask,
  onSettings,
}: Props) {
  /** '#/' dan '#' dianggap sama supaya Dasbor tetap tersorot di root. */
  const at = (href: string) =>
    (route === '' || route === '#' ? '#/' : route) === href ? 'page' : undefined;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="ws">
          <span className="av">P</span>
          <span className="nm">
            Pra-Launch
            <span className="cr">{email}</span>
          </span>
        </div>

        <nav className="snav">
          <a href="#/" aria-current={at('#/')}>
            {IconToday}
            Hari ini
            {overdueCount > 0 && <span className="b b--alert">{overdueCount}</span>}
          </a>
          <a href="#/timeline" aria-current={at('#/timeline')}>
            {IconTimeline}
            Timeline
            <span className="b">{totalTasks}</span>
          </a>
          <a href="#/progres" aria-current={at('#/progres')}>
            {IconProgress}
            Progres
            <span className="b">{progressPct}%</span>
          </a>
        </nav>

        <div className="sgroup">Data</div>
        <nav className="snav">
          <a href="#/impor" aria-current={at('#/impor')}>{IconImport}Impor JSON</a>
          <a href="#/ekspor" aria-current={at('#/ekspor')}>{IconExport}Ekspor JSON</a>
          <a href="#/pengaturan" aria-current={at('#/pengaturan')}>{IconGear}Pengaturan</a>
        </nav>

        <button type="button" className="newbtn" onClick={onNewTask}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Task baru
        </button>

        <div className="sfoot">
          {arrivalLabel ? (
            <>
              Barang tiba <b>{arrivalLabel}</b>
              <br />
            </>
          ) : null}
          Reminder harian <b>{String(reminderHour).padStart(2, '0')}:00</b> WIB
        </div>
      </aside>

      <div>
        <div className="crumbs">
          <span>Pra-Launch</span>
          <span className="sep">/</span>
          <span className="here">{title}</span>
          <span className="date">{fmtDayShort(today)}</span>
          <ThemeToggle />
          <button type="button" className="iconbtn" aria-label="Pengaturan" onClick={onSettings}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
            </svg>
          </button>
        </div>

        <div className="pagehead">
          <h1>{title}</h1>
          <div className="sub">{subtitle}</div>
        </div>

        {children}
      </div>

      <button type="button" className="fab" aria-label="Tambah task" onClick={onNewTask}>
        +
      </button>

      <nav className="bnav">
        <a href="#/" aria-current={at('#/')}>
          {IconToday}
          Hari ini
        </a>
        <a href="#/timeline" aria-current={at('#/timeline')}>
          {IconTimeline}
          Timeline
        </a>
        <a href="#/progres" aria-current={at('#/progres')}>
          {IconProgress}
          Progres
        </a>
        <a href="#/impor" aria-current={at('#/impor')}>
          {IconImport}
          Impor
        </a>
      </nav>
    </div>
  );
}
