import { NextResponse } from 'next/server';
import { bookingContext, fail, BookingError } from '@/lib/booking/server';
import { getGoogleOAuthUrl, requireEnv } from '@/lib/googleCalendar';
export async function POST(request:Request){try{
 const {admin,user}=await bookingContext(request,['trainer','admin']);
 if(new URL(requireEnv('GOOGLE_REDIRECT_URI')).origin!==new URL(request.url).origin)throw new BookingError('Google callback is not configured for this environment.',503);
 const state=crypto.randomUUID();const {error}=await admin.from('google_calendar_oauth_states').insert({state,trainer_id:user.id});if(error)throw error;
 const response=NextResponse.json({url:getGoogleOAuthUrl(state)});
 response.cookies.set('fxa-calendar-state',state,{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'lax',maxAge:600,path:'/api/google-calendar/callback'});
 return response;
}catch(e){return fail(e);}}
