// Vercel API Route — Cloudinary Folder Proxy
// Fetches all photos from a Cloudinary folder using the Search API
// Runs server-side so API credentials stay secure and no CORS issues

const https = require('https');

module.exports = async function handler(req, res) {

  // Allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if(req.method === 'OPTIONS'){
    return res.status(200).end();
  }

  // Get folder from query string
  // e.g. /api/cloudinary?folder=VOGUE MODEL - DeAnna May
  const folder = req.query && req.query.folder;

  if(!folder){
    return res.status(400).json({ error: 'Missing folder parameter' });
  }

  // Credentials from Vercel Environment Variables
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dfqouxke9';
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if(!apiKey || !apiSecret){
    return res.status(500).json({ error: 'Cloudinary credentials not configured in Vercel environment variables' });
  }

  const auth = Buffer.from(apiKey + ':' + apiSecret).toString('base64');

  // Use Cloudinary Search API with asset_folder expression
  const searchBody = JSON.stringify({
    expression: 'asset_folder="' + folder + '"',
    max_results: 500
  });

  return new Promise(function(resolve){
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

    const req2 = https.request(options, function(apiRes){
      let data = '';
      apiRes.on('data', function(chunk){ data += chunk; });
      apiRes.on('end', function(){
        try {
          const parsed = JSON.parse(data);
          const resources = parsed.resources || [];
          const photos = resources.map(function(r){
            return {
              public_id: r.public_id,
              thumb: 'https://res.cloudinary.com/' + cloudName + '/image/upload/w_400,h_400,c_fill,q_auto,f_auto/' + r.public_id,
              small: 'https://res.cloudinary.com/' + cloudName + '/image/upload/w_800,q_auto,f_auto/' + r.public_id,
              full:  'https://res.cloudinary.com/' + cloudName + '/image/upload/q_auto,f_auto/' + r.public_id
            };
          });
          res.status(200).json({
            photos: photos,
            count: photos.length,
            folder: folder,
            debug_error: parsed.error || null
          });
          resolve();
        } catch(e){
          res.status(500).json({ error: 'Parse error', detail: data.substring(0, 500) });
          resolve();
        }
      });
    });

    req2.on('error', function(e){
      res.status(500).json({ error: e.message });
      resolve();
    });

    req2.write(searchBody);
    req2.end();
  });
};
