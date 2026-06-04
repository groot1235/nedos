import express from "express";
import {
  getConversations,
  getMessages,
  sendMessage,
  reactToMessage,
  markAsRead,
  editMessage,
  deleteMessage,
  vanishCleanup,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/conversations", protectRoute, getConversations);
router.get("/:otherUserId", protectRoute, getMessages);
router.post("/send/:recipientId", protectRoute, upload.single("file"), sendMessage);
router.post("/:messageId/react", protectRoute, reactToMessage);
router.put("/read/:senderId", protectRoute, markAsRead);
router.put("/vanish/cleanup/:otherUserId", protectRoute, vanishCleanup);
router.put("/:messageId", protectRoute, editMessage);
router.delete("/:messageId", protectRoute, deleteMessage);

export default router;
