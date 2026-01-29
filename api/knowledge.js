// Knowledge Base API - searches the Mindvalley MarTech knowledge base
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
    const results = {
      tools: [],
      faqs: [],
      dataFlows: [],
      predictiveModels: [],
      strategicPillars: [],
      compliance: []
    };

    // Search FAQs first (highest priority for direct questions)
    for (const faq of knowledgeBase.faqs) {
      const faqMatch = searchTerms.some(term =>
        faq.question.toLowerCase().includes(term) ||
        faq.answer.toLowerCase().includes(term)
      );
      if (faqMatch) {
        results.faqs.push(faq);
      }
    }

    // Search through categories and tools
    for (const category of knowledgeBase.categories) {
      for (const tool of category.tools) {
        const toolMatch = searchTerms.some(term =>
          tool.name.toLowerCase().includes(term) ||
          tool.description.toLowerCase().includes(term) ||
          (tool.capabilities && tool.capabilities.some(cap => cap.toLowerCase().includes(term))) ||
          (tool.integrations && tool.integrations.some(int => int.toLowerCase().includes(term))) ||
          (tool.channels && tool.channels.some(ch => ch.toLowerCase().includes(term)))
        );

        if (toolMatch) {
          results.tools.push({
            category: category.name,
            tool: tool.name,
            description: tool.description,
            status: tool.status,
            capabilities: tool.capabilities || [],
            integrations: tool.integrations || [],
            channels: tool.channels || [],
            useCase: tool.useCase,
            consolidationPlan: tool.consolidationPlan
          });
        }
      }
    }

    // Search data flows
    for (const flow of knowledgeBase.dataFlows) {
      const flowMatch = searchTerms.some(term =>
        flow.name.toLowerCase().includes(term) ||
        flow.description.toLowerCase().includes(term) ||
        flow.source.toLowerCase().includes(term) ||
        flow.destination.toLowerCase().includes(term) ||
        flow.dataType.toLowerCase().includes(term)
      );
      if (flowMatch) {
        results.dataFlows.push(flow);
      }
    }

    // Search predictive models
    for (const model of knowledgeBase.dataStrategy.predictiveModels) {
      const modelMatch = searchTerms.some(term =>
        model.name.toLowerCase().includes(term) ||
        model.description.toLowerCase().includes(term) ||
        (model.tiers && model.tiers.some(t =>
          t.action.toLowerCase().includes(term) ||
          (t.label && t.label.toLowerCase().includes(term))
        ))
      );
      if (modelMatch) {
        results.predictiveModels.push(model);
      }
    }

    // Search strategic pillars
    for (const pillar of knowledgeBase.strategicPillars) {
      const pillarMatch = searchTerms.some(term =>
        pillar.name.toLowerCase().includes(term) ||
        pillar.description.toLowerCase().includes(term) ||
        pillar.initiatives.some(init => init.toLowerCase().includes(term))
      );
      if (pillarMatch) {
        results.strategicPillars.push(pillar);
      }
    }

    // Search compliance
    const complianceTerms = ['gdpr', 'compliance', 'consent', 'privacy', 'cpra', 'pdpa', 'regulation'];
    if (searchTerms.some(term => complianceTerms.includes(term))) {
      results.compliance.push(knowledgeBase.compliance);
    }

    // Search measurement framework
    const measurementTerms = ['mta', 'mmm', 'attribution', 'measurement', 'incrementality', 'experiment'];
    if (searchTerms.some(term => measurementTerms.includes(term))) {
      results.measurementFramework = knowledgeBase.measurementFramework;
    }

    const totalResults =
      results.tools.length +
      results.faqs.length +
      results.dataFlows.length +
      results.predictiveModels.length +
      results.strategicPillars.length +
      results.compliance.length +
      (results.measurementFramework ? 1 : 0);

    return res.status(200).json({
      success: true,
      query,
      company: knowledgeBase.company,
      results,
      totalResults
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
};
