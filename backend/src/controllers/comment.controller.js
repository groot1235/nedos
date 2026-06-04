import asyncHandler from "express-async-handler";
import { getClerkUserId } from "../utils/getClerkUserId.js";
import Comment from "../models/comment.model.js";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { sendPushNotification } from "../utils/pushNotification.js";

export const getComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const comments = await Comment.find({ post: postId })
    .sort({ createdAt: 1 }) // Chronological order is better for message threads
    .populate("user", "username firstName lastName profilePicture");

  res.status(200).json({ comments });
});

export const createComment = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { postId } = req.params;
  const { content, parentComment } = req.body;

  if (!content || content.trim() === "") {
    return res.status(400).json({ error: "Comment content is required" });
  }

  const user = await User.findOne({ clerkId: userId });
  const post = await Post.findById(postId);

  if (!user || !post) return res.status(404).json({ error: "User or post not found" });

  let parent = null;
  if (parentComment) {
    parent = await Comment.findById(parentComment);
    if (!parent) return res.status(404).json({ error: "Parent comment not found" });
  }

  const comment = await Comment.create({
    user: user._id,
    post: postId,
    content,
    parentComment: parentComment || null,
  });

  // link the comment to the post
  await Post.findByIdAndUpdate(postId, {
    $push: { comments: comment._id },
  });

  const senderName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;

  // Send push notification to parent comment author if replying
  if (parent && parent.user.toString() !== user._id.toString()) {
    const parentUser = await User.findById(parent.user);
    if (parentUser && parentUser.expoPushToken) {
      sendPushNotification(
        parentUser.expoPushToken,
        "New Reply",
        `${senderName} replied to your comment!`,
        { postId }
      );
    }
  }

  // create notification if not commenting on own post
  if (post.user.toString() !== user._id.toString()) {
    await Notification.create({
      from: user._id,
      to: post.user,
      type: "comment",
      post: postId,
      comment: comment._id,
    });

    // Also send push notification to post author if not replying to their comment
    const postAuthor = await User.findById(post.user);
    const isSameAsParentAuthor = parent && parent.user.toString() === post.user.toString();
    if (postAuthor && postAuthor.expoPushToken && !isSameAsParentAuthor) {
      sendPushNotification(
        postAuthor.expoPushToken,
        "New Comment",
        `${senderName} commented on your post!`,
        { postId }
      );
    }
  }

  const populatedComment = await Comment.findById(comment._id)
    .populate("user", "username firstName lastName profilePicture");

  res.status(201).json({ comment: populatedComment });
});

export const deleteComment = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { commentId } = req.params;

  const user = await User.findOne({ clerkId: userId });
  const comment = await Comment.findById(commentId);

  if (!user || !comment) {
    return res.status(404).json({ error: "User or comment not found" });
  }

  if (comment.user.toString() !== user._id.toString()) {
    return res.status(403).json({ error: "You can only delete your own comments" });
  }

  // remove comment from post
  await Post.findByIdAndUpdate(comment.post, {
    $pull: { comments: commentId },
  });

  // delete the comment
  await Comment.findByIdAndDelete(commentId);

  res.status(200).json({ message: "Comment deleted successfully" });
});