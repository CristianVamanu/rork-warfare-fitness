import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import Colors from '@/constants/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Mission Not Found</Text>
        <Text style={styles.subtitle}>This route does not exist, soldier.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Return to Base</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: Colors.text,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    paddingHorizontal: 24,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  linkText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
});
