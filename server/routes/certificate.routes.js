const express = require('express')
const mongoose = require('mongoose')
const crypto = require('crypto')
const Organization = require('../schema/organization.schema')
const Certificate = require('../schema/certificate.schema')

const router = express.Router()

function generateCertificateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let randomPart = ''

  for (let i = 0; i < 8; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length)
    randomPart += alphabet[idx]
  }

  return `CERT-SUI-${new Date().getFullYear()}-${randomPart}`
}

function normalizeHashInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function buildHashSource(
  studentName,
  registrationNumber,
  courseName,
  eventArea,
  eventDate,
  universityName
) {
  const normalizedStudent = normalizeHashInput(studentName)
  const normalizedReg = normalizeHashInput(registrationNumber)
  const normalizedCourse = normalizeHashInput(courseName)
  const normalizedArea = normalizeHashInput(eventArea)
  const normalizedDate = normalizeHashInput(eventDate)
  const normalizedUniversity = normalizeHashInput(universityName)
  return `${normalizedStudent}|${normalizedReg}|${normalizedCourse}|${normalizedArea}|${normalizedDate}|${normalizedUniversity}`
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function isSha256Hash(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || '').trim())
}

router.post('/issue', async (req, res) => {
  try {
    const {
      wallet,
      hash,
      studentName,
      registrationNumber,
      courseName,
      eventArea,
      eventDate,
      universityName,
      onChainDigest,
    } = req.body

    if (
      !wallet ||
      !hash ||
      !studentName ||
      !registrationNumber ||
      !courseName ||
      !eventArea ||
      !eventDate ||
      !universityName
    ) {
      return res.status(400).json({
        message:
          'wallet, hash, studentName, registrationNumber, courseName, eventArea, eventDate, and universityName are required',
      })
    }

    const expectedHash = sha256Hex(
      buildHashSource(
        studentName,
        registrationNumber,
        courseName,
        eventArea,
        eventDate,
        universityName
      )
    )

    if (String(hash).trim().toLowerCase() !== expectedHash) {
      return res.status(400).json({
        message: 'Hash mismatch. Certificate hash must be generated from form data.',
      })
    }

    const issuerWallet = String(wallet).trim().toLowerCase()

    const organization = await Organization.findOne({ wallet: issuerWallet }).lean()

    if (!organization) {
      return res.status(403).json({ message: 'Organization is not registered yet' })
    }

    const existingByHash = await Certificate.findOne({ hash }).lean()

    if (existingByHash) {
      return res.status(409).json({ message: 'Certificate hash already exists' })
    }

    let code = generateCertificateCode()
    while (await Certificate.findOne({ code }).lean()) {
      code = generateCertificateCode()
    }

    const certificate = await Certificate.create({
      code,
      hash: expectedHash,
      studentName,
      registrationNumber,
      courseName,
      eventArea,
      eventDate: new Date(eventDate),
      universityName,
      issuerWallet,
      organization: {
        wallet: organization.wallet,
        organizationName: organization.organizationName,
        contactEmail: organization.contactEmail,
        website: organization.website || '',
        country: organization.country,
        contactPerson: organization.contactPerson,
        description: organization.description || '',
        approvedAt: organization.approvedAt || null,
        onChainRegisteredAt: organization.onChainRegisteredAt || null,
        certificateRegistryId: organization.certificateRegistryId || '',
      },
      onChainDigest: onChainDigest || '',
      issuedAt: new Date(),
    })

    res.status(201).json({
      message: 'Certificate created',
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      certificate,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to issue certificate' })
  }
})

router.get('/organization/:wallet/count', async (req, res) => {
  try {
    const wallet = String(req.params.wallet || '').trim().toLowerCase()

    if (!wallet) {
      return res.status(400).json({ message: 'Organization wallet is required' })
    }

    const count = await Certificate.countDocuments({ issuerWallet: wallet })

    res.json({
      count,
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch created certificate count' })
  }
})

router.get('/organization/:wallet', async (req, res) => {
  try {
    const wallet = String(req.params.wallet || '').trim().toLowerCase()
    const registrationNumber = String(req.query.registrationNumber || '').trim()
    const courseName = String(req.query.courseName || '').trim()

    if (!wallet) {
      return res.status(400).json({ message: 'Organization wallet is required' })
    }

    const query = { issuerWallet: wallet }

    if (registrationNumber) {
      query.registrationNumber = { $regex: registrationNumber, $options: 'i' }
    }

    if (courseName) {
      query.courseName = { $regex: courseName, $options: 'i' }
    }

    const certificates = await Certificate.find(query).sort({ createdAt: -1 }).lean()

    res.json({
      certificates,
      count: certificates.length,
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to fetch created certificates' })
  }
})

router.get('/verify', async (req, res) => {
  try {
    const query = String(req.query.query || req.query.q || '').trim()

    if (!query) {
      return res.status(400).json({ message: 'Certificate code or hash is required' })
    }

    let certificate = null

    if (isSha256Hash(query)) {
      certificate = await Certificate.findOne({ hash: query.toLowerCase() }).lean()
    } else {
      certificate =
        (await Certificate.findOne({ code: query.toUpperCase() }).lean()) ||
        (await Certificate.findOne({ code: query }).lean())
    }

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found. Possible fake.' })
    }

    res.json({
      verified: true,
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      certificate,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to verify certificate' })
  }
})

router.get('/verify/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim()

    if (!code) {
      return res.status(400).json({ message: 'Certificate code is required' })
    }

    const certificate = await Certificate.findOne({ code }).lean()

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found. Possible fake.' })
    }

    res.json({
      verified: true,
      dbName: mongoose.connection?.db?.databaseName || 'unknown',
      certificate,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to verify certificate' })
  }
})

module.exports = router
