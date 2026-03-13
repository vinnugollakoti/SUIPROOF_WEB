const express = require('express')
const mongoose = require('mongoose')
const Organization = require('../schema/organization.schema')
const OrganizationRequest = require('../schema/organizationRequest.schema')

const router = express.Router()

const ADMIN_WALLET = String(
  process.env.ADMIN_WALLET ||
    '0x7c88663e7928a8fcd1a8c16f110580270cde571987ff1ccfa7c72d772370604d'
)
  .trim()
  .toLowerCase()

function isAuthorizedAdmin(req) {
  const headerWallet = String(req.headers['x-admin-wallet'] || '')
    .trim()
    .toLowerCase()

  return Boolean(headerWallet) && headerWallet === ADMIN_WALLET
}

router.get('/status/:wallet', async (req, res) => {
  try {
    const wallet = String(req.params.wallet || '').trim().toLowerCase()

    if (!wallet) {
      return res.status(400).json({ message: 'Wallet is required' })
    }

    const organization = await Organization.findOne({ wallet }).lean()

    if (organization) {
      return res.json({
        wallet,
        registered: true,
        requestStatus: 'approved',
        organization,
        dbName: mongoose.connection?.db?.databaseName || 'unknown',
      })
    }

    const request = await OrganizationRequest.findOne({ wallet }).lean()

    return res.json({
      wallet,
      registered: false,
      requestStatus: request?.status || 'not_submitted',
      request,
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch organization status' })
  }
})

router.get('/admin/approved', async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req)) {
      return res.status(403).json({ message: 'Admin access denied' })
    }

    const organizations = await Organization.find({})
      .sort({ approvedAt: -1, createdAt: -1 })
      .lean()

    res.json({
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      count: organizations.length,
      organizations,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch approved organizations' })
  }
})

router.post('/register-request', async (req, res) => {
  try {
    const {
      wallet,
      organizationName,
      contactEmail,
      website,
      country,
      contactPerson,
      description,
    } = req.body

    if (
      !wallet ||
      !organizationName ||
      !contactEmail ||
      !country ||
      !contactPerson
    ) {
      return res.status(400).json({
        message:
          'wallet, organizationName, contactEmail, country, and contactPerson are required',
      })
    }

    const normalizedWallet = String(wallet).trim().toLowerCase()

    const existingOrganization = await Organization.findOne({
      wallet: normalizedWallet,
    }).lean()

    if (existingOrganization) {
      return res
        .status(409)
        .json({ message: 'Organization is already registered and approved' })
    }

    const request = await OrganizationRequest.findOneAndUpdate(
      { wallet: normalizedWallet },
      {
        wallet: normalizedWallet,
        organizationName,
        contactEmail,
        website: website || '',
        country,
        contactPerson,
        description: description || '',
        status: 'pending',
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    )

    res.status(201).json({
      message: 'Registration request sent to SuiProof admin',
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      request,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to submit registration request' })
  }
})

router.get('/admin/requests', async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req)) {
      return res.status(403).json({ message: 'Admin access denied' })
    }

    const requests = await OrganizationRequest.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .lean()

    res.json({
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      count: requests.length,
      requests,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch pending requests' })
  }
})

router.post('/admin/approve/:wallet', async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req)) {
      return res.status(403).json({ message: 'Admin access denied' })
    }

    const wallet = String(req.params.wallet || '').trim().toLowerCase()
    const onChainDigest = String(req.body?.onChainDigest || '').trim()

    if (!wallet) {
      return res.status(400).json({ message: 'Wallet is required' })
    }

    const request = await OrganizationRequest.findOne({ wallet })

    if (!request) {
      return res.status(404).json({ message: 'Registration request not found' })
    }

    request.status = 'approved'
    await request.save()

    const organization = await Organization.findOneAndUpdate(
      { wallet },
      {
        wallet,
        organizationName: request.organizationName,
        contactEmail: request.contactEmail,
        website: request.website,
        country: request.country,
        contactPerson: request.contactPerson,
        description: request.description,
        onChainDigest,
        onChainRegisteredAt: onChainDigest ? new Date() : null,
        approvedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    res.json({
      message: 'Organization approved successfully',
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      organization,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to approve organization' })
  }
})

router.post('/admin/reject/:wallet', async (req, res) => {
  try {
    if (!isAuthorizedAdmin(req)) {
      return res.status(403).json({ message: 'Admin access denied' })
    }

    const wallet = String(req.params.wallet || '').trim().toLowerCase()

    if (!wallet) {
      return res.status(400).json({ message: 'Wallet is required' })
    }

    const request = await OrganizationRequest.findOne({ wallet })

    if (!request) {
      return res.status(404).json({ message: 'Registration request not found' })
    }

    request.status = 'rejected'
    await request.save()

    res.json({
      message: 'Organization request rejected',
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      request,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to reject organization request' })
  }
})

module.exports = router
