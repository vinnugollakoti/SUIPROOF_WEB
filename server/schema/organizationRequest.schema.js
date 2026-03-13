const mongoose = require('mongoose')

const organizationRequestSchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, unique: true, trim: true, lowercase: true },
    organizationName: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    website: { type: String, default: '', trim: true },
    country: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
)

module.exports =
  mongoose.models.OrganizationRequest ||
  mongoose.model('OrganizationRequest', organizationRequestSchema)
