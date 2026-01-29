// OpenAI-powered chat endpoint with smart fallback
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

  // Load knowledge base
  let knowledgeBase;
  try {
    const kbPath = path.join(process.cwd(), 'data', 'knowledge-base.json');
    knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load knowledge base' });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  // If no API key, use smart fallback
  if (!apiKey) {
    const answer = generateSmartAnswer(question, knowledgeBase);
    return res.status(200).json({
      success: true,
      answer,
      model: 'fallback'
    });
  }

  try {
    // Build focused context based on question
    const context = buildFocusedContext(question, knowledgeBase);

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
            content: `You are a helpful MarTech assistant for Mindvalley. Answer questions clearly and concisely based on the knowledge base provided.

Rules:
- Give direct, actionable answers
- Use **bold** for key terms and bullet points for lists
- Keep responses focused and under 300 words
- If you don't have the information, say so briefly

Knowledge Base Context:
${context}`
          },
          {
            role: 'user',
            content: question
          }
        ],
        max_tokens: 800,
        temperature: 0.5
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
    // Fallback to smart answer if OpenAI fails
    const answer = generateSmartAnswer(question, knowledgeBase);
    return res.status(200).json({
      success: true,
      answer,
      model: 'fallback'
    });
  }
};

// Generate a smart answer without AI by matching FAQs and relevant content
function generateSmartAnswer(question, kb) {
  const q = question.toLowerCase();

  // Check FAQs first - find best match
  let bestFaq = null;
  let bestScore = 0;

  for (const faq of kb.faqs) {
    const faqQ = faq.question.toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 3);
    const matches = words.filter(w => faqQ.includes(w)).length;
    const score = matches / words.length;

    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestFaq = faq;
    }
  }

  if (bestFaq && bestScore > 0.5) {
    return `**${bestFaq.question}**\n\n${bestFaq.answer}`;
  }

  // Check for specific topics
  if (q.includes('lead scor')) {
    const model = kb.dataStrategy.predictiveModels.find(m => m.name.includes('Lead Score'));
    if (model) {
      let answer = `**${model.name}**\n\n${model.description}\n\n**Score Tiers:**\n`;
      model.tiers.forEach(t => {
        answer += `• **${t.tier}**${t.label ? ` (${t.label})` : ''}: ${t.action}\n`;
      });
      answer += `\nThe score is computed in Segment and synced to Braze for targeting.`;
      return answer;
    }
  }

  if (q.includes('churn') || q.includes('predictive churn')) {
    const model = kb.dataStrategy.predictiveModels.find(m => m.name.includes('Churn'));
    if (model) {
      let answer = `**${model.name}**\n\n${model.description} (Scale: ${model.scale})\n\n**Tiers:**\n`;
      model.tiers.forEach(t => {
        answer += `• **${t.tier}**: ${t.action}\n`;
      });
      return answer;
    }
  }

  if (q.includes('braze') && q.includes('channel')) {
    const braze = kb.categories.find(c => c.name === 'Customer Engagement')?.tools.find(t => t.name === 'Braze');
    if (braze && braze.channels) {
      return `**Braze Supported Channels:**\n\n${braze.channels.map(c => `• ${c}`).join('\n')}\n\n**Additional Capabilities:**\n${braze.capabilities.slice(0, 6).map(c => `• ${c}`).join('\n')}`;
    }
  }

  if (q.includes('mta') || q.includes('mmm') || q.includes('attribution')) {
    const mf = kb.measurementFramework;
    let answer = `**${mf.description}**\n\n`;
    mf.approaches.forEach(a => {
      answer += `**${a.name}** - ${a.purpose}\n${a.description}\n\n`;
    });
    return answer;
  }

  if (q.includes('gdpr') || q.includes('compliance') || q.includes('privacy')) {
    const c = kb.compliance;
    let answer = `**Compliance & Privacy**\n\nRegulations: ${c.regulations.join(', ')}\n\n_"${c.principle}"_\n\n`;
    c.highRiskAreas.forEach(area => {
      answer += `**${area.area}:**\n${area.requirements.map(r => `• ${r}`).join('\n')}\n\n`;
    });
    return answer;
  }

  if (q.includes('data') && (q.includes('collect') || q.includes('flow'))) {
    let answer = `**Data Collection & Flows**\n\nUser data is collected via Segment SDK in the web/app.\n\n**Key Data Flows:**\n`;
    kb.dataFlows.forEach(f => {
      answer += `• **${f.name}**: ${f.source} → ${f.destination}\n  _${f.dataType}_\n`;
    });
    return answer;
  }

  // If we found a relevant FAQ but score was lower, still use it
  if (bestFaq) {
    return `**${bestFaq.question}**\n\n${bestFaq.answer}`;
  }

  // Check if question is about Braze - give Braze-specific suggestions
  if (q.includes('braze') || q.includes('campaign') || q.includes('canvas')) {
    return `**I can help with Braze!** Try asking:\n\n• "List all campaigns" - See your active campaigns\n• "Show Braze campaigns" - View campaign list\n• "How many campaigns do we have?" - Get campaign count\n• "What campaigns are running?" - See active campaigns\n• "What channels does Braze support?" - Learn about Braze capabilities\n• "How do I send a push notification?" - Step-by-step guide\n• "What is a Canvas in Braze?" - Learn about journey orchestration\n\n_Note: Live campaign data requires Braze to be connected in the Admin panel._`;
  }

  // Default response
  return `I can help you with questions about:\n\n• **Tools**: Braze, Segment, Amplitude, AppsFlyer, Mixpanel\n• **Data**: Lead scoring, LTV prediction, churn models\n• **Campaigns**: How to send push/email/SMS via Braze\n• **Attribution**: MTA vs MMM, measurement frameworks\n• **Compliance**: GDPR, consent management\n\nTry asking a specific question like "How does lead scoring work?" or "What channels does Braze support?"`;
}

// Build focused context based on the question
function buildFocusedContext(question, kb) {
  const q = question.toLowerCase();
  let context = '';

  // Always include relevant FAQs
  const relevantFaqs = kb.faqs.filter(faq => {
    const words = q.split(/\s+/).filter(w => w.length > 3);
    return words.some(w => faq.question.toLowerCase().includes(w) || faq.answer.toLowerCase().includes(w));
  }).slice(0, 3);

  if (relevantFaqs.length > 0) {
    context += 'Relevant FAQs:\n';
    relevantFaqs.forEach(faq => {
      context += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
    });
  }

  // Add predictive models if relevant
  if (q.includes('lead') || q.includes('score') || q.includes('churn') || q.includes('ltv') || q.includes('predictive')) {
    context += 'Predictive Models:\n';
    kb.dataStrategy.predictiveModels.forEach(m => {
      context += `${m.name}: ${m.description}`;
      if (m.scale) context += ` (${m.scale})`;
      context += '\n';
      if (m.tiers) {
        m.tiers.forEach(t => context += `  - ${t.tier}${t.label ? ` [${t.label}]` : ''}: ${t.action}\n`);
      }
    });
    context += '\n';
  }

  // Add tool info if relevant
  const toolKeywords = ['braze', 'segment', 'amplitude', 'mixpanel', 'appsflyer', 'push', 'email', 'sms', 'channel'];
  if (toolKeywords.some(k => q.includes(k))) {
    context += 'Tools:\n';
    kb.categories.forEach(cat => {
      cat.tools.forEach(tool => {
        if (toolKeywords.some(k => tool.name.toLowerCase().includes(k) || q.includes(tool.name.toLowerCase()))) {
          context += `${tool.name}: ${tool.description}\n`;
          if (tool.capabilities) context += `Capabilities: ${tool.capabilities.join(', ')}\n`;
          if (tool.channels) context += `Channels: ${tool.channels.join(', ')}\n`;
        }
      });
    });
    context += '\n';
  }

  // Add measurement framework if relevant
  if (q.includes('mta') || q.includes('mmm') || q.includes('attribution') || q.includes('measurement')) {
    context += `Measurement Framework: ${kb.measurementFramework.description}\n`;
    kb.measurementFramework.approaches.forEach(a => {
      context += `${a.name} (${a.purpose}): ${a.description}\n`;
    });
    context += '\n';
  }

  // Add compliance if relevant
  if (q.includes('gdpr') || q.includes('compliance') || q.includes('privacy') || q.includes('consent')) {
    context += `Compliance: Regulations: ${kb.compliance.regulations.join(', ')}\n`;
    context += `Principle: ${kb.compliance.principle}\n`;
    kb.compliance.highRiskAreas.forEach(a => {
      context += `${a.area}: ${a.requirements.join('; ')}\n`;
    });
    context += '\n';
  }

  // Add data flows if relevant
  if (q.includes('data') || q.includes('flow') || q.includes('collect') || q.includes('segment')) {
    context += 'Data Flows:\n';
    kb.dataFlows.forEach(f => {
      context += `${f.name}: ${f.source} -> ${f.destination} (${f.dataType})\n`;
    });
    context += '\n';
  }

  return context || buildContext(kb);
}

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
