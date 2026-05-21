import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUserContext } from "./UserContext";
import { API_URL } from "@/utils/api";

type SocketContextType = {
  socket: Socket | null;
  onlineUsers: string[];
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  onlineUsers: [],
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const { dbUser } = useUserContext();

  useEffect(() => {
    if (dbUser?._id) {
      const socketConn = io(API_URL, {
        query: {
          userId: dbUser._id,
        },
        transports: ["websocket"], // force WebSocket transport for RN stability
      });

      setSocket(socketConn);

      socketConn.on("connect", () => {
        console.log("Connected to socket server");
      });

      socketConn.on("getOnlineUsers", (users: string[]) => {
        setOnlineUsers(users);
      });

      socketConn.on("disconnect", () => {
        console.log("Disconnected from socket server");
      });

      return () => {
        socketConn.close();
        setSocket(null);
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
      }
    }
  }, [dbUser?._id]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};
