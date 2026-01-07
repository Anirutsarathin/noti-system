// frontend/src/store/wizard.jsx
import React, { createContext, useContext, useMemo, useState } from 'react'

const WizardCtx = createContext(null)

function makeEmptyDraft(){
  return {
    id: null,
    name: '',
    isActive: true,
    targets: {
      stations: [],
      scheduleType: 'interval', // interval | times
      intervalMinutes: 1,
      times: [],
    },
    // ✅ สำคัญ: เริ่มต้นเป็น [] แล้วให้ Step2 seed จาก API
    sensors: [],
    recipients: {
      lineTokens: [], // [{id, token}]
      emails: [], // [{id, email}]
    }
  }
}

export function WizardProvider({ children }){
  const [draft, setDraft] = useState(makeEmptyDraft())

  const api = useMemo(() => ({
    draft,
    setDraft,
    resetNewDraft(){
      setDraft(makeEmptyDraft())
    },
    setFromExisting(existing){
      setDraft(JSON.parse(JSON.stringify(existing)))
    },
    update(partial){
      setDraft(prev => ({ ...prev, ...partial }))
    },
    updateTargets(partial){
      setDraft(prev => ({ ...prev, targets: { ...prev.targets, ...partial } }))
    },
    updateRecipients(partial){
      setDraft(prev => ({ ...prev, recipients: { ...prev.recipients, ...partial } }))
    },

    // ✅ กันกรณี sensors ยังไม่ถูก seed
    updateSensorRules(sensorKey, rules){
      setDraft(prev => ({
        ...prev,
        sensors: (Array.isArray(prev.sensors) ? prev.sensors : [])
          .map(s => s.key === sensorKey ? { ...s, rules } : s)
      }))
    },

    // ✅ optional helper: seed sensors ได้จากที่อื่นถ้าต้องการ
    seedSensors(sensorList){
      setDraft(prev => {
        const list = Array.isArray(sensorList) ? sensorList : []
        if (list.length === 0) return prev

        // ถ้ามี sensors แล้วและ keys เท่ากัน ไม่ต้อง seed ซ้ำ
        const current = Array.isArray(prev.sensors) ? prev.sensors : []
        const currentKeys = new Set(current.map(s => s.key))
        const apiKeys = new Set(list.map(s => s.key))
        const same =
          currentKeys.size === apiKeys.size &&
          Array.from(apiKeys).every(k => currentKeys.has(k))

        if (same) return prev

        return {
          ...prev,
          sensors: list.map(s => {
            const old = current.find(x => x.key === s.key)
            return { ...s, rules: old?.rules || [] }
          })
        }
      })
    }
  }), [draft])

  return <WizardCtx.Provider value={api}>{children}</WizardCtx.Provider>
}

export function useWizard(){
  const v = useContext(WizardCtx)
  if(!v) throw new Error('useWizard must be used within WizardProvider')
  return v
}
