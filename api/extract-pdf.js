const https = require('https');

// Tell Vercel to allow large request bodies (up to 50MB)
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { pdfBase64, instruction } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'No PDF data provided' });

    // Send PDF to Claude for text extraction
    const payload = {
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: instruction || 'Extract ALL the text content from this PDF document. Return only the text content, preserving paragraphs. Do not add any commentary.'
          }
        ]
      }]
    };

    const postData = JSON.stringify(payload);

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
          catch(e) { reject(new Error('Parse error: ' + data.substring(0, 200))); }
        });
      });

      apiReq.on('error', reject);
      apiReq.write(postData);
      apiReq.end();
    });

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    const extractedText = result.content && result.content[0] ? result.content[0].text : '';
    return res.status(200).json({ text: extractedText, success: true });

  } catch(err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
