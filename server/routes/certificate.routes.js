const express = require('express')
const mongoose = require('mongoose')
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

router.post('/issue', async (req, res) => {
  try {
    const { wallet, hash, studentName, registrationNumber, courseName, onChainDigest } =
      req.body

    if (!wallet || !hash || !studentName || !registrationNumber || !courseName) {
      return res.status(400).json({
        message:
          'wallet, hash, studentName, registrationNumber, and courseName are required',
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
      hash,
      studentName,
      registrationNumber,
      courseName,
      issuerWallet,
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
