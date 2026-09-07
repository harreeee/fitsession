import { bookingContext,fail,uuid,BookingError } from '@/lib/booking/server';
export async function GET(request:Request){try{
 const {admin,user,profile}=await bookingContext(request);const clientId=new URL(request.url).searchParams.get('clientId');
 if(clientId&&profile.role!=='admin')throw new BookingError('Access denied.',403);
 const staff=await admin.from('profiles').select('id,full_name').eq('role','trainer').order('full_name');if(staff.error)throw staff.error;
 let main:string|undefined;
 if(profile.role==='client'||clientId){let query=admin.from('clients').select('assigned_trainer_id');query=clientId?query.eq('id',uuid(clientId)):query.eq('profile_id',user.id);const client=await query.single();if(client.error)throw new BookingError('Linked client account required.');main=client.data.assigned_trainer_id;}
 return Response.json({staff:(staff.data||[]).map(s=>({...s,is_main:s.id===main})).sort((a,b)=>Number(b.is_main)-Number(a.is_main)||a.full_name.localeCompare(b.full_name))},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
