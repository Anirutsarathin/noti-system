export default function Stepper({ step }){
  const items = [
    { n: 1, t: 'ข้อมูล 1: สถานี + เวลา' },
    { n: 2, t: 'ข้อมูล 2: เงื่อนไข Sensor' },
    { n: 3, t: 'ข้อมูล 3: ผู้รับ + บันทึก' },
  ]
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 10 }}>
        {items.map(it => (
          <div
            key={it.n}
            className="pill"
            style={{
              borderColor: it.n === step ? 'rgba(25,118,210,0.55)' : 'var(--border)',
              background: it.n === step ? 'rgba(25,118,210,0.10)' : '#fff',
              color: it.n === step ? 'var(--primary-2)' : 'var(--muted)',
              fontWeight: it.n === step ? 700 : 500
            }}
          >
            <span style={{ fontFamily: 'var(--mono)' }}>{it.n}</span> • {it.t}
          </div>
        ))}
      </div>
      {/* <div className="small" style={{ marginTop: 8 }}>
        * ตัวอย่าง UI: ปุ่ม “ทดสอบเชื่อมต่อ” เป็นการจำลอง (ยังไม่ยิง API จริง)
      </div> */}
    </div>
  )
}
