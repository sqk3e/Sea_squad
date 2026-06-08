const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация таблиц
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      emoji TEXT,
      rank TEXT DEFAULT 'Новичок',
      status TEXT DEFAULT '',
      medal TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reactions (
      post_id INTEGER REFERENCES posts(id),
      user_id INTEGER REFERENCES users(id),
      type TEXT,
      PRIMARY KEY(post_id, user_id)
    );
  `);
};
initDb();

// Регистрация
app.post('/api/register', async (req, res) => {
  const { username } = req.body;
  const isAdmin = username.toUpperCase() === 'SQKE';
  
  const emojis = ['🐟', '🐠', '🐡', '🐬', '🐳', '🦀', '🦐', '🐙'];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const finalEmoji = isAdmin ? '🦑' : randomEmoji;
  
  try {
    const result = await pool.query(
      'INSERT INTO users (username, emoji, is_admin) VALUES ($1, $2, $3) RETURNING id',
      [username, finalEmoji, isAdmin ? 1 : 0]
    );
    res.json({ id: result.rows[0].id, isAdmin, emoji: finalEmoji });
  } catch(e) {
    res.status(400).json({ error: 'Ник уже занят' });
  }
});

app.get('/api/users', async (req, res) => {
  const result = await pool.query('SELECT id, username, emoji, rank, status, medal FROM users ORDER BY created_at');
  res.json(result.rows);
});

app.get('/api/posts', async (req, res) => {
  const result = await pool.query(`
    SELECT p.*, u.username, u.emoji, u.rank, u.status, u.medal,
      (SELECT COUNT(*) FROM reactions WHERE post_id = p.id) as reaction_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `);
  res.json(result.rows);
});

app.post('/api/posts', async (req, res) => {
  const { user_id, content } = req.body;
  const result = await pool.query(
    'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id',
    [user_id, content]
  );
  res.json({ id: result.rows[0].id });
});

app.post('/api/reactions', async (req, res) => {
  const { post_id, user_id, type } = req.body;
  await pool.query(
    'INSERT INTO reactions (post_id, user_id, type) VALUES ($1, $2, $3) ON CONFLICT (post_id, user_id) DO UPDATE SET type = $3',
    [post_id, user_id, type]
  );
  res.json({ success: true });
});

app.post('/api/set-status', async (req, res) => {
  const { user_id, status } = req.body;
  await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, user_id]);
  res.json({ success: true });
});

app.post('/api/give-medal', async (req, res) => {
  const { admin_id, user_id, medal } = req.body;
  const admin = await pool.query('SELECT is_admin FROM users WHERE id = $1', [admin_id]);
  if (admin.rows[0]?.is_admin) {
    await pool.query('UPDATE users SET medal = $1 WHERE id = $2', [medal, user_id]);
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Только админ' });
  }
});

app.post('/api/stats', async (req, res) => {
  const { admin_id } = req.body;
  const admin = await pool.query('SELECT is_admin FROM users WHERE id = $1', [admin_id]);
  if (!admin.rows[0]?.is_admin) return res.status(403).json({ error: 'Доступ только для админа' });

  const totalUsers = await pool.query('SELECT COUNT(*) as count FROM users');
  const totalPosts = await pool.query('SELECT COUNT(*) as count FROM posts');
  const mostActiveUser = await pool.query(`
    SELECT u.username, COUNT(p.id) as post_count
    FROM users u JOIN posts p ON u.id = p.user_id
    GROUP BY u.id ORDER BY post_count DESC LIMIT 1
  `);
  const topPosts = await pool.query(`
    SELECT p.id, u.username, p.content, (SELECT COUNT(*) FROM reactions WHERE post_id = p.id) as reaction_count
    FROM posts p JOIN users u ON p.user_id = u.id
    ORDER BY reaction_count DESC LIMIT 3
  `);
  const topClan = await pool.query(`
    SELECT emoji, COUNT(*) as count FROM users GROUP BY emoji ORDER BY count DESC LIMIT 1
  `);

  res.json({
    totalUsers: totalUsers.rows[0].count,
    totalPosts: totalPosts.rows[0].count,
    mostActiveUser: mostActiveUser.rows[0] || null,
    topPosts: topPosts.rows,
    topClan: topClan.rows[0] || null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEA SQUAD running on port ${PORT}`));
