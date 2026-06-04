import express from "express";
import {
  createPost,
  deletePost,
  getPost,
  getPosts,
  getUserPosts,
  likePost,
  repostPost,
  searchPosts,
  toggleSavePost,
  getSavedPosts,
  getTrendingHashtags,
  votePoll,
} from "../controllers/post.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";

const router = express.Router();

// public routes
router.get("/", getPosts);
router.get("/trending", getTrendingHashtags);
router.get("/search", protectRoute, searchPosts);
router.get("/saved", protectRoute, getSavedPosts);
router.get("/:postId", getPost);
router.get("/user/:username", getUserPosts);

// protected routes
router.post("/", protectRoute, upload.array("images", 10), createPost);
router.post("/:postId/like", protectRoute, likePost);
router.post("/:postId/repost", protectRoute, repostPost);
router.post("/:postId/save", protectRoute, toggleSavePost);
router.post("/:postId/poll/vote", protectRoute, votePoll);
router.delete("/:postId", protectRoute, deletePost);

export default router;