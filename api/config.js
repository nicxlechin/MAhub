export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, restEndpoint } = req.body;

    if (!apiKey || !restEndpoint) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: apiKey and restEndpoint are required'
      });
    }

    // Validate the endpoint format
    const endpointPattern = /^https:\/\/rest\..+\.braze\.(com|eu)$/;
    if (!endpointPattern.test(restEndpoint)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Braze REST endpoint format'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Braze credentials validated successfully',
      endpoint: restEndpoint
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
