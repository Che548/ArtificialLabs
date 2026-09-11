import type { ImageSourcePropType } from 'react-native';

// Resolve visuals locally so existing saved plans receive current category artwork.
const categoryImages: Record<string, ImageSourcePropType> = {
  'Исследования крови': require('../assets/analyses/categories/01_blood.png'),
  'Исследования мочи': require('../assets/analyses/categories/02_urine.png'),
  'Ультразвуковые исследования': require('../assets/analyses/categories/03_ultrasound.png'),
  'Цитология и биопсия': require('../assets/analyses/categories/04_cytology.png'),
  'Экспресс-тесты и домашняя диагностика': require('../assets/analyses/categories/05_home_tests.png'),
  'Исследования кала и пищеварения': require('../assets/analyses/categories/06_digestion.png'),
  'Мазки и другие биоматериалы': require('../assets/analyses/categories/07_swabs.png'),
  'Диагностика инфекций': require('../assets/analyses/categories/08_infections.png'),
  'Генетические исследования': require('../assets/analyses/categories/09_genetics.png'),
  'Рентгенологические исследования': require('../assets/analyses/categories/10_xray.png'),
  'Компьютерная томография': require('../assets/analyses/categories/11_ct.png'),
  'Магнитно-резонансная томография': require('../assets/analyses/categories/12_mri.png'),
  'Эндоскопические исследования': require('../assets/analyses/categories/13_endoscopy.png'),
  'Функциональная диагностика': require('../assets/analyses/categories/14_functional_diagnostics.png'),
};

export function analysisCategoryImage(
  category?: string,
): ImageSourcePropType | undefined {
  return category ? categoryImages[category] : undefined;
}
