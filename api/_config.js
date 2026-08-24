const LLM_KEY = process.env.OLLAMA_API_KEY;
const LLM_BASE = process.env.LLM_BASE_URL || 'https://ollama.com/api';

async function llm(systemPrompt, userContent, options = {}) {
  if (!LLM_KEY) throw new Error('OLLAMA_API_KEY not configured');
  const url = LLM_BASE + '/chat';
  const body = JSON.stringify({
    model: options.model || 'gemma4:31b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    stream: false,
    options: { num_predict: options.maxTokens || 3000, temperature: options.temperature || 0.2 }
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + LLM_KEY, 'Content-Type': 'application/json' },
    body
  });
  if (!res.ok) throw new Error('LLM error: ' + res.status);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch (_) { throw new Error('LLM returned non-JSON: ' + text.substring(0, 100)); }
  return (json.message?.content || '').replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

function parseJSON(text) {
  if (!text) throw new Error('No text provided to parse');
  
  const cleaned = text.replace(/[\x00-\x1F]/g, '');
  
  // Direct parse first
  try { return JSON.parse(cleaned); } catch (_) {}
  
  // Fix common JSON issues (single quotes, trailing commas, unquoted keys)
  const fixed = cleaned
    .replace(/,(\s*[\]}])/g, '$1')
    .replace(/'/g, '"')
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
  try { return JSON.parse(fixed); } catch (_) {}
  
  // Find outermost object — handle truncation by completing it
  const objStart = cleaned.indexOf('{');
  if (objStart === -1) throw new Error('Could not parse LLM response: ' + text.substring(0, 200));
  let objText = cleaned.substring(objStart);
  
  // Try to find a complete valid JSON object
  for (let closeDepth = 1; closeDepth <= 20; closeDepth++) {
    const attempt = objText + '}'.repeat(closeDepth);
    try {
      const parsed = JSON.parse(attempt);
      // Verify it's the kind of object we expect (has strings as values)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {}
  }
  
  // Try adding closing brackets for unclosed arrays
  for (let closeDepth = 1; closeDepth <= 20; closeDepth++) {
    const attempt = objText + ']'.repeat(closeDepth);
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {}
  }
  
  // Try adding both braces and brackets
  const withBraces = objText + '"}';
  try { const p = JSON.parse(withBraces); if (p && typeof p === 'object') return p; } catch (_) {}
  const withBrackets = objText + '"]}';
  try { const p = JSON.parse(withBrackets); if (p && typeof p === 'object') return p; } catch (_) {}
  const withArray = objText + '"]}';
  try { const p = JSON.parse(withArray); if (p && typeof p === 'object') return p; } catch (_) {}
  
  // Extract partial data from truncated JSON
  const extractFields = (str) => {
    const result = {};
    
    const extractString = (key) => {
      const m = str.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 's'));
      if (m && m[1]) result[key] = m[1];
    };
    
    const extractArray = (key) => {
      const m = str.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)`, 's'));
      if (m && m[1]) {
        const items = m[1];
        const parsed = items
          .split(/,\s*/)
          .map(item => item.replace(/^"|"$/g, '').replace(/^'|'$/g, ''))
          .filter(item => item && item.length > 2);
        if (parsed.length > 0) result[key] = parsed;
      }
    };
    
    const extractObjectArray = (key, props) => {
      const m = str.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)`, 's'));
      if (m && m[1]) {
        const items = [];
        const itemMatches = m[1].match(/\{[^}]*\}/g);
        if (itemMatches) {
          for (const im of itemMatches) {
            try {
              const parsed = JSON.parse(im);
              if (props.every(p => parsed[p])) items.push(parsed);
            } catch (_) {}
          }
        }
        if (items.length > 0) result[key] = items;
      }
    };
    
    extractString('summary');
    extractString('pressure');
    extractString('signal_confidence');
    extractString('headline');
    extractString('vertical_shift');
    extractString('influence_level');
    extractString('success_metric');
    extractString('tailored_message');
    extractString('email_hosting');
    extractString('cloud_provider');
    extractString('devices');
    extractString('primary_competitor');
    extractString('confidence');
    extractString('reframe_headline');
    extractString('incumbent_strength');
    extractString('incumbent_weakness');
    extractString('our_lever');
    extractString('positioning_style');
    extractString('lead_path');
    extractString('fallback_path');
    extractString('entry_trigger');
    extractString('value_to_metric');
    extractString('success_criteria');
    
    extractArray('validation_questions');
    extractArray('inferred_signals');
    extractArray('talk_tracks');
    extractArray('concerns');
    extractArray('priorities');
    extractArray('likely_questions');
    extractArray('detected_tech');
    extractArray('comparison_prompts');
    extractArray('proof_points');
    extractArray('avoid_phrases');
    extractArray('sequence');
    extractArray('validation_prompts');
    extractArray('listen_for_cues');
    extractArray('dont_say');
    
    extractObjectArray('recent_developments', ['headline', 'date', 'relevance']);
    extractObjectArray('pivot_paths', ['if_they_say', 'then_pivot_to']);
    extractObjectArray('objection_handling', ['if_they_say', 'respond_with']);
    
    return result;
  };
  
  const fieldsResult = extractFields(objText);
  if (Object.keys(fieldsResult).length > 0) return fieldsResult;
  
  throw new Error('Could not parse LLM response: ' + text.substring(0, 200));
}

const COMPETITOR_INTEL = {
  Google: {
    strengths: ['Massive ecosystem across cloud, workspace, devices', 'Strong AI/ML capabilities with Gemini', 'Aggressive pricing on cloud services', 'Deep consumer brand recognition'],
    weaknesses: ['Enterprise support can be impersonal', 'Less mature in regulated industries', 'Product roadmap changes frequently', 'Less presence in legacy enterprise IT'],
    positioning: ['Position as more focused/niche where Google is broad', 'Emphasize dedicated support and partnership', 'Highlight reliability and SLA depth', 'Compare specialized features vs Google\'s general approach'],
    proof_points: ['99.99% uptime SLA across enterprise deployments', 'Faster time-to-value with dedicated onboarding', 'Superior NPS in customer satisfaction surveys'],
    objections: [
      { if_they_say: 'Google Cloud is more innovative', respond_with: 'Innovation matters less than reliability for mission-critical workloads — our platform is battle-tested' },
      { if_they_say: 'We use Google Workspace already', respond_with: 'Workspace integration is easy; our solution complements rather than replaces it' }
    ]
  },
  Microsoft: {
    strengths: ['Ubiquitous in enterprise with deep M365/Office integration', 'Trusted brand in IT decision-making', 'Azure has strong hybrid cloud capabilities', 'Broad portfolio across every category'],
    weaknesses: ['Complex licensing and pricing', 'Long procurement cycles', 'Legacy architecture in some products', 'Vendor lock-in concerns'],
    positioning: ['Focus on simplicity and faster deployment vs Microsoft complexity', 'Highlight cost transparency and flexible pricing', 'Position as modern/cloud-native alternative', 'Emphasize specialized niche where Microsoft is generic'],
    proof_points: ['70% faster deployment vs comparable Microsoft solutions', '43% lower TCO over 3 years in independent studies', 'G2-rated higher in user satisfaction for core use cases'],
    objections: [
      { if_they_say: 'We\'re all-in on Microsoft', respond_with: 'Our solution layers on top of M365 and enhances what you already have' },
      { if_they_say: 'Microsoft has this built in', respond_with: 'Their built-in solution covers 60% of what you need; we cover the other 40% with specialized depth' }
    ]
  },
  Salesforce: {
    strengths: ['Market leader in CRM with massive ecosystem', 'AppExchange and third-party integrations', 'Strong brand in sales organizations', 'Comprehensive platform capabilities'],
    weaknesses: ['High cost per user, especially with add-ons', 'Complex configuration and administration', 'Customization requires specialized developers', 'Performance issues at scale'],
    positioning: ['Offer simpler, more affordable alternative', 'Focus on faster time-to-value with less customization', 'Emphasize ease of use and adoption rates', 'Target specific use cases where Salesforce is overkill'],
    proof_points: ['50% lower cost per user vs comparable Salesforce setup', 'Deployed in 4 weeks vs 12+ weeks for Salesforce', '98% user adoption rate across deployments'],
    objections: [
      { if_they_say: 'Salesforce is the industry standard', respond_with: 'The standard isn\'t always the best fit — many teams find our solution meets their needs without the overhead' },
      { if_they_say: 'We need the AppExchange ecosystem', respond_with: 'We integrate with the tools you already use — no AppExchange required' }
    ]
  },
  AWS: {
    strengths: ['Largest cloud market share and infrastructure', 'Broadest service portfolio', 'Strong DevOps tooling and ecosystem', 'Aggressive pricing and innovation pace'],
    weaknesses: ['Complex pricing and cost management', 'Support quality varies by tier', 'UI/console usability complaints', 'Vendor dependency risk'],
    positioning: ['Offer managed simplicity vs AWS DIY complexity', 'Superior cost predictability and transparency', 'Better support and white-glove service', 'Focus on specific workloads where we excel'],
    proof_points: ['Predictable pricing model saves 35% on average cloud bill', '24/7 dedicated support with 15-min response SLA', 'Featured in Gartner\'s latest Magic Quadrant'],
    objections: [
      { if_they_say: 'AWS pricing is competitive', respond_with: 'Competitive at first glance, but unpredictable at scale — our model gives you cost certainty' },
      { if_they_say: 'We already have AWS expertise in-house', respond_with: 'Your team can focus on higher-value work while we handle the infrastructure' }
    ]
  },
  Apple: {
    strengths: ['Premium brand with high user satisfaction', 'Strong hardware-software integration', 'Privacy and security reputation', 'Loyal customer base in creative/design'],
    weaknesses: ['Enterprise tools are less mature', 'Closed ecosystem limits integrations', 'Higher hardware costs', 'Less suited for legacy enterprise stacks'],
    positioning: ['Offer cross-platform flexibility Apple lacks', 'Better integration with enterprise systems', 'Focus on cost efficiency and device agnosticism'],
    proof_points: ['Seamless deployment across Windows, Mac, Linux, and mobile', 'No ecosystem lock-in — your users keep their devices of choice'],
    objections: [
      { if_they_say: 'Apple devices are what our users prefer', respond_with: 'We\'re device-agnostic — your users keep Apple, we handle the backend' }
    ]
  }
};

const INCUMBENTS = {
  microsoft: { name: 'Microsoft', signals: ['Active Directory', 'Exchange', 'SharePoint', 'Teams', 'Azure AD', 'Windows Server', 'IIS', 'M365'] },
  google: { name: 'Google', signals: ['Google Workspace', 'Gmail', 'Google Cloud', 'Chrome', 'ChromeOS', 'Google Analytics', 'Android'] },
  apple: { name: 'Apple', signals: ['macOS', 'iCloud', 'Safari', 'Xcode', 'Swift'] },
  linux: { name: 'Linux/Thin Client', signals: ['Linux', 'Ubuntu', 'Debian', 'Citrix', 'VDI', 'RHEL'] }
};

const INCUMBENTS_SIGNALS = {
  Finance: ['Active Directory', 'Exchange', 'Office 365', 'Windows Server', 'Azure', 'M365', 'Teams', 'SharePoint'],
  Healthcare: ['Google Workspace', 'Chrome', 'Gmail', 'Google Cloud', 'Android', 'Google Analytics', 'ChromeOS'],
  Technology: ['Linux', 'Ubuntu', 'AWS', 'Google Cloud', 'Chrome', 'Chrome', 'Android', 'Kubernetes', 'Docker'],
  Retail: ['Azure', 'Office 365', 'Teams', 'Windows Server', 'Active Directory', 'M365', 'SharePoint'],
  Manufacturing: ['Windows Server', 'Active Directory', 'IIS', 'M365', 'Azure', 'Exchange', 'Teams'],
  Energy: ['Windows Server', 'Active Directory', 'IIS', 'Exchange', 'M365', 'Teams', 'Azure'],
  'Government / Public Sector': ['Windows Server', 'Active Directory', 'IIS', 'Exchange', 'M365', 'Teams', 'Azure AD'],
  Education: ['Google Workspace', 'Chrome', 'ChromeOS', 'Gmail', 'Google Cloud', 'Android', 'Google Analytics']
};

module.exports = { llm, parseJSON, INCUMBENTS, INCUMBENTS_SIGNALS, COMPETITOR_INTEL, LLM_KEY };