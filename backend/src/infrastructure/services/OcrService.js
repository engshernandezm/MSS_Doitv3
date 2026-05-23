// OCR Service — extrae datos CFDI 4.0 de imágenes/PDFs
// Si GOOGLE_VISION_API_KEY está vacío → devuelve datos mock realistas
// Para producción: reemplazar con Google Cloud Vision o AWS Textract

class OcrService {
  get isConfigured() {
    return !!process.env.GOOGLE_VISION_API_KEY;
  }

  // Retorna objeto con datos extraídos del comprobante
  async extractFromBuffer(buffer, mimeType = 'image/jpeg') {
    if (!this.isConfigured) {
      return this._mockExtract();
    }

    // Google Cloud Vision - Document Text Detection
    const b64 = buffer.toString('base64');
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: b64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );

    const data = await res.json();
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!fullText || fullText.trim().length < 20) {
      return { is_legible: false, confidence: 0, raw_text: '' };
    }

    return this._parseCFDI(fullText);
  }

  // Extrae campos CFDI 4.0 del texto crudo
  _parseCFDI(text) {
    const rfcRe    = /RFC\s*[:\s]+([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i;
    const uuidRe   = /UUID[:\s]+([0-9a-f-]{36})/i;
    const totalRe  = /Total[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i;
    const subtRe   = /SubTotal[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i;
    const ivaRe    = /IVA[:\s]*\$?\s*([\d,]+\.?\d{0,2})/i;
    const dateRe   = /Fecha[:\s]+(\d{4}-\d{2}-\d{2})/i;

    const parse = (n) => n ? parseFloat(n.replace(/,/g, '')) : null;

    const subtotal  = parse(text.match(subtRe)?.[1]);
    const iva       = parse(text.match(ivaRe)?.[1]);
    const total     = parse(text.match(totalRe)?.[1]);
    const rfc       = text.match(rfcRe)?.[1] || null;
    const uuid      = text.match(uuidRe)?.[1] || null;
    const fecha_str = text.match(dateRe)?.[1] || null;

    // Calcular confianza básica
    let confidence = 60;
    if (rfc)   confidence += 10;
    if (uuid)  confidence += 10;
    if (total) confidence += 10;
    if (subtotal && iva && total) confidence += 10;

    return {
      is_legible:   confidence >= 60,
      confidence,
      rfc_emisor:   rfc,
      uuid_cfdi:    uuid,
      subtotal,
      iva,
      total,
      fecha_cfdi:   fecha_str ? new Date(fecha_str) : null,
      raw_text:     text.substring(0, 500),
    };
  }

  // Mock: datos CFDI 4.0 realistas para desarrollo
  _mockExtract() {
    const rfcs = ['ABC123456XYZ','DEF789012ABC','GHI345678DEF','JKL901234GHI'];
    const rfc = rfcs[Math.floor(Math.random() * rfcs.length)];
    const subtotal  = parseFloat((Math.random() * 900 + 100).toFixed(2));
    const iva       = parseFloat((subtotal * 0.16).toFixed(2));
    const total     = parseFloat((subtotal + iva).toFixed(2));
    const uuid      = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    console.log('[OCR MOCK] Datos generados para desarrollo');
    return {
      is_legible:  true,
      confidence:  95,
      rfc_emisor:  rfc,
      uuid_cfdi:   uuid,
      subtotal,
      iva,
      total,
      fecha_cfdi:  new Date(),
      raw_text:    `[MOCK] RFC: ${rfc} | UUID: ${uuid} | SubTotal: ${subtotal} | IVA: ${iva} | Total: ${total}`,
    };
  }
}

module.exports = new OcrService();
