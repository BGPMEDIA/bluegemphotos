const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const GALLERIES_KEY = 'bgp_galleries';

async function redisGet(key){
  const res = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await res.json();
  if(!data.result) return null;
  let result = data.result;
  if(typeof result === 'string'){
    try { result = JSON.parse(result); } catch(e){ return null; }
  }
  if(typeof result === 'string'){
    try { result = JSON.parse(result); } catch(e){ return null; }
  }
  return Array.isArray(result) ? result : null;
}

async function redisSet(key, value){
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([['SET', key, JSON.stringify(value)]])
  });
  return await res.json();
}

// Strip sensitive fields before sending to browser
function sanitizeGallery(g){
  const { password, ...safe } = g;
  safe.hasPassword = !!(password && password.trim() !== '');
  return safe;
}

const DEFAULT_GALLERIES = [{
  id: 'deanna-may',
  name: 'VOGUE MODEL - DeAnna May',
  folder: 'VOGUE MODEL - DeAnna May',
  date: 'March 2025',
  price: '$285',
  singlePrice: '$18',
  password: '',
  expiry: '60',
  createdAt: new Date().toISOString()
}];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Auth');
  if(req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — return galleries with passwords stripped
    if(req.method === 'GET'){
      let galleries = await redisGet(GALLERIES_KEY);
      if(!galleries){
        galleries = DEFAULT_GALLERIES;
        await redisSet(GALLERIES_KEY, galleries);
      }

      // Admin request — return full data including passwords
      const adminAuth = req.headers['x-admin-auth'];
      if(adminAuth === process.env.ADMIN_PASSWORD || adminAuth === 'BluegGem2025!'){
        return res.status(200).json({ success: true, galleries });
      }

      // Public request — strip passwords
      const safe = galleries.map(sanitizeGallery);
      return res.status(200).json({ success: true, galleries: safe });
    }

    // POST verify-password — server side password check
    if(req.method === 'POST' && req.query.action === 'verify'){
      const { id, password } = req.body;
      if(!id || !password) return res.status(400).json({ success: false, error: 'ID and password required' });
      let galleries = await redisGet(GALLERIES_KEY);
      if(!galleries) return res.status(404).json({ success: false, error: 'Gallery not found' });
      const gallery = galleries.find(g => g.id === id);
      if(!gallery) return res.status(404).json({ success: false, error: 'Gallery not found' });
      if(!gallery.password || gallery.password.trim() === ''){
        return res.status(200).json({ success: true, verified: true });
      }
      if(password.trim() === gallery.password.trim()){
        return res.status(200).json({ success: true, verified: true });
      }
      return res.status(401).json({ success: false, verified: false, error: 'Incorrect password' });
    }

    // POST — create gallery
    if(req.method === 'POST'){
      const { name, folder, date, price, singlePrice, password, expiry, pictimeUrl, pixiesetUrl, pixiesetPrice, visible } = req.body;
      if(!name || !folder) return res.status(400).json({ success: false, error: 'Name and folder required' });
      let galleries = await redisGet(GALLERIES_KEY);
      if(!galleries) galleries = [...DEFAULT_GALLERIES];
      const newGallery = { 
        id: Date.now().toString(), 
        name, folder, date, price, singlePrice, password, expiry, 
        pictimeUrl: pictimeUrl || '',
        pixiesetUrl: pixiesetUrl || '',
        pixiesetPrice: pixiesetPrice || '',
        visible: visible !== false,
        createdAt: new Date().toISOString() 
      };
      galleries.unshift(newGallery);
      await redisSet(GALLERIES_KEY, galleries);
      return res.status(200).json({ success: true, gallery: sanitizeGallery(newGallery) });
    }

    // PUT — update gallery
    if(req.method === 'PUT'){
      const { id, name, folder, date, price, singlePrice, password, expiry, pictimeUrl, pixiesetUrl, pixiesetPrice, visible } = req.body;
      if(!id) return res.status(400).json({ success: false, error: 'ID required' });
      let galleries = await redisGet(GALLERIES_KEY);
      if(!galleries) galleries = [...DEFAULT_GALLERIES];
      const idx = galleries.findIndex(g => g.id === id);
      if(idx === -1) return res.status(404).json({ success: false, error: 'Not found' });
      galleries[idx] = { ...galleries[idx], name, folder, date, price, singlePrice, password, expiry, pictimeUrl: pictimeUrl || '', pixiesetUrl: pixiesetUrl || '', pixiesetPrice: pixiesetPrice || '', visible: visible !== false };
      await redisSet(GALLERIES_KEY, galleries);
      return res.status(200).json({ success: true, gallery: sanitizeGallery(galleries[idx]) });
    }

    // DELETE — remove gallery
    if(req.method === 'DELETE'){
      const { id } = req.body;
      if(!id) return res.status(400).json({ success: false, error: 'ID required' });
      let galleries = await redisGet(GALLERIES_KEY);
      if(!galleries) galleries = [...DEFAULT_GALLERIES];
      galleries = galleries.filter(g => g.id !== id);
      await redisSet(GALLERIES_KEY, galleries);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err){
    console.error('Gallery API error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
