export type StripCvJsonRequest = {
  imageUri: string;
  assayProfile: unknown;
  cardProfile: unknown;
  options: unknown;
};

export type StripCvRgbImage = {
  base64: string;
  width: number;
  height: number;
  rowStride: number;
};

export function toStripCvCliRequest(
  request: StripCvJsonRequest,
  image: StripCvRgbImage,
): Record<string, unknown> {
  return {
    assay_profile: request.assayProfile,
    card_profile: request.cardProfile,
    options: request.options,
    rgb_base64: image.base64,
    width: image.width,
    height: image.height,
    row_stride: image.rowStride,
  };
}
