import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
});
