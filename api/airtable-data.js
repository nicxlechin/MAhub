// Fetch data from Airtable
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

  const { apiKey, baseId, tableName, maxRecords, filterFormula, view } = req.body;

  if (!apiKey || !baseId || !tableName) {
    return res.status(400).json({
      success: false,
      error: 'API Key, Base ID, and Table Name are required'
    });
  }

  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (maxRecords) params.append('maxRecords', maxRecords);
    if (filterFormula) params.append('filterByFormula', filterFormula);
    if (view) params.append('view', view);

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.error?.message || 'Airtable API error',
        details: data.error
      });
    }

    // Transform records to be more usable
    const records = (data.records || []).map(record => ({
      id: record.id,
      ...record.fields,
      _createdTime: record.createdTime
    }));

    return res.status(200).json({
      success: true,
      records,
      count: records.length,
      tableName
    });

  } catch (error) {
    console.error('Airtable data error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Airtable data'
    });
  }
};
