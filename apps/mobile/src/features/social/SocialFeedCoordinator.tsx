import { useEffect } from "react";
import { AppState } from "react-native";
import { subscribeToTrainingChanges } from "../../storage/trainingChanges";
import { observePRSharingAuth, retryPersonalRecordPublishing } from "./prPublishing";

export function SocialFeedCoordinator() {
  useEffect(() => {
    const retry = () => { void retryPersonalRecordPublishing().catch(() => {}); };
    const auth = observePRSharingAuth();
    const training = subscribeToTrainingChanges(retry);
    const appState = AppState.addEventListener("change", (value) => { if (value === "active") retry(); });
    retry();
    return () => { auth(); training(); appState.remove(); };
  }, []);
  return null;
}
