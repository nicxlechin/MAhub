module.exports = async function handler(req, res) {
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
    const { apiKey, restEndpoint, page, includeArchived, sortDirection, lastEditTimeGt, lastEditTimeLt } = req.body;

    if (!apiKey || !restEndpoint) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: apiKey and restEndpoint are required'
      });
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (page !== undefined) params.append('page', page);
    if (includeArchived !== undefined) params.append('include_archived', includeArchived);
    if (sortDirection) params.append('sort_direction', sortDirection);
    if (lastEditTimeGt) params.append('last_edit.time[gt]', lastEditTimeGt);
    if (lastEditTimeLt) params.append('last_edit.time[lt]', lastEditTimeLt);

    const queryString = params.toString();
    const brazeUrl = `${restEndpoint}/campaigns/list${queryString ? '?' + queryString : ''}`;

    const response = await fetch(brazeUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'Braze API error',
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};
