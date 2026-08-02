import {
  toStripCvCliRequest,
  type StripCvJsonRequest,
  type StripCvRgbImage,
} from './StripCv.web-request';

type JsonRecord = Record<string, unknown>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return globalThis.btoa(binary);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to decode the captured image in the browser.'));
    };
    image.src = objectUrl;
  });
}

async function decodeImageUri(imageUri: string): Promise<StripCvRgbImage> {
  const response = await fetch(imageUri);
  if (!response.ok) {
    throw new Error(`Unable to read captured image (${response.status}).`);
  }
  const image = await loadImage(await response.blob());
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width < 1 || height < 1) {
    throw new Error('Captured image has no pixels.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    throw new Error('The browser does not provide a 2D image canvas.');
  }
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, destination = 0; source < rgba.length; source += 4) {
    rgb[destination++] = rgba[source];
    rgb[destination++] = rgba[source + 1];
    rgb[destination++] = rgba[source + 2];
  }
  return {
    base64: bytesToBase64(rgb),
    width,
    height,
    rowStride: width * 3,
  };
}

function endpoint(): string {
  const configured = (
    globalThis as typeof globalThis & {
      __STRIP_CV_ENDPOINT__?: string;
    }
  ).__STRIP_CV_ENDPOINT__;
  return configured ?? '/api/strip-cv';
}

const webModule = {
  async analyzeStripJsonAsync(requestJson: string): Promise<string> {
    const request = JSON.parse(requestJson) as JsonRecord;
    const imageUri = request.imageUri;
    if (typeof imageUri !== 'string' || imageUri.length === 0) {
      throw new Error('StripCV web analysis requires a captured image URI.');
    }

    const image = await decodeImageUri(imageUri);
    const response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        toStripCvCliRequest(request as StripCvJsonRequest, image),
      ),
    });
    const payload = (await response.json()) as JsonRecord;
    if (!response.ok) {
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : `StripCV web service failed (${response.status}).`;
      throw new Error(message);
    }
    return JSON.stringify(payload);
  },
};

export default webModule;
