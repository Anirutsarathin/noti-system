// export default function Toggle({ checked, onChange, labelOn="เปิด", labelOff="ปิด" }){
//   return (
//     <button
//       type="button"
//       className={"btn " + (checked ? "btnPrimary" : "")}
//       onClick={() => onChange(!checked)}
//       aria-pressed={checked}
//       // title="สลับเปิด/ปิด"
//     >
//       {checked ? "🟢 " + labelOn : "⚪ " + labelOff}
//     </button>
//   )
// }
// frontend/src/components/Toggle.jsx
export default function Toggle({
  checked,
  onChange,
  iconOnly = false,
  className = ""
}) {
  const isOn = !!checked

  const handleClick = () => {
    onChange?.(!isOn)
  }

  // โหมดแสดงเฉพาะไอคอน
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`btn ${className}`}
        title={isOn ? "ปิดการทำงาน" : "เปิดการทำงาน"}
        aria-label={isOn ? "ปิดการทำงาน" : "เปิดการทำงาน"}
        style={{ minWidth: 46, display: "inline-flex", justifyContent: "center" }}
      >
        {isOn ? "🟢" : "⚪"}
      </button>
    )
  }

  // โหมดเดิม (มีข้อความ)
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`btn ${className}`}
      title={isOn ? "ปิดการทำงาน" : "เปิดการทำงาน"}
    >
      <span style={{ marginRight: 8 }}>{isOn ? "🟢" : "⚪"}</span>
      {isOn ? "เปิด" : "ปิด"}
    </button>
  )
}
