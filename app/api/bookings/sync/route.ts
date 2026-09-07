import { bookingContext, fail, uuid, jsonBody, BookingError } from '@/lib/booking/server';
import { syncBooking } from '@/lib/booking/sync';
export async function POST(request:Request){try{
 const {db,profile,user,admin}=await bookingContext(request,['trainer','admin','client']);const b=await jsonBody(request);const id=uuid(b.bookingId);
 const {data,error}=await db.from('bookings').select('id,trainer_id,client_id').eq('id',id).single();if(error||!data)throw new BookingError('Booking not found.',404);
 if(profile.role==='trainer'&&data.trainer_id!==user.id)throw new BookingError('Access denied.',403);
 if(profile.role==='client'){const own=await admin.from('clients').select('id').eq('id',data.client_id).eq('profile_id',user.id).single();if(own.error)throw new BookingError('Access denied.',403);}
 await syncBooking(id);return Response.json({ok:true});
}catch(e){return fail(e);}}
