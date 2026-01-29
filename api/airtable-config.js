// Airtable configuration and connection testing
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, baseId } = req.body;

  if (!apiKey || !baseId) {
    return res.status(400).json({
      success: false,
      error: 'API Key and Base ID are required'
    });
  }

  try {
    // Test connection by fetching base schema
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key'
        });
      }
      if (response.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Base not found - check your Base ID'
        });
      }
      throw new Error(error.error?.message || 'Airtable API error');
    }

    const data = await response.json();
    const tables = data.tables || [];

    return res.status(200).json({
      success: true,
      message: 'Connection successful',
      tableCount: tables.length,
      tables: tables.map(t => ({ id: t.id, name: t.name }))
    });

  } catch (error) {
    console.error('Airtable config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect to Airtable'
    });
  }
};
