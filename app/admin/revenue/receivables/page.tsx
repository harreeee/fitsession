"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserRole } from "@/lib/checkUserRole";

type Purchase = {
  id: string; client_id: string; plan_name: string; purchase_type: string | null;
  price: number | string; amount_paid: number | string | null; balance_due: number | string | null;
  debt_deadline: string | null; status: string;
  clients: { full_name: string; client_code: string | null } | { full_name: string; client_code: string | null }[] | null;
};
type Account = { id: string; name: string };
const inputClass = "w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-white focus:border-yellow-400 outline-none";
const formatMoney = (n: number | string | null) => new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(Number(n)||0);
function today() {return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}

export default function AccountantClientReceivablesPage() {
  const router=useRouter();
  const [ready,setReady]=useState(false);
  const [rows,setRows]=useState<Purchase[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<Purchase|null>(null);
  const [price,setPrice]=useState("");
  const [deadline,setDeadline]=useState("");
  const [reason,setReason]=useState("");
  const [amount,setAmount]=useState("");
  const [date,setDate]=useState(today());
  const [account,setAccount]=useState("");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const reload=useCallback(async ()=>{
    const [p,a]=await Promise.all([
      supabase.from("client_purchases").select("id,client_id,plan_name,purchase_type,price,amount_paid,balance_due,debt_deadline,status,clients(full_name,client_code)").order("created_at",{ascending:false}),
      supabase.from("finance_accounts").select("id,name").eq("is_active",true).neq("name","Số dư chưa phân bổ").order("name")
    ]);
    if(p.error||a.error){setMessage(p.error?.message||a.error?.message||"Loading failed.");return;}
    setRows((p.data||[]) as Purchase[]);setAccounts((a.data||[]) as Account[]);
  },[]);
  useEffect(()=>{let mounted=true;void getCurrentUserRole().then(({role})=>{
    if(!mounted)return;
    if(role!=="accountant"){router.replace(role==="admin"||role==="manager"?"/admin":"/login");return;}
    setReady(true);void reload();
  });return()=>{mounted=false;};},[reload,router]);
  function choose(p:Purchase){
    setSelected(p);setPrice(String(p.price));setDeadline(p.debt_deadline||"");setReason("");setAmount("");setNote("");setMessage("");
  }
  async function editContract(){
    if(!selected||saving)return;
    if(reason.trim().length<5){setMessage("Nhập lý do sửa tối thiểu 5 ký tự.");return;}
    setSaving(true);
    const result=await supabase.rpc("fxa_accountant_set_contract",{p_purchase_id:selected.id,p_new_price:Number(price),p_debt_deadline:deadline||null,p_reason:reason.trim()});
    setSaving(false);
    if(result.error){setMessage(result.error.message);return;}
    setMessage("Đã cập nhật giá trị hợp đồng và công nợ, không ghi nhận tiền mặt.");
    await reload();setSelected(null);window.dispatchEvent(new Event("fxa:finance-updated"));
  }
  async function collect(){
    if(!selected||saving)return;
    const paid=Number(amount);
    if(!Number.isFinite(paid)||paid<=0||!account||!date){setMessage("Nhập khoản thu hợp lệ, ngày và nguồn tiền.");return;}
    if(!window.confirm(`Ghi nhận thu ${formatMoney(paid)} vào ${accounts.find(a=>a.id===account)?.name}? Công nợ và sổ nhật ký sẽ cùng cập nhật.`))return;
    setSaving(true);const requestId=crypto.randomUUID();
    const result=await supabase.rpc("fxa_accountant_record_receipt",{p_request_id:requestId,p_purchase_id:selected.id,p_amount:paid,p_payment_date:date,p_account_id:account,p_notes:note||null});
    setSaving(false);
    if(result.error){setMessage(result.error.message);return;}
    setMessage("Đã ghi nhận khoản thu. Sổ nhật ký, tài khoản và công nợ cùng cập nhật.");
    await reload();setSelected(null);window.dispatchEvent(new Event("fxa:finance-updated"));
  }
  const visible=rows.filter(p=>{const c=Array.isArray(p.clients)?p.clients[0]:p.clients;return [c?.full_name,c?.client_code,p.plan_name,p.purchase_type].join(" ").toLowerCase().includes(search.toLowerCase());});
  return <main className="min-h-screen bg-[#070707] px-4 py-8 text-white">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 rounded-3xl border border-yellow-400/30 bg-yellow-400/5 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">FXA Fitness · Accountant</p>
        <h1 className="mt-2 text-3xl font-bold">Client Receivables</h1>
        <p className="mt-2 text-sm text-zinc-300">Admin creates clients and renews sessions. Accountant confirms contract numbers and cash receipts here. Cash entries always link back to clients.</p>
        <Link href="/admin/revenue" className="mt-4 inline-block rounded-xl border border-white/20 px-4 py-2 text-sm">← Revenue Journal</Link>
      </header>
      {!ready?<p className="text-yellow-300">Checking Accountant access...</p>:<>
        {message&&<p role="status" className="mb-4 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-100">{message}</p>}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm khách hàng, mã khách, gói tập..." className={inputClass+" mb-5"}/>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="max-h-[72vh] space-y-2 overflow-y-auto rounded-2xl border border-white/10 p-3">
            {visible.map(p=>{const c=Array.isArray(p.clients)?p.clients[0]:p.clients;return <button type="button" key={p.id} onClick={()=>choose(p)} className={`w-full rounded-xl border p-3 text-left hover:border-yellow-400/60 ${selected?.id===p.id?"border-yellow-400 bg-yellow-400/10":"border-white/10"}`}>
              <p className="font-semibold">{c?.full_name||"Unknown client"} <span className="text-xs text-zinc-500">{c?.client_code}</span></p>
              <p className="mt-1 text-sm text-zinc-300">{p.plan_name} · {p.purchase_type||"new"} · {p.status}</p>
              <p className="mt-2 text-sm">Value {formatMoney(p.price)} · Paid <span className="text-green-300">{formatMoney(p.amount_paid)}</span> · Due <span className="text-yellow-300">{formatMoney(p.balance_due)}</span></p>
            </button>;})}
            {visible.length===0&&<p className="p-5 text-zinc-400">No matching purchases.</p>}
          </section>
          <section className="rounded-2xl border border-yellow-400/20 p-5">
            {!selected?<p className="text-zinc-400">Chọn hồ sơ bên trái để nhập hợp đồng hoặc thu tiền.</p>:<>
              <h2 className="text-xl font-semibold">{selected.plan_name}</h2>
              <p className="mt-2 text-sm text-zinc-300">Price {formatMoney(selected.price)} · Paid {formatMoney(selected.amount_paid)} · Due {formatMoney(selected.balance_due)}</p>
              <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                <h3 className="font-semibold text-yellow-300">1. Giá trị hợp đồng / điều chỉnh công nợ</h3>
                <label className="block text-sm">Giá trị hợp đồng CAD<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className={inputClass}/></label>
                <label className="block text-sm">Ngày đến hạn<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} className={inputClass}/></label>
                <label className="block text-sm">Lý do sửa *<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: xác nhận giá gói theo hợp đồng..." className={inputClass}/></label>
                <button disabled={saving||reason.trim().length<5} onClick={()=>void editContract()} className="w-full rounded-xl border border-yellow-400 px-4 py-3 text-yellow-300 disabled:opacity-40">Lưu giá hợp đồng / công nợ</button>
              </div>
              <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
                <h3 className="font-semibold text-green-300">2. Tiền thực thu / Thu công nợ</h3>
                <label className="block text-sm">Số tiền CAD<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className={inputClass}/></label>
                <label className="block text-sm">Ngày thu<input type="date" value={date} onChange={e=>setDate(e.target.value)} className={inputClass}/></label>
                <label className="block text-sm">Nguồn tiền<select value={account} onChange={e=>setAccount(e.target.value)} className={inputClass}><option value="">Chọn CIBC, TD, tiền mặt...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="block text-sm">Ghi chú / số biên nhận<input value={note} onChange={e=>setNote(e.target.value)} className={inputClass}/></label>
                <button disabled={saving||!account||Number(amount)<=0} onClick={()=>void collect()} className="w-full rounded-xl bg-green-400 px-4 py-3 font-semibold text-black disabled:opacity-40">{saving?"Recording...":"Ghi nhận tiền thực thu"}</button>
              </div>
            </>}
          </section>
        </div>
      </>}
    </div>
  </main>;
}
