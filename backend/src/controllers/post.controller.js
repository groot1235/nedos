import asyncHandler from "express-async-handler";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import { getClerkUserId } from "../utils/getClerkUserId.js";
import cloudinary from "../config/cloudinary.js";
import { sendPushNotification } from "../utils/pushNotification.js";

import Notification from "../models/notification.model.js";
import Comment from "../models/comment.model.js";

export const getPosts = asyncHandler(async (req, res) => {
  const clerkUserId = getClerkUserId(req);
  if (!clerkUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const currentUser = await User.findOne({ clerkId: clerkUserId });
  if (!currentUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const userLocality = currentUser.homeLocality || "Kharghar";
  const limit = parseInt(req.query.limit) || 10;
  const skip = parseInt(req.query.skip) || 0;

  // Base populate for posts
  const basePopulate = [
    { path: "user", select: "username firstName lastName profilePicture location homeLocality" },
    {
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    },
    {
      path: "repostOf",
      populate: [
        {
          path: "user",
          select: "username firstName lastName profilePicture location homeLocality",
        },
        {
          path: "comments",
          populate: {
            path: "user",
            select: "username firstName lastName profilePicture",
          },
        },
      ],
    },
  ];

  // Fetch posts matching ONLY that specific neighborhood, excluding blocked users, sorted chronologically, populated, paginated
  const posts = await Post.find({
    locality: userLocality,
    user: { $nin: currentUser.blockedUsers || [] },
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate(basePopulate)
    .lean();

  res.status(200).json({ posts });
});

export const getPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await Post.findById(postId)
    .populate("user", "username firstName lastName profilePicture")
    .populate({
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "repostOf",
      populate: [
        {
          path: "user",
          select: "username firstName lastName profilePicture",
        },
        {
          path: "comments",
          populate: {
            path: "user",
            select: "username firstName lastName profilePicture",
          },
        },
      ],
    });

  if (!post) return res.status(404).json({ error: "Post not found" });

  res.status(200).json({ post });
});

export const getUserPosts = asyncHandler(async (req, res) => {
  const { username } = req.params;

  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find({ user: user._id })
    .sort({ createdAt: -1 })
    .populate("user", "username firstName lastName profilePicture")
    .populate({
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "repostOf",
      populate: [
        {
          path: "user",
          select: "username firstName lastName profilePicture",
        },
        {
          path: "comments",
          populate: {
            path: "user",
            select: "username firstName lastName profilePicture",
          },
        },
      ],
    });

  res.status(200).json({ posts });
});

export const createPost = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { content, type } = req.body;
  const imageFiles = req.files || [];

  if (!content && (!imageFiles || imageFiles.length === 0) && type !== "poll") {
    return res.status(400).json({ error: "Post must contain content, images, or a poll" });
  }

  const user = await User.findOne({ clerkId: userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  let imageUrls = [];
  let videoUrl = "";

  // upload media to Cloudinary if provided
  if (imageFiles && imageFiles.length > 0) {
    try {
      await Promise.all(
        imageFiles.map(async (file) => {
          const isVideo = file.mimetype.startsWith("video/");
          const base64File = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
          const uploadResponse = await cloudinary.uploader.upload(base64File, {
            folder: "social_media_posts",
            resource_type: isVideo ? "video" : "image",
          });

          if (isVideo) {
            videoUrl = uploadResponse.secure_url;
          } else {
            imageUrls.push(uploadResponse.secure_url);
          }
        })
      );
    } catch (uploadError) {
      console.error("Cloudinary upload error:", uploadError);
      return res.status(400).json({ error: "Failed to upload media files" });
    }
  }

  // Parse hashtags and mentions
  const hashtags = [];
  const mentions = [];
  if (content) {
    const rawHashtags = content.match(/#\w+/g) || [];
    rawHashtags.forEach(tag => {
      const cleaned = tag.toLowerCase();
      if (!hashtags.includes(cleaned)) {
        hashtags.push(cleaned);
      }
    });

    const rawMentions = content.match(/@\w+/g) || [];
    rawMentions.forEach(mention => {
      const username = mention.substring(1);
      if (!mentions.includes(username)) {
        mentions.push(username);
      }
    });
  }

  // Parse Poll Data if applicable
  let pollData = null;
  if (type === "poll") {
    let parsedOptions = [];
    if (typeof req.body.pollOptions === "string") {
      try {
        parsedOptions = JSON.parse(req.body.pollOptions);
      } catch (e) {
        parsedOptions = req.body.pollOptions.split(",").map(o => o.trim());
      }
    } else if (Array.isArray(req.body.pollOptions)) {
      parsedOptions = req.body.pollOptions;
    }

    if (parsedOptions.length > 0) {
      pollData = {
        question: req.body.pollQuestion || content || "",
        options: parsedOptions.map(opt => ({
          optionText: opt,
          votes: [],
        })),
        expiresAt: req.body.pollExpiresAt ? new Date(req.body.pollExpiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
    }
  }

  const post = await Post.create({
    user: user._id,
    content: content || "",
    image: imageUrls.length > 0 ? imageUrls[0] : "", // fallback for backward compatibility
    images: imageUrls,
    video: videoUrl,
    hashtags,
    mentions,
    type: type || "discussion",
    locality: user.homeLocality || "Kharghar",
    poll: pollData,
  });

  const populatedPost = await Post.findById(post._id)
    .populate("user", "username firstName lastName profilePicture location homeLocality")
    .populate({
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    });

  res.status(201).json({ post: populatedPost });
});

export const likePost = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { postId } = req.params;

  const user = await User.findOne({ clerkId: userId });
  const post = await Post.findById(postId);

  if (!user || !post) return res.status(404).json({ error: "User or post not found" });

  const isLiked = post.likes.includes(user._id);

  if (isLiked) {
    // unlike
    await Post.findByIdAndUpdate(postId, {
      $pull: { likes: user._id },
    });
  } else {
    // like
    await Post.findByIdAndUpdate(postId, {
      $push: { likes: user._id },
    });

    // create notification if not liking own post
    if (post.user.toString() !== user._id.toString()) {
      await Notification.create({
        from: user._id,
        to: post.user,
        type: "like",
        post: postId,
      });

      const recipient = await User.findById(post.user);
      if (recipient && recipient.expoPushToken) {
        const senderName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;
        sendPushNotification(
          recipient.expoPushToken,
          "New Interaction",
          `${senderName} liked your post!`,
          { postId }
        );
      }
    }
  }

  res.status(200).json({
    message: isLiked ? "Post unliked successfully" : "Post liked successfully",
  });
});

export const deletePost = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { postId } = req.params;

  const user = await User.findOne({ clerkId: userId });
  const post = await Post.findById(postId);

  if (!user || !post) return res.status(404).json({ error: "User or post not found" });

  if (post.user.toString() !== user._id.toString()) {
    return res.status(403).json({ error: "You can only delete your own posts" });
  }

  // delete all comments on this post
  await Comment.deleteMany({ post: postId });

  // delete the post
  await Post.findByIdAndDelete(postId);

  res.status(200).json({ message: "Post deleted successfully" });
});

export const repostPost = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { postId } = req.params;

  const user = await User.findOne({ clerkId: userId });
  const originalPost = await Post.findById(postId);

  if (!user || !originalPost) {
    return res.status(404).json({ error: "User or post not found" });
  }

  // Check if already reposted
  const existingRepost = await Post.findOne({ user: user._id, repostOf: postId });

  if (existingRepost) {
    // Unrepost (delete the repost post)
    await Post.findByIdAndDelete(existingRepost._id);
    
    // Pull from original post's reposts list
    await Post.findByIdAndUpdate(postId, {
      $pull: { reposts: user._id }
    });

    res.status(200).json({ message: "Post unreposted successfully", reposted: false });
  } else {
    // Create new repost post
    const repost = await Post.create({
      user: user._id,
      repostOf: postId,
    });

    // Push to original post's reposts list
    await Post.findByIdAndUpdate(postId, {
      $push: { reposts: user._id }
    });

    // Create notification for original post user if it's not their own post
    if (originalPost.user.toString() !== user._id.toString()) {
      await Notification.create({
        from: user._id,
        to: originalPost.user,
        type: "repost",
        post: postId,
      });
    }

    res.status(201).json({ message: "Post reposted successfully", reposted: true, repost });
  }
});

export const searchPosts = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(200).json({ posts: [] });
  }

  // Find posts where content matches query (case-insensitive regex)
  const posts = await Post.find({ content: { $regex: q, $options: "i" } })
    .sort({ createdAt: -1 })
    .populate("user", "username firstName lastName profilePicture")
    .populate({
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "repostOf",
      populate: [
        {
          path: "user",
          select: "username firstName lastName profilePicture",
        },
        {
          path: "comments",
          populate: {
            path: "user",
            select: "username firstName lastName profilePicture",
          },
        },
      ],
    });

  res.status(200).json({ posts });
});

export const toggleSavePost = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { postId } = req.params;

  const user = await User.findOne({ clerkId: userId });
  const post = await Post.findById(postId);

  if (!user || !post) return res.status(404).json({ error: "User or post not found" });

  const isSaved = post.savedBy?.includes(user._id) || false;

  if (isSaved) {
    // unsave
    await Post.findByIdAndUpdate(postId, {
      $pull: { savedBy: user._id },
    });
  } else {
    // save
    await Post.findByIdAndUpdate(postId, {
      $push: { savedBy: user._id },
    });
  }

  res.status(200).json({
    message: isSaved ? "Post unsaved successfully" : "Post saved successfully",
    saved: !isSaved,
  });
});

export const getSavedPosts = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const user = await User.findOne({ clerkId: userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find({ savedBy: user._id })
    .sort({ createdAt: -1 })
    .populate("user", "username firstName lastName profilePicture location")
    .populate({
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    })
    .populate({
      path: "repostOf",
      populate: [
        {
          path: "user",
          select: "username firstName lastName profilePicture location",
        },
        {
          path: "comments",
          populate: {
            path: "user",
            select: "username firstName lastName profilePicture",
          },
        },
      ],
    });

  res.status(200).json({ posts });
});

export const getTrendingHashtags = asyncHandler(async (req, res) => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // Aggregate posts to get count of hashtags
  const result = await Post.aggregate([
    { $match: { createdAt: { $gte: oneWeekAgo }, hashtags: { $exists: true, $ne: [] } } },
    { $unwind: "$hashtags" },
    { $group: { _id: "$hashtags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  const trends = result.map(item => ({
    topic: item._id,
    tweets: `${item.count} posts`
  }));

  res.status(200).json({ trends });
});

export const votePoll = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { postId } = req.params;
  const { optionText } = req.body;

  if (!optionText) {
    return res.status(400).json({ error: "Option text is required" });
  }

  const user = await User.findOne({ clerkId: userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });

  if (post.type !== "poll" || !post.poll) {
    return res.status(400).json({ error: "This post is not a poll" });
  }

  // Remove user's vote from any option they already voted on
  post.poll.options.forEach((opt) => {
    opt.votes = opt.votes.filter((vId) => vId.toString() !== user._id.toString());
  });

  // Add user's vote to the selected option
  const targetOption = post.poll.options.find((opt) => opt.optionText === optionText);
  if (!targetOption) {
    return res.status(400).json({ error: "Invalid option selected" });
  }

  targetOption.votes.push(user._id);
  await post.save();

  // Return populated post
  const populatedPost = await Post.findById(post._id)
    .populate("user", "username firstName lastName profilePicture location homeLocality")
    .populate({
      path: "comments",
      populate: {
        path: "user",
        select: "username firstName lastName profilePicture",
      },
    });

  res.status(200).json({ post: populatedPost });
});