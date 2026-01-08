// frontend/src/pages/WizardStep1.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Stepper from '../components/Stepper'
import { getProfile } from '../store/storage'
import { useWizard } from '../store/wizard'

export default function WizardStep1({ mode }) {
  const nav = useNavigate()
  const { id } = useParams()
  const { draft, setFromExisting, resetNewDraft, updateTargets } = useWizard()

  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ stations จาก API
  const [stations, setStations] = useState([])
  const [loadingStations, setLoadingStations] = useState(false)
  const [stationsErr, setStationsErr] = useState('')

  // ✅ โหลด stations จาก http://localhost:4500/api/meta/stations
  useEffect(() => {
    const runStations = async () => {
      setStationsErr('')
      setLoadingStations(true)
      try {
        // const r = await fetch('http://171.102.131.91:4500/api/meta/stations')
        const r = await fetch('http://localhost:4500/api/meta/stations')
        const j = await r.json()
        if (!r.ok || !j?.success) throw new Error(j?.message || 'โหลด stations ไม่สำเร็จ')
        setStations(Array.isArray(j.data) ? j.data : [])
      } catch (e) {
        setStations([])
        setStationsErr(e?.message || 'โหลด stations ไม่สำเร็จ')
      } finally {
        setLoadingStations(false)
      }
    }
    runStations()
  }, [])

  // ✅ hydrate เมื่อ edit
  useEffect(() => {
    const run = async () => {
      if (mode === 'create') {
        resetNewDraft()

        // ✅ default mode สำหรับ create (กัน undefined)
        updateTargets({
          dataMode: draft?.targets?.dataMode || 'latest',
          avgWindowMin: draft?.targets?.avgWindowMin ?? 30,
        })
        return
      }

      setLoading(true)
      try {
        const p = await getProfile(id)
        setFromExisting({
          id: p.id,
          name: p.profile_name,
          isActive: !!p.is_active,
          targets: {
            stations: p.stations || [],
            scheduleType: p.send_mode === 'times' ? 'times' : 'interval',
            intervalMinutes: p.interval_min || 1,
            times: (p.times || []).map(String),

            // ✅ เลือกข้อมูลที่จะใช้ส่ง: latest vs avg (ส่งไป DB ด้วย avg_window_min)
            dataMode: Number(p.avg_window_min || 0) > 0 ? 'avg' : 'latest',
            avgWindowMin: Number(p.avg_window_min || 30),
          },
          sensors: draft.sensors.map(s => {
            const found = (p.sensors || []).find(x => x.key === s.key)
            return { ...s, rules: found ? found.rules : (s.rules || []) }
          }),
          recipients: {
            lineTokens: (p.recipients?.lineTargets || []).map((t, idx) => ({ id: `L-${idx}`, token: t })),
            emails: (p.recipients?.emails || []).map((e, idx) => ({ id: `E-${idx}`, email: e })),
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
  }, [mode, id])

  const selected = useMemo(
    () => new Set(draft.targets.stations),
    [draft.targets.stations]
  )

  const toggleStation = (sid) => {
    const next = new Set(selected)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    updateTargets({ stations: Array.from(next) })
  }

  const addTime = (t) => {
    const value = String(t || '').trim()
    if (!value) return
    const times = (draft.targets.times || [])
    if (times.includes(value)) return
    updateTargets({ times: [...times, value].sort() })
  }

  const removeTime = (t) => {
    updateTargets({ times: (draft.targets.times || []).filter(x => x !== t) })
  }

  const next = () => {
    setErr('')

    // 1) stations
    if (!draft.targets.stations || draft.targets.stations.length === 0) {
      setErr('กรุณาเลือกอย่างน้อย 1 สถานี')
      return
    }

    // 2) schedule
    if (draft.targets.scheduleType === 'interval') {
      const m = Number(draft.targets.intervalMinutes || 0)
      if (!m || m <= 0) {
        setErr('กรุณาใส่ "ทุกกี่นาที" ให้ถูกต้อง (มากกว่า 0)')
        return
      }
    } else {
      const t = (draft.targets.times || []).filter(Boolean)
      if (t.length === 0) {
        setErr('กรุณาเพิ่มเวลาอย่างน้อย 1 เวลา (เช่น 17:00)')
        return
      }
    }

    // 3) data mode (latest/avg)
    const dataMode = draft.targets.dataMode || 'latest'
    if (dataMode === 'avg') {
      const a = Number(draft.targets.avgWindowMin || 0)
      if (!a || a <= 0) {
        setErr('กรุณาใส่ "เฉลี่ยย้อนหลัง (นาที)" ให้ถูกต้อง (มากกว่า 0)')
        return
      }
    }

    if (mode === 'create') nav('/new/step-2')
    else nav(`/edit/${id}/step-2`)
  }

  const dataMode = draft.targets.dataMode || 'latest'

  return (
    <div>
      <p className="sub">เลือกสถานี + ตั้งค่าเวลาในการส่งแจ้งเตือน</p>

      <Stepper step={1} />

      <div className="card" style={{ marginTop: 14 }}>
        {loading && <div className="small">กำลังโหลดข้อมูล...</div>}

        <div style={{ fontWeight: 800, marginBottom: 10 }}>1) เลือกสถานีที่จะส่งแจ้งเตือน</div>

        {loadingStations && <div className="small">กำลังโหลดรายชื่อสถานี...</div>}
        {!loadingStations && stationsErr && <div className="err">⚠️ {stationsErr}</div>}

        <div className="row" style={{ gap: 14 }}>
          {(stations || []).map(s => (
            <label
              key={s.id}
              className="pill"
              style={{
                cursor: 'pointer',
                userSelect: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleStation(s.id)}
              />
              {s.name}
              {/* {' '}
              <span className="small" style={{ fontFamily: 'var(--mono)' }}>
                {s.id}
              </span> */}
            </label>
          ))}
        </div>

        {!loadingStations && !stationsErr && (stations || []).length === 0 ? (
          <div className="small" style={{ marginTop: 8 }}>ไม่พบรายการสถานี</div>
        ) : null}

        <div className="hr" />

        <div style={{ fontWeight: 800, marginBottom: 10 }}>2) เลือกเวลาในการส่ง (เลือก 1 แบบ)</div>

        <div className="row" style={{ gap: 10 }}>
          <label className="pill" style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name="scheduleType"
              checked={draft.targets.scheduleType === 'interval'}
              onChange={() => updateTargets({ scheduleType: 'interval' })}
            />
            แจ้งเตือนทุกกี่นาที
          </label>

          <label className="pill" style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name="scheduleType"
              checked={draft.targets.scheduleType === 'times'}
              onChange={() => updateTargets({ scheduleType: 'times' })}
            />
            ระบุเวลาที่จะส่ง
          </label>
        </div>

        {draft.targets.scheduleType === 'interval' ? (
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field">
              <div className="label">ทุกกี่นาที (ตัวอย่าง: 1 นาที)</div>
              <input
                className="input"
                type="number"
                min="1"
                value={draft.targets.intervalMinutes ?? 1}
                onChange={(e) => updateTargets({ intervalMinutes: e.target.value })}
              />
              <div className="small" style={{ marginTop: 6 }}>
                ระบบจะส่งทุก ๆ {Number(draft.targets.intervalMinutes || 0) || '-'} นาที
              </div>
            </div>

            <div className="card" style={{ background: 'rgba(25,118,210,0.06)', borderStyle: 'dashed' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>ตัวอย่าง</div>
              <div className="small">
                เลือก “ทุกกี่นาที” → ใส่ <span className="kbd">1</span> = ส่งทุก 1 นาที
              </div>
            </div>
          </div>
        ) : (
          <TimesPicker
            times={draft.targets.times || []}
            onAdd={addTime}
            onRemove={removeTime}
          />
        )}

        {/* ✅ ข้อ 3: เลือกข้อมูลที่จะใช้ส่ง (Latest / AVG) */}
        <div className="hr" />
        <div style={{ fontWeight: 800, marginBottom: 10 }}>3) เลือกการเเจ้งเตือนของข้อมูล</div>

        {/* ✅ ทำให้ 2 pill เท่ากันด้วย grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            alignItems: 'stretch',
            maxWidth: 820, // จะเอาออกก็ได้
          }}
        >
          {/* Latest */}
          <label
            className="pill"
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              justifyContent: 'flex-start',
              padding: '1px 15px',
              minHeight: 25,     // ✅ ความสูงเท่ากัน
              boxSizing: 'border-box',
            }}
          >
            <input
              type="radio"
              name="dataMode"
              checked={dataMode === 'latest'}
              onChange={() => updateTargets({ dataMode: 'latest' })}
            />
            ค่าล่าสุด
          </label>

          {/* AVG */}
          <label
            className="pill"
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              justifyContent: 'flex-start',
              padding: '1px 15px',
              minHeight: 25,     // ✅ ความสูงเท่ากัน
              boxSizing: 'border-box',
            }}
            onClick={() => updateTargets({ dataMode: 'avg' })}
          >
            <input
              type="radio"
              name="dataMode"
              checked={dataMode === 'avg'}
              onChange={() => updateTargets({ dataMode: 'avg' })}
            />
            ค่าเฉลี่ย

            <input
              className="input"
              type="number"
              min="1"
              value={draft.targets.avgWindowMin ?? 30}
              onChange={(e) => updateTargets({ avgWindowMin: e.target.value })}
              disabled={dataMode !== 'avg'}
              style={{
                width: 90,         // ✅ คุมกว้าง input
                height: 30,        // ✅ ให้ดูบาลานซ์กับ pill
                padding: '6px 10px',
              }}
              onClick={(e) => e.stopPropagation()} // กัน click แล้ว toggle แปลกๆ
            />
            <span className="small">นาที</span>
          </label>
        </div>

        <div className="small" style={{ marginTop: 8 }}>
          {dataMode === 'avg'
            ? `ระบบจะคำนวณค่าเฉลี่ยย้อนหลัง ${Number(draft.targets.avgWindowMin || 0) || '-'} นาที ก่อนส่ง`
            : 'ใช้ค่าล่าสุด 1 แถวจากตารางสถานี '}
        </div>


        {err && <div className="err" style={{ marginTop: 12 }}>⚠️ {err}</div>}

        <div className="rowBetween" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => nav('/')}>← กลับหน้าหลัก</button>
          <button className="btn btnPrimary" onClick={next}>ถัดไป →</button>
        </div>
      </div>
    </div>
  )
}

function TimesPicker({ times, onAdd, onRemove }) {
  const [t, setT] = useState('17:00')

  return (
    <div className="card" style={{ marginTop: 12, background: 'rgba(25,118,210,0.06)', borderStyle: 'dashed' }}>
      <div className="rowBetween">
        <div>
          <div style={{ fontWeight: 800 }}>เพิ่มเวลาที่จะส่ง (เพิ่มได้หลายเวลา)</div>
          <div className="small">ตัวอย่าง: 17:00, 21:00</div>
        </div>

        <div className="row">
          <input
            className="input"
            type="time"
            value={t}
            onChange={(e) => setT(e.target.value)}
            style={{ width: 140 }}
          />
          <button className="btn btnPrimary" type="button" onClick={() => onAdd(t)}>
            + เพิ่มเวลา
          </button>
        </div>
      </div>

      <div className="hr" />

      {times.length === 0 ? (
        <div className="small">ยังไม่มีเวลา</div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {times.map(x => (
            <span key={x} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)' }}>{x}</span>
              <button className="btn btnGhost" type="button" onClick={() => onRemove(x)} title="ลบเวลา">
                ✖
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
