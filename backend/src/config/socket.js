import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// userSocketMap stores mapping of mongo user _id -> socket.id
const userSocketMap = {};

export const getRecipientSocketId = (recipientId) => {
  return userSocketMap[recipientId];
};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  const userId = socket.handshake.query.userId;
  
  if (userId && userId !== "undefined") {
    userSocketMap[userId] = socket.id;
  }

  // Send list of online users to all clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle typing status
  socket.on("typing", ({ recipientId }) => {
    const recipientSocketId = getRecipientSocketId(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("typing", { senderId: userId });
    }
  });

  socket.on("stopTyping", ({ recipientId }) => {
    const recipientSocketId = getRecipientSocketId(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("stopTyping", { senderId: userId });
    }
  });

  // Handle real-time read receipt updates
  socket.on("messagesRead", ({ senderId }) => {
    const senderSocketId = getRecipientSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messagesRead", { senderId, recipientId: userId });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (userId) {
      delete userSocketMap[userId];
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, io, server };
