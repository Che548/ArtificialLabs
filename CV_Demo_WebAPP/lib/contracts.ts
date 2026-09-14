export type { AnalysisResult, Point } from '../../modules/strip-cv/src/StripCv.types';
export { getAnalysisDecision, getAnalysisConfidence, deriveDetectedInterpretation } from '../../services/scanning/result-interpretation';
export type SessionInfo = { role: 'admin'|'guest'; owner: string; expiresAt: number };
export type Product = { label: string; batch: string; expiresAt: string; source: 'bundled'|'manual'|'qr' };
export const initialProduct: Product = { label:'Двухлинейная тест-полоска', batch:'Встроенный профиль', expiresAt:'',source:'bundled' };
export type AnalysisResponse = { analysis: import('../../modules/strip-cv/src/StripCv.types').AnalysisResult; width:number; height:number; product:Product };
export type ScanRecord = { id:string; owner:string; createdAt:number; date:string; photo:Blob; result:AnalysisResponse; configuration?:{qr:string;batch:string;flip:boolean}; confirmed:boolean; interpretation:'positive'|'negative'|null; manual:boolean; note:string };
export const reasonLabels: Record<string,string> = {
  control_not_detected:'Контрольная линия не обнаружена', strip_not_found:'Тест-полоска не найдена', low_control_snr:'Контрольная линия недостаточно чёткая', blurry_image:'Снимок недостаточно резкий', excessive_glare:'Блики на изображении', low_confidence:'Недостаточная уверенность распознавания', insufficient_valid_pixels:'Недостаточно полезных пикселей', low_locator_confidence:'Проверьте границы тест-полоски', image_blurry:'Снимок недостаточно резкий', low_control_signal:'Слабый сигнал контрольной линии', clipped_pixels:'Часть снимка пересвечена', glare_detected:'Обнаружены блики', uncertain_peak_pair:'Требуется проверка положения линий', no_strip_candidate:'Не удалось найти тест-полоску',
};
export function qualityReason(code:string) { return reasonLabels[code] || `Проверка качества: ${code.replaceAll('_',' ')}`; }
