import { bookingContext,fail } from '@/lib/booking/server';
import { allRows } from '@/lib/dataIntegrity';
export async function GET(request:Request){try{const {admin}=await bookingContext(request,['admin']);const result=await allRows(admin.from('clients').select('id,full_name').eq('status','active').order('full_name').order('id'));if(result.error)throw result.error;return Response.json({clients:result.data},{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
