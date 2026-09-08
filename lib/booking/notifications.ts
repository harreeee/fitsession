import { BUSINESS_TIME_ZONE } from '../businessTime';
import { createServiceSupabaseClient } from '../supabaseServer';

type BookingEmailRow = {
  id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  trainer_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string | null;
};

type TrainerEmailRow = {
  full_name: string | null;
  email: string | null;
};

function escapeHtml(value: string | null | undefined) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bookingTimeLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(start);

  const startTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(start);

  const endTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(end);

  return `${date}, ${startTime} - ${endTime}`;
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    'FXA FITNESS <bookings@fxafitness.app>';

  if (!apiKey) {
    console.warn('[booking-email] RESEND_API_KEY is missing; trainer email skipped.');
    return { sent: false, reason: 'missing_RESEND_API_KEY' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Trainer booking email failed (${response.status}): ${detail.slice(0, 220)}`,
    );
  }

  return { sent: true };
}

export async function sendTrainerBookingEmail(bookingId: string) {
  const db = createServiceSupabaseClient();

  const { data: booking, error: bookingError } = await db
    .from('bookings')
    .select('id, client_name, client_email, client_phone, trainer_id, starts_at, ends_at, status')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) throw bookingError;
  const cleanBooking = booking as BookingEmailRow | null;
  if (!cleanBooking || cleanBooking.status !== 'booked' || !cleanBooking.trainer_id) return;

  const { data: trainer, error: trainerError } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('id', cleanBooking.trainer_id)
    .maybeSingle();

  if (trainerError) throw trainerError;
  const cleanTrainer = trainer as TrainerEmailRow | null;
  const trainerEmail = cleanTrainer?.email?.trim();

  if (!trainerEmail) {
    console.warn(`[booking-email] Trainer email missing for booking ${bookingId}.`);
    return;
  }

  const when = bookingTimeLabel(cleanBooking.starts_at, cleanBooking.ends_at);
  const clientName = cleanBooking.client_name || 'Client';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fxafitness.app';
  const bookingUrl = `${siteUrl.replace(/\/$/, '')}/trainer/calendar`;

  const text = [
    `New FXA booking`,
    `Client: ${clientName}`,
    `Time: ${when} (${BUSINESS_TIME_ZONE})`,
    cleanBooking.client_email ? `Client email: ${cleanBooking.client_email}` : null,
    cleanBooking.client_phone ? `Client phone: ${cleanBooking.client_phone}` : null,
    `Open calendar: ${bookingUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#050505;color:#ffffff;padding:24px;border-radius:18px;max-width:560px">
      <p style="margin:0 0 8px;color:#facc15;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase">FXA FITNESS</p>
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.2">New client booking</h1>
      <div style="background:#111111;border:1px solid #333333;border-radius:14px;padding:18px;margin-bottom:18px">
        <p style="margin:0;color:#888888;font-size:12px;text-transform:uppercase;letter-spacing:0.12em">Client</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:800">${escapeHtml(clientName)}</p>
        <p style="margin:14px 0 0;color:#888888;font-size:12px;text-transform:uppercase;letter-spacing:0.12em">Session time</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:800;color:#facc15">${escapeHtml(when)}</p>
        <p style="margin:6px 0 0;color:#9ca3af;font-size:13px">Toronto time</p>
      </div>
      <p style="margin:0 0 6px;color:#d1d5db">${cleanBooking.client_email ? `Email: ${escapeHtml(cleanBooking.client_email)}` : ''}</p>
      <p style="margin:0 0 18px;color:#d1d5db">${cleanBooking.client_phone ? `Phone: ${escapeHtml(cleanBooking.client_phone)}` : ''}</p>
      <a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:#facc15;color:#000000;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px">Open FXA calendar</a>
    </div>
  `;

  await sendResendEmail({
    to: trainerEmail,
    subject: `New FXA booking: ${clientName} - ${when}`,
    text,
    html,
  });
}
