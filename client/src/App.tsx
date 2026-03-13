import { useEffect, useState } from 'react'
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import './App.css'

type Theme = 'light' | 'dark'
type Page = 'landing' | 'organization' | 'admin'

type OrganizationStatus = {
  wallet: string
  registered: boolean
  requestStatus: 'approved' | 'pending' | 'rejected' | 'not_submitted'
}

type OrganizationRequest = {
  _id: string
  wallet: string
  organizationName: string
  contactEmail: string
  website?: string
  country: string
  contactPerson: string
  description?: string
  createdAt: string
}

type ApprovedOrganization = {
  _id: string
  wallet: string
  organizationName: string
  contactEmail: string
  website?: string
  country: string
  contactPerson: string
  description?: string
  approvedAt?: string
}

const PACKAGE_ID =
  '0xaa7051b88117f7945ae4e8463bf55b9ce6143f3665badc91572a0fb889a6ea18'
const ADMIN_WALLET =
  '0x7c88663e7928a8fcd1a8c16f110580270cde571987ff1ccfa7c72d772370604d'
const DEFAULT_ORG_REGISTRY_ID = import.meta.env.VITE_ORG_REGISTRY_ID || ''
const DEFAULT_CERT_REGISTRY_ID = import.meta.env.VITE_CERT_REGISTRY_ID || ''

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

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

function getPageFromHash(): Page {
  if (typeof window === 'undefined') return 'landing'

  if (window.location.hash === '#organization') return 'organization'
  if (window.location.hash === '#admin') return 'admin'
  return 'landing'
}

function bytesFromText(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function bytesFromHex(hex: string): number[] {
  const cleaned = hex.replace(/^0x/, '')
  const bytes: number[] = []
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.slice(i, i + 2), 16))
  }
  return bytes
}

async function sha256Hex(value: string): Promise<string> {
  const raw = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [page, setPage] = useState<Page>(getPageFromHash)

  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction()
  const connectedWallet = account?.address?.toLowerCase() || ''
  const isAdminWallet = connectedWallet === ADMIN_WALLET

  const [organizationStatus, setOrganizationStatus] =
    useState<OrganizationStatus | null>(null)

  const [registerForm, setRegisterForm] = useState({
    organizationName: '',
    contactEmail: '',
    website: '',
    country: '',
    contactPerson: '',
    description: '',
  })

  const [certificateForm, setCertificateForm] = useState({
    studentName: '',
    registrationNumber: '',
    courseName: '',
  })
  const [registryConfig, setRegistryConfig] = useState({
    orgRegistryId: DEFAULT_ORG_REGISTRY_ID,
    certRegistryId: DEFAULT_CERT_REGISTRY_ID,
  })

  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [showSuccessPulse, setShowSuccessPulse] = useState(false)

  const [adminLoadingPending, setAdminLoadingPending] = useState(false)
  const [adminLoadingApproved, setAdminLoadingApproved] = useState(false)
  const [orgRegistryLoading, setOrgRegistryLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [adminView, setAdminView] = useState<'pending' | 'approved'>('pending')
  const [adminInitialized, setAdminInitialized] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<OrganizationRequest[]>([])
  const [approvedOrganizations, setApprovedOrganizations] = useState<
    ApprovedOrganization[]
  >([])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('sui-proof-theme', theme)
  }, [theme])

  useEffect(() => {
    const onHashChange = () => {
      setPage(getPageFromHash())
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  async function fetchOrganizationStatus(wallet: string) {
    setActionMessage('')

    try {
      const response = await fetch(
        `${API_BASE}/organization/status/${encodeURIComponent(wallet)}`
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch organization status')
      }

      setOrganizationStatus(data)
    } catch (error) {
      setOrganizationStatus(null)
      setActionMessage(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  async function fetchPendingRequests(showLoader = true) {
    if (!connectedWallet) return

    if (showLoader) setAdminLoadingPending(true)

    try {
      const response = await fetch(`${API_BASE}/organization/admin/requests`, {
        headers: {
          'x-admin-wallet': connectedWallet,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch admin requests')
      }

      setPendingRequests(data.requests || [])
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Admin request failed')
    } finally {
      if (showLoader) setAdminLoadingPending(false)
    }
  }

  async function fetchApprovedOrganizations(showLoader = true) {
    if (!connectedWallet) return

    if (showLoader) setAdminLoadingApproved(true)

    try {
      const response = await fetch(`${API_BASE}/organization/admin/approved`, {
        headers: {
          'x-admin-wallet': connectedWallet,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch approved organizations')
      }

      setApprovedOrganizations(data.organizations || [])
    } catch (error) {
      setAdminMessage(
        error instanceof Error ? error.message : 'Approved organizations request failed'
      )
    } finally {
      if (showLoader) setAdminLoadingApproved(false)
    }
  }

  async function fetchOrgRegistryFromPackage() {
    setOrgRegistryLoading(true)
    setAdminMessage('')

    try {
      const txBlocks = await suiClient.queryTransactionBlocks({
        filter: {
          MoveFunction: {
            package: PACKAGE_ID,
            module: 'organization',
            function: 'create_registry',
          },
        },
        options: {
          showObjectChanges: true,
        },
        limit: 30,
        order: 'descending',
      })

      let foundRegistryId = ''

      for (const tx of txBlocks.data || []) {
        for (const change of tx.objectChanges || []) {
          if (
            (change.type === 'created' ||
              change.type === 'mutated' ||
              change.type === 'transferred') &&
            'objectType' in change &&
            typeof change.objectType === 'string' &&
            change.objectType.endsWith('::organization::OrganizationRegistry')
          ) {
            foundRegistryId = change.objectId
            break
          }
        }
        if (foundRegistryId) break
      }

      if (!foundRegistryId) {
        throw new Error(
          'Organization Registry ID not found on-chain. Please create registry first.'
        )
      }

      setRegistryConfig((prev) => ({
        ...prev,
        orgRegistryId: foundRegistryId,
      }))
    } catch (error) {
      setAdminMessage(
        error instanceof Error ? error.message : 'Failed to fetch registry ID'
      )
    } finally {
      setOrgRegistryLoading(false)
    }
  }

  async function handleCreateRegistry() {
    if (!connectedWallet || !isAdminWallet) return
    if (registryConfig.orgRegistryId) {
      setAdminMessage('Organization Registry already exists. You can use the current ID.')
      return
    }

    setOrgRegistryLoading(true)
    setAdminMessage('')

    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::organization::create_registry`,
      })

      const chainResult = await signAndExecuteTransaction({
        transaction: tx,
      })

      const createdTx = await suiClient.getTransactionBlock({
        digest: chainResult.digest,
        options: {
          showObjectChanges: true,
        },
      })

      let foundRegistryId = ''

      for (const change of createdTx.objectChanges || []) {
        if (
          (change.type === 'created' ||
            change.type === 'mutated' ||
            change.type === 'transferred') &&
          'objectType' in change &&
          typeof change.objectType === 'string' &&
          change.objectType.endsWith('::organization::OrganizationRegistry')
        ) {
          foundRegistryId = change.objectId
          break
        }
      }

      if (!foundRegistryId) {
        await fetchOrgRegistryFromPackage()
        return
      }

      setRegistryConfig((prev) => ({
        ...prev,
        orgRegistryId: foundRegistryId,
      }))
      setAdminMessage('Organization Registry created successfully on-chain.')
    } catch (error) {
      setAdminMessage(
        error instanceof Error ? error.message : 'Failed to create registry'
      )
    } finally {
      setOrgRegistryLoading(false)
    }
  }

  useEffect(() => {
    if (!connectedWallet) {
      setOrganizationStatus(null)
      setActionMessage('')
      return
    }

    if (page === 'organization') {
      fetchOrganizationStatus(connectedWallet)
    }
  }, [connectedWallet, page])

  useEffect(() => {
    if (page !== 'admin') return
    if (!connectedWallet || !isAdminWallet) {
      setPendingRequests([])
      setApprovedOrganizations([])
      setAdminMessage('')
      setAdminInitialized(false)
      return
    }

    if (!adminInitialized) {
      void Promise.all([fetchPendingRequests(false), fetchApprovedOrganizations(false)])
      setAdminInitialized(true)
    }
  }, [page, connectedWallet, isAdminWallet, adminInitialized])

  useEffect(() => {
    if (page !== 'admin') return
    if (!connectedWallet || !isAdminWallet) return
    if (registryConfig.orgRegistryId) return

    fetchOrgRegistryFromPackage()
  }, [page, connectedWallet, isAdminWallet, registryConfig.orgRegistryId])

  async function handleRegisterRequest(event: React.FormEvent) {
    event.preventDefault()

    if (!connectedWallet) {
      setActionMessage('Connect wallet first')
      return
    }

    setActionLoading(true)
    setActionMessage('')

    try {
      const response = await fetch(`${API_BASE}/organization/register-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: connectedWallet,
          ...registerForm,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit request')
      }

      setActionMessage('Request sent to SuiProof admin successfully.')
      await fetchOrganizationStatus(connectedWallet)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Request failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleIssueCertificate(event: React.FormEvent) {
    event.preventDefault()

    if (!connectedWallet) {
      setActionMessage('Connect wallet first')
      return
    }
    if (!registryConfig.orgRegistryId || !registryConfig.certRegistryId) {
      setActionMessage('Please enter both Organization Registry ID and Certificate Registry ID.')
      return
    }

    setActionLoading(true)
    setActionMessage('')
    setShowSuccessPulse(false)

    try {
      const studentName = certificateForm.studentName.trim()
      const registrationNumber = certificateForm.registrationNumber.trim()
      const courseName = certificateForm.courseName.trim()
      const hashSource = `${studentName.toLowerCase()}|${registrationNumber.toLowerCase()}|${courseName.toLowerCase()}`
      const hash = await sha256Hex(hashSource)

      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::certificate::issue_certificate`,
        arguments: [
          tx.object(registryConfig.orgRegistryId),
          tx.object(registryConfig.certRegistryId),
          tx.pure.vector('u8', bytesFromHex(hash)),
          tx.pure.vector('u8', bytesFromText(studentName)),
          tx.pure.vector('u8', bytesFromText(courseName)),
        ],
      })

      const chainResult = await signAndExecuteTransaction({
        transaction: tx,
      })

      const response = await fetch(`${API_BASE}/certificate/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: connectedWallet,
          hash,
          studentName,
          registrationNumber,
          courseName,
          onChainDigest: chainResult.digest || '',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to issue certificate')
      }

      setActionMessage(`Certificate created. Unique code: ${data.certificate.code}`)
      setCertificateForm({
        studentName: '',
        registrationNumber: '',
        courseName: '',
      })
      setShowSuccessPulse(true)
      window.setTimeout(() => setShowSuccessPulse(false), 2400)
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'Certificate issue failed'
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAdminAction(
    wallet: string,
    action: 'approve' | 'reject',
    organizationName?: string
  ) {
    if (!connectedWallet) return

    setAdminLoadingPending(true)
    setAdminLoadingApproved(true)
    setAdminMessage('')

    try {
      let approvalDigest = ''

      if (action === 'approve') {
        if (!registryConfig.orgRegistryId) {
          throw new Error('Organization Registry ID is required for on-chain approval.')
        }
        if (!organizationName) {
          throw new Error('Organization name is required for on-chain approval.')
        }

        const tx = new Transaction()
        tx.moveCall({
          target: `${PACKAGE_ID}::organization::add_organization`,
          arguments: [
            tx.object(registryConfig.orgRegistryId),
            tx.pure.address(wallet),
            tx.pure.vector('u8', bytesFromText(organizationName)),
          ],
        })

        const chainResult = await signAndExecuteTransaction({
          transaction: tx,
        })

        approvalDigest = chainResult.digest || ''
      }

      const response = await fetch(
        `${API_BASE}/organization/admin/${action}/${encodeURIComponent(wallet)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-wallet': connectedWallet,
          },
          body:
            action === 'approve'
              ? JSON.stringify({ onChainDigest: approvalDigest })
              : undefined,
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || `Failed to ${action} request`)
      }

      setAdminMessage(
        action === 'approve'
          ? 'Organization approved successfully.'
          : 'Organization request rejected.'
      )

      await Promise.all([fetchPendingRequests(false), fetchApprovedOrganizations(false)])
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Admin action failed')
    } finally {
      setAdminLoadingPending(false)
      setAdminLoadingApproved(false)
    }
  }

  return (
    <div className="landing">
      <header className="topbar">
        <a href="#" className="brand" aria-label="Sui Proof home">
          SuiProof
        </a>

        <div className="topbar-right">
          <nav className="nav-tabs" aria-label="Primary">
            <a href="#" className={page === 'landing' ? 'tab active' : 'tab'}>
              Landing
            </a>
            <a
              href="#organization"
              className={page === 'organization' ? 'tab active' : 'tab'}
            >
              Organization Panel
            </a>
            <a href="#admin" className={page === 'admin' ? 'tab active' : 'tab'}>
              Admin Panel
            </a>
          </nav>

          {page === 'landing' || page === 'admin' || (page === 'organization' && connectedWallet) ? (
            <div className="wallet-nav">
              <ConnectButton />
            </div>
          ) : null}

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span>{theme === 'light' ? 'Dark' : 'Light'} Mode</span>
            <span className="theme-dot" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main>
        {page === 'landing' ? (
          <>
            <section className="hero">
              <p className="eyebrow">Blockchain Certificate Verifier</p>
              <h1>Issue trusted certificates. Verify authenticity in seconds.</h1>
              <p className="subtext">
                Sui Proof helps organizations publish certificate proofs on-chain and
                lets anyone validate them with a unique code.
              </p>

              <div className="hero-actions">
                <a href="#organization" className="button button-solid">
                  Enter Organization Panel
                </a>
                <a href="#admin" className="button button-outline">
                  Open Admin Panel
                </a>
              </div>
            </section>

            <section
              className="network-strip"
              aria-label="Deployed contract package"
            >
              <p>Sui Move Package</p>
              <code>{PACKAGE_ID}</code>
            </section>

            <section
              id="dashboards"
              className="card-grid"
              aria-label="Platform modules"
            >
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
          </>
        ) : page === 'organization' ? (
          <section className="org-panel">
            <div className="panel-header">
              <p className="eyebrow">Organization Dashboard</p>
              <h1>Manage your certificate issuance workflow</h1>
              <p className="subtext">
                Connect your wallet to continue. After connecting, submit your
                registration request for review or issue certificates if already
                approved.
              </p>
            </div>

            {!connectedWallet ? (
              <section className="panel-box connect-box">
                <p className="big-message">
                  Connect your wallet to access the organization panel.
                </p>
                <div className="wallet-row">
                  <ConnectButton />
                </div>
              </section>
            ) : organizationStatus?.registered ? (
              <form className="panel-box" onSubmit={handleIssueCertificate}>
                <h2>Create Certificate</h2>
                <div className="form-grid two-cols">
                  <label>
                    Organization Registry ID
                    <input
                      required
                      value={registryConfig.orgRegistryId}
                      onChange={(event) =>
                        setRegistryConfig((prev) => ({
                          ...prev,
                          orgRegistryId: event.target.value,
                        }))
                      }
                      placeholder="0x...shared org registry object id"
                    />
                  </label>
                  <label>
                    Certificate Registry ID
                    <input
                      required
                      value={registryConfig.certRegistryId}
                      onChange={(event) =>
                        setRegistryConfig((prev) => ({
                          ...prev,
                          certRegistryId: event.target.value,
                        }))
                      }
                      placeholder="0x...shared certificate registry object id"
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Student Name
                    <input
                      required
                      value={certificateForm.studentName}
                      onChange={(event) =>
                        setCertificateForm((prev) => ({
                          ...prev,
                          studentName: event.target.value,
                        }))
                      }
                      placeholder="Student full name"
                    />
                  </label>
                  <label>
                    Register Number
                    <input
                      required
                      value={certificateForm.registrationNumber}
                      onChange={(event) =>
                        setCertificateForm((prev) => ({
                          ...prev,
                          registrationNumber: event.target.value,
                        }))
                      }
                      placeholder="Registration number"
                    />
                  </label>
                  <label>
                    Hackathon / Course Name
                    <input
                      required
                      value={certificateForm.courseName}
                      onChange={(event) =>
                        setCertificateForm((prev) => ({
                          ...prev,
                          courseName: event.target.value,
                        }))
                      }
                      placeholder="Course or hackathon name"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="button button-solid"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Creating...' : 'Create Certificate'}
                </button>
                {showSuccessPulse ? (
                  <div className="success-pop" role="status" aria-live="polite">
                    Certificate created successfully.
                  </div>
                ) : null}
                {actionMessage ? <p className="status-line">{actionMessage}</p> : null}
              </form>
            ) : organizationStatus?.requestStatus === 'pending' ? (
              <section className="panel-box review-card">
                <p className="review-badge">Application Under Review</p>
                <h2 className="review-title">
                  Please wait, your application is being reviewed.
                </h2>
                <p className="review-text">
                  If you have any emergency please contact{' '}
                  <a href="mailto:support.suiproof@gmail.com">
                    support.suiproof@gmail.com
                  </a>
                </p>
              </section>
            ) : organizationStatus ? (
              <form className="panel-box" onSubmit={handleRegisterRequest}>
                <h2>Organization Registration Request</h2>
                <div className="form-grid two-cols">
                  <label>
                    Organization Name
                    <input
                      required
                      value={registerForm.organizationName}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          organizationName: event.target.value,
                        }))
                      }
                      placeholder="Sui Club Name"
                    />
                  </label>
                  <label>
                    Contact Email
                    <input
                      required
                      type="email"
                      value={registerForm.contactEmail}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          contactEmail: event.target.value,
                        }))
                      }
                      placeholder="mail@organization.com"
                    />
                  </label>
                  <label>
                    Website
                    <input
                      value={registerForm.website}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          website: event.target.value,
                        }))
                      }
                      placeholder="https://"
                    />
                  </label>
                  <label>
                    Country
                    <input
                      required
                      value={registerForm.country}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          country: event.target.value,
                        }))
                      }
                      placeholder="Country"
                    />
                  </label>
                  <label>
                    Contact Person
                    <input
                      required
                      value={registerForm.contactPerson}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          contactPerson: event.target.value,
                        }))
                      }
                      placeholder="Full name"
                    />
                  </label>
                  <label className="full">
                    Description
                    <textarea
                      value={registerForm.description}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Tell us about your organization"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="button button-solid"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Sending...' : 'Send Request'}
                </button>
                {actionMessage ? <p className="status-line">{actionMessage}</p> : null}
              </form>
            ) : null}
          </section>
        ) : (
          <section className="org-panel">
            <div className="panel-header">
              <p className="eyebrow">Admin Dashboard</p>
              <h1>Review organization onboarding requests</h1>
              <p className="subtext">
                Access is restricted to the owner wallet and used to approve or reject
                pending organization requests.
              </p>
            </div>

            {!connectedWallet ? (
              <section className="panel-box connect-box">
                <p className="big-message">
                  Connect admin wallet to access the admin panel.
                </p>
                <div className="wallet-row">
                  <ConnectButton />
                </div>
              </section>
            ) : !isAdminWallet ? (
              <section className="panel-box admin-denied">
                <p className="review-badge">Access Restricted</p>
                <h2 className="review-title">This wallet is not authorized.</h2>
                <p className="review-text">
                  Only admin wallet {ADMIN_WALLET} can access this panel.
                </p>
              </section>
            ) : (
              <section className="panel-box">
                <div className="admin-head-row">
                  <p className="review-badge admin-registry-badge">
                    {registryConfig.orgRegistryId
                      ? 'Organization Registry Ready'
                      : 'Organization Registry Not Created'}
                    {registryConfig.orgRegistryId ? (
                      <span className="ready-dot" aria-label="Ready" />
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={
                      adminView === 'pending'
                        ? () => fetchPendingRequests()
                        : () => fetchApprovedOrganizations()
                    }
                    disabled={adminLoadingPending || adminLoadingApproved}
                  >
                    {adminLoadingPending || adminLoadingApproved
                      ? 'Refreshing...'
                      : 'Refresh'}
                  </button>
                </div>

                <div className="admin-registry">
                  {!registryConfig.orgRegistryId ? (
                    <button
                      type="button"
                      className="button button-solid button-highlight"
                      onClick={handleCreateRegistry}
                      disabled={orgRegistryLoading}
                    >
                      {orgRegistryLoading ? 'Creating Registry...' : 'Create Registry'}
                    </button>
                  ) : null}
                </div>

                <div className="admin-actions-head">
                  <div className="admin-subtabs">
                    <button
                      type="button"
                      className={adminView === 'pending' ? 'tab active' : 'tab'}
                      onClick={() => setAdminView('pending')}
                    >
                      Pending Requests ({pendingRequests.length})
                    </button>
                    <button
                      type="button"
                      className={adminView === 'approved' ? 'tab active' : 'tab'}
                      onClick={() => setAdminView('approved')}
                    >
                      Approved Organizations ({approvedOrganizations.length})
                    </button>
                  </div>
                </div>

                {adminMessage ? <p className="status-line">{adminMessage}</p> : null}

                {adminView === 'pending' &&
                !adminLoadingPending &&
                pendingRequests.length === 0 ? (
                  <p className="status-line muted admin-empty">
                    No pending requests right now.
                  </p>
                ) : null}

                {adminView === 'pending' ? (
                  <div key="pending" className="admin-tab-content admin-grid">
                    {pendingRequests.map((request) => (
                      <article key={request._id} className="admin-card">
                        <h3>{request.organizationName}</h3>
                        <p>
                          <strong>Wallet:</strong> {request.wallet}
                        </p>
                        <p>
                          <strong>Contact:</strong> {request.contactPerson} ({request.contactEmail})
                        </p>
                        <p>
                          <strong>Country:</strong> {request.country}
                        </p>
                        {request.website ? (
                          <p>
                            <strong>Website:</strong> {request.website}
                          </p>
                        ) : null}
                        {request.description ? <p>{request.description}</p> : null}

                        <div className="admin-card-actions">
                          <button
                            type="button"
                            className="button button-solid"
                            onClick={() =>
                              handleAdminAction(
                                request.wallet,
                                'approve',
                                request.organizationName
                              )
                            }
                            disabled={
                              adminLoadingPending ||
                              adminLoadingApproved ||
                              !registryConfig.orgRegistryId
                            }
                            title={
                              !registryConfig.orgRegistryId
                                ? 'Create organization registry first'
                                : ''
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="button button-outline"
                            onClick={() => handleAdminAction(request.wallet, 'reject')}
                            disabled={adminLoadingPending || adminLoadingApproved}
                          >
                            Reject
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}

                {adminView === 'approved' &&
                !adminLoadingApproved &&
                approvedOrganizations.length === 0 ? (
                  <p className="status-line muted admin-empty">
                    No approved organizations yet.
                  </p>
                ) : null}

                {adminView === 'approved' ? (
                  <div key="approved" className="admin-tab-content admin-grid">
                    {approvedOrganizations.map((organization) => (
                      <article key={organization._id} className="admin-card">
                        <h3 className="approved-title">
                          {organization.organizationName}
                          <span className="verified-pill" aria-label="Verified organization">
                            <span className="verified-icon">✓</span>
                            Verified
                          </span>
                        </h3>
                        <p>
                          <strong>Wallet:</strong> {organization.wallet}
                        </p>
                        <p>
                          <strong>Contact:</strong> {organization.contactPerson} (
                          {organization.contactEmail})
                        </p>
                        <p>
                          <strong>Country:</strong> {organization.country}
                        </p>
                        {organization.website ? (
                          <p>
                            <strong>Website:</strong> {organization.website}
                          </p>
                        ) : null}
                        {organization.approvedAt ? (
                          <p>
                            <strong>Approved At:</strong>{' '}
                            {new Date(organization.approvedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
