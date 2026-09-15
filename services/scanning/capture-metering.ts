/** Do not turn an unsettled or cancelled camera operation into a CV miss. */
export async function captureMeteredPhoto<T>({
  waitForMetering, capture, cancelled,
}: {
  waitForMetering?: () => Promise<boolean>;
  capture: () => Promise<T>;
  cancelled: () => boolean;
}): Promise<T | null> {
  if (cancelled()) return null;
  if (waitForMetering && !await waitForMetering()) return null;
  if (cancelled()) return null;
  return capture();
}

/** A missing video frame retries later; it must not re-arm expensive still capture. */
export async function captureLiveFrame<T>({ takePreview, takePhoto, flashProbe }: {
  takePreview?: () => Promise<T | null | undefined>;
  takePhoto: () => Promise<T | null | undefined>;
  flashProbe: boolean;
}): Promise<T | null | undefined> {
  return takePreview && !flashProbe ? takePreview() : takePhoto();
}
