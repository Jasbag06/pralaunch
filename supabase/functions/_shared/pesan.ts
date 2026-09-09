/**
 * Penyusun isi pengingat. Murni — tidak menyentuh Deno, database, maupun
 * jaringan — supaya bisa diuji lewat vitest bersama kode client.
 *
 * Ini teks yang kamu baca tiap pagi, jadi bentuknya harus benar bahkan di
 * kasus pinggir: tidak ada task, terlalu banyak task, tanggal tiba belum diisi.
 */

import { daysBetween } from './waktu.ts';

export interface TaskRingkas {
  title: string;
  scheduled_date: string;
}

export interface Pesan {
  title: string;
  body: string;
}

/** Maksimal task yang disebut satu per satu sebelum diringkas jadi "+N lagi". */
export const MAKS_DAFTAR = 5;

export function ringkasanHarian(
  hariIni: TaskRingkas[],
  telat: TaskRingkas[],
  arrival: string | null,
  today: string,
): Pesan {
  const sisa = arrival ? daysBetween(today, arrival) : null;

  const title =
    sisa === null
      ? 'Pra-Launch hari ini'
      : sisa > 0
        ? `${sisa} hari menuju barang tiba`
        : sisa === 0
          ? 'Barang tiba hari ini'
          : `Barang sudah tiba ${-sisa} hari lalu`;

  const baris: string[] = [];
  if (telat.length > 0) baris.push(`⚠ ${telat.length} task telat`);

  if (hariIni.length === 0) {
    baris.push('Tidak ada task terjadwal hari ini.');
  } else {
    baris.push(`${hariIni.length} task hari ini:`);
    for (const t of hariIni.slice(0, MAKS_DAFTAR)) baris.push(`• ${t.title}`);
    if (hariIni.length > MAKS_DAFTAR) baris.push(`• +${hariIni.length - MAKS_DAFTAR} lagi`);
  }

  return { title, body: baris.join('\n') };
}

export function pesanDeadline(tasks: TaskRingkas[]): Pesan {
  return {
    title: `Deadline: ${tasks.length} task kritis`,
    body: tasks
      .slice(0, MAKS_DAFTAR)
      .map((t) => `• ${t.title} (${t.scheduled_date})`)
      .join('\n'),
  };
}

export function pesanTelat(tasks: TaskRingkas[]): Pesan {
  return {
    title: `${tasks.length} task telat lebih dari sehari`,
    body: tasks.slice(0, MAKS_DAFTAR).map((t) => `• ${t.title}`).join('\n'),
  };
}
