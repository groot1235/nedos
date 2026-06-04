import asyncHandler from "express-async-handler";
import Report from "../models/report.model.js";
import User from "../models/user.model.js";
import Post from "../models/post.model.js";
import { getClerkUserId } from "../utils/getClerkUserId.js";

// @desc    Submit a user or post report
// @route   POST /api/reports
// @access  Private
export const createReport = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { reportedUserId, reportedPostId, reason, description } = req.body;

  if (!reason) {
    return res.status(400).json({ error: "Reason for reporting is required" });
  }

  const reporter = await User.findOne({ clerkId: userId });
  if (!reporter) return res.status(404).json({ error: "Reporter user not found" });

  const reportData = {
    reporter: reporter._id,
    reason,
    description: description || "",
  };

  if (reportedUserId) {
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) return res.status(404).json({ error: "Reported user not found" });
    reportData.reportedUser = reportedUserId;
  }

  if (reportedPostId) {
    const reportedPost = await Post.findById(reportedPostId);
    if (!reportedPost) return res.status(404).json({ error: "Reported post not found" });
    reportData.reportedPost = reportedPostId;
  }

  if (!reportedUserId && !reportedPostId) {
    return res.status(400).json({ error: "Must specify a reported user or post" });
  }

  const report = await Report.create(reportData);

  res.status(201).json({ success: true, message: "Report submitted successfully", report });
});
