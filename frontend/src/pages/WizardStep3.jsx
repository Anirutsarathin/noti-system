// frontend/src/pages/WizardStep3.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Stepper from '../components/Stepper'
import { getProfile, createProfile, updateProfile, testLine, testEmail } from '../store/storage'
import { useWizard } from '../store/wizard'
import { genId } from '../store/storage_local_ids'
import Swal from 'sweetalert2'

function safeArray(v){ return Array.isArray(v) ? v : [] }

function applyDefaultRuleIfEmpty(sensor){
  const rules = safeArray(sensor?.rules)
  if (rules.length > 0) return sensor
  return {
    ...sensor,
    rules: [{
      op: '==',
      value: 0,
      value2: null,
      level: 'normal',
      priority: 10
    }]
  }
}

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true,
})

const nowStr = () =>
  new Date().toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

async function runWithLoading(title, fn){
  Swal.fire({
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading(),
  })
  try {
    const res = await fn()
    Swal.close()
    return res
  } catch (e) {
    Swal.close()
    throw e
  }
}

const getErrMsg = (e) =>
  e?.response?.data?.message || e?.message || 'เกิดข้อผิดพลาด'

export default function WizardStep3({ mode }){
  const nav = useNavigate()
  const { id } = useParams()
  const { draft, setFromExisting, update, updateRecipients } = useWizard()

  const [lineInput, setLineInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const effectiveMode = useMemo(() => {
    if (mode === 'create' || mode === 'edit') return mode
    return id ? 'edit' : 'create'
  }, [mode, id])

  // ✅ hydrate ตอนเข้าหน้า edit step3 ตรงๆ
  useEffect(() => {
    const run = async () => {
      if (effectiveMode !== 'edit') return
      if (!id) return
      if (draft?.id != null && String(draft.id) === String(id)) return

      setLoading(true)
      try {
        const p = await getProfile(id)

        const dataMode = Number(p?.avg_window_min || 0) > 0 ? 'avg' : 'latest'
        const avgWindowMin = Number(p?.avg_window_min || 30)

        setFromExisting({
          id: p.id,
          name: p.profile_name ?? '',
          isActive: !!p.is_active,
          targets: {
            stations: safeArray(p.stations),
            scheduleType: p.send_mode === 'times' ? 'times' : 'interval',
            intervalMinutes: p.interval_min || 1,
            times: safeArray(p.times).map(String),

            // ✅ สำคัญ: โหมดข้อมูล
            dataMode,
            avgWindowMin,
          },
          sensors: safeArray(p.sensors).map(s => ({
            key: s.key,
            label: s.label ?? s.key,
            unit: s.unit ?? '',
            rules: safeArray(s.rules)
          })),
          recipients: {
            lineTokens: safeArray(p?.recipients?.lineTargets).map(t => ({ id: genId(), token: t })),
            emails: safeArray(p?.recipients?.emails).map(e => ({ id: genId(), email: e })),
          }
        })
      } catch {
        nav('/', { replace: true })
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, id])

  const safeRecipients = useMemo(() => ({
    lineTokens: safeArray(draft?.recipients?.lineTokens),
    emails: safeArray(draft?.recipients?.emails),
  }), [draft?.recipients])

  const receiverCount = safeRecipients.lineTokens.length + safeRecipients.emails.length

  const canSave = useMemo(() => {
    const hasName = (draft?.name || '').trim().length > 0
    return hasName && receiverCount > 0
  }, [draft?.name, receiverCount])

  const goPrev = () => {
    if (effectiveMode === 'create') nav('/new/step-2')
    else nav(`/edit/${id}/step-2`)
  }

  const addLineToken = () => {
    setErr('')
    const token = lineInput.trim()
    if (!token) { Swal.fire({ icon:'warning', title:'กรุณาใส่ LINE Target ID ก่อน' }); return }
    if (safeRecipients.lineTokens.some(x => x.token === token)) { Swal.fire({ icon:'info', title:'มีรายการนี้แล้ว' }); return }
    updateRecipients({ lineTokens: [{ id: genId(), token }, ...safeRecipients.lineTokens] })
    setLineInput('')
    toast.fire({ icon:'success', title:`เพิ่ม LINE แล้ว (${nowStr()})` })
  }

  const addEmailAddr = () => {
    setErr('')
    const email = emailInput.trim()
    if (!email) { Swal.fire({ icon:'warning', title:'กรุณาใส่ Email ก่อน' }); return }
    if (!/^\S+@\S+\.\S+$/.test(email)) { Swal.fire({ icon:'warning', title:'รูปแบบ Email ไม่ถูกต้อง' }); return }
    if (safeRecipients.emails.some(x => x.email === email)) { Swal.fire({ icon:'info', title:'มี Email นี้แล้ว' }); return }
    updateRecipients({ emails: [{ id: genId(), email }, ...safeRecipients.emails] })
    setEmailInput('')
    toast.fire({ icon:'success', title:`เพิ่ม Email แล้ว (${nowStr()})` })
  }

  const editLine = async (itemId) => {
    const current = safeRecipients.lineTokens.find(x => x.id === itemId)
    const r = await Swal.fire({
      title: 'แก้ไข LINE Target ID',
      input: 'text',
      inputValue: current?.token || '',
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      inputValidator: (v) => {
        const value = (v || '').trim()
        if (!value) return 'ห้ามว่าง'
        if (safeRecipients.lineTokens.some(x => x.token === value && x.id !== itemId)) return 'มีรายการนี้แล้ว'
        return null
      }
    })
    if (!r.isConfirmed) return
    const value = String(r.value || '').trim()
    updateRecipients({
      lineTokens: safeRecipients.lineTokens.map(x => x.id === itemId ? { ...x, token: value } : x)
    })
    toast.fire({ icon:'success', title:`แก้ไขแล้ว (${nowStr()})` })
  }

  const deleteLine = async (itemId) => {
    const r = await Swal.fire({
      title: 'ลบรายการนี้?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d33',
    })
    if (!r.isConfirmed) return
    updateRecipients({ lineTokens: safeRecipients.lineTokens.filter(x => x.id !== itemId) })
    toast.fire({ icon:'success', title:`ลบแล้ว (${nowStr()})` })
  }

  const editEmail = async (itemId) => {
    const current = safeRecipients.emails.find(x => x.id === itemId)
    const r = await Swal.fire({
      title: 'แก้ไข Email',
      input: 'text',
      inputValue: current?.email || '',
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      inputValidator: (v) => {
        const value = (v || '').trim()
        if (!value) return 'ห้ามว่าง'
        if (!/^\S+@\S+\.\S+$/.test(value)) return 'รูปแบบ Email ไม่ถูกต้อง'
        if (safeRecipients.emails.some(x => x.email === value && x.id !== itemId)) return 'มี Email นี้แล้ว'
        return null
      }
    })
    if (!r.isConfirmed) return
    const value = String(r.value || '').trim()
    updateRecipients({
      emails: safeRecipients.emails.map(x => x.id === itemId ? { ...x, email: value } : x)
    })
    toast.fire({ icon:'success', title:`แก้ไขแล้ว (${nowStr()})` })
  }

  const deleteEmail = async (itemId) => {
    const r = await Swal.fire({
      title: 'ลบรายการนี้?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d33',
    })
    if (!r.isConfirmed) return
    updateRecipients({ emails: safeRecipients.emails.filter(x => x.id !== itemId) })
    toast.fire({ icon:'success', title:`ลบแล้ว (${nowStr()})` })
  }

  const onTestLine = async (token) => {
    try {
      const r = await runWithLoading('กำลังทดสอบ LINE...', async () => testLine(token))
      toast.fire({ icon:'success', title: `${r?.message || 'ทดสอบ LINE สำเร็จ'} (${nowStr()})` })
    } catch (e) {
      Swal.fire({ icon:'error', title:'ทดสอบ LINE ไม่สำเร็จ', text: getErrMsg(e) })
    }
  }

  const onTestEmail = async (email) => {
    try {
      const r = await runWithLoading('กำลังทดสอบ Email...', async () => testEmail(email))
      toast.fire({ icon:'success', title: `${r?.message || 'ทดสอบ Email สำเร็จ'} (${nowStr()})` })
    } catch (e) {
      Swal.fire({ icon:'error', title:'ทดสอบ Email ไม่สำเร็จ', text: getErrMsg(e) })
    }
  }

  const onSave = async () => {
    setErr('')
    const name = (draft?.name || '').trim()
    if (!name) { Swal.fire({ icon:'warning', title:'กรุณาตั้งชื่อกลุ่ม' }); return }
    if (receiverCount === 0) { Swal.fire({ icon:'warning', title:'กรุณาเพิ่มผู้รับอย่างน้อย 1 คน' }); return }

    const sensorsFixed = safeArray(draft?.sensors).map(applyDefaultRuleIfEmpty)

    // ✅ แปลงโหมดข้อมูล -> avg_window_min
    const dataMode = String(draft?.targets?.dataMode || 'latest')
    const avgWindowMinRaw = Number(draft?.targets?.avgWindowMin || 30)
    const avgWindowMin =
      dataMode === 'avg' ? Math.max(1, avgWindowMinRaw || 30) : 0

    const payload = {
      profile_name: name,
      is_active: draft?.isActive ? 1 : 0,
      send_mode: draft?.targets?.scheduleType === 'times' ? 'times' : 'interval',
      interval_min: draft?.targets?.scheduleType === 'interval'
        ? Number(draft?.targets?.intervalMinutes || 1)
        : null,

      stations: safeArray(draft?.targets?.stations),
      times: draft?.targets?.scheduleType === 'times' ? safeArray(draft?.targets?.times) : [],

      // ✅ สำคัญ: ส่งไป DB
      avg_window_min: avgWindowMin,

      sensors: sensorsFixed.map((s) => ({
        key: s.key,
        rules: safeArray(s.rules).map((r, idx) => ({
          op: r.op,
          value: r.value,
          value2: r.value2 ?? null,
          level: r.level,
          priority: r.priority ?? (10 - idx),
        }))
      })),
      recipients: {
        lineTargets: safeRecipients.lineTokens.map(x => x.token),
        emails: safeRecipients.emails.map(x => x.email),
      }
    }

    setLoading(true)
    try {
      await runWithLoading('กำลังบันทึก...', async () => {
        if (effectiveMode === 'create') return createProfile(payload)
        return updateProfile(id, payload)
      })
      toast.fire({ icon:'success', title:`บันทึกสำเร็จ (${nowStr()})` })
      nav('/', { replace: true })
    } catch (e) {
      Swal.fire({ icon:'error', title:'บันทึกไม่สำเร็จ', text: getErrMsg(e) })
      setErr(getErrMsg(e))
    } finally {
      setLoading(false)
    }
  }

  const dataModeText = useMemo(() => {
    const m = String(draft?.targets?.dataMode || 'latest')
    const w = Number(draft?.targets?.avgWindowMin || 30)
    return m === 'avg' ? `เฉลี่ย ${w} นาทีล่าสุด` : 'ค่าล่าสุด'
  }, [draft?.targets?.dataMode, draft?.targets?.avgWindowMin])

  return (
    <div>
      <p className="sub">ตั้งชื่อกลุ่ม + เพิ่มผู้รับ (LINE/Email) + ทดสอบเชื่อมต่อ + บันทึก</p>

      <Stepper step={3} />

      <div className="card" style={{ marginTop: 14 }}>
        {loading && <div className="small">กำลังทำรายการ...</div>}

        <div className="grid2">
          <div className="field">
            <div className="label">ตั้งชื่อกลุ่ม</div>
            <input
              className="input"
              placeholder="เช่น แจ้งเตือนคุณภาพน้ำ - สถานี 1/2"
              value={draft?.name || ''}
              onChange={(e) => update({ name: e.target.value })}
            />
            <div className="small" style={{ marginTop: 6 }}>
              {draft?.id ? <>profile_id: <span style={{ fontFamily:'var(--mono)' }}>{draft.id}</span></> : 'ยังไม่ถูกบันทึก'}
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              ผู้รับรวม: <b>{receiverCount}</b> (LINE {safeRecipients.lineTokens.length}, Email {safeRecipients.emails.length})
            </div>
          </div>

          <div className="card" style={{ background:'rgba(25,118,210,0.06)', borderStyle:'dashed' }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>สรุปก่อนบันทึก</div>
            <div className="small" style={{ lineHeight: 1.7 }}>
              <div>• สถานี: <b>{safeArray(draft?.targets?.stations).join(', ') || '-'}</b></div>
              <div>
                • รูปแบบเวลา:{' '}
                <b>
                  {draft?.targets?.scheduleType === 'interval'
                    ? `ทุก ${draft?.targets?.intervalMinutes} นาที`
                    : `เวลา ${safeArray(draft?.targets?.times).join(', ')}`}
                </b>
              </div>

              {/* ✅ โหมดข้อมูล */}
              <div>• ข้อมูลที่ใช้ส่ง: <b>{dataModeText}</b></div>

              <div>• ผู้รับ: <b>{safeRecipients.lineTokens.length}</b> LINE, <b>{safeRecipients.emails.length}</b> Email</div>
            </div>
          </div>
        </div>

        <div className="hr" />

        <div className="grid2">
          <RecipientsCard
            title="LINE Target ID (เพิ่มได้หลายคน)"
            placeholder="เช่น group_id / user_id"
            inputValue={lineInput}
            setInputValue={setLineInput}
            onAdd={addLineToken}
            items={safeRecipients.lineTokens}
            renderValue={(x)=>x.token}
            onTest={(x)=>onTestLine(x.token)}
            onEdit={(x)=>editLine(x.id)}
            onDelete={(x)=>deleteLine(x.id)}
          />
          <RecipientsCard
            title="Email (เพิ่มได้หลายคน)"
            placeholder="someone@example.com"
            inputValue={emailInput}
            setInputValue={setEmailInput}
            onAdd={addEmailAddr}
            items={safeRecipients.emails}
            renderValue={(x)=>x.email}
            onTest={(x)=>onTestEmail(x.email)}
            onEdit={(x)=>editEmail(x.id)}
            onDelete={(x)=>deleteEmail(x.id)}
          />
        </div>

        {err && <div className="err" style={{ marginTop: 12 }}>⚠️ {err}</div>}

        <div className="rowBetween" style={{ marginTop: 16 }}>
          <button className="btn" onClick={goPrev} disabled={loading}>← ย้อนกลับ</button>
          <button
            className={"btn " + (canSave ? "btnPrimary" : "")}
            onClick={onSave}
            disabled={!canSave || loading}
            style={{ opacity: canSave ? 1 : 0.5 }}
          >
            💾 บันทึกข้อมูล
          </button>
        </div>

        {!canSave && (
          <div className="small" style={{ marginTop: 10 }}>
            * ต้อง “ตั้งชื่อกลุ่ม” และ “เพิ่มผู้รับอย่างน้อย 1 คน” ก่อนถึงจะบันทึกได้
          </div>
        )}
      </div>
    </div>
  )
}

function RecipientsCard({ title, placeholder, inputValue, setInputValue, onAdd, items, renderValue, onTest, onEdit, onDelete }){
  return (
    <div className="card" style={{ boxShadow:'var(--shadow-2)' }}>
      <div style={{ fontWeight: 900 }}>{title}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" value={inputValue} onChange={(e)=>setInputValue(e.target.value)} placeholder={placeholder} />
        <button className="btn btnPrimary" type="button" onClick={onAdd}>+ เพิ่ม</button>
      </div>

      <div className="hr" />

      {items.length === 0 ? (
        <div className="small">ยังไม่มีรายการ</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
          {items.map(x => (
            <div key={x.id} className="card" style={{ padding: 12, borderRadius: 14, boxShadow:'none', background:'rgba(25,118,210,0.05)' }}>
              <div className="rowBetween">
                <div style={{ display:'flex', flexDirection:'column', gap: 4 }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize: 12, color:'var(--muted)' }}>{x.id}</div>
                  <div style={{ fontFamily:'var(--mono)', wordBreak:'break-all' }}>{renderValue(x)}</div>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" type="button" onClick={() => onTest(x)}>🧪 ทดสอบ</button>
                  <button className="btn" type="button" onClick={() => onEdit(x)}>✏️ แก้ไข</button>
                  <button className="btn btnDanger" type="button" onClick={() => onDelete(x)}>ลบ</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
