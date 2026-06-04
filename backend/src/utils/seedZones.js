import Zone from "../models/zone.model.js";

const SEED_ZONES = [
  {
    name: "Kharghar",
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [73.04, 19.00],
          [73.08, 19.00],
          [73.08, 19.05],
          [73.04, 19.05],
          [73.04, 19.00], // Close loop
        ],
      ],
    },
  },
  {
    name: "Vashi",
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [72.97, 19.05],
          [73.01, 19.05],
          [73.01, 19.09],
          [72.97, 19.09],
          [72.97, 19.05], // Close loop
        ],
      ],
    },
  },
  {
    name: "Nerul",
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [73.00, 19.01],
          [73.04, 19.01],
          [73.04, 19.04],
          [73.00, 19.04],
          [73.00, 19.01], // Close loop
        ],
      ],
    },
  },
  {
    name: "Seawoods",
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [72.99, 18.99],
          [73.02, 18.99],
          [73.02, 19.02],
          [72.99, 19.02],
          [72.99, 18.99], // Close loop
        ],
      ],
    },
  },
];

export const seedZones = async () => {
  try {
    const count = await Zone.countDocuments();
    if (count > 0) {
      console.log("Zones already seeded (Count:", count, ")");
      return;
    }

    console.log("Seeding predefined hyperlocal zones...");
    await Zone.create(SEED_ZONES);
    console.log("Hyperlocal zones seeded successfully ✅");
  } catch (error) {
    console.error("Failed to seed hyperlocal zones:", error);
  }
};
