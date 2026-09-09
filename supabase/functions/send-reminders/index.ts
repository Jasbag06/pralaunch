/**
 * send-reminders — dipanggil pg_cron tiap 15 menit.
 *
 * Cron-nya sering, tapi function inilah yang memutuskan apakah sudah waktunya.
 * pg_cron menyimpan jadwal statis dalam UTC; kalau jam reminder dipatok di
 * sana, mengubahnya lewat Settings tidak akan berpengaruh sampai kamu ingat
 * masuk SQL editor. Dengan cara ini toggle di Settings benar-benar bekerja.
 *
 * Deduplikasi ada di tabel notification_log — tanpa itu ringkasan harian
 * terkirim 96x sehari.
 *
 * Deploy:
 *   supabase functions deploy send-reminders --no-verify-jwt
 * Dipanggil tanpa JWT user; pengamannya header x-cron-secret.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { addDays, daysBetween, hourJakarta, todayJakarta } from '../_shared/waktu.ts';
import { pesanDeadline, pesanTelat, ringkasanHarian } from '../_shared/pesan.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC = env('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = env('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = env('VAPID_SUBJECT');
const CRON_SECRET = env('CRON_SECRET');
const RESEND_API_KEY = env('RESEND_API_KEY');
const RESEND_FROM = env('RESEND_FROM') || 'Pra-Launch <onboarding@resend.dev>';

type Kind = 'daily_digest' | 'deadline' | 'overdue';

interface Task {
  id: string;
  key: string;
  title: string;
  scheduled_date: string;
  status: string;
  is_deadline: boolean;
  workstream: string;
}

interface Settings {
  owner_id: string;
  target_arrival_date: string | null;
  reminder_enabled: boolean;
  reminder_hour: number;
  deadline_alert_enabled: boolean;
  overdue_alert_enabled: boolean;
  email_fallback_enabled: boolean;
  email_address: string | null;
}

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failed_count: number;
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

// ------------------------------------------------------------ pengiriman ---

async function kirimPush(subs: Sub[], payload: unknown) {
  let sent = 0;
  let failed = 0;

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;

      // 404/410 = endpoint sudah mati permanen (PWA dihapus, langganan
      // kedaluwarsa). Kalau tidak dimatikan, tiap pengiriman berikutnya
      // makin lama karena menunggu endpoint mati satu per satu.
      if (status === 404 || status === 410) {
        await db
          .from('push_subscriptions')
          .update({ disabled_at: new Date().toISOString() })
          .eq('id', s.id);
      } else {
        await db
          .from('push_subscriptions')
          .update({ failed_count: s.failed_count + 1 })
          .eq('id', s.id);
      }
    }
  }

  return { sent, failed };
}

async function kirimEmail(ke: string, judul: string, isi: string) {
  if (!RESEND_API_KEY) return { sent: 0, failed: 1, note: 'RESEND_API_KEY kosong' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [ke],
      subject: judul,
      text: isi,
    }),
  });

  if (!res.ok) {
    return { sent: 0, failed: 1, note: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  return { sent: 1, failed: 0 };
}

/** Sudah pernah dikirim hari ini? Insert unik jadi kunci anti-dobel. */
async function catat(
  ownerId: string,
  kind: Kind,
  forDate: string,
  channel: 'push' | 'email',
  hasil: { sent: number; failed: number; note?: string },
): Promise<boolean> {
  const { error } = await db.from('notification_log').insert({
    owner_id: ownerId,
    kind,
    for_date: forDate,
    channel,
    sent_count: hasil.sent,
    failed_count: hasil.failed,
    detail: hasil.note ? { note: hasil.note } : {},
  });
  // 23505 = unique violation -> sudah pernah dikirim, bukan error sungguhan.
  return !error || error.code === '23505';
}

async function sudahDikirim(ownerId: string, kind: Kind, forDate: string, channel: string) {
  const { data } = await db
    .from('notification_log')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('kind', kind)
    .eq('for_date', forDate)
    .eq('channel', channel)
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------- utama ----

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const now = new Date();
  const today = todayJakarta(now);
  const jam = hourJakarta(now);
  const besok = addDays(today, 1);
  const laporan: unknown[] = [];

  const { data: semuaSettings, error } = await db.from('app_settings').select('*');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  for (const s of (semuaSettings ?? []) as Settings[]) {
    // Milestone yang tanggalnya sudah lewat tapi masih pending -> missed.
    await db
      .from('milestones')
      .update({ status: 'missed' })
      .eq('owner_id', s.owner_id)
      .eq('status', 'pending')
      .lt('target_date', today);

    if (!s.reminder_enabled || jam !== s.reminder_hour) {
      laporan.push({ owner: s.owner_id, lewat: `jam ${jam} bukan ${s.reminder_hour}` });
      continue;
    }

    const { data: tasks } = await db
      .from('tasks')
      .select('id,key,title,scheduled_date,status,is_deadline,workstream')
      .eq('owner_id', s.owner_id)
      .in('status', ['todo', 'in_progress']);

    const terbuka = (tasks ?? []) as Task[];
    const hariIni = terbuka.filter((t) => t.scheduled_date === today);
    const telat = terbuka.filter((t) => t.scheduled_date < today);
    const deadlineDekat = terbuka.filter(
      (t) => t.is_deadline && (t.scheduled_date === today || t.scheduled_date === besok),
    );
    const telatLama = telat.filter((t) => daysBetween(t.scheduled_date, today) > 1);

    const { data: subsRaw } = await db
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth,failed_count')
      .eq('owner_id', s.owner_id)
      .is('disabled_at', null);
    const subs = (subsRaw ?? []) as Sub[];

    const pesan = ringkasanHarian(hariIni, telat, s.target_arrival_date, today);

    // --- ringkasan harian ---
    if (!(await sudahDikirim(s.owner_id, 'daily_digest', today, 'push')) && subs.length > 0) {
      const hasil = await kirimPush(subs, { ...pesan, tag: 'harian', url: './#/' });
      await catat(s.owner_id, 'daily_digest', today, 'push', hasil);
      laporan.push({ owner: s.owner_id, kind: 'daily_digest', ...hasil });
    }

    if (
      s.email_fallback_enabled &&
      s.email_address &&
      !(await sudahDikirim(s.owner_id, 'daily_digest', today, 'email'))
    ) {
      const hasil = await kirimEmail(s.email_address, pesan.title, pesan.body);
      await catat(s.owner_id, 'daily_digest', today, 'email', hasil);
      laporan.push({ owner: s.owner_id, kind: 'daily_digest', channel: 'email', ...hasil });
    }

    // --- deadline kritis hari ini / besok ---
    if (
      s.deadline_alert_enabled &&
      deadlineDekat.length > 0 &&
      subs.length > 0 &&
      !(await sudahDikirim(s.owner_id, 'deadline', today, 'push'))
    ) {
      const hasil = await kirimPush(subs, {
        title: `Deadline: ${deadlineDekat.length} task kritis`,
        body: deadlineDekat.map((t) => `• ${t.title} (${t.scheduled_date})`).join('\n'),
        tag: 'deadline',
        url: './#/',
      });
      await catat(s.owner_id, 'deadline', today, 'push', hasil);
      laporan.push({ owner: s.owner_id, kind: 'deadline', ...hasil });
    }

    // --- telat lebih dari sehari ---
    if (
      s.overdue_alert_enabled &&
      telatLama.length > 0 &&
      subs.length > 0 &&
      !(await sudahDikirim(s.owner_id, 'overdue', today, 'push'))
    ) {
      const hasil = await kirimPush(subs, {
        title: `${telatLama.length} task telat lebih dari sehari`,
        body: telatLama.map((t) => `• ${t.title}`).slice(0, 5).join('\n'),
        tag: 'overdue',
        url: './#/',
      });
      await catat(s.owner_id, 'overdue', today, 'push', hasil);
      laporan.push({ owner: s.owner_id, kind: 'overdue', ...hasil });
    }
  }

  return Response.json({ ok: true, today, jam, laporan });
});
