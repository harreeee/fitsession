import { bookingContext, fail, uuid, BookingError } from '@/lib/booking/server';
import { availability } from '@/lib/booking/availability';
import { businessDate } from '@/lib/businessTime';
export async function GET(request: Request) {try{
 const {admin,user,profile}=await bookingContext(request); const q=new URL(request.url).searchParams;
 const trainerId=uuid(q.get('trainerId')); let clientId:string|null=null;
 if(q.get('clientId')){if(profile.role!=='admin')throw new BookingError('Access denied.',403);clientId=uuid(q.get('clientId'));}
 if(profile.role==='client'){const {data,error}=await admin.from('clients').select('id').eq('profile_id',user.id).single();if(error||!data)throw new BookingError('Linked client account required.');clientId=data.id;}
 const slots=await availability(trainerId,q.get('date')||businessDate(),clientId);
 return Response.json({slots,availability:slots,timeZone:'America/Toronto'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
