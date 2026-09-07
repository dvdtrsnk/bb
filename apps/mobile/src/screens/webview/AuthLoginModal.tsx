import { useRef, useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { isShellNavigation } from "@/lib/shell";
import { Button, Spinner, Text } from "@/ui";

export interface AuthLoginModalProps {
  visible: boolean;
  serverUrl: string;
  initialUrl?: string;
  onDismiss: () => void;
  onAuthenticated: () => void;
}

export function AuthLoginModal({
  visible,
  serverUrl,
  initialUrl,
  onDismiss,
  onAuthenticated,
}: AuthLoginModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);

  const handleNavigationStateChange = (state: WebViewNavigation) => {
    if (settled.current || state.loading) return;
    if (isShellNavigation(state.url, serverUrl)) {
      settled.current = true;
      onAuthenticated();
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
      onShow={() => {
        settled.current = false;
        setLoading(true);
      }}
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-4 py-2">
          <Text variant="headline">Log in</Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={onDismiss}
            testID="auth-login-dismiss"
          >
            Done
          </Button>
        </View>
        <View className="flex-1">
          <WebView
            source={{ uri: initialUrl ?? serverUrl }}
            sharedCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            onNavigationStateChange={handleNavigationStateChange}
            onLoadEnd={() => setLoading(false)}
          />
          {loading ? (
            <View
              className="absolute inset-0 items-center justify-center"
              pointerEvents="none"
            >
              <Spinner />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
