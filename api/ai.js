const https = require('https');

// Allow large request bodies for PDF content
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

module.exports = async function(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Test endpoint
  if (req.method === 'GET') {
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    return res.status(200).json({ 
      status: 'Vercel function working!', 
      hasApiKey: hasKey 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  // Get API key from environment
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: { message: 'ANTHROPIC_API_KEY not set in Vercel environment variables' } 
    });
  }

  // Get payload
  const payload = req.body && req.body.payload;
  if (!payload) {
    return res.status(400).json({ 
      error: { message: 'No payload provided in request body' } 
    });
  }

  const postData = JSON.stringify(payload);

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      };

      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('Bad response: ' + data.substring(0, 200))); }
        });
      });

      apiReq.on('error', reject);
      apiReq.write(postData);
      apiReq.end();
    });

    return res.status(200).json(result);

  } catch(err) {
    return res.status(500).json({ 
      error: { message: 'Server error: ' + err.message } 
    });
  }
};
