import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const ok = login(username, password)
    if (!ok) {
      setErr('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } else {
      nav('/')
    }
  }

  return (
    <div style={styles.bg}>
      <form onSubmit={submit} style={styles.card}>
        <h2 style={{ color: '#0ea5e9' }}>💧 WaterMonitor Alert</h2>

        {err && <p style={styles.err}>{err}</p>}

        <input
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={styles.input}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={styles.input}
        />

        <button style={styles.btn}>Login</button>
      </form>
    </div>
  )
}

const styles = {
  bg: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#90dfffff'
  },
  card: {
    width: 340,
    padding: 28,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,.15)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  input: {
    padding: 10,
    borderRadius: 8,
    border: '1px solid #cbd5e1'
  },
  btn: {
    padding: 10,
    borderRadius: 8,
    border: 'none',
    background: '#103d7dff',
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  err: {
    color: '#dc2626',
    fontSize: 14
  }
}
