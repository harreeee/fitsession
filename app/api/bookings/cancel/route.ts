import { after } from 'next/server';
import { bookingContext, fail, uuid, jsonBody } from '@/lib/booking/server';
import { syncBooking } from '@/lib/booking/sync';
export async function POST(request:Request){try{
 const {db}=await bookingContext(request,['client','trainer','admin']);const body=await jsonBody(request);const id=uuid(body.bookingId);
 const {data,error}=await db.rpc('fxa_cancel_booking',{p_booking_id:id,p_reason:typeof body.reason==='string'?body.reason:''});if(error)throw error;
 after(()=>syncBooking(id));return Response.json({booking:data});
}catch(e){return fail(e);}}
