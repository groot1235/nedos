import mongoose from "mongoose";

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    boundary: {
      type: {
        type: String,
        enum: ["Polygon"],
        required: true,
      },
      coordinates: {
        type: [[[Number]]], // Array of arrays of coordinates [longitude, latitude]
        required: true,
      },
    },
  },
  { timestamps: true }
);

// Index 2dsphere for geospatial query spatial containment checks
zoneSchema.index({ boundary: "2dsphere" });

const Zone = mongoose.model("Zone", zoneSchema);

export default Zone;
