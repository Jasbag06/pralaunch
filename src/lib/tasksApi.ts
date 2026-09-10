import { supabase } from './supabase';
import type { Milestone, Task, TaskStatus } from './types';
import type { ImportPlan } from './importer';

/**
 * Seluruh task dan milestone user, sekali ambil.
 *
 * Jadwal 30 hari itu ~150 baris — cukup kecil untuk dimuat semuanya lalu
 * dihitung di memori. Itu sebabnya tidak ada view atau RPC di database:
 * pengelompokan per minggu, "siap dikerjakan", dan resolusi dependensi
 * semuanya butuh melihat seluruh himpunan sekaligus, jadi memfilter di server
 * justru akan menambah bolak-balik tanpa menghemat apa pun.
 */
export async function fetchAll(): Promise<{ tasks: Task[]; milestones: Milestone[] }> {
  const [tasks, milestones] = await Promise.all([
    supabase.from('tasks').select('*'),
    supabase.from('milestones').select('*'),
  ]);

  if (tasks.error) throw tasks.error;
  if (milestones.error) throw milestones.error;

  return {
    tasks: (tasks.data ?? []) as Task[],
    milestones: (milestones.data ?? []) as Milestone[],
  };
}

/**
 * Ubah status satu task.
 *
 * `completed_at` sengaja TIDAK dikirim — trigger sync_completed_at di database
 * yang mengisinya. Baris hasil update dikembalikan supaya client memakai nilai
 * yang benar-benar tersimpan, bukan tebakan lokal.
 */
export async function setStatus(id: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

/** Geser jadwal satu task. Dipakai tombol "besok" dan "weekend terdekat". */
export async function reschedule(id: string, scheduledDate: string): Promise<Task> {
  return updateTask(id, { scheduled_date: scheduledDate });
}

/**
 * Kolom yang boleh diubah dari layar detail.
 *
 * `completed_at` sengaja tidak ada di sini — trigger sync_completed_at yang
 * mengisinya. `owner_id` juga tidak: nilainya datang dari default auth.uid()
 * dan RLS akan menolak kalau client mencoba menimpanya.
 */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'scheduled_date'
    | 'week_number'
    | 'workstream'
    | 'priority'
    | 'is_deadline'
    | 'status'
    | 'depends_on'
    | 'estimated_minutes'
    | 'notes'
    | 'sort_order'
    | 'result_hidden_at'
  >
>;

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export type NewTask = TaskPatch & {
  key: string;
  title: string;
  scheduled_date: string;
  week_number: number;
  workstream: Task['workstream'];
};

export async function createTask(input: NewTask): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(input).select().single();

  if (error) throw error;
  return data as Task;
}

/**
 * Hapus task. Trigger prune_depends_on di database akan mencabut key-nya dari
 * depends_on task lain, jadi tidak ada yang tertinggal menunggu hantu — tapi
 * baris lain itu ikut berubah, jadi pemanggil harus memuat ulang datanya.
 */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}


/**
 * Terapkan rencana impor.
 *
 * Urutannya penting: hapus dulu, baru upsert. Kalau dibalik, task baru yang
 * memakai key milik task lama yang akan dihapus akan bentrok dengan constraint
 * unique (owner_id, key).
 *
 * Bukan satu transaksi — PostgREST tidak menyediakannya. Kalau upsert gagal
 * setelah delete berhasil, sebagian minggu bisa kosong; itu sebabnya UI
 * menampilkan preview dan menyarankan Ekspor lebih dulu.
 */
export async function applyImport(
  ownerId: string,
  plan: ImportPlan,
): Promise<{ dihapus: number; ditulis: number; milestone: number }> {
  if (plan.deleteKeys.length > 0) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('owner_id', ownerId)
      .in('key', plan.deleteKeys);
    if (error) throw error;
  }

  const rows = [...plan.insert, ...plan.update].map((r) => ({ ...r, owner_id: ownerId }));
  if (rows.length > 0) {
    const { error } = await supabase
      .from('tasks')
      .upsert(rows, { onConflict: 'owner_id,key' });
    if (error) throw error;
  }

  // Milestone ditulis SETELAH task, karena tasks.milestone_id boleh menunjuk
  // ke sini. Selalu upsert, tidak pernah dihapus — lihat catatan di ImportPlan.
  if (plan.milestones.length > 0) {
    const { error } = await supabase
      .from('milestones')
      .upsert(
        plan.milestones.map((m) => ({ ...m, owner_id: ownerId })),
        { onConflict: 'owner_id,key' },
      );
    if (error) throw error;
  }

  return {
    dihapus: plan.deleteKeys.length,
    ditulis: rows.length,
    milestone: plan.milestones.length,
  };
}
