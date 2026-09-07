/** Fetch all pages, never silently compute totals from the first REST page. */
export async function allRows<T>(query: {range: (from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>}) {
 const rows:T[]=[];
 for(let from=0;from<100000;from+=500){const r=await query.range(from,from+499);if(r.error)return{data:null,error:r.error};const page=r.data||[];rows.push(...page);if(page.length<500)return{data:rows,error:null};}
 return {data:null,error:{message:'Result too large. Narrow the date range before computing totals.'}};
}
export function sessionText(row:{session_topic?:string|null;session_content?:string|null;trainer_note?:string|null}){
 const topic=row.session_topic?.trim(),content=row.session_content?.trim(),note=row.trainer_note?.trim();
 return [topic,content,note&&note!==content?note:null].filter(Boolean).join('\n\n');
}
