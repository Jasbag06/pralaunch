import type { IsoDate } from './date';

export const WORKSTREAMS = [
  'Legal',
  'Branding',
  'Riset',
  'Listing',
  'Operasional',
  'Konten',
  'Ads',
  'Supplier',
  'Keuangan',
] as const;
export type Workstream = (typeof WORKSTREAMS)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'skipped'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['critical', 'normal', 'buffer'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const MILESTONE_STATUSES = ['pending', 'achieved', 'missed'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Cermin tabel `tasks`. `depends_on` berisi Task['key'], bukan uuid. */
export interface Task {
  id: string;
  owner_id: string;
  key: string;
  title: string;
  description: string | null;
  scheduled_date: IsoDate;
  week_number: number;
  workstream: Workstream;
  priority: Priority;
  is_deadline: boolean;
  milestone_id: string | null;
  status: TaskStatus;
  completed_at: string | null;
  depends_on: string[];
  estimated_minutes: number | null;
  notes: string | null;
  sort_order: number;
  /** Disembunyikan dari blok "Hasil tersimpan" di Dasbor. Task-nya sendiri
   *  tetap utuh — masih di riwayat, Timeline, dan hitungan progres. */
  result_hidden_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  owner_id: string;
  key: string;
  title: string;
  target_date: IsoDate;
  week_number: number;
  status: MilestoneStatus;
  achieved_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Lampiran task, tiga jenis:
 *   file — salinan di Supabase Storage, bisa dibuka & di-download di mana saja
 *   link — URL Drive/OneDrive/Sheet, selalu menunjuk versi terbaru
 *   path — catatan lokasi file di komputer; diklik untuk menyalin, tidak bisa
 *          dibuka (browser memblokir file:// dari halaman http)
 * Lihat 0003_attachments.sql dan 0004_attachment_path.sql.
 */
export interface Attachment {
  id: string;
  owner_id: string;
  task_id: string;
  kind: 'file' | 'link' | 'path';
  label: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  local_path: string | null;
  sort_order: number;
  created_at: string;
}

export interface AppSettings {
  owner_id: string;
  target_arrival_date: IsoDate | null;
  reminder_enabled: boolean;
  reminder_hour: number;
  deadline_alert_enabled: boolean;
  overdue_alert_enabled: boolean;
  email_fallback_enabled: boolean;
  email_address: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}
