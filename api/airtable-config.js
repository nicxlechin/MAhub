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
    // First try the metadata API (requires schema.bases:read scope)
    const metaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (metaResponse.ok) {
      const data = await metaResponse.json();
      const tables = data.tables || [];
      return res.status(200).json({
        success: true,
        message: 'Connection successful',
        tableCount: tables.length,
        tables: tables.map(t => ({ id: t.id, name: t.name }))
      });
    }

    // If metadata API fails, try a simple base access test
    // This works with just data.records:read scope
    const error = await metaResponse.json();

    if (metaResponse.status === 403 || (error.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND')) {
      // Try alternative: just verify we can access the base
      // We'll try to list from a dummy table - if base is valid, we get "table not found" not "base not found"
      const testResponse = await fetch(`https://api.airtable.com/v0/${baseId}/_test_connection_?maxRecords=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const testError = await testResponse.json();

      // If we get "table not found", the base ID and API key are valid
      if (testError.error?.type === 'TABLE_NOT_FOUND' || testError.error?.message?.includes('Could not find table')) {
        return res.status(200).json({
          success: true,
          message: 'Connection successful (limited access)',
          note: 'API key valid but lacks schema.bases:read scope. Add this scope in Airtable to see table list.',
          tableCount: null,
          tables: []
        });
      }

      // If unauthorized, the API key is wrong
      if (testResponse.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key'
        });
      }

      // If we get a different error, base might not exist
      if (testResponse.status === 404 || testError.error?.type === 'NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'Base not found - check your Base ID'
        });
      }
    }

    if (metaResponse.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    if (metaResponse.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Base not found - check your Base ID'
      });
    }

    throw new Error(error.error?.message || 'Airtable API error');

  } catch (error) {
    console.error('Airtable config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect to Airtable'
    });
  }
};
