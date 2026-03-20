// Netlify Serverless Function — Cloudinary Folder Proxy
// This runs on Netlify's servers, not in the browser
// so there are no CORS issues and your API secret stays safe

const https = require('https');

exports.handler = async function(event, context) {

  // Allow requests from your site
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers, body: '' };
  }

  // Get folder name from query string
  // e.g. /.netlify/functions/cloudinary?folder=FASHION -DeAnna May
  const folder = event.queryStringParameters && event.queryStringParameters.folder;

  if(!folder){
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing folder parameter' })
    };
  }

  // Your Cloudinary credentials — set these in Netlify Environment Variables
  // Go to: Netlify Dashboard → Site Settings → Environment Variables
  // Add: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  const cloudName  = process.env.CLOUDINARY_CLOUD_NAME  || 'dfqouxke9';
  const apiKey     = process.env.CLOUDINARY_API_KEY;
  const apiSecret  = process.env.CLOUDINARY_API_SECRET;

  if(!apiKey || !apiSecret){
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Cloudinary credentials not configured in Netlify environment variables' })
    };
  }

  // Build Cloudinary Admin API URL
  // Lists all resources in a specific folder
  const encodedFolder = encodeURIComponent(folder);
  const path = '/v1_1/'+cloudName+'/resources/image?type=upload&prefix='+encodedFolder+'&max_results=500';

  // Basic auth with API key and secret
  const auth = Buffer.from(apiKey+':'+apiSecret).toString('base64');

  return new Promise(function(resolve){
    const options = {
      hostname: 'api.cloudinary.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Basic '+auth
      }
    };

    const req = https.request(options, function(res){
      let data = '';
      res.on('data', function(chunk){ data += chunk; });
      res.on('end', function(){
        try {
          const parsed = JSON.parse(data);
          const photos = (parsed.resources || []).map(function(r){
            return {
              public_id: r.public_id,
              url: 'https://res.cloudinary.com/'+cloudName+'/image/upload/'+r.public_id,
              thumb: 'https://res.cloudinary.com/'+cloudName+'/image/upload/w_400,h_400,c_fill,q_auto,f_auto/'+r.public_id,
              small: 'https://res.cloudinary.com/'+cloudName+'/image/upload/w_800,q_auto,f_auto/'+r.public_id,
              full: 'https://res.cloudinary.com/'+cloudName+'/image/upload/q_auto,f_auto/'+r.public_id
            };
          });
          resolve({
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ photos: photos, count: photos.length, folder: folder })
          });
        } catch(e){
          resolve({
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: 'Failed to parse Cloudinary response', detail: data })
          });
        }
      });
    });

    req.on('error', function(e){
      resolve({
        statusCode: 500,
        headers: headers,
        body: JSON.stringify({ error: e.message })
      });
    });

    req.end();
  });
};
