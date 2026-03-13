const mongoose = require('mongoose')

const organizationSchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, unique: true, trim: true, lowercase: true },
    organizationName: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    website: { type: String, default: '', trim: true },
    country: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    onChainDigest: { type: String, default: '', trim: true },
    onChainRegisteredAt: { type: Date, default: null },
    certificateRegistryId: { type: String, default: '', trim: true },
    certificateRegistryDigest: { type: String, default: '', trim: true },
    certificateRegistryCreatedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

module.exports =
  mongoose.models.Organization || mongoose.model('Organization', organizationSchema)
