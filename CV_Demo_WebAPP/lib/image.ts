import sharp from 'sharp';

/** Decode once, respecting orientation and the same white background as preview. */
export function decodeScanImage(bytes:Buffer) {
  return sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning'})
    .rotate()
    .flatten({background:'#ffffff'})
    .toColourspace('srgb')
    .raw()
    .toBuffer({resolveWithObject:true});
}
