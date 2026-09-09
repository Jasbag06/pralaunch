import { supabase } from './supabase';
import type { Attachment } from './types';
import { fmtBytes, hostOf, isHttpUrl, MAX_BYTES, safeName, splitPath } from './attachmentUtil';

export { fmtBytes, MAX_BYTES, splitPath } from './attachmentUtil';

const BUCKET = 'lampiran';

/** Semua lampiran user, dikelompokkan per task_id. */
export async function fetchAttachments(): Promise<Map<string, Attachment[]>> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .order('sort_order')
    .order('created_at');

  if (error) throw error;

  const out = new Map<string, Attachment[]>();
  for (const a of (data ?? []) as Attachment[]) {
    const list = out.get(a.task_id);
    if (list) list.push(a);
    else out.set(a.task_id, [a]);
  }
  return out;
}

export async function uploadFile(
  ownerId: string,
  taskId: string,
  file: File,
): Promise<Attachment> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File terlalu besar (${fmtBytes(file.size)}). Batasnya 10 MB.`);
  }

  // owner_id jadi segmen pertama — itu yang dicocokkan policy Storage.
  const path = `${ownerId}/${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) throw up.error;

  const row = await supabase
    .from('attachments')
    .insert({
      task_id: taskId,
      kind: 'file',
      label: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (row.error) {
    // Baris gagal dibuat -> file jadi yatim di Storage dan memakan kuota tanpa
    // pernah bisa ditemukan lagi. Bersihkan sebelum melempar.
    await supabase.storage.from(BUCKET).remove([path]);
    throw row.error;
  }

  return row.data as Attachment;
}

export async function addLink(taskId: string, url: string, label: string): Promise<Attachment> {
  const bersih = url.trim();
  if (!isHttpUrl(bersih)) {
    throw new Error('Link harus diawali http:// atau https://');
  }

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      task_id: taskId,
      kind: 'link',
      label: label.trim() || hostOf(bersih),
      url: bersih,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Attachment;
}

/**
 * Catat lokasi file di komputer. Tidak menyalin apa pun — cuma teks, supaya
 * kamu tahu hasil kerja kemarin ditaruh di mana.
 */
export async function addPath(taskId: string, path: string, label: string): Promise<Attachment> {
  const bersih = path.trim();
  if (bersih === '') throw new Error('Lokasi file tidak boleh kosong.');

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      task_id: taskId,
      kind: 'path',
      label: label.trim() || splitPath(bersih).name,
      local_path: bersih,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Attachment;
}

/** Salin teks ke clipboard. Butuh konteks aman (https atau localhost). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function removeAttachment(a: Attachment): Promise<void> {
  if (a.kind === 'file' && a.storage_path) {
    const { error } = await supabase.storage.from(BUCKET).remove([a.storage_path]);
    // Objek Storage yang sudah hilang bukan alasan menahan penghapusan baris —
    // membiarkan barisnya justru meninggalkan lampiran yang tidak bisa dibuka.
    if (error && !/not found/i.test(error.message)) throw error;
  }

  const { error } = await supabase.from('attachments').delete().eq('id', a.id);
  if (error) throw error;
}

/**
 * URL berumur pendek untuk membuka file. Bucket-nya privat, jadi tanpa ini
 * file tidak bisa diakses sama sekali — termasuk oleh pemiliknya.
 */
export async function signedUrl(path: string, detik = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, detik);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Buka lampiran di tab baru.
 *
 * Untuk file, window dibuka SEBELUM await — signed URL butuh satu round-trip,
 * dan Safari memblokir window.open yang dipanggil setelah await karena tidak
 * lagi dianggap berasal dari gestur user. Ini persis kasus iPad-nya.
 */
export async function openAttachment(a: Attachment): Promise<void> {
  // 'path' tidak dibuka di sini — komponen yang menanganinya dengan menyalin,
  // karena ia perlu menampilkan konfirmasi "tersalin" ke user.
  if (a.kind === 'path') return;

  if (a.kind === 'link' && a.url) {
    window.open(a.url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!a.storage_path) return;

  const win = window.open('', '_blank', 'noopener,noreferrer');
  try {
    const url = await signedUrl(a.storage_path);
    if (win) win.location.href = url;
    else window.location.href = url; // popup diblokir: buka di tab ini
  } catch (e) {
    win?.close();
    throw e;
  }
}
