module.exports = async function handler(req, res) {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if(!REDIS_URL || !REDIS_TOKEN) {
    return res.status(200).json({ 
      success: false, 
      error: 'Missing env vars',
      hasUrl: !!REDIS_URL,
      hasToken: !!REDIS_TOKEN
    });
  }

  try {
    const response = await fetch(`${REDIS_URL}/ping`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await response.json();
    return res.status(200).json({ success: true, ping: data });
  } catch(err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
