// MV MarTech Hub - Intelligent Chat API
// Dynamically fetches from Airtable, parses documents, uses OpenAI

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });

  // Get credentials from environment
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    let knowledgeContext = '';

    // Fetch Airtable data if configured
    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
      console.log('Fetching Airtable data...');
      knowledgeContext = await fetchAirtableKnowledge(AIRTABLE_API_KEY, AIRTABLE_BASE_ID);
    }

    // Send to OpenAI
    const answer = await askOpenAI(OPENAI_API_KEY, question, knowledgeContext);

    return res.status(200).json({
      success: true,
      answer,
      source: knowledgeContext ? 'airtable+openai' : 'openai'
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process question'
    });
  }
};

// Fetch all tables and records from Airtable, including document content
async function fetchAirtableKnowledge(apiKey, baseId) {
  let context = '';

  try {
    // Step 1: Get list of all tables in the base
    const tablesRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!tablesRes.ok) {
      console.error('Failed to fetch tables:', await tablesRes.text());
      return '';
    }

    const tablesData = await tablesRes.json();
    const tables = tablesData.tables || [];

    console.log(`Found ${tables.length} tables`);

    // Step 2: Fetch records from each table
    for (const table of tables) {
      const tableName = table.name;
      const tableId = table.id;

      // Identify field types for this table
      const attachmentFields = [];
      const urlFields = [];

      for (const field of table.fields || []) {
        if (field.type === 'multipleAttachments') {
          attachmentFields.push(field.name);
        }
        if (field.type === 'url' || field.type === 'richText' || field.type === 'multilineText' || field.type === 'singleLineText') {
          urlFields.push(field.name);
        }
      }

      // Fetch records from this table
      const recordsRes = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=100`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!recordsRes.ok) {
        console.error(`Failed to fetch records from ${tableName}`);
        continue;
      }

      const recordsData = await recordsRes.json();
      const records = recordsData.records || [];

      if (records.length === 0) continue;

      context += `\n\n=== TABLE: ${tableName} (${records.length} records) ===\n`;

      // Process each record
      for (const record of records) {
        const fields = record.fields;
        let recordText = '\n---\n';

        // Add all regular fields
        for (const [key, value] of Object.entries(fields)) {
          if (value === null || value === undefined) continue;

          // Handle attachments
          if (attachmentFields.includes(key) && Array.isArray(value)) {
            recordText += `${key}: `;
            for (const attachment of value) {
              recordText += `[${attachment.filename || 'file'}](${attachment.url}) `;

              // Try to fetch document content
              const docContent = await fetchDocumentContent(attachment.url, attachment.type);
              if (docContent) {
                recordText += `\n  Content: ${docContent.substring(0, 2000)}...\n`;
              }
            }
            recordText += '\n';
          }
          // Handle potential URL fields - look for Google Docs links
          else if (typeof value === 'string' && value.includes('docs.google.com')) {
            recordText += `${key}: ${value}\n`;
            const docContent = await fetchGoogleDocContent(value);
            if (docContent) {
              recordText += `  Document Content: ${docContent.substring(0, 3000)}...\n`;
            }
          }
          // Handle arrays
          else if (Array.isArray(value)) {
            recordText += `${key}: ${value.join(', ')}\n`;
          }
          // Handle objects
          else if (typeof value === 'object') {
            recordText += `${key}: ${JSON.stringify(value)}\n`;
          }
          // Handle regular values
          else {
            recordText += `${key}: ${value}\n`;
          }
        }

        context += recordText;
      }
    }

  } catch (error) {
    console.error('Airtable fetch error:', error);
  }

  return context;
}

// Fetch content from Google Docs (must be publicly shared)
async function fetchGoogleDocContent(url) {
  try {
    // Extract doc ID from various Google Docs URL formats
    const patterns = [
      /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
      /docs\.google\.com\/document\/u\/\d+\/d\/([a-zA-Z0-9_-]+)/,
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/
    ];

    let docId = null;
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        docId = match[1];
        break;
      }
    }

    if (!docId) return null;

    // Fetch as plain text (requires doc to be publicly accessible)
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl);

    if (!response.ok) {
      console.log(`Could not fetch Google Doc ${docId}: ${response.status}`);
      return null;
    }

    const text = await response.text();
    return text.trim();

  } catch (error) {
    console.error('Google Doc fetch error:', error);
    return null;
  }
}

// Fetch content from document attachments (PDFs, etc.)
async function fetchDocumentContent(url, mimeType) {
  try {
    // For PDFs, we'd need a PDF parser - for now, just note the URL
    if (mimeType && mimeType.includes('pdf')) {
      // In production, you could use pdf-parse or a PDF API service
      return `[PDF document - view at: ${url}]`;
    }

    // For text files, fetch directly
    if (mimeType && (mimeType.includes('text') || mimeType.includes('plain'))) {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
    }

    return null;
  } catch (error) {
    console.error('Document fetch error:', error);
    return null;
  }
}

// Ask OpenAI with the knowledge context
async function askOpenAI(apiKey, question, knowledgeContext) {
  const systemPrompt = `You are MV MarTech Hub, an intelligent assistant for Mindvalley's marketing technology stack.

Your knowledge comes from the company's Airtable database which contains:
- MarTech DNA (tools, platforms, integrations)
- Processes and workflows
- Documentation and guides
- Any other relevant marketing technology information

INSTRUCTIONS:
1. Answer questions directly and helpfully based on the knowledge provided
2. If the knowledge contains relevant information, USE IT to give specific answers
3. Reference specific tools, processes, or documents when relevant
4. If you find document links in the data, you can share them with the user
5. Use **bold** for emphasis and bullet points for lists
6. Be concise but complete
7. If you truly don't have information about something, say so honestly

${knowledgeContext ? `\n--- KNOWLEDGE BASE ---\n${knowledgeContext}\n--- END KNOWLEDGE BASE ---` : 'Note: No knowledge base is currently connected.'}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 2000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API error');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'I could not generate a response.';
}
