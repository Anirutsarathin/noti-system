export function scheduleSummary(targets){
  if(!targets) return '-'
  if(targets.scheduleType === 'interval'){
    const m = Number(targets.intervalMinutes || 0)
    if(!m) return 'ทุก - นาที'
    return `ทุก ${m} นาที`
  }
  const t = (targets.times || []).filter(Boolean)
  if(t.length === 0) return 'เวลา: -'
  return `เวลา: ${t.join(', ')}`
}

export function stationsSummary(stations){
  if(!stations || stations.length === 0) return '-'
  return stations.map(s => `#${s}`).join(', ')
}

export function levelPillClass(level){
  if(level === 'danger') return 'pillDanger'
  if(level === 'risk') return 'pillRisk'
  return 'pillNormal'
}

export function levelLabel(level){
  if(level === 'danger') return 'อันตราย'
  if(level === 'risk') return 'เสี่ยง'
  return 'ปกติ'
}

export function parseNumber(v){
  if(v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
