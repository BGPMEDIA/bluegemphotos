const https = require('https');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { amountCents, currency, note, buyerName, buyerEmail, redirectUrl } = req.body;

  if (!amountCents) {
    return res.status(400).json({ error: 'Missing required payment fields' });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;

  const payload = JSON.stringify({
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: note || 'Photography Session Booking',
      price_money: {
        amount: amountCents,
        currency: currency || 'USD'
      },
      location_id: locationId
    },
    checkout_options: {
      redirect_url: redirectUrl || 'https://bluegemphotos.com',
      ask_for_shipping_address: false
    },
    pre_populated_data: {
      buyer_email: buyerEmail || undefined
    }
  });

  const options = {
    hostname: 'connect.squareupsandbox.com',
    path: '/v2/online-checkout/payment-links',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + accessToken,
      'Square-Version': '2024-01-18',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.payment_link && result.payment_link.url) {
            res.status(200).json({
              success: true,
              paymentUrl: result.payment_link.url,
              paymentId: result.payment_link.id
            });
          } else {
            const errorMsg = result.errors?.[0]?.detail || 'Could not create payment link';
            res.status(400).json({ success: false, error: errorMsg });
          }
        } catch (e) {
          res.status(500).json({ success: false, error: 'Invalid response from payment processor' });
        }
        resolve();
      });
    });

    request.on('error', () => {
      res.status(500).json({ success: false, error: 'Payment processing error' });
      resolve();
    });

    request.write(payload);
    request.end();
  });
};
