const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const organizationRoutes = require('./routes/organization.routes')
const certificateRoutes = require('./routes/certificate.routes')

const app = express()

function loadEnvFromFile() {
  try {
    const envPath = path.join(__dirname, '.env')
    const data = fs.readFileSync(envPath, 'utf8')

    for (const line of data.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue

      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      process.env[key] = value
    }
  } catch (_err) {
    // .env should exist in this project, fallback kept for safety.
  }
}

function forceDatabaseInMongoUri(rawUri, databaseName) {
  const uri = new URL(rawUri)
  uri.pathname = `/${databaseName}`
  return uri.toString()
}

loadEnvFromFile()

const PORT = Number(process.env.PORT || 4000)
const DB_NAME = 'SuiProof'

if (!process.env.MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in server/.env')
}

const MONGODB_URI = forceDatabaseInMongoUri(process.env.MONGODB_URI, DB_NAME)

app.use(cors())
app.use(express.json())

app.get('/api/health', async (_req, res) => {
  res.json({
    message: 'SuiProof API is running',
    dbName: mongoose.connection?.db?.databaseName || DB_NAME,
  })
})

app.use('/api/organization', organizationRoutes)
app.use('/api/certificate', certificateRoutes)

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: DB_NAME })
    console.log(`MongoDB connected (db: ${mongoose.connection.db.databaseName})`)

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (err) {
    console.error('Server startup error:', err)
    process.exit(1)
  }
}

startServer()
