import express from "express";
import {
  followUser,
  getCurrentUser,
  getUserProfile,
  syncUser,
  updateProfile,
  searchUsers,
  blockUser,
  detectZone,
  updatePushToken,
} from "../controllers/user.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// public route
router.get("/profile/:username", getUserProfile);

// protected routes
router.get("/search", protectRoute, searchUsers);
router.post("/sync", protectRoute, syncUser);
router.post("/me", protectRoute, getCurrentUser);
router.put("/profile", protectRoute, updateProfile);
router.post("/follow/:targetUserId", protectRoute, followUser);
router.post("/block/:targetUserId", protectRoute, blockUser);
router.post("/detect-zone", protectRoute, detectZone);
router.post("/push-token", protectRoute, updatePushToken);

export default router;