import { getStaffAccessContext, staffAccessFail } from "@/lib/staffAccessServer";

export async function GET(request: Request) {
  try {
    const { access } = await getStaffAccessContext(request);
    return Response.json(access, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffAccessFail(error);
  }
}
