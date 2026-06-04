import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import Zone from "../models/zone.model.js";
import Notification from "../models/notification.model.js";
import cloudinary from "../config/cloudinary.js";

import { createClerkClient } from "@clerk/express";
import { getClerkUserId } from "../utils/getClerkUserId.js";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

export const getUserProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ user });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const updateData = { ...req.body };

  // Helper to upload base64 image to Cloudinary
  const uploadBase64 = async (base64Str, folder = "profiles") => {
    try {
      const uploadResponse = await cloudinary.uploader.upload(base64Str, {
        folder,
        resource_type: "image",
      });
      return uploadResponse.secure_url;
    } catch (error) {
      console.error("Cloudinary upload error in profile update:", error);
      throw new Error("Failed to upload image to Cloudinary");
    }
  };

  if (updateData.profilePicture && updateData.profilePicture.startsWith("data:")) {
    updateData.profilePicture = await uploadBase64(updateData.profilePicture, "profiles/avatars");
  }

  if (updateData.bannerImage && updateData.bannerImage.startsWith("data:")) {
    updateData.bannerImage = await uploadBase64(updateData.bannerImage, "profiles/banners");
  }

  const user = await User.findOneAndUpdate({ clerkId: userId }, updateData, { new: true });

  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ user });
});

export const syncUser = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);

  const existingUser = await User.findOne({ clerkId: userId });
  if (existingUser) {
    return res.status(200).json({ user: existingUser, message: "User already exists" });
  }

  const clerkUser = await clerkClient.users.getUser(userId);
  const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    return res.status(400).json({ error: "Clerk user has no email address" });
  }

  const baseUsername = primaryEmail.split("@")[0];
  let username = baseUsername;
  let suffix = 1;

  while (await User.findOne({ username })) {
    username = `${baseUsername}${suffix}`;
    suffix += 1;
  }

  const userData = {
    clerkId: userId,
    email: primaryEmail,
    firstName: clerkUser.firstName || "",
    lastName: clerkUser.lastName || "",
    username,
    profilePicture: clerkUser.imageUrl || "",
    homeLocality: "PENDING",
  };

  const user = await User.create(userData);

  res.status(201).json({ user, message: "User created successfully" });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const user = await User.findOne({ clerkId: userId });

  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ user });
});

export const followUser = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { targetUserId } = req.params;

  const currentUser = await User.findOne({ clerkId: userId });
  const targetUser = await User.findById(targetUserId);

  if (!currentUser || !targetUser) return res.status(404).json({ error: "User not found" });

  if (currentUser._id.toString() === targetUserId) {
    return res.status(400).json({ error: "You cannot follow yourself" });
  }

  const isFollowing = currentUser.following.includes(targetUserId);

  if (isFollowing) {
    // unfollow
    await User.findByIdAndUpdate(currentUser._id, {
      $pull: { following: targetUserId },
    });
    await User.findByIdAndUpdate(targetUserId, {
      $pull: { followers: currentUser._id },
    });
  } else {
    // follow
    await User.findByIdAndUpdate(currentUser._id, {
      $push: { following: targetUserId },
    });
    await User.findByIdAndUpdate(targetUserId, {
      $push: { followers: currentUser._id },
    });

    // create notification
    await Notification.create({
      from: currentUser._id,
      to: targetUserId,
      type: "follow",
    });
  }

  res.status(200).json({
    message: isFollowing ? "User unfollowed successfully" : "User followed successfully",
  });
});

export const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const userId = getClerkUserId(req);

  if (!q) {
    return res.status(200).json({ users: [] });
  }

  // Find current user's DB record to exclude them from results
  const currentUser = await User.findOne({ clerkId: userId });
  const excludeId = currentUser ? currentUser._id : null;

  const query = {
    $and: [
      {
        $or: [
          { username: { $regex: q, $options: "i" } },
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
        ],
      },
    ],
  };

  if (excludeId) {
    query.$and.push({ _id: { $ne: excludeId } });
  }

  const users = await User.find(query)
    .select("username firstName lastName profilePicture followers following")
    .limit(20);

  // Return users with a flag indicating if the current user is following them
  const formattedUsers = users.map((u) => {
    const isFollowing = currentUser ? currentUser.following.includes(u._id) : false;
    return {
      _id: u._id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      profilePicture: u.profilePicture,
      isFollowing,
    };
  });

  res.status(200).json({ users: formattedUsers });
});

export const blockUser = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { targetUserId } = req.params;

  const currentUser = await User.findOne({ clerkId: userId });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  if (currentUser._id.toString() === targetUserId) {
    return res.status(400).json({ error: "You cannot block yourself" });
  }

  const isBlocked = currentUser.blockedUsers?.includes(targetUserId);

  if (isBlocked) {
    // Unblock
    await User.findByIdAndUpdate(currentUser._id, {
      $pull: { blockedUsers: targetUserId },
    });
    res.status(200).json({ message: "User unblocked successfully", blocked: false });
  } else {
    // Block
    await User.findByIdAndUpdate(currentUser._id, {
      $push: { blockedUsers: targetUserId },
    });
    // Clean up follow relationships
    await User.findByIdAndUpdate(currentUser._id, {
      $pull: { following: targetUserId, followers: targetUserId },
    });
    await User.findByIdAndUpdate(targetUserId, {
      $pull: { following: currentUser._id, followers: currentUser._id },
    });
    res.status(200).json({ message: "User blocked successfully", blocked: true });
  }
});

export const detectZone = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: "Latitude and longitude are required" });
  }

  try {
    const zone = await Zone.findOne({
      boundary: {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
        },
      },
    });

    if (zone) {
      return res.status(200).json({ zoneName: zone.name });
    }
    res.status(200).json({ zoneName: null });
  } catch (err) {
    console.error("Error detecting spatial zone polygon:", err);
    res.status(500).json({ error: "Failed to detect zone" });
  }
});

export const updatePushToken = asyncHandler(async (req, res) => {
  const userId = getClerkUserId(req);
  const { token } = req.body;

  const user = await User.findOneAndUpdate(
    { clerkId: userId },
    { expoPushToken: token || "" },
    { new: true }
  );

  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ success: true, user });
});