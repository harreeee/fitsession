import { requireAdminAccess, staffAccessFail } from "@/lib/staffAccessServer";

export async function GET(request:Request){
  try {
    const {admin}=await requireAdminAccess(request);
    const {data,error}=await admin.from("profiles").select("id,full_name,email,role").order("full_name");
    if(error)throw error;
    return Response.json({profiles:data||[]},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return staffAccessFail(error);}
}

export async function PATCH(request:Request){
  try {
    const {admin}=await requireAdminAccess(request);
    const body=await request.json() as {profileId?:string; action?:"assign"|"revoke"};
    if(!body.profileId||!/^[0-9a-f-]{36}$/i.test(body.profileId)||!["assign","revoke"].includes(body.action||"")){
      return Response.json({error:"A valid user and action are required."},{status:400});
    }
    const {data:target,error:lookupError}=await admin.from("profiles").select("id,full_name,email,role").eq("id",body.profileId).single();
    if(lookupError||!target)return Response.json({error:"User not found."},{status:404});
    if(target.role==="admin")return Response.json({error:"Admin roles cannot be reassigned here."},{status:403});
    if(body.action==="revoke"&&target.role!=="accountant")return Response.json({error:"Selected user is not an Accountant."},{status:400});
    const newRole=body.action==="assign"?"accountant":"manager";
    const {data,error}=await admin.from("profiles").update({role:newRole}).eq("id",body.profileId).eq("role",target.role).select("id,full_name,email,role").single();
    if(error||!data)return Response.json({error:error?.message||"User role changed concurrently."},{status:409});
    return Response.json({success:true,previousRole:target.role,profile:data},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return staffAccessFail(error);}
}
