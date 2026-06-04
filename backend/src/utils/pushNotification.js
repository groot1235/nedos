/**
 * Sends a push notification using Expo's push notification service.
 * @param {string} expoPushToken - The recipient's Expo push token.
 * @param {string} title - The notification title.
 * @param {string} body - The notification body.
 * @param {object} data - Optional metadata payload.
 */
export const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  if (!expoPushToken || !expoPushToken.startsWith("ExponentPushToken")) {
    console.log("Invalid Expo push token:", expoPushToken);
    return;
  }

  const message = {
    to: expoPushToken,
    sound: "default",
    title,
    body,
    data,
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const resData = await response.json();
    console.log(`Push notification sent successfully to ${expoPushToken}:`, resData);
  } catch (error) {
    console.error("Error sending push notification to Expo service:", error);
  }
};
