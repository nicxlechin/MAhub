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

  const { apiKey, baseId, tableName } = req.body;

  if (!apiKey || !baseId) {
    return res.status(400).json({
      success: false,
      error: 'API Key and Base ID are required'
    });
  }

  try {
    // If table name provided, test direct access to that table
    if (tableName) {
      const tableResponse = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=1`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      if (tableResponse.ok) {
        return res.status(200).json({
          success: true,
          message: 'Connection successful',
          tableName: tableName,
          note: 'Successfully connected to table'
        });
      }

      const tableError = await tableResponse.json();
      throw new Error(tableError.error?.message || 'Failed to access table');
    }

    // Test connection by accessing the base with a fake table name
    // This tells us if the API key and base ID are valid
    const testResponse = await fetch(
      `https://api.airtable.com/v0/${baseId}/__connection_test__?maxRecords=1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const testData = await testResponse.json();

    // Check the error type to determine what's wrong
    if (testData.error) {
      const errorType = testData.error.type;
      const errorMsg = testData.error.message || '';

      // "TABLE_NOT_FOUND" means the base ID and API key are valid!
      if (errorType === 'TABLE_NOT_FOUND' || errorMsg.includes('Could not find table')) {
        return res.status(200).json({
          success: true,
          message: 'Connection successful',
          note: 'Base and API key verified. Enter a table name to test full access.'
        });
      }

      // Authentication error
      if (errorType === 'AUTHENTICATION_REQUIRED' || testResponse.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key - check your Personal Access Token'
        });
      }

      // Invalid base
      if (errorType === 'NOT_FOUND' || errorMsg.includes('Could not find base')) {
        return res.status(404).json({
          success: false,
          error: 'Base not found - check your Base ID (starts with "app")'
        });
      }

      // Permission error
      if (errorType === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
        return res.status(403).json({
          success: false,
          error: `Permission denied. Airtable says: "${errorMsg}". Base ID used: ${baseId.substring(0, 6)}...`
        });
      }

      // Return full error for debugging
      throw new Error(`${errorType}: ${errorMsg}`);
    }

    // If somehow we got here with a success response
    return res.status(200).json({
      success: true,
      message: 'Connection successful'
    });

  } catch (error) {
    console.error('Airtable config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect to Airtable'
    });
  }
};
