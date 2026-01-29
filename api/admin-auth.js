// Simple admin authentication
// In production, use environment variables and proper auth
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'password';

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

  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({
      success: true,
      token: Buffer.from(`${username}:${Date.now()}`).toString('base64')
    });
  }

  return res.status(401).json({ success: false, error: 'Invalid credentials' });
};
