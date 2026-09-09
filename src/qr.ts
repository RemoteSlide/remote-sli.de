import QRCode from "qrcode";

/**
 * Renders `text` as an SVG QR code wrapped in a data URL, suitable for an
 * <img src>. SVG keeps the Worker free of any canvas/PNG dependency.
 */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
