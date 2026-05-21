import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";

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

  const user = await User.findOneAndUpdate({ clerkId: userId }, req.body, { new: true });

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