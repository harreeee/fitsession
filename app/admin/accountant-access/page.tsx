"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {staffFetch} from "@/lib/staffFetch";
import {getCurrentUserRole} from "@/lib/checkUserRole";

type Profile={id:string;full_name:string|null;email:string|null;role:string};
export default function AccountantAccessPage(){
 const router=useRouter();const [profiles,setProfiles]=useState<Profile[]>([]);
 const [selected,setSelected]=useState("");const [ready,setReady]=useState(false);
 const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 async function load(){try{const data=await staffFetch<{profiles:Profile[]}>("/api/admin/accountant-role");setProfiles(data.profiles);}catch(e){setMessage(e instanceof Error?e.message:"Could not load users.");}}
 useEffect(()=>{void getCurrentUserRole().then(({role})=>{if(role!=="admin"){router.replace(role==="accountant"?"/admin/revenue":"/login");return;}setReady(true);void load();});},[router]);
 const target=profiles.find(p=>p.id===selected);
 async function update(action:"assign"|"revoke"){
   if(!target||saving)return;
   const next=action==="assign"?"accountant":"manager";
   if(!window.confirm(`Change ${target.full_name||target.email} from ${target.role} to ${next}? Their previous app permissions will be replaced immediately.`))return;
   setSaving(true);try{await staffFetch("/api/admin/accountant-role",{method:"PATCH",body:JSON.stringify({profileId:target.id,action})});setMessage("Role updated. User must sign in again.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Role update failed.");}finally{setSaving(false);}
 }
 return <main className="min-h-screen bg-black p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-yellow-400/25 p-6">
 <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">FxA Fitness · Admin only</p>
 <h1 className="mt-2 text-3xl font-bold">Accountant Access</h1>
 <p className="mt-3 text-sm text-zinc-300">Assign an existing dedicated user account as Accountant. This replaces their previous role. Admin remains responsible for client data; Accountant handles financial numbers.</p>
 <Link href="/admin" className="mt-4 inline-block rounded-xl border border-white/15 px-4 py-2 text-sm">Back to Admin</Link>
 {message&&<p role="status" className="mt-4 rounded-xl bg-yellow-400/10 p-3 text-yellow-100">{message}</p>}
 {ready?<div className="mt-6 space-y-4">
 <label className="block text-sm">Account <select className="mt-2 w-full rounded-xl border border-white/20 bg-black p-3" value={selected} onChange={e=>setSelected(e.target.value)}>
 <option value="">Select a user</option>{profiles.filter(p=>p.role!=="admin").map(p=><option key={p.id} value={p.id}>{p.full_name||p.email||p.id} ({p.role})</option>)}</select></label>
 {target&&<div className="rounded-xl border border-white/15 p-3 text-sm"><b>{target.full_name}</b><p>{target.email||"No email"}</p><p>Current role: {target.role}</p></div>}
 <div className="flex flex-wrap gap-3">
 <button disabled={!target||saving||target.role==="accountant"} onClick={()=>void update("assign")} className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black disabled:opacity-40">Assign Accountant</button>
 <button disabled={!target||saving||target.role!=="accountant"} onClick={()=>void update("revoke")} className="rounded-xl border border-white/20 px-5 py-3 disabled:opacity-40">Revoke → Manager</button>
 </div></div>:<p className="mt-5 text-zinc-300">Checking Admin access...</p>}
 </div></main>;
}
