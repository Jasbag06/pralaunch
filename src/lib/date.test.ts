import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  fmtDayShort,
  fmtDuration,
  fmtFull,
  fmtRange,
  fmtShort,
  hourJakarta,
  isWeekend,
  nextWeekend,
  todayJakarta,
  weekday,
} from './date';

describe('todayJakarta', () => {
  it('memakai tanggal Jakarta, bukan UTC', () => {
    // 2026-09-08T17:30Z = 2026-09-09 00:30 WIB -> sudah hari berikutnya.
    expect(todayJakarta(new Date('2026-09-08T17:30:00Z'))).toBe('2026-09-09');
  });

  it('tepat di batas tengah malam WIB', () => {
    expect(todayJakarta(new Date('2026-09-08T16:59:59Z'))).toBe('2026-09-08');
    expect(todayJakarta(new Date('2026-09-08T17:00:00Z'))).toBe('2026-09-09');
  });

  it('selalu berformat YYYY-MM-DD', () => {
    expect(todayJakarta(new Date('2026-01-05T03:00:00Z'))).toBe('2026-01-05');
  });
});

describe('hourJakarta', () => {
  it('menggeser UTC ke WIB (+7)', () => {
    expect(hourJakarta(new Date('2026-09-08T00:00:00Z'))).toBe(7);
    expect(hourJakarta(new Date('2026-09-08T02:30:00Z'))).toBe(9);
  });

  it('tengah malam WIB adalah 0, bukan 24', () => {
    expect(hourJakarta(new Date('2026-09-08T17:00:00Z'))).toBe(0);
  });
});

describe('addDays', () => {
  it('melintasi batas bulan', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('melintasi batas tahun', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('mundur', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('tahun kabisat', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('daysBetween', () => {
  it('menghitung countdown maju', () => {
    expect(daysBetween('2026-09-08', '2026-10-06')).toBe(28);
  });

  it('negatif kalau sudah lewat', () => {
    expect(daysBetween('2026-09-08', '2026-09-05')).toBe(-3);
  });

  it('nol untuk tanggal yang sama', () => {
    expect(daysBetween('2026-09-08', '2026-09-08')).toBe(0);
  });
});

describe('weekday & isWeekend', () => {
  it('08 Sep 2026 adalah Selasa', () => {
    expect(weekday('2026-09-08')).toBe(2);
    expect(isWeekend('2026-09-08')).toBe(false);
  });

  it('mengenali Sabtu dan Minggu', () => {
    expect(isWeekend('2026-09-12')).toBe(true); // Sabtu
    expect(isWeekend('2026-09-13')).toBe(true); // Minggu
  });
});

describe('nextWeekend', () => {
  it('dari hari kerja lompat ke Sabtu', () => {
    expect(nextWeekend('2026-09-08')).toBe('2026-09-12');
  });

  it('dari Sabtu lanjut ke Minggu', () => {
    expect(nextWeekend('2026-09-12')).toBe('2026-09-13');
  });

  it('dari Minggu lompat ke Sabtu berikutnya', () => {
    expect(nextWeekend('2026-09-13')).toBe('2026-09-19');
  });

  it('tidak pernah mengembalikan tanggal yang sama', () => {
    for (const d of ['2026-09-08', '2026-09-12', '2026-09-13']) {
      expect(nextWeekend(d)).not.toBe(d);
    }
  });
});

describe('format tampilan', () => {
  it('fmtShort', () => {
    expect(fmtShort('2026-09-08')).toBe('08 Sep');
  });

  it('fmtDayShort cocok dengan mockup', () => {
    expect(fmtDayShort('2026-09-08')).toBe('Sel, 08 Sep 2026');
  });

  it('fmtFull cocok dengan mockup', () => {
    expect(fmtFull('2026-09-08')).toBe('Selasa, 08 September 2026');
  });

  it('fmtRange dalam satu bulan', () => {
    expect(fmtRange('2026-09-01', '2026-09-07')).toBe('01–07 Sep');
  });

  it('fmtRange melintasi bulan', () => {
    expect(fmtRange('2026-09-29', '2026-10-06')).toBe('29 Sep–06 Okt');
  });

  it('fmtRange satu hari tidak diulang jadi 05–05', () => {
    expect(fmtRange('2026-10-05', '2026-10-05')).toBe('05 Okt');
  });

  it('fmtDuration', () => {
    expect(fmtDuration(45)).toBe('45m');
    expect(fmtDuration(120)).toBe('2j');
    expect(fmtDuration(165)).toBe('2j 45m');
  });
});
