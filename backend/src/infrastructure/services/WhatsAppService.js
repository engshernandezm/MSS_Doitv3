// WhatsApp Business Cloud API (Meta)
// Si WA_PHONE_ID y WA_ACCESS_TOKEN están vacíos → modo consola (dev)

class WhatsAppService {
  get isConfigured() {
    return !!(process.env.WA_PHONE_ID && process.env.WA_ACCESS_TOKEN);
  }

  async sendText(to, message) {
    if (!this.isConfigured) {
      console.log(`[WHATSAPP DEV] To: ${to}`);
      console.log(`[WHATSAPP DEV] ${message}`);
      return { status: 'dev_console' };
    }

    const url = `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { body: message },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  async sendButtons(to, body, buttons) {
    if (!this.isConfigured) {
      console.log(`[WHATSAPP DEV] To: ${to} | Buttons: ${buttons.map(b => b.title).join(' | ')}`);
      console.log(`[WHATSAPP DEV] ${body}`);
      return { status: 'dev_console' };
    }

    const url = `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.map((b, i) => ({
              type: 'reply',
              reply: { id: b.id || String(i + 1), title: b.title },
            })),
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  // Descarga imagen enviada por el usuario vía WhatsApp
  async downloadMedia(mediaId) {
    if (!this.isConfigured) return null;

    // 1) Obtener URL de la imagen
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
    });
    const { url } = await metaRes.json();

    // 2) Descargar bytes
    const imgRes = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` },
    });
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    return buffer;
  }
}

module.exports = new WhatsAppService();
