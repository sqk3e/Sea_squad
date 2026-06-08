const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const db = new Database('social.db');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    emoji TEXT,
    rank TEXT DEFAULT 'Новичок',
    status TEXT DEFAULT '',
    medal TEXT DEFAULT '',
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS reactions (
    post_id INTEGER,
    user_id INTEGER,
    type TEXT,
    PRIMARY KEY(post_id, user_id)
  );
`);

// Регистрация
app.post('/api/register', (req, res) => {
  const { username } = req.body;
  const isAdmin = username.toUpperCase() === 'SQKE';
  
  const emojis = ['🐟', '🐠', '🐡', '🐬', '🐳', '🦀', '🦐', '🐙'];
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const finalEmoji = isAdmin ? '🦑' : randomEmoji;
  
  try {
    const stmt = db.prepare('INSERT INTO users (username, emoji, is_admin) VALUES (?, ?, ?)');
    const info = stmt.run(username, finalEmoji, isAdmin ? 1 : 0);
    res.json({ id: info.lastInsertRowid, isAdmin, emoji: finalEmoji });
  } catch(e) {
    res.status(400).json({ error: 'Ник уже занят' });
  }
});

// Получить всех пользователей
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, username, emoji, rank, status, medal FROM users ORDER BY created_at').all();
  res.json(users);
});

// Получить посты
app.get('/api/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.username, u.emoji, u.rank, u.status, u.medal,
      (SELECT COUNT(*) FROM reactions WHERE post_id = p.id) as reaction_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(posts);
});

// Добавить пост
app.post('/api/posts', (req, res) => {
  const { user_id, content } = req.body;
  const stmt = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)');
  const info = stmt.run(user_id, content);
  res.json({ id: info.lastInsertRowid });
});

// Реакция
app.post('/api/reactions', (req, res) => {
  const { post_id, user_id, type } = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)');
  stmt.run(post_id, user_id, type);
  res.json({ success: true });
});

// Обновить статус
app.post('/api/set-status', (req, res) => {
  const { user_id, status } = req.body;
  const stmt = db.prepare('UPDATE users SET status = ? WHERE id = ?');
  stmt.run(status, user_id);
  res.json({ success: true });
});

// Выдать медаль (только админ)
app.post('/api/give-medal', (req, res) => {
  const { admin_id, user_id, medal } = req.body;
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(admin_id);
  if (admin?.is_admin) {
    db.prepare('UPDATE users SET medal = ? WHERE id = ?').run(medal, user_id);
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Только админ' });
  }
});

// Статистика (только админ)
app.post('/api/stats', (req, res) => {
  const { admin_id } = req.body;
  const admin = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(admin_id);
  if (!admin?.is_admin) return res.status(403).json({ error: 'Доступ только для админа' });

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const totalPosts = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  const mostActiveUser = db.prepare(`
    SELECT u.username, COUNT(p.id) as post_count
    FROM users u JOIN posts p ON u.id = p.user_id
    GROUP BY u.id ORDER BY post_count DESC LIMIT 1
  `).get();
  const topPosts = db.prepare(`
    SELECT p.id, u.username, p.content, (SELECT COUNT(*) FROM reactions WHERE post_id = p.id) as reaction_count
    FROM posts p JOIN users u ON p.user_id = u.id
    ORDER BY reaction_count DESC LIMIT 3
  `).all();
  const topClan = db.prepare(`
    SELECT emoji, COUNT(*) as count FROM users GROUP BY emoji ORDER BY count DESC LIMIT 1
  `).get();

  res.json({ totalUsers: totalUsers.count, totalPosts: totalPosts.count, mostActiveUser, topPosts, topClan });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEA SQUAD running on port ${PORT}`));
