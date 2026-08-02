import { StatusBar } from 'expo-status-bar';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const futureCapabilities = [
  'Объяснять сохранённые показатели простым языком',
  'Помогать подготовить вопросы врачу',
  'Учитывать выбранную программу и записи дневника',
];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-surface-canvas">
      <StatusBar style="dark" />
      <ScrollView
        className="px-4"
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: 120,
        }}
      >
        <Text className="font-sf-semibold text-[30px] text-ink">Помощник</Text>
        <Text className="text-text-secondary mt-1 font-sf text-[15px]">
          Безопасный контекстный чат появится отдельным этапом
        </Text>

        <View className="shadow-card mt-6 rounded-[30px] bg-brand-burgundy p-6">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-white/15">
            <Text className="font-yaro text-[24px] text-white">с.</Text>
          </View>
          <Text className="mt-5 font-sf-semibold text-[22px] leading-7 text-white">
            Сейчас чат намеренно отключён
          </Text>
          <Text className="mt-3 font-sf text-[15px] leading-6 text-white/75">
            Мы не отправляем медицинские записи во внешний AI без отдельной
            модели согласия, фильтрации данных и проверки ответов.
          </Text>
        </View>

        <Text className="mt-7 font-sf-semibold text-[20px] text-ink">
          Что планируется
        </Text>
        {futureCapabilities.map((capability, index) => (
          <View
            key={capability}
            className="shadow-card mt-3 flex-row items-center gap-4 rounded-card-lg bg-white p-4"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-warm">
              <Text className="font-yaro text-[16px] text-brand-primary">
                {index + 1}
              </Text>
            </View>
            <Text className="flex-1 font-sf text-[15px] leading-5 text-ink">
              {capability}
            </Text>
          </View>
        ))}

        <View className="mt-6 rounded-card-lg border border-surface-divider bg-white/60 p-4">
          <Text className="text-text-secondary font-sf text-[13px] leading-5">
            Помощник не заменит врача и не будет ставить диагнозы. До запуска
            здесь не собираются сообщения и медицинские данные.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
