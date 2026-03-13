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
type Page = 'landing' | 'organization' | 'verify' | 'admin'

type OrganizationStatus = {
  wallet: string
  registered: boolean
  requestStatus: 'approved' | 'pending' | 'rejected' | 'not_submitted'
  organization?: {
    certificateRegistryId?: string
    certificateRegistryCreatedAt?: string
  }
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

type VerifiedCertificate = {
  _id?: string
  code: string
  hash: string
  studentName: string
  registrationNumber: string
  courseName: string
  eventArea?: string
  eventDate?: string
  universityName?: string
  issuerWallet: string
  onChainDigest?: string
  issuedAt?: string
  organization?: {
    wallet?: string
    organizationName?: string
    contactEmail?: string
    website?: string
    country?: string
    contactPerson?: string
    description?: string
    approvedAt?: string
    onChainRegisteredAt?: string
    certificateRegistryId?: string
  }
}

const PACKAGE_ID =
  '0xaa7051b88117f7945ae4e8463bf55b9ce6143f3665badc91572a0fb889a6ea18'
const ADMIN_WALLET =
  '0x7c88663e7928a8fcd1a8c16f110580270cde571987ff1ccfa7c72d772370604d'
const DEFAULT_ORG_REGISTRY_ID = import.meta.env.VITE_ORG_REGISTRY_ID || ''

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://suiproof-web.onrender.com/api'

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
  if (window.location.hash.startsWith('#verify')) return 'verify'
  if (window.location.hash === '#admin') return 'admin'
  return 'landing'
}

function getVerifyQueryFromHash(): string {
  if (typeof window === 'undefined') return ''
  const [_, queryPart] = window.location.hash.split('?')
  if (!queryPart) return ''
  const params = new URLSearchParams(queryPart)
  return String(params.get('query') || '').trim()
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
    eventArea: '',
    eventDate: '',
    universityName: '',
  })
  const [registryConfig, setRegistryConfig] = useState({
    orgRegistryId: DEFAULT_ORG_REGISTRY_ID,
  })

  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [showSuccessPulse, setShowSuccessPulse] = useState(false)
  const [certRegistryLoading, setCertRegistryLoading] = useState(false)
  const [certRegistryReadyLocal, setCertRegistryReadyLocal] = useState(false)
  const [certRegistryIdLocal, setCertRegistryIdLocal] = useState('')
  const [orgStatusLoading, setOrgStatusLoading] = useState(false)
  const [organizationTab, setOrganizationTab] = useState<'create' | 'created'>('create')
  const [createdCertificates, setCreatedCertificates] = useState<VerifiedCertificate[]>([])
  const [createdCertCount, setCreatedCertCount] = useState(0)
  const [createdCertLoading, setCreatedCertLoading] = useState(false)
  const [createdCertMessage, setCreatedCertMessage] = useState('')
  const [lastIssuedCertificate, setLastIssuedCertificate] =
    useState<VerifiedCertificate | null>(null)
  const [qrDataByCertificate, setQrDataByCertificate] = useState<Record<string, string>>(
    {}
  )
  const [qrDownloadLoadingKey, setQrDownloadLoadingKey] = useState('')
  const [createdCertFilters, setCreatedCertFilters] = useState({
    registrationNumber: '',
    courseName: '',
  })

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
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState('')
  const [verifiedCertificate, setVerifiedCertificate] =
    useState<VerifiedCertificate | null>(null)
  const [onChainVerified, setOnChainVerified] = useState<boolean | null>(null)

  function getCertificateKey(certificate: VerifiedCertificate): string {
    return certificate._id || certificate.code || certificate.hash
  }

  function buildVerificationUrl(hash: string): string {
    if (typeof window === 'undefined') return `#verify?query=${encodeURIComponent(hash)}`
    return `${window.location.origin}${window.location.pathname}#verify?query=${encodeURIComponent(hash)}`
  }

  function generateQrImageUrl(hash: string): string {
    const verifyUrl = buildVerificationUrl(hash)
    return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(verifyUrl)}`
  }

  async function handleDownloadQr(certificate: VerifiedCertificate) {
    const key = getCertificateKey(certificate)
    setQrDownloadLoadingKey(key)

    try {
      let qrDataUrl = qrDataByCertificate[key]
      if (!qrDataUrl) {
        qrDataUrl = generateQrImageUrl(certificate.hash)
        setQrDataByCertificate((prev) => ({
          ...prev,
          [key]: qrDataUrl,
        }))
      }

      const safeRegistration = String(certificate.registrationNumber || 'certificate')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')

      const response = await fetch(qrDataUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch QR image')
      }
      const qrBlob = await response.blob()
      const blobUrl = URL.createObjectURL(qrBlob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${safeRegistration || 'certificate'}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (_error) {
      setCreatedCertMessage('Failed to generate QR code download.')
    } finally {
      setQrDownloadLoadingKey('')
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('sui-proof-theme', theme)
  }, [theme])

  useEffect(() => {
    const onHashChange = () => {
      setPage(getPageFromHash())
      if (window.location.hash.startsWith('#verify')) {
        setVerifyInput(getVerifyQueryFromHash())
      }
    }

    if (window.location.hash.startsWith('#verify')) {
      setVerifyInput(getVerifyQueryFromHash())
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  async function fetchOrganizationStatus(wallet: string) {
    setActionMessage('')
    setOrgStatusLoading(true)

    try {
      const response = await fetch(
        `${API_BASE}/organization/status/${encodeURIComponent(wallet)}`
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch organization status')
      }

      setOrganizationStatus(data)

      if (data.organization?.certificateRegistryId) {
        setCertRegistryReadyLocal(true)
        setCertRegistryIdLocal(data.organization.certificateRegistryId)
      } else if (data.registered) {
        await syncCertificateRegistryFromChain(wallet)
      }
    } catch (error) {
      setOrganizationStatus(null)
      setActionMessage(error instanceof Error ? error.message : 'Connection failed')
    } finally {
      setOrgStatusLoading(false)
    }
  }

  async function syncCertificateRegistryFromChain(wallet: string) {
    try {
      const txBlocks = await suiClient.queryTransactionBlocks({
        filter: {
          FromAddress: wallet,
        },
        options: {
          showObjectChanges: true,
        },
        limit: 50,
        order: 'descending',
      })

      let foundRegistryId = ''
      let foundDigest = ''

      for (const tx of txBlocks.data || []) {
        for (const change of tx.objectChanges || []) {
          if (
            (change.type === 'created' ||
              change.type === 'mutated' ||
              change.type === 'transferred') &&
            'objectType' in change &&
            typeof change.objectType === 'string' &&
            change.objectType.endsWith('::certificate::CertificateRegistry')
          ) {
            foundRegistryId = change.objectId
            foundDigest = tx.digest || ''
            break
          }
        }
        if (foundRegistryId) break
      }

      if (!foundRegistryId) return

      setCertRegistryReadyLocal(true)
      setCertRegistryIdLocal(foundRegistryId)

      try {
        await fetch(`${API_BASE}/organization/certificate-registry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet,
            certificateRegistryId: foundRegistryId,
            onChainDigest: foundDigest,
          }),
        })
      } catch (_err) {
        // Local on-chain detection is enough to unlock form immediately.
      }

      setOrganizationStatus((prev) =>
        prev
          ? {
              ...prev,
              organization: {
                ...(prev.organization || {}),
                certificateRegistryId: foundRegistryId,
              },
            }
          : prev
      )
    } catch (_error) {
      // no-op, UI will keep showing create button if not found
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

  async function fetchOrgRegistryFromPackage({
    setFeedback = true,
  }: {
    setFeedback?: boolean
  } = {}) {
    setOrgRegistryLoading(true)
    if (setFeedback) setAdminMessage('')

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
      return foundRegistryId
    } catch (error) {
      if (setFeedback) {
        setAdminMessage(
          error instanceof Error ? error.message : 'Failed to fetch registry ID'
        )
      }
      return ''
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

  async function handleCreateCertificateRegistry() {
    if (!connectedWallet) return
    if (!organizationStatus?.registered) {
      setActionMessage('Only approved organizations can create certificate registry.')
      return
    }
    if (organizationStatus.organization?.certificateRegistryId) {
      setActionMessage('Certificate registry already created. You are ready to create certificates.')
      return
    }

    setCertRegistryLoading(true)
    setActionMessage('')

    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::certificate::create_cert_registry`,
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

      let foundCertificateRegistryId = ''
      for (const change of createdTx.objectChanges || []) {
        if (
          (change.type === 'created' ||
            change.type === 'mutated' ||
            change.type === 'transferred') &&
          'objectType' in change &&
          typeof change.objectType === 'string' &&
          change.objectType.endsWith('::certificate::CertificateRegistry')
        ) {
          foundCertificateRegistryId = change.objectId
          break
        }
      }

      if (!foundCertificateRegistryId) {
        throw new Error(
          'Certificate Registry ID not found from transaction. Please retry create registry.'
        )
      }

      const response = await fetch(`${API_BASE}/organization/certificate-registry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: connectedWallet,
          certificateRegistryId: foundCertificateRegistryId,
          onChainDigest: chainResult.digest || '',
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save certificate registry')
      }

      setCertRegistryReadyLocal(true)
      setCertRegistryIdLocal(foundCertificateRegistryId)
      setActionMessage('You are ready to create certificates now.')
      await fetchOrganizationStatus(connectedWallet)
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'Failed to create certificate registry'
      )
    } finally {
      setCertRegistryLoading(false)
    }
  }

  useEffect(() => {
    if (!connectedWallet) {
      setOrganizationStatus(null)
      setActionMessage('')
      setCertRegistryReadyLocal(false)
      setCertRegistryIdLocal('')
      setOrganizationTab('create')
      setCreatedCertificates([])
      setCreatedCertCount(0)
      setCreatedCertMessage('')
      setLastIssuedCertificate(null)
      setQrDataByCertificate({})
      return
    }

    if (page === 'organization') {
      fetchOrganizationStatus(connectedWallet)
    }
  }, [connectedWallet, page])

  useEffect(() => {
    if (organizationStatus?.organization?.certificateRegistryId) {
      setCertRegistryReadyLocal(true)
      setCertRegistryIdLocal(organizationStatus.organization.certificateRegistryId)
    }
  }, [organizationStatus])

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

  useEffect(() => {
    if (page !== 'organization') return
    if (!connectedWallet) return
    if (!organizationStatus?.registered) return
    if (registryConfig.orgRegistryId) return

    void fetchOrgRegistryFromPackage({ setFeedback: false })
  }, [page, connectedWallet, organizationStatus, registryConfig.orgRegistryId])

  useEffect(() => {
    if (page !== 'organization') return
    if (!connectedWallet) return
    if (!organizationStatus?.registered) return
    if (organizationTab !== 'created') return

    void fetchCreatedCertificates()
  }, [page, connectedWallet, organizationStatus, organizationTab])

  useEffect(() => {
    if (page !== 'organization') return
    if (!connectedWallet) return
    if (!organizationStatus?.registered) return
    void fetchCreatedCertificateCount()
  }, [page, connectedWallet, organizationStatus?.registered])

  useEffect(() => {
    let isMounted = true

    async function hydrateQrCodes() {
      const missing = createdCertificates.filter(
        (certificate) => !qrDataByCertificate[getCertificateKey(certificate)]
      )
      if (missing.length === 0) return

      const updates: Record<string, string> = {}
      for (const certificate of missing) {
        const key = getCertificateKey(certificate)
        try {
          updates[key] = generateQrImageUrl(certificate.hash)
        } catch (_error) {
          // Skip invalid QR generation for this item.
        }
      }

      if (!isMounted || Object.keys(updates).length === 0) return

      setQrDataByCertificate((prev) => ({
        ...prev,
        ...updates,
      }))
    }

    void hydrateQrCodes()
    return () => {
      isMounted = false
    }
  }, [createdCertificates, qrDataByCertificate])

  useEffect(() => {
    let isMounted = true
    async function hydrateLatestIssuedQr() {
      if (!lastIssuedCertificate) return
      const key = getCertificateKey(lastIssuedCertificate)
      if (qrDataByCertificate[key]) return

      try {
        const dataUrl = generateQrImageUrl(lastIssuedCertificate.hash)
        if (!isMounted) return
        setQrDataByCertificate((prev) => ({
          ...prev,
          [key]: dataUrl,
        }))
      } catch (_error) {
        // no-op
      }
    }

    void hydrateLatestIssuedQr()
    return () => {
      isMounted = false
    }
  }, [lastIssuedCertificate, qrDataByCertificate])

  useEffect(() => {
    if (page !== 'verify') return
    const queryFromHash = getVerifyQueryFromHash()
    if (!queryFromHash) return
    setVerifyInput(queryFromHash)
    void lookupCertificate(queryFromHash)
  }, [page])

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
    let organizationRegistryId = registryConfig.orgRegistryId
    if (!organizationRegistryId) {
      organizationRegistryId = await fetchOrgRegistryFromPackage({
        setFeedback: false,
      })
    }

    const certificateRegistryId =
      organizationStatus?.organization?.certificateRegistryId || certRegistryIdLocal

    if (!organizationRegistryId || !certificateRegistryId) {
      setActionMessage(
        'Unable to fetch Organization Registry ID or Certificate Registry setup is missing.'
      )
      return
    }

    setActionLoading(true)
    setActionMessage('')
    setShowSuccessPulse(false)

    try {
      const studentName = certificateForm.studentName.trim()
      const registrationNumber = certificateForm.registrationNumber.trim()
      const courseName = certificateForm.courseName.trim()
      const eventArea = certificateForm.eventArea.trim()
      const eventDate = certificateForm.eventDate.trim()
      const universityName = certificateForm.universityName.trim()
      const hashSource = `${studentName.toLowerCase()}|${registrationNumber.toLowerCase()}|${courseName.toLowerCase()}|${eventArea.toLowerCase()}|${eventDate.toLowerCase()}|${universityName.toLowerCase()}`
      const hash = await sha256Hex(hashSource)

      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::certificate::issue_certificate`,
        arguments: [
          tx.object(organizationRegistryId),
          tx.object(certificateRegistryId),
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
          eventArea,
          eventDate,
          universityName,
          onChainDigest: chainResult.digest || '',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to issue certificate')
      }

      setActionMessage(`Certificate created. Unique code: ${data.certificate.code}`)
      setLastIssuedCertificate(data.certificate as VerifiedCertificate)
      setCertificateForm({
        studentName: '',
        registrationNumber: '',
        courseName: '',
        eventArea: '',
        eventDate: '',
        universityName: '',
      })
      setShowSuccessPulse(true)
      window.setTimeout(() => setShowSuccessPulse(false), 2400)
      void fetchCreatedCertificateCount()
      if (organizationTab === 'created') {
        void fetchCreatedCertificates(false)
      }
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'Certificate issue failed'
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function fetchCreatedCertificates(showLoader = true) {
    if (!connectedWallet) return
    if (showLoader) setCreatedCertLoading(true)
    setCreatedCertMessage('')

    try {
      const params = new URLSearchParams()
      if (createdCertFilters.registrationNumber.trim()) {
        params.set('registrationNumber', createdCertFilters.registrationNumber.trim())
      }
      if (createdCertFilters.courseName.trim()) {
        params.set('courseName', createdCertFilters.courseName.trim())
      }

      const queryString = params.toString()
      const response = await fetch(
        `${API_BASE}/certificate/organization/${encodeURIComponent(connectedWallet)}${
          queryString ? `?${queryString}` : ''
        }`
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch created certificates')
      }

      setCreatedCertificates(data.certificates || [])
    } catch (error) {
      setCreatedCertMessage(
        error instanceof Error ? error.message : 'Failed to fetch created certificates'
      )
    } finally {
      if (showLoader) setCreatedCertLoading(false)
    }
  }

  async function fetchCreatedCertificateCount() {
    if (!connectedWallet) return

    try {
      const response = await fetch(
        `${API_BASE}/certificate/organization/${encodeURIComponent(connectedWallet)}/count`
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch created certificate count')
      }

      setCreatedCertCount(Number(data.count || 0))
    } catch (_error) {
      // Keep last count in UI if count fetch fails.
    }
  }

  function handleCreatedCertificatesFilter(event: React.FormEvent) {
    event.preventDefault()
    void fetchCreatedCertificates()
  }

  async function verifyCertificateOnChain(certificate: VerifiedCertificate) {
    let certificateRegistryId = certificate.organization?.certificateRegistryId || ''

    if (!certificateRegistryId) {
      try {
        const txBlocks = await suiClient.queryTransactionBlocks({
          filter: {
            FromAddress: certificate.issuerWallet,
          },
          options: {
            showObjectChanges: true,
          },
          limit: 50,
          order: 'descending',
        })

        for (const tx of txBlocks.data || []) {
          for (const change of tx.objectChanges || []) {
            if (
              (change.type === 'created' ||
                change.type === 'mutated' ||
                change.type === 'transferred') &&
              'objectType' in change &&
              typeof change.objectType === 'string' &&
              change.objectType.endsWith('::certificate::CertificateRegistry')
            ) {
              certificateRegistryId = change.objectId
              break
            }
          }
          if (certificateRegistryId) break
        }
      } catch (_error) {
        // continue to null state below
      }
    }

    if (!certificateRegistryId) {
      setOnChainVerified(null)
      return null
    }

    try {
      const verifyTx = new Transaction()
      verifyTx.moveCall({
        target: `${PACKAGE_ID}::certificate::verify_certificate`,
        arguments: [
          verifyTx.object(certificateRegistryId),
          verifyTx.pure.vector('u8', bytesFromHex(certificate.hash)),
        ],
      })

      const inspectResult = await suiClient.devInspectTransactionBlock({
        sender:
          connectedWallet || '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: verifyTx,
      })

      const raw = inspectResult.results?.[0]?.returnValues?.[0]?.[0]

      if (Array.isArray(raw) && raw.length > 0) {
        const isValid = raw[0] === 1
        setOnChainVerified(isValid)
        return isValid
      }

      setOnChainVerified(null)
      return null
    } catch (_error) {
      setOnChainVerified(null)
      return null
    }
  }

  async function lookupCertificate(queryValue: string) {
    const cleanQuery = queryValue.trim()
    if (!cleanQuery) {
      setVerifyMessage('Enter certificate code or SHA256 hash to continue.')
      setVerifiedCertificate(null)
      setOnChainVerified(null)
      return
    }

    setVerifyLoading(true)
    setVerifyMessage('')
    setVerifiedCertificate(null)
    setOnChainVerified(null)

    try {
      const response = await fetch(
        `${API_BASE}/certificate/verify?query=${encodeURIComponent(cleanQuery)}`
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Certificate verification failed')
      }

      const certificate = data.certificate as VerifiedCertificate
      const chainValid = await verifyCertificateOnChain(certificate)

      if (chainValid !== true) {
        setVerifiedCertificate(null)
        setVerifyMessage(
          'Certificate was found in backend, but not verified by on-chain verify_certificate. Possible fake.'
        )
        return
      }

      setVerifiedCertificate(certificate)
      setVerifyMessage('Certificate verified successfully on-chain.')
    } catch (error) {
      setVerifyMessage(
        error instanceof Error ? error.message : 'Certificate verification failed'
      )
    } finally {
      setVerifyLoading(false)
    }
  }

  function handleVerifySubmit(event: React.FormEvent) {
    event.preventDefault()
    const cleanQuery = verifyInput.trim()
    if (!cleanQuery) {
      setVerifyMessage('Enter certificate code or SHA256 hash to continue.')
      return
    }
    window.location.hash = `#verify?query=${encodeURIComponent(cleanQuery)}`
    if (page === 'verify') {
      void lookupCertificate(cleanQuery)
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
            <a href="#verify" className={page === 'verify' ? 'tab active' : 'tab'}>
              Verify Certificate
            </a>
            <a href="#admin" className={page === 'admin' ? 'tab active' : 'tab'}>
              Admin Panel
            </a>
          </nav>

          {page === 'landing' ||
          page === 'verify' ||
          page === 'admin' ||
          (page === 'organization' && connectedWallet) ? (
            <div className="wallet-nav">
              <ConnectButton />
            </div>
          ) : null}
          <div className="wallet-nav">
            <ConnectButton />
          </div>

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

              <form className="verify-form verify-form-hero" onSubmit={handleVerifySubmit}>
                <label>
                  Certificate Code / SHA256 Hash
                  <input
                    value={verifyInput}
                    onChange={(event) => setVerifyInput(event.target.value)}
                    placeholder="CERT-SUI-2026-XXXXXXX or 64-char hash"
                  />
                </label>
                <button type="submit" className="button button-solid" disabled={verifyLoading}>
                  {verifyLoading ? 'Verifying...' : 'Verify Certificate'}
                </button>
              </form>

              <div className="hero-actions">
                <a href="#organization" className="button button-solid">
                  Enter Organization Panel
                </a>
                <a href="#verify" className="button button-outline">
                  Verify Certificate
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
              <div className="code-chip">Verify using code or SHA256 hash</div>
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
              <>
                {orgStatusLoading ? (
                  <section className="panel-box">
                    <p className="status-line muted">
                      Checking certificate registry status...
                    </p>
                  </section>
                ) : (
                  <>
                    <div className="admin-actions-head">
                      <div className="admin-subtabs" role="tablist" aria-label="Organization tabs">
                        <button
                          type="button"
                          className={organizationTab === 'create' ? 'tab active' : 'tab'}
                          onClick={() => setOrganizationTab('create')}
                        >
                          Create Certificate
                        </button>
                        <button
                          type="button"
                          className={organizationTab === 'created' ? 'tab active' : 'tab'}
                          onClick={() => setOrganizationTab('created')}
                        >
                          Created Certificates ({createdCertCount})
                        </button>
                      </div>
                    </div>

                    {organizationTab === 'create' ? (
                      !(
                        certRegistryReadyLocal ||
                        Boolean(organizationStatus.organization?.certificateRegistryId)
                      ) ? (
                        <section className="panel-box review-card">
                          <p className="review-badge">Certificate Registry Required</p>
                          <h2 className="review-title">
                            Create Certificate Registry before issuing certificates.
                          </h2>
                          <p className="review-text">
                            This is a one-time setup for your organization. After it is
                            created, you can start creating certificates.
                          </p>
                          <div className="hero-actions">
                            <button
                              type="button"
                              className="button button-solid"
                              onClick={handleCreateCertificateRegistry}
                              disabled={certRegistryLoading}
                            >
                              {certRegistryLoading
                                ? 'Creating Certificate Registry...'
                                : 'Create Certificate Registry'}
                            </button>
                          </div>
                        </section>
                      ) : (
                        <form className="panel-box" onSubmit={handleIssueCertificate}>
                          <h2>Create Certificate</h2>
                          <p className="status-line muted">
                            You are ready to create certificates now.
                          </p>
                          <br />
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
                            <label>
                              Event Area
                              <input
                                required
                                value={certificateForm.eventArea}
                                onChange={(event) =>
                                  setCertificateForm((prev) => ({
                                    ...prev,
                                    eventArea: event.target.value,
                                  }))
                                }
                                placeholder="Event area / venue"
                              />
                            </label>
                            <label>
                              Event Date
                              <input
                                required
                                type="date"
                                value={certificateForm.eventDate}
                                onChange={(event) =>
                                  setCertificateForm((prev) => ({
                                    ...prev,
                                    eventDate: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label>
                              University Name
                              <input
                                required
                                value={certificateForm.universityName}
                                onChange={(event) =>
                                  setCertificateForm((prev) => ({
                                    ...prev,
                                    universityName: event.target.value,
                                  }))
                                }
                                placeholder="University / college name"
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

                          {lastIssuedCertificate ? (
                            <section className="qr-card">
                              <p className="review-badge">Latest Certificate QR</p>
                              <h3>{lastIssuedCertificate.code}</h3>
                              <p className="status-line muted">
                                Scan this QR to open SuiProof verification directly.
                              </p>
                              {qrDataByCertificate[getCertificateKey(lastIssuedCertificate)] ? (
                                <img
                                  className="qr-image"
                                  src={
                                    qrDataByCertificate[
                                      getCertificateKey(lastIssuedCertificate)
                                    ]
                                  }
                                  alt={`QR code for ${lastIssuedCertificate.code}`}
                                />
                              ) : null}
                              <button
                                type="button"
                                className="button button-outline"
                                onClick={() => handleDownloadQr(lastIssuedCertificate)}
                                disabled={
                                  qrDownloadLoadingKey ===
                                  getCertificateKey(lastIssuedCertificate)
                                }
                              >
                                {qrDownloadLoadingKey ===
                                getCertificateKey(lastIssuedCertificate)
                                  ? 'Preparing QR...'
                                  : `Download QR (${lastIssuedCertificate.registrationNumber}.png)`}
                              </button>
                            </section>
                          ) : null}
                        </form>
                      )
                    ) : (
                      <section className="panel-box admin-tab-content">
                        <h2>Created Certificates</h2>
                        <form
                          className="form-grid two-cols created-filters"
                          onSubmit={handleCreatedCertificatesFilter}
                        >
                          <label>
                            Register Number
                            <input
                              value={createdCertFilters.registrationNumber}
                              onChange={(event) =>
                                setCreatedCertFilters((prev) => ({
                                  ...prev,
                                  registrationNumber: event.target.value,
                                }))
                              }
                              placeholder="Filter by register number"
                            />
                          </label>
                          <label>
                            Event / Course Name
                            <input
                              value={createdCertFilters.courseName}
                              onChange={(event) =>
                                setCreatedCertFilters((prev) => ({
                                  ...prev,
                                  courseName: event.target.value,
                                }))
                              }
                              placeholder="Filter by event or course"
                            />
                          </label>
                          <button type="submit" className="button button-solid full">
                            Apply Filters
                          </button>
                        </form>

                        {createdCertMessage ? (
                          <p className="status-line">{createdCertMessage}</p>
                        ) : null}

                        {createdCertLoading ? (
                          <p className="status-line muted">Loading created certificates...</p>
                        ) : createdCertificates.length === 0 ? (
                          <p className="status-line muted admin-empty">
                            No created certificates found.
                          </p>
                        ) : (
                          <div className="admin-grid">
                            {createdCertificates.map((certificate) => (
                              <article
                                className="admin-card"
                                key={certificate._id || `${certificate.code}-${certificate.hash}`}
                              >
                                <h3>{certificate.studentName}</h3>
                                <p>
                                  <strong>Code:</strong> {certificate.code}
                                </p>
                                <p>
                                  <strong>Register Number:</strong>{' '}
                                  {certificate.registrationNumber}
                                </p>
                                <p>
                                  <strong>Event / Course:</strong> {certificate.courseName}
                                </p>
                                <p>
                                  <strong>Event Area:</strong> {certificate.eventArea || 'N/A'}
                                </p>
                                <p>
                                  <strong>Event Date:</strong>{' '}
                                  {certificate.eventDate
                                    ? new Date(certificate.eventDate).toLocaleDateString()
                                    : 'N/A'}
                                </p>
                                <p>
                                  <strong>University:</strong>{' '}
                                  {certificate.universityName || 'N/A'}
                                </p>
                                <p>
                                  <strong>Hash:</strong> {certificate.hash}
                                </p>
                                {qrDataByCertificate[getCertificateKey(certificate)] ? (
                                  <img
                                    className="qr-image qr-image-small"
                                    src={
                                      qrDataByCertificate[getCertificateKey(certificate)]
                                    }
                                    alt={`QR code for ${certificate.code}`}
                                  />
                                ) : null}
                                <button
                                  type="button"
                                  className="button button-outline"
                                  onClick={() => handleDownloadQr(certificate)}
                                  disabled={
                                    qrDownloadLoadingKey ===
                                    getCertificateKey(certificate)
                                  }
                                >
                                  {qrDownloadLoadingKey === getCertificateKey(certificate)
                                    ? 'Preparing QR...'
                                    : `Download QR (${certificate.registrationNumber}.png)`}
                                </button>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                  </>
                )}
              </>
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
        ) : page === 'verify' ? (
          <section className="org-panel">
            <div className="panel-header">
              <p className="eyebrow">Certificate Verification</p>
              <h1>Check if a certificate is real</h1>
              <p className="subtext">
                Enter the unique certificate code or SHA256 hash to validate the
                certificate details.
              </p>
            </div>

            <form className="panel-box verify-page-form" onSubmit={handleVerifySubmit}>
              <div className="field-row">
                <input
                  value={verifyInput}
                  onChange={(event) => setVerifyInput(event.target.value)}
                  placeholder="Enter certificate code or SHA256 hash"
                />
                <button
                  type="submit"
                  className="button button-solid"
                  disabled={verifyLoading}
                >
                  {verifyLoading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
              {verifyMessage ? <p className="status-line">{verifyMessage}</p> : null}
            </form>

            {verifiedCertificate ? (
              <section className="panel-box verify-result-card">
                <p className="review-badge">Verification Result</p>
                <h2 className="review-title">Certificate is found in SuiProof records</h2>
                <div className="verify-meta-grid">
                  <p>
                    <strong>Certificate Code:</strong> {verifiedCertificate.code}
                  </p>
                  <p>
                    <strong>Student Name:</strong> {verifiedCertificate.studentName}
                  </p>
                  <p>
                    <strong>Register Number:</strong>{' '}
                    {verifiedCertificate.registrationNumber}
                  </p>
                  <p>
                    <strong>Course / Hackathon:</strong> {verifiedCertificate.courseName}
                  </p>
                  <p>
                    <strong>Event Area:</strong> {verifiedCertificate.eventArea || 'N/A'}
                  </p>
                  <p>
                    <strong>Event Date:</strong>{' '}
                    {verifiedCertificate.eventDate
                      ? new Date(verifiedCertificate.eventDate).toLocaleDateString()
                      : 'N/A'}
                  </p>
                  <p>
                    <strong>University Name:</strong>{' '}
                    {verifiedCertificate.universityName || 'N/A'}
                  </p>
                  <p>
                    <strong>Issuer Wallet:</strong> {verifiedCertificate.issuerWallet}
                  </p>
                  <p>
                    <strong>Organization:</strong>{' '}
                    {verifiedCertificate.organization?.organizationName || 'N/A'}
                  </p>
                  <p className="full">
                    <strong>Certificate Hash:</strong> {verifiedCertificate.hash}
                  </p>
                  <p>
                    <strong>On-chain Digest:</strong>{' '}
                    {verifiedCertificate.onChainDigest || 'N/A'}
                  </p>
                  <p>
                    <strong>On-chain Verification:</strong>{' '}
                    {onChainVerified === null
                      ? 'Not available'
                      : onChainVerified
                        ? 'Valid'
                        : 'Not found'}
                  </p>
                </div>
              </section>
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
