// Vercel API Route — Cloudinary Folder Proxy with Redis Caching
// Caches photo lists in Upstash Redis for 24 hours
// Prevents Cloudinary API rate limit issues

const https = require('https');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_TTL   = 86400; // 24 hours in seconds

async function redisGet(key){
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    if(!data.result) return null;
    let result = data.result;
    if(typeof result === 'string'){
      try { result = JSON.parse(result); } catch(e){ return null; }
    }
    return result;
  } catch(e){ return null; }
}

async function redisSet(key, value, ttl){
  try {
    await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        ['SET', key, JSON.stringify(value)],
        ['EXPIRE', key, ttl]
      ])
    });
  } catch(e){ console.warn('Redis cache write failed:', e.message); }
}

function fetchFromCloudinary(cloudName, apiKey, apiSecret, folder){
  return new Promise(function(resolve, reject){
    const auth = Buffer.from(apiKey + ':' + apiSecret).toString('base64');
    const searchBody = JSON.stringify({
      expression: 'asset_folder="' + folder + '"',
      max_results: 500
    });
    const options = {
      hostname: 'api.cloudinary.com',
      path: '/v1_1/' + cloudName + '/resources/search',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(searchBody)
      }
    };
    const req = https.request(options, function(apiRes){
      let data = '';
      apiRes.on('data', function(chunk){ data += chunk; });
      apiRes.on('end', function(){
        try {
          const parsed = JSON.parse(data);
          if(parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.resources || []);
        } catch(e){ reject(e); }
      });
    });
    req.on('error', reject);
    req.write(searchBody);
    req.end();
  });
}

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Auth');
  res.setHeader('Content-Type', 'application/json');

  if(req.method === 'OPTIONS') return res.status(200).end();

  const folder = req.query && req.query.folder;
  if(!folder) return res.status(400).json({ error: 'Missing folder parameter' });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dfqouxke9';
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if(!apiKey || !apiSecret){
    return res.status(500).json({ error: 'Cloudinary credentials not configured' });
  }

  // Admin cache bust — DELETE request or ?bust=1
  const adminAuth = req.headers['x-admin-auth'];
  const isCacheBust = req.method === 'DELETE' || req.query.bust === '1';
  if(isCacheBust && (adminAuth === 'BluegGem2025!' || req.query.bust === '1')){
    const cacheKey = 'bgp_gallery_cache:' + folder;
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(cacheKey)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    return res.status(200).json({ success: true, message: 'Cache cleared for ' + folder });
  }

  // Check Redis cache first
  const cacheKey = 'bgp_gallery_cache:' + folder;
  const cached = await redisGet(cacheKey);

  if(cached && Array.isArray(cached) && cached.length > 0){
    return res.status(200).json({
      photos: cached,
      count: cached.length,
      folder: folder,
      cached: true
    });
  }

  // Cache miss — fetch from Cloudinary
  try {
    const resources = await fetchFromCloudinary(cloudName, apiKey, apiSecret, folder);
    const photos = resources.map(function(r){
      return {
        public_id: r.public_id,
        thumb: 'https://res.cloudinary.com/' + cloudName + '/image/upload/w_400,h_400,c_fill,q_auto,f_auto/' + r.public_id,
        small: 'https://res.cloudinary.com/' + cloudName + '/image/upload/w_800,q_auto,f_auto/' + r.public_id,
        full:  'https://res.cloudinary.com/' + cloudName + '/image/upload/q_auto,f_auto/' + r.public_id
      };
    });

    // Save to Redis cache for 24 hours
    if(photos.length > 0){
      await redisSet(cacheKey, photos, CACHE_TTL);
    }

    return res.status(200).json({
      photos: photos,
      count: photos.length,
      folder: folder,
      cached: false
    });
  } catch(err){
    // If Cloudinary fails — try returning stale cache if available
    const stale = await redisGet(cacheKey);
    if(stale && Array.isArray(stale)){
      return res.status(200).json({
        photos: stale,
        count: stale.length,
        folder: folder,
        cached: true,
        stale: true
      });
    }
    return res.status(500).json({ error: err.message });
  }
};
