import { after } from 'next/server';
import { bookingContext, fail, BookingError, uuid } from '@/lib/booking/server';
import { canClientCancel } from '@/lib/booking/time';
import { syncBooking } from '@/lib/booking/sync';
export async function GET(request:Request){try{
 const {db,admin,user,profile}=await bookingContext(request);
 const explicitClient=new URL(request.url).searchParams.get('clientId');if(explicitClient&&profile.role!=='admin')throw new BookingError('Access denied.',403);
 let query=db.from('bookings').select('id,client_id,trainer_id,client_name,starts_at,ends_at,status,google_sync_status').eq('status','booked').order('starts_at').limit(100);
 if(explicitClient)query=query.eq('client_id',uuid(explicitClient));
 if(profile.role==='trainer')query=query.eq('trainer_id',user.id);
 if(profile.role==='client'){const {data,error}=await admin.from('clients').select('id').eq('profile_id',user.id).single();if(error||!data)throw new BookingError('Linked client account required.');query=query.eq('client_id',data.id);}
 const {data,error}=await query;if(error)throw error;
 const ids=[...new Set((data||[]).map(b=>b.trainer_id))];
 const {data:staff,error:staffError}=ids.length?await admin.from('profiles').select('id,full_name').in('id',ids):{data:[],error:null};if(staffError)throw staffError;
 const names=new Map((staff||[]).map(s=>[s.id,s.full_name]));
 const bookings=(data||[]).map(b=>({...b,trainer_name:names.get(b.trainer_id)||'Trainer',can_cancel:profile.role==='client'?canClientCancel(b.starts_at):['admin','trainer'].includes(profile.role)&&Date.parse(b.starts_at)>Date.now()}));
 // Recover persisted sync jobs on page visits as well as the initial request.
 const pending=bookings.filter(b=>b.google_sync_status!=='synced').slice(0,3);
 after(async()=>{for(const b of pending)await syncBooking(b.id);});
 return Response.json({bookings,serverTime:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
