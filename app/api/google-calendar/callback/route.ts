import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabaseServer';
import { exchangeCodeForTokens, getGoogleEmail } from '@/lib/googleCalendar';
export async function GET(request:NextRequest){
 const redirect=(message:string,ok=false)=>{const response=NextResponse.redirect(new URL(`/trainer/calendar?${ok?'connected=1':`error=${encodeURIComponent(message)}`}`,request.url));response.cookies.set('fxa-calendar-state','',{maxAge:0,path:'/api/google-calendar/callback',httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'});return response;};
 try{
  const q=request.nextUrl.searchParams;const state=q.get('state'),code=q.get('code');
  if(q.get('error')||!state||!code||state!==request.cookies.get('fxa-calendar-state')?.value)return redirect('Invalid or expired Google authorization. Please reconnect.');
  const db=createServiceSupabaseClient();
  const {data:row,error}=await db.from('google_calendar_oauth_states').delete().eq('state',state).gte('created_at',new Date(Date.now()-600000).toISOString()).select('trainer_id').single();
  if(error||!row)return redirect('Google authorization expired. Please reconnect.');
  const {data:profile}=await db.from('profiles').select('role').eq('id',row.trainer_id).single();
  if(!profile||!['trainer','admin'].includes(profile.role))return redirect('Access denied.');
  const token=await exchangeCodeForTokens(code),email=await getGoogleEmail(token.access_token);
  const {data:existing}=await db.from('trainer_google_calendar_connections').select('refresh_token,calendar_id').eq('trainer_id',row.trainer_id).maybeSingle();
  const refresh=token.refresh_token||existing?.refresh_token;if(!refresh)return redirect('Offline calendar access is required. Please reconnect.');
  const {error:saved}=await db.from('trainer_google_calendar_connections').upsert({trainer_id:row.trainer_id,google_email:email,access_token:token.access_token,refresh_token:refresh,token_expiry:new Date(Date.now()+(token.expires_in||3600)*1000).toISOString(),calendar_id:existing?.calendar_id||'primary',updated_at:new Date().toISOString()},{onConflict:'trainer_id'});
  return saved?redirect('Could not save Google connection.'):redirect('',true);
 }catch{return redirect('Google connection failed. Please reconnect.');}
}
