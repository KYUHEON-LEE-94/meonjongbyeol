'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '@/app/components/ui/EmptyState'
import { BADGE, BTN_DANGER, BTN_PRIMARY, CARD, H2, INPUT, LABEL, TABLE, TD, TH, TR } from '@/lib/ui/styles'
import AdminPageHeader from '../_components/AdminPageHeader'
import AdminStat from '../_components/AdminStat'

type Member = { id:string; name:string; balance:number }
type Ledger = { id:number; member_name:string; amount:number; reason:string; description:string|null; balance_after:number; created_at:string; actor_name:string }

const REASON_LABEL: Record<string,string> = {
  daily_login: '출석',
  custom_game_participation: '내전 참여',
  cosmetic_purchase: '꾸미기 구매',
  shop_purchase: '상점 구매',
  admin_adjustment: '관리자',
  hall_of_fame: '명예의 전당',
}
const REASON_STYLE: Record<string,string> = {
  daily_login: BADGE.info,
  custom_game_participation: BADGE.brand,
  cosmetic_purchase: BADGE.danger,
  shop_purchase: BADGE.danger,
  admin_adjustment: BADGE.neutral,
  hall_of_fame: BADGE.warn,
}
const REASON_OPTIONS: [string,string][] = [['','전체 유형'],...Object.entries(REASON_LABEL)]

export default function PointsManager() {
  const [members,setMembers]=useState<Member[]>([]); const [ledger,setLedger]=useState<Ledger[]>([])
  const [q,setQ]=useState(''); const [memberId,setMemberId]=useState(''); const [amount,setAmount]=useState(''); const [description,setDescription]=useState(''); const [requestId,setRequestId]=useState('')
  const [sign,setSign]=useState<1|-1>(1)
  const [reasonFilter,setReasonFilter]=useState('')
  const [message,setMessage]=useState(''); const [loading,setLoading]=useState(false)
  const load=useCallback(async()=>{ const res=await fetch(`/api/admin/points?q=${encodeURIComponent(q)}${reasonFilter?`&reason=${reasonFilter}`:''}`,{cache:'no-store'}); const data:unknown=await res.json(); if(res.ok && data && typeof data==='object' && 'members' in data && 'ledger' in data){ const value=data as {members:Member[];ledger:Ledger[]}; setMembers(value.members);setLedger(value.ledger) } else setMessage('포인트 정보를 불러오지 못했습니다.') },[q,reasonFilter])
  useEffect(()=>{ const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[load])
  async function grant(){
    if(!memberId)return
    setLoading(true);setMessage('')
    const id=requestId||crypto.randomUUID();setRequestId(id)
    try {
      const res=await fetch('/api/admin/points',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId,amount:sign*Number(amount),requestId:id,description})})
      const data:unknown=await res.json()
      if(!res.ok){setMessage(data&&typeof data==='object'&&'error'in data?String(data.error):sign>0?'지급하지 못했습니다.':'차감하지 못했습니다.');return}
      setMessage(sign>0?'포인트를 지급했습니다.':'포인트를 차감했습니다.');setAmount('');setDescription('');setRequestId('');await load()
    } catch {
      setMessage('네트워크 오류가 발생했습니다. 같은 요청으로 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }
  const totals=useMemo(()=>ledger.reduce((acc,row)=>{ if(row.amount>0)acc.plus+=row.amount; else acc.minus+=row.amount; return acc },{plus:0,minus:0}),[ledger])
  const segBtn=(active:boolean,tone:'brand'|'danger')=>`flex-1 min-h-10 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${active?(tone==='brand'?'bg-brand text-white':'bg-danger text-white'):'text-muted hover:text-fg'}`
  return <section>
    <AdminPageHeader kicker="Points" title="포인트 관리" description="승인 멤버에게 운영 포인트를 지급하거나 차감합니다." />

    <div className="mb-6 grid grid-cols-3 gap-3">
      <AdminStat label="표시 중인 내역" value={ledger.length.toLocaleString()} hint="최근 내역 기준" />
      <AdminStat label="지급 합계" value={`+${totals.plus.toLocaleString()}P`} tone="brand" compact />
      <AdminStat label="차감 합계" value={`${totals.minus.toLocaleString()}P`} tone={totals.minus<0?'danger':undefined} compact />
    </div>

    <div className={`${CARD} mb-8 grid gap-4 p-5 sm:p-6 md:grid-cols-2`}>
      <div className="flex rounded-2xl bg-surface-2 p-1 md:col-span-2" role="group" aria-label="지급 / 차감 선택">
        <button type="button" aria-pressed={sign>0} onClick={()=>{setSign(1);setRequestId('')}} className={segBtn(sign>0,'brand')}>지급 (+)</button>
        <button type="button" aria-pressed={sign<0} onClick={()=>{setSign(-1);setRequestId('')}} className={segBtn(sign<0,'danger')}>차감 (−)</button>
      </div>
      <label className="space-y-1.5"><span className={LABEL}>멤버 검색</span><input className={INPUT} placeholder="이름으로 검색" value={q} onChange={e=>setQ(e.target.value)} /></label>
      <label className="space-y-1.5"><span className={LABEL}>대상 멤버</span><select className={INPUT} value={memberId} onChange={e=>{setMemberId(e.target.value);setRequestId('')}}><option value="">멤버 선택</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.balance.toLocaleString()}P</option>)}</select></label>
      <label className="space-y-1.5"><span className={LABEL}>포인트</span><input className={`${INPUT} tabular-nums`} type="number" min={1} max={10000} placeholder="1 ~ 10,000" value={amount} onChange={e=>{setAmount(e.target.value);setRequestId('')}} /></label>
      <label className="space-y-1.5"><span className={LABEL}>사유</span><input className={INPUT} maxLength={200} placeholder={sign>0?'지급 사유':'차감 사유'} value={description} onChange={e=>{setDescription(e.target.value);setRequestId('')}} /></label>
      <button className={`${sign>0?BTN_PRIMARY:BTN_DANGER} md:col-span-2`} disabled={loading||!memberId||!amount||Number(amount)<1||!description.trim()} onClick={()=>void grant()}>{loading?(sign>0?'지급 중…':'차감 중…'):(sign>0?'포인트 지급':'포인트 차감')}</button>
      {message&&<p role="status" className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted md:col-span-2">{message}</p>}
    </div>

    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className={H2}>포인트 내역</h2><p className="mt-1 text-xs text-subtle">지급·차감 전체 로그</p></div>
      <select aria-label="유형 필터" className={`${INPUT} w-auto! py-2!`} value={reasonFilter} onChange={e=>setReasonFilter(e.target.value)}>{REASON_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    </div>
    {ledger.length===0
      ? <EmptyState>내역이 없습니다.</EmptyState>
      : <div className={`${CARD} overflow-hidden`}><div className="overflow-x-auto"><table className={`${TABLE} min-w-[720px]`}><thead><tr className="bg-surface-2/60"><th className={TH}>멤버</th><th className={TH}>유형</th><th className={`${TH} text-right`}>증감</th><th className={TH}>사유</th><th className={`${TH} text-right`}>잔액</th><th className={TH}>처리</th><th className={TH}>일시</th></tr></thead><tbody>{ledger.map(row=><tr key={row.id} className={TR}><td className={`${TD} font-bold text-fg`}>{row.member_name}</td><td className={TD}><span className={REASON_STYLE[row.reason]??BADGE.neutral}>{REASON_LABEL[row.reason]??row.reason}</span></td><td className={`${TD} text-right font-bold tabular-nums ${row.amount>0?'text-brand-ink':'text-danger-ink'}`}>{row.amount>0?'+':''}{row.amount.toLocaleString()}P</td><td className={`${TD} text-muted`}>{row.description}</td><td className={`${TD} text-right tabular-nums text-fg`}>{row.balance_after.toLocaleString()}P</td><td className={`${TD} text-muted`}>{row.actor_name}</td><td className={`${TD} whitespace-nowrap text-xs tabular-nums text-subtle`}>{new Date(row.created_at).toLocaleString('ko-KR')}</td></tr>)}</tbody></table></div></div>}
  </section>
}
