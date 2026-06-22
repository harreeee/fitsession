import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../../lib/supabaseClient';
import { toCsv } from '@/lib/csv';

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const year = Number(searchParams.get('year'));
  const month = Number(searchParams.get('month'));

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  const { start, end } = getMonthRange(year, month);

  const { data, error } = await supabase
    .from('session_history')
    .select(`
      id,
      created_at,
      check_in_time,
      session_type,
      status,
      notes,
      client:client_id (
        full_name,
        email
      ),
      trainer:trainer_id (
        full_name,
        email
      )
    `)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows =
    data?.map((item: any) => ({
      Date: item.created_at,
      'Check-in Time': item.check_in_time ?? '',
      'Client Name': item.client?.full_name ?? '',
      'Client Email': item.client?.email ?? '',
      'Trainer Name': item.trainer?.full_name ?? '',
      'Trainer Email': item.trainer?.email ?? '',
      'Session Type': item.session_type ?? '',
      Status: item.status ?? '',
      Notes: item.notes ?? '',
    })) ?? [];

  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="FXA-Session-History-${year}-${String(
        month
      ).padStart(2, '0')}.csv"`,
    },
  });
}