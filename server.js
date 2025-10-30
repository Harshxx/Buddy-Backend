const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");

// Routers
const userRouter = require("./routes/v1/userRoute");
const botRouter = require("./routes/v1/botRoutes");
const messageRouter = require("./routes/v1/messageRoute");
const toolRouter = require("./routes/v1/toolRoutes");
const supportRouter = require("./routes/v1/supportRoutes");
const errorHandler = require("./middleware/errorHandler");
const chatRouter = require("./routes/v1/chatRoutes");
const userMessageModel = require("./models/userMessageModel");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // or your Expo dev URL
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000; // Render default

//! connect mongoose
mongoose
  .connect(
    process.env.MONGO_URL ||
      `mongodb+srv://${process.env.MONGO_USER_NAME}:${process.env.MONGO_USER_PASS}@cluster.tlonw2c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster`
  )
  .then(() => {
    console.log("✅ Connected to DB");
  })
  .catch((err) => {
    console.error("❌ DB connection error:", err);
  });

//! middleware
app.use(express.json());
app.use(cors()); // Allow all origins

//! health check route
app.get("/", (req, res) => {
  res.status(200).send("✅ Server is alive!");
});

//! routes
app.use("/api/v1/user", userRouter);
app.use("/api/v1/bot", botRouter);
app.use("/api/v1/message", messageRouter);
app.use("/api/v1/tool", toolRouter);
app.use("/api/v1/support", supportRouter);
app.use("/api/v1/chat", chatRouter);

//! socket verify auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token; // sent from client
  if (!token) return next(new Error("No token"));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = user.id;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

//! Socket.IO Setup
io.on("connection", (socket) => {
  // Each user joins their own private room
  if (socket.userId) {
    socket.join(socket.userId.toString());
    console.log(`👤 Joined private room: ${socket.userId}`);
  }

  // Join a specific chat room
  socket.on("join_room", ({ roomId }) => {
    socket.join(roomId);
    console.log(`👥 Joined room: ${roomId}`);
  });

  // Handle sending a message
  socket.on("send_message", async (data) => {
    const msg = await userMessageModel.create({
      roomId: data.roomId,
      senderId: socket.userId,
      receiverId: data.receiverId,
      message: data.message,
      timestamp: data.timestamp,
      isRead: false,
    });

    const messagePayload = {
      ...data,
      senderId: socket.userId,
      messageId: msg._id.toString(),
      status: "delivered", // immediately delivered to receiver
    };

    // 🔹 Tell sender their message is confirmed (temp → real)
    io.to(socket.userId.toString()).emit("message_confirmed", {
      tempId: data.tempId,
      realMessageId: msg._id.toString(),
      timestamp: msg.timestamp,
    });

    // 🔹 Send to receiver’s private room
    io.to(data.receiverId.toString()).emit("receive_message", messagePayload);

    // 🔹 Optional: notify sender that message is delivered
    io.to(socket.userId.toString()).emit("message_status_update", {
      messageId: msg._id.toString(),
      status: "delivered",
    });
  });

  // mark as read
  socket.on("chat_opened", async ({ roomId, userId }) => {
    const updated = await userMessageModel.updateMany(
      { roomId, receiverId: userId, isRead: false },
      { $set: { isRead: true } }
    );

    // Notify the sender that all their messages were read
    io.to(roomId).emit("messages_read", { roomId, userId });

    // 🔹 Also emit per-message updates if needed
    const readMessages = await userMessageModel.find({
      roomId,
      receiverId: userId,
      isRead: true,
    });

    readMessages.forEach((m) => {
      io.to(m.senderId.toString()).emit("message_status_update", {
        messageId: m._id.toString(),
        status: "read",
      });
    });
  });

  socket.on("disconnect", () => {});
});

//! error handling middleware
app.use(errorHandler);

//! Start server
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}/api/v1`);
});
