// OpenAI-powered chat endpoint
const fs = require('fs');
const path = require('path');

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

  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    // Load knowledge base
    const kbPath = path.join(process.cwd(), 'data', 'knowledge-base.json');
    const knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf8'));

    // Build context from knowledge base
    const context = buildContext(knowledgeBase);

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a helpful MarTech assistant for Mindvalley. You help answer questions about the marketing technology stack, data flows, campaigns, compliance, and analytics.

Use the following knowledge base to answer questions accurately. If the information is not in the knowledge base, say so and provide general guidance.

Format your responses with markdown: use **bold** for emphasis, bullet points for lists, and clear paragraphs.

Knowledge Base:
${context}`
          },
          {
            role: 'user',
            content: question
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    return res.status(200).json({
      success: true,
      answer,
      model: 'gpt-4o-mini'
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process question'
    });
  }
};

function buildContext(kb) {
  let context = '';

  // Company info
  context += `Company: ${kb.company}\n`;
  context += `Last Updated: ${kb.lastUpdated}\n\n`;

  // Strategy goals
  if (kb.strategyGoals) {
    context += `Strategy Goals: ${kb.strategyGoals.goals.join(', ')}\n`;
    context += `Objectives: ${kb.strategyGoals.objectives.join(', ')}\n\n`;
  }

  // Strategic pillars
  if (kb.strategicPillars) {
    context += 'Strategic Pillars:\n';
    kb.strategicPillars.forEach(pillar => {
      context += `- ${pillar.name}: ${pillar.description}\n`;
      context += `  Initiatives: ${pillar.initiatives.join('; ')}\n`;
    });
    context += '\n';
  }

  // Tools by category
  if (kb.categories) {
    context += 'Tools and Categories:\n';
    kb.categories.forEach(cat => {
      context += `\n${cat.name}: ${cat.description}\n`;
      cat.tools.forEach(tool => {
        context += `- ${tool.name}: ${tool.description}\n`;
        if (tool.capabilities) {
          context += `  Capabilities: ${tool.capabilities.join(', ')}\n`;
        }
        if (tool.channels) {
          context += `  Channels: ${tool.channels.join(', ')}\n`;
        }
        if (tool.integrations) {
          context += `  Integrations: ${tool.integrations.join(', ')}\n`;
        }
      });
    });
    context += '\n';
  }

  // Data strategy and predictive models
  if (kb.dataStrategy?.predictiveModels) {
    context += 'Predictive Models:\n';
    kb.dataStrategy.predictiveModels.forEach(model => {
      context += `- ${model.name}: ${model.description}`;
      if (model.scale) context += ` (Scale: ${model.scale})`;
      context += '\n';
      if (model.tiers) {
        model.tiers.forEach(tier => {
          const label = tier.label ? ` [${tier.label}]` : '';
          context += `  ${tier.tier}${label}: ${tier.action}\n`;
        });
      }
    });
    context += '\n';
  }

  // Data flows
  if (kb.dataFlows) {
    context += 'Data Flows:\n';
    kb.dataFlows.forEach(flow => {
      context += `- ${flow.name}: ${flow.source} -> ${flow.destination}\n`;
      context += `  ${flow.description}\n`;
      context += `  Data Type: ${flow.dataType}\n`;
    });
    context += '\n';
  }

  // Measurement framework
  if (kb.measurementFramework) {
    context += `Measurement Framework: ${kb.measurementFramework.description}\n`;
    kb.measurementFramework.approaches.forEach(approach => {
      context += `- ${approach.name} (${approach.purpose}): ${approach.description}\n`;
    });
    context += '\n';
  }

  // Compliance
  if (kb.compliance) {
    context += `Compliance Regulations: ${kb.compliance.regulations.join(', ')}\n`;
    context += `Principle: ${kb.compliance.principle}\n`;
    kb.compliance.highRiskAreas.forEach(area => {
      context += `- ${area.area}: ${area.requirements.join('; ')}\n`;
    });
    context += '\n';
  }

  // FAQs
  if (kb.faqs) {
    context += 'Frequently Asked Questions:\n';
    kb.faqs.forEach(faq => {
      context += `Q: ${faq.question}\n`;
      context += `A: ${faq.answer}\n\n`;
    });
  }

  return context;
}
