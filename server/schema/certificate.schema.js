const mongoose = require('mongoose')

const certificateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    hash: { type: String, required: true, unique: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    eventArea: { type: String, required: true, trim: true },
    eventDate: { type: Date, required: true },
    universityName: { type: String, required: true, trim: true },
    issuerWallet: { type: String, required: true, trim: true, lowercase: true },
    organization: {
      wallet: { type: String, required: true, trim: true, lowercase: true },
      organizationName: { type: String, required: true, trim: true },
      contactEmail: { type: String, required: true, trim: true, lowercase: true },
      website: { type: String, default: '', trim: true },
      country: { type: String, required: true, trim: true },
      contactPerson: { type: String, required: true, trim: true },
      description: { type: String, default: '', trim: true },
      approvedAt: { type: Date, default: null },
      onChainRegisteredAt: { type: Date, default: null },
      certificateRegistryId: { type: String, default: '', trim: true },
    },
    onChainDigest: { type: String, default: '', trim: true },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

module.exports =
  mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema)
