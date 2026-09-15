type LightMode = 'off' | 'on' | 'auto';

export const CAPTURE_LIGHT_SETTLE_MS = 350;

/** EXIF Flash is a bit field: bit zero means fired, not the entire value. */
export function didPhotoFlashFire(exif: Record<string, unknown> | undefined): boolean {
  const raw = exif?.Flash;
  const value = typeof raw === 'number' ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 0 && value <= 0xffff && (value & 1) === 1;
}

export function getCaptureLighting(mode: LightMode, autoFired: boolean | null, active: boolean) {
  // Auto gets one native metering photo. Its decision stays latched while CV,
  // tracking and shutter state change; ordinary buffer photos never flash.
  const probe = active && mode === 'auto' && autoFired === null;
  return {
    probe,
    flash: probe ? 'auto' as const : 'off' as const,
    enableTorch: active && (mode === 'on' || (mode === 'auto' && autoFired === true)),
  };
}
