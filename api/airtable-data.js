// Fetch data from Airtable with fuzzy table name matching
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

  // Helper to normalize table names for comparison (strip emojis and extra spaces)
  const normalizeTableName = (name) => {
    return name
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
      .replace(/[^\w\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase();
  };

  // Helper to fetch data from a specific table
  const fetchTableData = async (actualTableName) => {
    const params = new URLSearchParams();
    if (maxRecords) params.append('maxRecords', maxRecords);
    if (filterFormula) params.append('filterByFormula', filterFormula);
    if (view) params.append('view', view);

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(actualTableName)}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    return { response, data: await response.json() };
  };

  try {
    // First, try with the exact table name
    let { response, data } = await fetchTableData(tableName);

    // If table not found, try fuzzy matching
    if (!response.ok && (data.error?.type === 'TABLE_NOT_FOUND' || data.error?.message?.includes('Could not find table'))) {
      console.log(`Table "${tableName}" not found, trying fuzzy match...`);

      // Fetch list of tables from the base
      const tablesResponse = await fetch(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      if (tablesResponse.ok) {
        const tablesData = await tablesResponse.json();
        const tables = tablesData.tables || [];
        const normalizedSearch = normalizeTableName(tableName);

        // Find best matching table
        let bestMatch = null;
        let bestScore = 0;

        for (const table of tables) {
          const normalizedTableName = normalizeTableName(table.name);

          // Check for exact normalized match
          if (normalizedTableName === normalizedSearch) {
            bestMatch = table.name;
            break;
          }

          // Check if search term is contained in table name
          if (normalizedTableName.includes(normalizedSearch) || normalizedSearch.includes(normalizedTableName)) {
            const score = Math.min(normalizedSearch.length, normalizedTableName.length) / Math.max(normalizedSearch.length, normalizedTableName.length);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = table.name;
            }
          }

          // Check word overlap
          const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
          const tableWords = normalizedTableName.split(' ').filter(w => w.length > 2);
          const matchingWords = searchWords.filter(w => tableWords.some(tw => tw.includes(w) || w.includes(tw)));
          if (matchingWords.length > 0) {
            const wordScore = matchingWords.length / Math.max(searchWords.length, 1);
            if (wordScore > bestScore) {
              bestScore = wordScore;
              bestMatch = table.name;
            }
          }
        }

        if (bestMatch) {
          console.log(`Found matching table: "${bestMatch}"`);
          const result = await fetchTableData(bestMatch);
          response = result.response;
          data = result.data;
          // Update tableName for response
          if (response.ok) {
            const records = (data.records || []).map(record => ({
              id: record.id,
              ...record.fields,
              _createdTime: record.createdTime
            }));

            return res.status(200).json({
              success: true,
              records,
              count: records.length,
              tableName: bestMatch, // Return the actual matched table name
              requestedTable: tableName // Include original request for reference
            });
          }
        }
      }
    }

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
