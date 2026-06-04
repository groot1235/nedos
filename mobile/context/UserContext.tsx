import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth, useUser } from "@clerk/expo";
import { API_URL } from "@/utils/api";

type DbUserType = {
  _id: string;
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  profilePicture?: string;
  bannerImage?: string;
  bio?: string;
  location?: string;
  homeLocality?: string;
  followers: string[];
  following: string[];
  blockedUsers?: string[];
  createdAt: string;
  updatedAt: string;
};

type UserContextType = {
  dbUser: DbUserType | null;
  isLoading: boolean;
  syncDbUser: () => Promise<void>;
};

const UserContext = createContext<UserContextType>({
  dbUser: null,
  isLoading: true,
  syncDbUser: async () => {},
});

export const useUserContext = () => useContext(UserContext);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [dbUser, setDbUser] = useState<DbUserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Keep a ref to getToken so syncDbUser has a stable identity
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const syncDbUser = useCallback(async () => {
    if (!isSignedIn) {
      setDbUser(null);
      setIsLoading(false);
      return;
    }

    const MAX_ATTEMPTS = 4;
    const DELAYS_MS = [0, 1500, 3000, 5000]; // first attempt is immediate

    try {
      setIsLoading(true);

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (DELAYS_MS[attempt] > 0) {
          await sleep(DELAYS_MS[attempt]);
        }

        // skipCache on retries to get a fresh JWT from Clerk
        const token = await getTokenRef.current({ skipCache: attempt > 0 });

        if (!token) {
          console.warn(`[UserContext] No token on attempt ${attempt + 1}`);
          continue;
        }

        let response: Response;
        try {
          response = await fetch(`${API_URL}/api/users/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (networkError) {
          console.warn(`[UserContext] Network error on attempt ${attempt + 1}:`, networkError);
          continue;
        }

        if (response.status === 401) {
          // Clerk session not yet accepted by server — retry with fresh token
          console.warn(
            `[UserContext] Got 401 on attempt ${attempt + 1} — session may not be ready yet`
          );
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to sync user with database: Status ${response.status} - ${errorText}`
          );
        }

        const data = await response.json();
        setDbUser(data.user);
        return; // ✅ Success — exit loop
      }

      // All attempts exhausted
      console.error(
        `[UserContext] All ${MAX_ATTEMPTS} sync attempts failed. Check backend or Clerk config.`
      );
    } catch (error) {
      console.error("Error syncing user with DB:", error, `(API: ${API_URL})`);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]); // getToken is accessed via ref — keeps syncDbUser stable

  useEffect(() => {
    if (isLoaded) {
      syncDbUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, clerkUser?.id]); // syncDbUser intentionally omitted — it's stable via ref pattern

  return (
    <UserContext.Provider value={{ dbUser, isLoading, syncDbUser }}>
      {children}
    </UserContext.Provider>
  );
};
