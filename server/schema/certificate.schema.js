const mongoose = require('mongoose')

const certificateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    hash: { type: String, required: true, unique: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    issuerWallet: { type: String, required: true, trim: true, lowercase: true },
    onChainDigest: { type: String, default: '', trim: true },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

module.exports =
  mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema)
