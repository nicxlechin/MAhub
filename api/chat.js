// Intelligent chat endpoint - uses OpenAI with live data context
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

  const { question, liveData } = req.body;

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

  // Build context with live data
  const context = buildContext(question, knowledgeBase, liveData);

  // If OpenAI is available, use it
  if (apiKey) {
    try {
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
              content: `You are a helpful MarTech assistant for Mindvalley. Answer questions directly and helpfully.

IMPORTANT RULES:
- Give direct, specific answers - never say "I can help with..." as a response
- If you have live data (campaigns, etc), USE IT to answer the question
- Use **bold** for emphasis and bullet points for lists
- Keep responses concise but complete
- If you truly don't know, admit it briefly and suggest what you CAN help with

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

      if (response.ok) {
        const data = await response.json();
        const answer = data.choices[0]?.message?.content;
        if (answer) {
          return res.status(200).json({ success: true, answer, model: 'gpt-4o-mini' });
        }
      }
    } catch (error) {
      console.error('OpenAI error:', error);
    }
  }

  // Fallback: Generate intelligent answer without OpenAI
  const answer = generateIntelligentAnswer(question, knowledgeBase, liveData);
  return res.status(200).json({ success: true, answer, model: 'fallback' });
};

function buildContext(question, kb, liveData) {
  let context = 'KNOWLEDGE BASE:\n';

  // Add relevant FAQs
  const q = question.toLowerCase();
  const relevantFaqs = kb.faqs.filter(faq => {
    const words = q.split(/\s+/).filter(w => w.length > 2);
    return words.some(w =>
      faq.question.toLowerCase().includes(w) ||
      faq.answer.toLowerCase().includes(w)
    );
  }).slice(0, 5);

  if (relevantFaqs.length > 0) {
    context += '\nRelevant FAQs:\n';
    relevantFaqs.forEach(faq => {
      context += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
    });
  }

  // Add tool information
  context += '\nAvailable Tools: Segment (CDP), Braze (engagement), Amplitude (analytics), Mixpanel, AppsFlyer (attribution), Clarisights\n';

  // Add predictive models info
  context += '\nPredictive Models: Lead Scoring (0-100), Predictive LTV, Churn Score, Product Affinity\n';

  // Add live data context if available
  if (liveData) {
    context += '\n--- LIVE DATA ---\n';
    context += `Braze Connected: ${liveData.brazeConnected ? 'Yes' : 'No'}\n`;
    context += `Airtable Connected: ${liveData.airtableConnected ? 'Yes' : 'No'}\n`;

    if (liveData.brazeCampaigns && liveData.brazeCampaigns.length > 0) {
      const campaigns = liveData.brazeCampaigns;
      const sorted = [...campaigns].sort((a, b) =>
        new Date(b.last_edited || b.created_at) - new Date(a.last_edited || a.created_at)
      );

      context += `\nBraze Campaigns (${campaigns.length} total):\n`;
      sorted.slice(0, 15).forEach((c, i) => {
        const date = new Date(c.last_edited || c.created_at).toLocaleDateString();
        const status = c.draft ? 'draft' : 'active';
        context += `${i + 1}. ${c.name} (${status}, last edited: ${date})\n`;
      });
    }
  }

  return context;
}

function generateIntelligentAnswer(question, kb, liveData) {
  const q = question.toLowerCase();

  // Check for campaign-related questions with live data
  if (liveData?.brazeCampaigns && liveData.brazeCampaigns.length > 0) {
    const campaigns = liveData.brazeCampaigns;
    const sorted = [...campaigns].sort((a, b) =>
      new Date(b.last_edited || b.created_at) - new Date(a.last_edited || a.created_at)
    );

    // How many campaigns
    if (/how many|count|total/i.test(q) && /campaign/i.test(q)) {
      const drafts = campaigns.filter(c => c.draft).length;
      const active = campaigns.length - drafts;
      return `You have **${campaigns.length} campaigns** in Braze:\n• ${active} active campaigns\n• ${drafts} drafts`;
    }

    // List/show campaigns
    if (/list|show|what|which/i.test(q) && /campaign/i.test(q)) {
      let response = `**Your Braze Campaigns** (${campaigns.length} total):\n\n`;
      sorted.slice(0, 10).forEach((c, i) => {
        const date = new Date(c.last_edited || c.created_at).toLocaleDateString();
        const status = c.draft ? ' _(draft)_' : '';
        response += `${i + 1}. **${c.name}**${status}\n   Last edited: ${date}\n\n`;
      });
      if (campaigns.length > 10) {
        response += `_...and ${campaigns.length - 10} more_`;
      }
      return response;
    }

    // Recent/latest campaigns
    if (/recent|latest|last|new/i.test(q) && /campaign/i.test(q)) {
      let response = `**Most Recent Campaigns:**\n\n`;
      sorted.slice(0, 5).forEach((c, i) => {
        const date = new Date(c.last_edited || c.created_at).toLocaleDateString();
        response += `${i + 1}. **${c.name}**\n   Last edited: ${date}\n\n`;
      });
      return response;
    }

    // Search for specific campaign
    const searchMatch = q.match(/campaign.*(called|named|about|for)\s+["']?([^"'?]+)/i);
    if (searchMatch) {
      const searchTerm = searchMatch[2].trim().toLowerCase();
      const matches = campaigns.filter(c => c.name.toLowerCase().includes(searchTerm));
      if (matches.length > 0) {
        let response = `**Found ${matches.length} matching campaign(s):**\n\n`;
        matches.slice(0, 5).forEach((c, i) => {
          const date = new Date(c.last_edited || c.created_at).toLocaleDateString();
          response += `${i + 1}. **${c.name}**\n   Last edited: ${date}\n\n`;
        });
        return response;
      } else {
        return `No campaigns found matching "${searchMatch[2]}". You have ${campaigns.length} campaigns in Braze.`;
      }
    }
  }

  // Check FAQs for best match
  let bestFaq = null;
  let bestScore = 0;
  const words = q.split(/\s+/).filter(w => w.length > 2);

  for (const faq of kb.faqs) {
    const faqText = (faq.question + ' ' + faq.answer).toLowerCase();
    const matches = words.filter(w => faqText.includes(w)).length;
    const score = matches / Math.max(words.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestFaq = faq;
    }
  }

  if (bestFaq && bestScore > 0.4) {
    return `**${bestFaq.question}**\n\n${bestFaq.answer}`;
  }

  // Topic-specific responses
  if (/lead scor/i.test(q)) {
    const model = kb.dataStrategy.predictiveModels.find(m => m.name.includes('Lead Score'));
    if (model) {
      let response = `**${model.name}**\n\n${model.description}\n\n`;
      model.tiers.forEach(t => {
        response += `• **${t.tier}**${t.label ? ` (${t.label})` : ''}: ${t.action}\n`;
      });
      return response;
    }
  }

  if (/churn/i.test(q)) {
    const model = kb.dataStrategy.predictiveModels.find(m => m.name.includes('Churn'));
    if (model) {
      let response = `**${model.name}**\n\n${model.description}\n\nScale: ${model.scale}\n\n`;
      model.tiers.forEach(t => {
        response += `• **${t.tier}**: ${t.action}\n`;
      });
      return response;
    }
  }

  if (/channel|braze support/i.test(q)) {
    const braze = kb.categories.find(c => c.name === 'Customer Engagement')?.tools.find(t => t.name === 'Braze');
    if (braze?.channels) {
      return `**Braze Supported Channels:**\n\n${braze.channels.map(c => `• ${c}`).join('\n')}\n\n**Key Capabilities:**\n${braze.capabilities.slice(0, 5).map(c => `• ${c}`).join('\n')}`;
    }
  }

  if (/mta|mmm|attribution/i.test(q)) {
    const mf = kb.measurementFramework;
    let response = `**${mf.description}**\n\n`;
    mf.approaches.forEach(a => {
      response += `**${a.name}** (${a.purpose})\n${a.description}\n\n`;
    });
    return response;
  }

  if (/gdpr|compliance|privacy|consent/i.test(q)) {
    const c = kb.compliance;
    let response = `**Compliance & Privacy**\n\nRegulations: ${c.regulations.join(', ')}\n\n`;
    response += `_"${c.principle}"_\n\n`;
    c.highRiskAreas.forEach(area => {
      response += `**${area.area}:**\n${area.requirements.map(r => `• ${r}`).join('\n')}\n\n`;
    });
    return response;
  }

  if (/segment|data collect|cdp/i.test(q)) {
    const segment = kb.categories.find(c => c.name.includes('CDP'))?.tools[0];
    if (segment) {
      return `**${segment.name}**\n\n${segment.description}\n\n**Capabilities:**\n${segment.capabilities.map(c => `• ${c}`).join('\n')}\n\n**Integrations:** ${segment.integrations.join(', ')}`;
    }
  }

  // If Braze is mentioned but no data
  if (/braze/i.test(q) && !liveData?.brazeConnected) {
    return `To answer questions about your Braze campaigns, please connect Braze in the **Admin Panel**.\n\nOnce connected, I can help with:\n• Listing your campaigns\n• Finding specific campaigns\n• Campaign counts and status\n• Recent campaign activity`;
  }

  // Generic but still helpful response
  if (liveData?.brazeConnected) {
    return `I'm not sure about that specific question, but I can help you with:\n\n**Your Connected Data:**\n• "List my campaigns" - See all Braze campaigns\n• "How many campaigns?" - Get campaign count\n• "Recent campaigns" - See latest activity\n\n**Knowledge Base:**\n• Lead scoring and predictive models\n• Data flows and integrations\n• Compliance (GDPR, consent)\n• Tool capabilities (Braze, Segment, Amplitude)`;
  }

  return `I can help you with MarTech questions! Try asking:\n\n• "How does lead scoring work?"\n• "What channels does Braze support?"\n• "Explain predictive churn"\n• "What is MTA vs MMM?"\n• "GDPR compliance requirements"\n\n_Connect Braze in Admin to query live campaign data._`;
}
