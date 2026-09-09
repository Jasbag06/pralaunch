import { supabase } from './supabase';
import type { AppSettings } from './types';

/**
 * Ambil baris settings user; buat dengan nilai default kalau belum ada.
 *
 * app_settings adalah singleton per user tapi tidak ada trigger yang membuatnya
 * saat signup — user dibuat lewat Supabase Dashboard, bukan lewat app. Jadi
 * baris pertamanya lahir di sini, saat login pertama.
 */
export async function ensureSettings(ownerId: string): Promise<AppSettings> {
  const existing = await supabase
    .from('app_settings')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as AppSettings;

  const created = await supabase
    .from('app_settings')
    .insert({ owner_id: ownerId })
    .select()
    .single();

  if (created.error) throw created.error;
  return created.data as AppSettings;
}

export async function updateSettings(
  ownerId: string,
  patch: Partial<Omit<AppSettings, 'owner_id' | 'created_at' | 'updated_at'>>,
): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .update(patch)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) throw error;
  return data as AppSettings;
}
