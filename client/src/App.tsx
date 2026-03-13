import { useEffect, useState } from 'react'
import './App.css'

type Theme = 'light' | 'dark'

const PACKAGE_ID =
  '0xaa7051b88117f7945ae4e8463bf55b9ce6143f3665badc91572a0fb889a6ea18'

const valueCards = [
  {
    title: 'Organization Dashboard',
    text: 'Register verified issuers, manage wallet access, and control who can issue certificates.',
  },
  {
    title: 'Certificate Issuance',
    text: 'Anchor every certificate hash on Sui and generate a unique verification code for each record.',
  },
  {
    title: 'Verification Panel',
    text: 'Search by certificate code to instantly validate details or flag fake certificates.',
  },
]

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  const saved = window.localStorage.getItem('sui-proof-theme')
  if (saved === 'light' || saved === 'dark') return saved

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('sui-proof-theme', theme)
  }, [theme])

  return (
    <div className="landing">
      <header className="topbar">
        <a href="#" className="brand" aria-label="Sui Proof home">
          SuiProof
        </a>

        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span>{theme === 'light' ? 'Dark' : 'Light'} Mode</span>
          <span className="theme-dot" aria-hidden="true" />
        </button>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Blockchain Certificate Verifier</p>
          <h1>Issue trusted certificates. Verify authenticity in seconds.</h1>
          <p className="subtext">
            Sui Proof helps organizations publish certificate proofs on-chain and
            lets anyone validate them with a unique code.
          </p>

          <div className="hero-actions">
            <a href="#dashboards" className="button button-solid">
              Explore Dashboards
            </a>
            <a href="#verification" className="button button-outline">
              Start Verification
            </a>
          </div>
        </section>

        <section className="network-strip" aria-label="Deployed contract package">
          <p>Sui Move Package</p>
          <code>{PACKAGE_ID}</code>
        </section>

        <section id="dashboards" className="card-grid" aria-label="Platform modules">
          {valueCards.map((card) => (
            <article key={card.title} className="info-card">
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </article>
          ))}
        </section>

        <section id="verification" className="verify-preview">
          <div>
            <p className="eyebrow">Verification Experience</p>
            <h2>One code decides if a certificate is genuine.</h2>
            <p>
              Enter the unique certificate code in the verification dashboard.
              If it exists on-chain, the learner, course, and issuer details are
              shown. If not, the certificate is fake.
            </p>
          </div>
          <div className="code-chip">CERT-SUI-2026-8F2A91</div>
        </section>
      </main>
    </div>
  )
}

export default App
