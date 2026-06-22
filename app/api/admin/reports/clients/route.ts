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

  const { end } = getMonthRange(year, month);

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      phone,
      role,
      created_at,
      session_balance:client_session_balances (
        total_sessions_purchased,
        total_sessions_used,
        remaining_sessions
      )
    `)
    .eq('role', 'client')
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows =
    data?.map((client: any) => {
      const balance = Array.isArray(client.session_balance)
        ? client.session_balance[0]
        : client.session_balance;

      return {
        'Client Name': client.full_name ?? '',
        Email: client.email ?? '',
        Phone: client.phone ?? '',
        'Join Date': client.created_at,
        'Total Sessions Purchased': balance?.total_sessions_purchased ?? 0,
        'Total Sessions Used': balance?.total_sessions_used ?? 0,
        'Remaining Sessions': balance?.remaining_sessions ?? 0,
      };
    }) ?? [];

  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="FXA-Clients-${year}-${String(
        month
      ).padStart(2, '0')}.csv"`,
    },
  });
}