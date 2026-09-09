import { describe, expect, it } from 'vitest';
import { pesanDeadline, pesanTelat, ringkasanHarian, type TaskRingkas } from './pesan.ts';
import { addDays, daysBetween, hourJakarta, todayJakarta } from './waktu.ts';

const t = (title: string, scheduled_date = '2026-09-08'): TaskRingkas => ({
  title,
  scheduled_date,
});

describe('waktu (cermin src/lib/date.ts)', () => {
  it('todayJakarta memakai tanggal Jakarta, bukan UTC', () => {
    expect(todayJakarta(new Date('2026-09-08T17:30:00Z'))).toBe('2026-09-09');
  });

  it('hourJakarta menggeser +7 dan tengah malam jadi 0', () => {
    expect(hourJakarta(new Date('2026-09-08T00:00:00Z'))).toBe(7);
    expect(hourJakarta(new Date('2026-09-08T17:00:00Z'))).toBe(0);
  });

  it('addDays melintasi batas bulan', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('daysBetween menghitung mundur dengan benar', () => {
    expect(daysBetween('2026-09-08', '2026-10-06')).toBe(28);
  });
});

describe('ringkasanHarian', () => {
  it('judulnya hitung mundur ke tanggal tiba', () => {
    const p = ringkasanHarian([t('A')], [], '2026-10-06', '2026-09-08');
    expect(p.title).toBe('28 hari menuju barang tiba');
  });

  it('hari kedatangan itu sendiri tidak ditulis "0 hari"', () => {
    const p = ringkasanHarian([], [], '2026-09-08', '2026-09-08');
    expect(p.title).toBe('Barang tiba hari ini');
  });

  it('tanggal yang sudah lewat tidak menghasilkan angka negatif', () => {
    const p = ringkasanHarian([], [], '2026-09-01', '2026-09-08');
    expect(p.title).toBe('Barang sudah tiba 7 hari lalu');
  });

  it('tanpa tanggal tiba tetap punya judul yang wajar', () => {
    expect(ringkasanHarian([], [], null, '2026-09-08').title).toBe('Pra-Launch hari ini');
  });

  it('task telat disebut lebih dulu', () => {
    const p = ringkasanHarian([t('Kerjakan A')], [t('Telat B')], null, '2026-09-08');
    expect(p.body.split('\n')[0]).toBe('⚠ 1 task telat');
  });

  it('hari kosong dikatakan apa adanya, bukan dibiarkan hampa', () => {
    const p = ringkasanHarian([], [], null, '2026-09-08');
    expect(p.body).toBe('Tidak ada task terjadwal hari ini.');
  });

  it('daftar panjang dipangkas jadi "+N lagi"', () => {
    const banyak = Array.from({ length: 9 }, (_, i) => t(`Task ${i + 1}`));
    const p = ringkasanHarian(banyak, [], null, '2026-09-08');

    expect(p.body).toContain('9 task hari ini:');
    expect(p.body).toContain('• Task 5');
    expect(p.body).not.toContain('• Task 6');
    expect(p.body).toContain('• +4 lagi');
  });

  it('tepat 5 task tidak memunculkan baris "+0 lagi"', () => {
    const lima = Array.from({ length: 5 }, (_, i) => t(`Task ${i + 1}`));
    expect(ringkasanHarian(lima, [], null, '2026-09-08').body).not.toContain('lagi');
  });
});

describe('pesanDeadline & pesanTelat', () => {
  it('deadline menyebut tanggalnya', () => {
    const p = pesanDeadline([t('Daftar Shopee', '2026-09-11')]);
    expect(p.title).toBe('Deadline: 1 task kritis');
    expect(p.body).toBe('• Daftar Shopee (2026-09-11)');
  });

  it('telat ikut dipangkas di 5', () => {
    const banyak = Array.from({ length: 7 }, (_, i) => t(`Telat ${i + 1}`));
    const p = pesanTelat(banyak);
    expect(p.title).toBe('7 task telat lebih dari sehari');
    expect(p.body.split('\n')).toHaveLength(5);
  });
});
