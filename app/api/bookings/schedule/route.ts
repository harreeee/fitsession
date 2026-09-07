import { bookingContext, fail, jsonBody, uuid } from '@/lib/booking/server';
import { getTrainerCalendarConnection } from '@/lib/googleCalendar';
export async function GET(request:Request){try{
 const {db,user}=await bookingContext(request,['trainer','admin']);
 const [w,b,c]=await Promise.all([db.from('trainer_availability').select('weekday,start_minute,end_minute').eq('trainer_id',user.id).order('weekday').order('start_minute'),db.from('trainer_time_blocks').select('id,starts_at,ends_at,reason').eq('trainer_id',user.id).gt('ends_at',new Date().toISOString()).order('starts_at'),getTrainerCalendarConnection(user.id)]);
 if(w.error||b.error)throw w.error||b.error;
 return Response.json({windows:w.data,blocks:b.data,connection:c?{google_email:c.google_email,connected:true}:null},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
export async function PUT(request:Request){try{
 const {db}=await bookingContext(request,['trainer','admin']);const b=await jsonBody(request);
 const {error}=await db.rpc('fxa_save_availability',{p_windows:b.windows});if(error)throw error;return Response.json({ok:true});
}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 const {db}=await bookingContext(request,['trainer','admin']);const b=await jsonBody(request);
 const {data,error}=await db.rpc('fxa_block_time',{p_starts_at:b.startsAt,p_ends_at:b.endsAt,p_reason:typeof b.reason==='string'?b.reason:'',p_delete_id:null});if(error)throw error;return Response.json({id:data});
}catch(e){return fail(e);}}
export async function DELETE(request:Request){try{
 const {db}=await bookingContext(request,['trainer','admin']);const b=await jsonBody(request);
 const {error}=await db.rpc('fxa_block_time',{p_starts_at:null,p_ends_at:null,p_reason:'',p_delete_id:uuid(b.id)});if(error)throw error;return Response.json({ok:true});
}catch(e){return fail(e);}}
