// frontend/src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Toggle from '../components/Toggle'
import Swal from 'sweetalert2'

import {
  listProfiles,
  deleteProfile,
  toggleActive,
  getSchedulerStatus,
  fireProfileNow
} from '../store/storage'
import { scheduleSummary } from '../utils/format'

function fmtLeft(sec) {
  if (sec === null || sec === undefined) return '-'
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}ชม ${m}น ${ss}วิ`
  if (m > 0) return `${m}น ${ss}วิ`
  return `${ss}วิ`
}

function fmtNext(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

// ✅ parse times จาก API ที่เป็น "22:57:00,22:59:00" -> ["22:57","22:59"]
function parseTimes(v) {
  if (!v) return []
  if (Array.isArray(v)) {
    return v
      .map(s => String(s).trim())
      .filter(Boolean)
      .map(t => (t.length >= 5 ? t.slice(0, 5) : t))
  }
  if (typeof v === 'string') {
    return v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(t => (t.length >= 5 ? t.slice(0, 5) : t))
  }
  return []
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

async function runWithLoading(title, fn) {
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

const getErrMsg = e =>
  e?.response?.data?.message || e?.message || 'เกิดข้อผิดพลาด'

export default function Dashboard() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // map เก็บ countdown ตาม profile id
  const [schedMap, setSchedMap] = useState({})

  // ✅ โหลดรายการโปรไฟล์
  const refresh = async () => {
    setErr('')
    setLoading(true)
    try {
      const rows = await listProfiles() // ⚠️ ต้องแก้ listProfiles ให้ return r.data.data แล้วนะ
      setItems(
        (rows || []).map(r => {
          const mode = String(r.send_mode || 'interval').toLowerCase()
          return {
            id: r.id,
            name: r.profile_name,
            isActive: !!r.is_active,
            targets: {
              scheduleType: mode === 'times' ? 'times' : 'interval',
              intervalMinutes: Number(r.interval_min) || 1,
              times: parseTimes(r.times) // ✅ ทำให้ scheduleSummary โชว์ times ได้จริง
            }
          }
        })
      )
    } catch (e) {
      setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  // ✅ โหลด scheduler status (นับถอยหลัง)
  const refreshScheduler = async () => {
    try {
      const rows = await getSchedulerStatus()
      const map = {}
      ;(rows || []).forEach(r => {
        map[r.profile_id] = r
      })
      setSchedMap(map)
    } catch (e) {
      // เงียบไว้ ไม่ทำให้หน้าแดง
    }
  }

  useEffect(() => {
    refresh()
    refreshScheduler()

    // poll ทุก 1 วิ ให้ countdown เด้งวินาที
    const t = setInterval(refreshScheduler, 1000)
    return () => clearInterval(t)
  }, [])

  const totalActive = useMemo(() => items.filter(x => x.isActive).length, [items])

const onDelete = async id => {
  const r = await Swal.fire({
    title: 'ต้องการลบกลุ่มนี้ใช่ไหม?',
    text: 'ลบแล้วกู้คืนไม่ได้',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#d33',
  })
  if (!r.isConfirmed) return

  try {
    await runWithLoading('กำลังลบ...', async () => {
      await deleteProfile(id)
      await refresh()
      await refreshScheduler()
    })
    toast.fire({ icon: 'success', title: `ลบแล้ว (${nowStr()})` })
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: getErrMsg(e) })
  }
}


const onToggle = async (id, next) => {
  try {
    await runWithLoading('กำลังเปลี่ยนสถานะ...', async () => {
      await toggleActive(id, next)
      await refresh()
      await refreshScheduler()
    })
    toast.fire({
      icon: 'success',
      title: `${next ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'} (${nowStr()})`,
    })
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'เปลี่ยนสถานะไม่สำเร็จ', text: getErrMsg(e) })
  }
}


const onSendNow = async id => {
  try {
    await runWithLoading('กำลังส่งทันที...', async () => {
      await fireProfileNow(id)
      await refreshScheduler()
    })
    toast.fire({ icon: 'success', title: `📤 ส่งทันทีแล้ว ✅ (${nowStr()})` })
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: getErrMsg(e) })
  }
}


  return (
    <div>
      <div className="rowBetween" style={{ marginBottom: 12 }}>
        <div>
          <div className="h1">สถานีการแจ้งเตือน</div>
        </div>

        <div className="row">
          <div className="pill">
            ทั้งหมด: <b>{items.length}</b>
          </div>
          <div className="pill pillNormal">
            เปิดใช้งาน: <b>{totalActive}</b>
          </div>
          <Link to="/new/step-1" className="btn btnPrimary">
            + เพิ่มกลุ่มใหม่
          </Link>
        </div>
      </div>

      <div className="card">
        {loading && <div className="small">กำลังโหลด...</div>}
        {!loading && err && <div className="err">⚠️ {err}</div>}

        {!loading && !err && items.length === 0 ? (
          <div>
            <div style={{ fontWeight: 700 }}>ยังไม่มีกลุ่มแจ้งเตือน</div>
            <div className="small">
              กดปุ่ม <span className="kbd">+ เพิ่มกลุ่มใหม่</span> เพื่อเริ่มตั้งค่า
            </div>
          </div>
        ) : null}

        {!loading && !err && items.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อกลุ่ม</th>
                <th>เวลา/รอบการส่ง</th>
                {/* <th>นับถอยหลัง</th> */}
                <th>สถานะ</th>
                <th className="actions">จัดการ</th>
              </tr>
            </thead>

            <tbody>
              {items.map(it => {
                const st = schedMap[it.id] // { mode, seconds_left, next_run_at }
                const left = st?.seconds_left
                const next = st?.next_run_at

                return (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 800 }}>
                        {it.name || '(ยังไม่ตั้งชื่อ)'}
                      </div>
                      <div className="small" style={{ fontFamily: 'var(--mono)' }}>
                        {/* ถ้าอยากโชว์ next time แบบชัด ๆ เปิดตรงนี้ */}
                        {/* {next ? `ถัดไป: ${fmtNext(next)}` : ''} */}
                      </div>
                    </td>

                    <td>
                      <div>{scheduleSummary(it.targets)}</div>

                      <div className="small" style={{ marginTop: 4 }}>
                        {/* ถ้าอยากโชว์ countdown/next เพิ่ม */}
                        {/* {left != null ? <> • เหลือ: <span className="kbd">{fmtLeft(left)}</span></> : null} */}
                        {st?.mode ? (
                          <>
                            {/* {' '} */}
                            {/* • โหมด: <span className="kbd">{st.mode}</span> */}
                          </>
                        ) : null}
                      </div>
                    </td>

                    {/* <td>
                      <span className="pill">⏳ {fmtLeft(left)}</span>
                    </td> */}

                    <td>
                      <span className={'pill ' + (it.isActive ? 'pillNormal' : '')}>
                        {it.isActive ? 'เปิด' : 'ปิด'}
                      </span>
                    </td>

                  <td className="actions">
  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
    <Toggle
      checked={!!it.isActive}
      onChange={next => onToggle(it.id, next)}
      iconOnly
      title={it.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
    />

    <button
      className="btn"
      onClick={() => onSendNow(it.id)}
      title="ทดสอบส่ง"
      aria-label="ทดสอบส่ง"
    >
      📤
    </button>

    <Link
      className="btn"
      to={`/edit/${it.id}/step-1`}
      title="แก้ไขข้อมูล"
      aria-label="แก้ไขข้อมูล"
    >
      ✏️
    </Link>

    <button
      className="btn"
      onClick={() => onDelete(it.id)}
      title="ลบข้อมูล"
      aria-label="ลบข้อมูล"
    >
      🗑️
    </button>
  </div>
</td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}
