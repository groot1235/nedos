import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useUserContext } from "@/context/UserContext";
import { API_URL } from "@/utils/api";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";

const NEIGHBORHOODS = [
  "Kharghar Sector 2",
  "Kharghar Sector 10",
  "Kharghar Sector 12",
  "Kharghar Sector 15",
  "Kharghar Sector 20",
  "Kharghar Sector 30",
  "Vashi Sector 9",
  "Vashi Sector 17",
  "Vashi Sector 30",
  "Seawoods Sector 40",
  "Seawoods Sector 50",
  "Nerul Sector 1",
  "Nerul Sector 10",
  "Belapur Sector 11",
  "Belapur Sector 15",
  "Kopar Khairane Sector 4",
  "Sanpada Sector 5",
  "Airoli Sector 3",
  "Ghansoli Sector 8",
  "Kamothe",
  "Kalamboli",
  "Panvel",
];

const getZoneForNeighborhood = (neighborhood: string): string => {
  const n = neighborhood.toLowerCase();
  if (n.includes("kharghar") || n.includes("kamothe") || n.includes("kalamboli") || n.includes("panvel")) {
    return "Kharghar";
  }
  if (
    n.includes("vashi") ||
    n.includes("sanpada") ||
    n.includes("kopar khairane") ||
    n.includes("airoli") ||
    n.includes("ghansoli")
  ) {
    return "Vashi";
  }
  if (n.includes("nerul") || n.includes("belapur")) {
    return "Nerul";
  }
  if (n.includes("seawoods")) {
    return "Seawoods";
  }
  return "Kharghar"; // Fallback default
};

export default function OnboardingScreen() {
  const { getToken } = useAuth();
  const { syncDbUser } = useUserContext();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocality, setSelectedLocality] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GPS auto-detection states
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedZone, setDetectedZone] = useState<string | null>(null);
  const [showDetectedConfirm, setShowDetectedConfirm] = useState(false);

  useEffect(() => {
    // Attempt auto-detection on mount
    handleGPSDetect(true);
  }, []);

  const handleGPSDetect = async (silentOnDenial = false) => {
    try {
      setIsDetecting(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silentOnDenial) {
          Alert.alert("Permission Denied", "GPS permission denied. Please select your neighborhood manually.");
        }
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;
      const token = await getToken();

      const response = await fetch(`${API_URL}/api/users/detect-zone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ latitude, longitude }),
      });

      if (!response.ok) {
        throw new Error("Failed to detect zone from GPS coordinates");
      }

      const data = await response.json();
      if (data.zoneName) {
        setDetectedZone(data.zoneName);
        setSelectedLocality(data.zoneName);
        setShowDetectedConfirm(true);
      } else {
        if (!silentOnDenial) {
          Alert.alert(
            "Location Outside Service Area",
            "We couldn't match your location to any active zones. Please select manually."
          );
        }
      }
    } catch (error) {
      console.error("GPS detection error:", error);
      if (!silentOnDenial) {
        Alert.alert("Location Detection Failed", "Could not determine your location. Please select manually.");
      }
    } finally {
      setIsDetecting(false);
    }
  };

  const filteredNeighborhoods = NEIGHBORHOODS.filter((n) =>
    n.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConfirm = async () => {
    if (!selectedLocality) {
      Alert.alert("Selection Required", "Please select your neighborhood to proceed.");
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      // Resolve final zone name (e.g. Kharghar, Vashi, Nerul, Seawoods)
      // If detectedZone matches selectedLocality, use it. Otherwise resolve from selected neighborhood.
      const finalZone =
        showDetectedConfirm && detectedZone === selectedLocality
          ? detectedZone
          : getZoneForNeighborhood(selectedLocality);

      const response = await fetch(`${API_URL}/api/user/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          homeLocality: finalZone, // Match exact zoned homeLocality
          location: selectedLocality, // Store the display sector/neighborhood name
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${errText}`);
      }

      await syncDbUser();
      router.replace("/(tabs)");
    } catch (error) {
      console.error("Error setting locality during onboarding:", error);
      Alert.alert(
        "Update Failed",
        "We could not save your location. Please check your internet connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 px-6 justify-between py-4"
      >
        <View className="flex-1">
          {/* Header */}
          <View className="mt-8 mb-6">
            <Text className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Select Your Locality
            </Text>
            <Text className="text-gray-500 text-[15px] mt-2 leading-5">
              Connect with your local community. Choose your neighborhood to see relevant posts, matches, and activities near you.
            </Text>
          </View>

          {isDetecting ? (
            <View className="flex-1 items-center justify-center py-12">
              <ActivityIndicator size="large" color="#2b4afc" />
              <Text className="text-gray-500 text-base mt-4 font-medium animate-pulse">
                Locating your community zone...
              </Text>
            </View>
          ) : showDetectedConfirm && detectedZone ? (
            /* GPS Detected Confirmation View */
            <View className="flex-1 justify-center py-6">
              <View className="bg-[#2b4afc]/5 border border-[#2b4afc]/20 rounded-3xl p-6 items-center shadow-sm">
                <View className="bg-[#2b4afc] rounded-full p-4 mb-4">
                  <Feather name="navigation" size={28} color="white" />
                </View>
                <Text className="text-xl font-bold text-gray-900">Location Detected!</Text>
                <Text className="text-gray-500 text-center mt-2 leading-5">
                  We found that you are within the community zone:
                </Text>
                <Text className="text-[#2b4afc] text-2xl font-extrabold mt-3">
                  {detectedZone}
                </Text>

                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={isSubmitting}
                  className="w-full bg-[#2b4afc] py-4 rounded-2xl flex-row items-center justify-center mt-8 shadow-md shadow-[#2b4afc]/20"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Text className="text-white font-bold text-base mr-2">Confirm & Enter Feed</Text>
                      <Feather name="arrow-right" size={16} color="white" />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setShowDetectedConfirm(false);
                    setSelectedLocality(null);
                  }}
                  className="mt-5"
                >
                  <Text className="text-gray-500 font-semibold text-sm underline">
                    Select neighborhood manually
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Manual Neighborhood Selector View */
            <View className="flex-1">
              {/* Search Input */}
              <View className="flex-row items-center bg-gray-100 rounded-2xl px-4 py-3.5 mb-4 border border-gray-100 focus:border-[#2b4afc]">
                <Feather name="search" size={18} color="#657786" />
                <TextInput
                  placeholder="Search sectors, neighborhoods..."
                  placeholderTextColor="#657786"
                  className="flex-1 ml-3 text-base text-gray-900"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Feather name="x-circle" size={18} color="#becbd6" />
                  </TouchableOpacity>
                )}
              </View>

              {/* GPS Quick Action */}
              <TouchableOpacity
                onPress={() => handleGPSDetect(false)}
                className="flex-row items-center justify-center bg-gray-50 py-3 rounded-2xl mb-4 border border-gray-200/50"
              >
                <Feather name="navigation" size={16} color="#2b4afc" />
                <Text className="text-[#2b4afc] font-bold text-sm ml-2">Detect using GPS</Text>
              </TouchableOpacity>

              {/* Neighborhood List */}
              <View className="flex-1">
                <FlatList
                  data={filteredNeighborhoods}
                  keyExtractor={(item) => item}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  renderItem={({ item }) => {
                    const isSelected = selectedLocality === item;
                    const zone = getZoneForNeighborhood(item);
                    return (
                      <TouchableOpacity
                        onPress={() => setSelectedLocality(item)}
                        className={`flex-row items-center justify-between p-4 mb-2.5 rounded-2xl border ${
                          isSelected
                            ? "bg-[#2b4afc]/5 border-[#2b4afc]"
                            : "bg-gray-50/50 border-gray-100"
                        }`}
                      >
                        <View className="flex-row items-center flex-1 pr-4">
                          <Feather
                            name="map-pin"
                            size={16}
                            color={isSelected ? "#2b4afc" : "#657786"}
                          />
                          <View className="ml-3">
                            <Text
                              className={`text-base ${
                                isSelected ? "text-[#2b4afc] font-semibold" : "text-gray-800"
                              }`}
                            >
                              {item}
                            </Text>
                            <Text className="text-gray-400 text-xs mt-0.5">
                              Zone: {zone}
                            </Text>
                          </View>
                        </View>
                        {isSelected ? (
                          <View className="bg-[#2b4afc] rounded-full p-0.5">
                            <Feather name="check" size={14} color="white" />
                          </View>
                        ) : (
                          <View className="w-5 h-5 rounded-full border border-gray-300" />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <View className="py-12 items-center justify-center">
                      <Text className="text-gray-400 text-base">
                        No matching neighborhoods found
                      </Text>
                    </View>
                  }
                />
              </View>
            </View>
          )}
        </View>

        {/* Manual Confirm Action Button (Only visible in manual mode) */}
        {(!showDetectedConfirm || !detectedZone) && !isDetecting && (
          <View className="mt-4">
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selectedLocality || isSubmitting}
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center ${
                selectedLocality && !isSubmitting ? "bg-[#2b4afc]" : "bg-gray-200"
              }`}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text
                  className={`font-bold text-base ${
                    selectedLocality ? "text-white" : "text-gray-400"
                  }`}
                >
                  Confirm Locality
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
