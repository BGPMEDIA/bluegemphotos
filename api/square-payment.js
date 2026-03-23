const https = require('https');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sourceId, amountCents, currency, note, buyerName, buyerEmail } = req.body;

  if (!sourceId || !amountCents) {
    return res.status(400).json({ error: 'Missing required payment fields' });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;

  const payload = JSON.stringify({
    source_id: sourceId,
    idempotency_key: crypto.randomUUID(),
    amount_money: {
      amount: amountCents,
      currency: currency || 'USD'
    },
    location_id: locationId,
    note: note || 'Photography session booking',
    buyer_email_address: buyerEmail || undefined
  });

  const options = {
    hostname: 'connect.squareupsandbox.com',
    path: '/v2/payments',
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
          if (result.payment && result.payment.status === 'COMPLETED') {
            res.status(200).json({
              success: true,
              paymentId: result.payment.id,
              amount: result.payment.amount_money.amount
            });
          } else {
            const errorMsg = result.errors?.[0]?.detail || 'Payment was not completed';
            res.status(400).json({ success: false, error: errorMsg });
          }
        } catch (e) {
          res.status(500).json({ success: false, error: 'Invalid response from payment processor' });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(500).json({ success: false, error: 'Payment processing error' });
      resolve();
    });

    request.write(payload);
    request.end();
  });
};
