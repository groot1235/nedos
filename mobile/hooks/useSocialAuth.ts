import { useSSO } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import { useState } from "react";
import { Alert } from "react-native";

const redirectUrl = AuthSession.makeRedirectUri({ path: "sso-callback" });

export const useSocialAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { startSSOFlow } = useSSO();

  const handleSocialAuth = async (strategy: "oauth_google" | "oauth_apple") => {
    setIsLoading(true);
    try {
      const { createdSessionId, setActive, authSessionResult } =
        await startSSOFlow({ strategy, redirectUrl });

      if (
        authSessionResult?.type === "cancel" ||
        authSessionResult?.type === "dismiss"
      ) {
        return;
      }

      if (authSessionResult?.type !== "success") {
        throw new Error("Sign-in was not completed");
      }

      if (!createdSessionId) {
        throw new Error("No session was created");
      }

      await setActive?.({ session: createdSessionId });
    } catch (err) {
      console.error("Error in social auth", err);
      const provider = strategy === "oauth_google" ? "Google" : "Apple";
      Alert.alert(
        "Error",
        `Failed to sign in with ${provider}. Please try again.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, handleSocialAuth };
};
