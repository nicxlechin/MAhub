// Knowledge Base API - searches the MarTech knowledge base
const knowledgeBase = require('../data/knowledge-base.json');

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

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const searchTerms = query.toLowerCase().split(/\s+/);
    const results = [];

    // Search through categories
    for (const category of knowledgeBase.categories) {
      const categoryMatch = searchTerms.some(term =>
        category.name.toLowerCase().includes(term) ||
        category.description.toLowerCase().includes(term)
      );

      // Search through tools in category
      for (const tool of category.tools) {
        const toolMatch = searchTerms.some(term =>
          tool.name.toLowerCase().includes(term) ||
          tool.description.toLowerCase().includes(term) ||
          tool.capabilities.some(cap => cap.toLowerCase().includes(term)) ||
          (tool.integrations && tool.integrations.some(int => int.toLowerCase().includes(term)))
        );

        if (toolMatch || categoryMatch) {
          results.push({
            category: category.name,
            tool: tool.name,
            description: tool.description,
            capabilities: tool.capabilities,
            integrations: tool.integrations || [],
            dataFlows: tool.dataFlows || [],
            relevance: toolMatch ? 'high' : 'medium'
          });
        }
      }
    }

    // Search through data flows
    const flowResults = [];
    for (const flow of knowledgeBase.dataFlows) {
      const flowMatch = searchTerms.some(term =>
        flow.name.toLowerCase().includes(term) ||
        flow.description.toLowerCase().includes(term) ||
        flow.source.toLowerCase().includes(term) ||
        flow.destination.toLowerCase().includes(term)
      );

      if (flowMatch) {
        flowResults.push(flow);
      }
    }

    // Search through FAQs
    const faqResults = [];
    for (const faq of knowledgeBase.faqs) {
      const faqMatch = searchTerms.some(term =>
        faq.question.toLowerCase().includes(term) ||
        faq.answer.toLowerCase().includes(term)
      );

      if (faqMatch) {
        faqResults.push(faq);
      }
    }

    return res.status(200).json({
      success: true,
      query,
      results: {
        tools: results,
        dataFlows: flowResults,
        faqs: faqResults
      },
      totalResults: results.length + flowResults.length + faqResults.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
};
