import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

export default function Topbar() {
  const loc = useLocation()
  const nav = useNavigate()
  const isHome = loc.pathname === '/'

  const { user, logout } = useAuth()

  const onLogout = () => {
    logout()
    nav('/login')
  }

  return (
    <header style={styles.wrap}>
      <div style={styles.inner}>
        {/* BRAND */}
        <div style={styles.brand}>
          <div style={styles.logo}>💧</div>
          <div>
            <div style={styles.title}>WaterMonitor Alert</div>
          </div>
        </div>

        {/* NAV */}
        <nav style={styles.nav}>
          <Link className={"btn " + (isHome ? "btnPrimary" : "")} to="/">
            หน้าแรก
          </Link>

          {/* USER + LOGOUT */}
          {user && (
            <div style={styles.userBox}>
              {/* <span style={styles.user}>
                👤 {user.username}
              </span> */}

              <button
                onClick={onLogout}
                title="Logout"
                aria-label="Logout"
                style={styles.logoutIcon}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>


            </div>
          )}
        </nav>
      </div>
    </header>
  )
}


const styles = {
  wrap: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backdropFilter: 'blur(10px)',
    background: 'rgba(246, 251, 255, 0.72)',
    borderBottom: '1px solid var(--border)'
  },
  inner: {
    width: 'min(1100px, calc(100% - 40px))',
    margin: '0 auto',
    padding: '14px 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: {
    width: 38, height: 38, borderRadius: 14,
    display: 'grid', placeItems: 'center',
    background: 'linear-gradient(180deg, rgba(25,118,210,1), rgba(13,71,161,1))',
    color: '#fff',
    boxShadow: 'var(--shadow-2)'
  },
  title: { fontWeight: 800, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: 'var(--muted)' },
  nav: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },

  /* 👇 เพิ่มใหม่ */
  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    borderLeft: '1px solid var(--border)'
  },
  user: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: 600
  },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    background: 'linear-gradient(135deg,#ef4444,#dc2626)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    boxShadow: 'var(--shadow-2)'
  }

}
