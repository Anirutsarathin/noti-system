// frontend/src/pages/WizardStep2.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Stepper from '../components/Stepper'
import { OPS, LEVELS } from '../store/constants'
import { getProfile } from '../store/storage'
import { useWizard } from '../store/wizard'
import { levelPillClass, levelLabel, parseNumber } from '../utils/format'

function safeArray(v) { return Array.isArray(v) ? v : [] }

function toNumOrEmpty(v) {
  if (v === '' || v === null || v === undefined) return ''
  const n = Number(v)
  return Number.isFinite(n) ? n : ''
}

function normalizeRules(rules) {
  return safeArray(rules).map((r, idx) => ({
    op: r?.op ?? '==',
    value: toNumOrEmpty(r?.value),
    value2: r?.value2 ?? null,
    level: r?.level ?? 'normal',
    priority: r?.priority ?? (10 - idx),
  }))
}

function normalizeSensors(list) {
  return safeArray(list).map(s => ({
    key: s?.key,
    label: s?.label ?? s?.key ?? '',
    unit: s?.unit ?? '',
    rules: normalizeRules(s?.rules),
  })).filter(s => !!s.key)
}

export default function WizardStep2({ mode }) {
  const nav = useNavigate()
  const { id } = useParams()
  const { draft, setFromExisting, updateSensorRules } = useWizard()

  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const [sensorList, setSensorList] = useState([])
  const [loadingSensors, setLoadingSensors] = useState(false)
  const [sensorErr, setSensorErr] = useState('')

  const effectiveMode = useMemo(() => {
    if (mode === 'create' || mode === 'edit') return mode
    return id ? 'edit' : 'create'
  }, [mode, id])

  const draftSensors = useMemo(() => safeArray(draft?.sensors), [draft?.sensors])

  // ใช้ draft ก่อน ถ้า draft ว่างค่อยใช้ sensorList (เอาไว้ render ชั่วคราว)
  const displaySensors = useMemo(() => {
    if (draftSensors.length > 0) return draftSensors
    if (sensorList.length > 0) return sensorList
    return []
  }, [draftSensors, sensorList])

  const totalRules = useMemo(
    () => displaySensors.reduce((sum, s) => sum + safeArray(s?.rules).length, 0),
    [displaySensors]
  )

  // ==============================
  // โหลด sensors ตามโหมด
  // create: /api/meta/sensors
  // edit  : /api/meta/sensors-edit?profile_id=id
  // ==============================
  useEffect(() => {
    const ac = new AbortController()

    const run = async () => {
      setSensorErr('')
      setLoadingSensors(true)
      try {
        const url =
          // effectiveMode === 'edit'
          //   ? `http://171.102.131.91:4500/api/meta/sensors-edit?profile_id=${encodeURIComponent(id)}`
          //   : `http://171.102.131.91:4500/api/meta/sensors`
          effectiveMode === 'edit'
            ? `http://localhost:4500/api/meta/sensors-edit?profile_id=${encodeURIComponent(id)}`
            : `http://localhost:4500/api/meta/sensors`

        const r = await fetch(url, { signal: ac.signal })
        const j = await r.json()
        if (!r.ok || !j?.success) throw new Error(j?.message || 'โหลด sensor list ไม่สำเร็จ')

        const normalized = normalizeSensors(j.data)

        // create endpoint ส่ง meta อย่างเดียว -> ล้าง rules ให้เป็น []
        const finalList =
          effectiveMode === 'create'
            ? normalized.map(s => ({ ...s, rules: [] }))
            : normalized // edit endpoint มี rules มาแล้ว

        setSensorList(finalList)
      } catch (e) {
        if (e?.name === 'AbortError') return
        setSensorList([])
        setSensorErr(e?.message || 'โหลด sensor list ไม่สำเร็จ')
      } finally {
        setLoadingSensors(false)
      }
    }

    run()
    return () => ac.abort()
  }, [effectiveMode, id])

  // ==============================
  // seed เข้า draft (ครั้งเดียว)
  // ==============================
  const seededRef = useRef(false)

  useEffect(() => {
    if (seededRef.current) return
    if (loadingSensors || sensorErr) return
    if (sensorList.length === 0) return

    // ===== CREATE =====
    if (effectiveMode === 'create') {
      if (draftSensors.length > 0) { seededRef.current = true; return }

      // ✅ targets default ต้องมี dataMode/avgWindowMin กันหลุดจาก step1
      const baseTargets = draft?.targets ?? {
        stations: [],
        scheduleType: 'interval',
        intervalMinutes: 1,
        times: [],
        dataMode: 'latest',
        avgWindowMin: 30,
      }

      setFromExisting({
        id: null,
        name: draft?.name ?? '',
        isActive: draft?.isActive ?? true,
        targets: {
          ...baseTargets,
          dataMode: baseTargets.dataMode || 'latest',
          avgWindowMin: baseTargets.avgWindowMin ?? 30,
        },
        sensors: sensorList.map(s => ({ ...s, rules: [] })),
        recipients: draft?.recipients ?? { lineTokens: [], emails: [] },
      })
      seededRef.current = true
      return
    }

    // ===== EDIT =====
    const sameProfile = draft?.id != null && String(draft.id) === String(id)

    const hydrateOthers = async () => {
      // ถ้ามาจาก step1 แล้ว draft.id ตรง -> อย่าทับ targets (เพราะมี dataMode/avg)
      if (sameProfile) {
        setFromExisting({
          ...draft,
          sensors: sensorList,
        })
        seededRef.current = true
        return
      }

      // ถ้าเข้าหน้า step2 ตรงๆ -> โหลด profile เพื่อเติม name/targets/recipients
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

            // ✅ เพิ่มให้ step2 hydrate แล้วไม่หาย
            dataMode,
            avgWindowMin,
          },
          sensors: sensorList, // ✅ ใช้ rules จาก sensors-edit
          recipients: {
            lineTokens: safeArray(p?.recipients?.lineTargets).map((t, idx) => ({ id: `L-${idx}`, token: t })),
            emails: safeArray(p?.recipients?.emails).map((e, idx) => ({ id: `E-${idx}`, email: e })),
          }
        })
      } catch {
        nav('/', { replace: true })
      } finally {
        setLoading(false)
        seededRef.current = true
      }
    }

    hydrateOthers()
  }, [effectiveMode, id, loadingSensors, sensorErr, sensorList, draftSensors.length, draft, setFromExisting, nav])

  // ==============================
  // ✅ create: ถ้า sensor ไหนยังไม่มี rules -> ใส่ default "== 0 normal"
  // ==============================
  const applyDefaultRulesForCreate = () => {
    if (effectiveMode !== 'create') return

    const opEq =
      OPS.find(o => o.value === '==' || o.value === '=' || o.value === 'eq')?.value
      || '=='

    const lvNormal =
      LEVELS.find(l => l.value === 'normal' || l.value === 'ok' || l.value === 'info')?.value
      || 'normal'

    const nextSensors = displaySensors.map(s => {
      const rules = safeArray(s?.rules)
      if (rules.length > 0) return s
      return {
        ...s,
        rules: [{
          op: opEq,
          value: 0,
          value2: null,
          level: lvNormal,
          priority: 10
        }]
      }
    })

    setFromExisting({
      ...draft,
      sensors: nextSensors
    })
  }

  // ==============================
  // Nav
  // ==============================
  const goPrev = () => {
    if (effectiveMode === 'create') nav('/new/step-1')
    else nav(`/edit/${id}/step-1`)
  }

  const goNext = () => {
    setErr('')

    // ✅ เติม default rule ให้ตัวที่ว่าง (เฉพาะ create)
    applyDefaultRulesForCreate()

    if (displaySensors.length === 0) {
      setErr('ไม่พบรายการ Sensor')
      return
    }

    if (effectiveMode === 'create') nav('/new/step-3')
    else nav(`/edit/${id}/step-3`)
  }

  return (
    <div>
      <p className="sub">ตั้งค่าเงื่อนไขแจ้งเตือนของ Sensor (กำหนดได้หลายเงื่อนไข/ตัว)</p>

      <Stepper step={2} />

      <div className="card" style={{ marginTop: 14 }}>
        {loading && <div className="small">กำลังโหลดข้อมูล...</div>}
        {loadingSensors && <div className="small">กำลังโหลดรายการ Sensor...</div>}
        {!loadingSensors && sensorErr && <div className="err">⚠️ {sensorErr}</div>}

        <div className="rowBetween">
          <div>
            <div style={{ fontWeight: 800 }}>วิธีคิด</div>
            <div className="small">
              เพิ่มกฎ เช่น <span className="kbd">pH &lt; 6.5</span> → เลือกระดับ <span className="kbd">เสี่ยง</span>
              หรือ <span className="kbd">&gt; 9</span> → <span className="kbd">อันตราย (แดง)</span>
            </div>
            {effectiveMode === 'create' && (
              <div className="small" style={{ marginTop: 6 }}>
                * ถ้าไม่ตั้งค่า sensor ใดๆ ระบบจะตั้งค่าให้เป็น <span className="kbd">== 0</span> ระดับ <span className="kbd">normal</span> อัตโนมัติ
              </div>
            )}
          </div>
          <div className="pill">รวมกฎทั้งหมด: <b>{totalRules}</b></div>
        </div>

        <div className="hr" />

        {(displaySensors.length === 0 && !loadingSensors && !sensorErr) ? (
          <div className="small">ไม่พบรายการ Sensor</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {displaySensors.map(sensor => (
              <SensorRuleCard
                key={sensor.key}
                sensor={sensor}
                onChangeRules={(rules) => updateSensorRules(sensor.key, rules)}
              />
            ))}
          </div>
        )}

        {err && <div className="err" style={{ marginTop: 12 }}>⚠️ {err}</div>}

        <div className="rowBetween" style={{ marginTop: 16 }}>
          <button className="btn" onClick={goPrev}>← ย้อนกลับ</button>
          <button
            className="btn btnPrimary"
            onClick={goNext}
            disabled={loadingSensors || !!sensorErr || displaySensors.length === 0}
          >
            ถัดไป →
          </button>
        </div>
      </div>
    </div>
  )
}

function SensorRuleCard({ sensor, onChangeRules }) {
  const rules = safeArray(sensor?.rules)

  const addRule = () => onChangeRules([...rules, { op: '==', value: 0, value2: null, level: 'normal', priority: 10 }])
  const removeRule = (idx) => onChangeRules(rules.filter((_, i) => i !== idx))
  const updateRule = (idx, patch) => onChangeRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  return (
    <div className="card" style={{ boxShadow: 'var(--shadow-2)' }}>
      <div className="rowBetween">
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {sensor.label} {sensor.unit ? <span className="small">({sensor.unit})</span> : null}
          </div>
          <div className="small">กำหนดกฎหลายข้อได้ เช่น &gt; 9 (แดง) , &gt; 7 (ส้ม)</div>
        </div>
        <button className="btn" type="button" onClick={addRule}>+ เพิ่มเงื่อนไข</button>
      </div>

      {rules.length === 0 ? (
        <div className="small" style={{ marginTop: 10 }}>ยังไม่มีเงื่อนไข</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map((r, idx) => (
            <div
              key={idx}
              className="card"
              style={{ padding: 12, borderRadius: 14, boxShadow: 'none', background: 'rgba(25,118,210,0.05)' }}
            >
              <div className="grid3">
                <div className="field">
                  <div className="label">เงื่อนไข</div>
                  <select className="select" value={r.op} onChange={(e) => updateRule(idx, { op: e.target.value })}>
                    {OPS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                </div>

                <div className="field">
                  <div className="label">ค่า</div>
                  <input
                    className="input"
                    type="number"
                    value={r.value ?? ''}
                    onChange={(e) => updateRule(idx, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </div>

                <div className="field">
                  <div className="label">รูปแบบการแจ้งเตือน</div>
                  <select className="select" value={r.level} onChange={(e) => updateRule(idx, { level: e.target.value })}>
                    {LEVELS.map(lv => <option key={lv.value} value={lv.value}>{lv.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="rowBetween" style={{ marginTop: 10 }}>
                <div className={'pill ' + levelPillClass(r.level)}>
                  ตัวอย่างกฎ:{' '}
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    {sensor.label} {r.op} {parseNumber(r.value) ?? '-'}
                  </span>{' '}
                  = {levelLabel(r.level)}
                </div>
                <button className="btn btnDanger" type="button" onClick={() => removeRule(idx)}>ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
