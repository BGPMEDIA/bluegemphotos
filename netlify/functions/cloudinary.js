const https = require('https');

exports.handler = async function(event, context) {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers, body: '' };
  }

  const folder = event.queryStringParameters && event.queryStringParameters.folder;
  if(!folder){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing folder parameter' }) };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dfqouxke9';
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if(!apiKey || !apiSecret){
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Cloudinary credentials not configured' }) };
  }

  const auth = Buffer.from(apiKey + ':' + apiSecret).toString('base64');

  // Use Cloudinary Search API — searches by asset_folder which matches the UI folder
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

    const req = https.request(options, function(res){
      let data = '';
      res.on('data', function(chunk){ data += chunk; });
      res.on('end', function(){
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
          resolve({
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
              photos: photos,
              count: photos.length,
              folder: folder,
              debug_status: res.statusCode,
              debug_error: parsed.error || null
            })
          });
        } catch(e){
          resolve({
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: 'Parse error', detail: data.substring(0, 500) })
          });
        }
      });
    });

    req.on('error', function(e){
      resolve({ statusCode: 500, headers: headers, body: JSON.stringify({ error: e.message }) });
    });

    req.write(searchBody);
    req.end();
  });
};
