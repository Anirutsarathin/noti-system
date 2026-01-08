import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('auth_user')
    if (saved) setUser(JSON.parse(saved))
  }, [])

  const login = (username, password) => {
    if (username === 'root' && password === '12345678') {
      const u = { username }
      setUser(u)
      localStorage.setItem('auth_user', JSON.stringify(u))
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('auth_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
