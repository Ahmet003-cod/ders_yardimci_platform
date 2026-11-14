require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createClient } = require('@libsql/client');
const { body, validationResult } = require('express-validator');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:studyflow.db',
  authToken: process.env.TURSO_AUTH_TOKEN
});

const query = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const getOne = async (sql, args = []) => (await db.execute({ sql, args })).rows[0] || null;
const run = async (sql, args = []) => {
  const r = await db.execute({ sql, args });
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
};

async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,full_name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,theme TEXT DEFAULT 'light',pomo_work INT DEFAULT 25,pomo_short INT DEFAULT 5,pomo_long INT DEFAULT 15,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,description TEXT,color TEXT DEFAULT '#2f6f5e',teacher TEXT,target_minutes INT DEFAULT 0,category TEXT,archived INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS schedules(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT NOT NULL REFERENCES courses(id),date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,topic TEXT,description TEXT,priority TEXT DEFAULT 'orta',reminder INT DEFAULT 10,done INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT REFERENCES courses(id),title TEXT NOT NULL,content TEXT,tags TEXT DEFAULT '',favorite INT DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS study_logs(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT REFERENCES courses(id),topic TEXT,started_at TEXT NOT NULL,seconds INT NOT NULL,mode TEXT DEFAULT 'serbest');
    CREATE TABLE IF NOT EXISTS active_timer(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,course_id INT,topic TEXT,started_at INT NOT NULL,paused_at INT,accumulated INT DEFAULT 0,mode TEXT DEFAULT 'serbest');
    CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT REFERENCES courses(id),title TEXT NOT NULL,description TEXT,due_date TEXT,priority TEXT DEFAULT 'orta',done INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,period TEXT NOT NULL,target_minutes INT NOT NULL,course_id INT REFERENCES courses(id));
    CREATE INDEX IF NOT EXISTS i_courses ON courses(user_id);
    CREATE INDEX IF NOT EXISTS i_sched ON schedules(user_id,date);
    CREATE INDEX IF NOT EXISTS i_notes ON notes(user_id);
    CREATE INDEX IF NOT EXISTS i_logs ON study_logs(user_id,started_at);
    CREATE INDEX IF NOT EXISTS i_tasks ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS i_goals ON goals(user_id);
  `);
}
initDb().catch(console.error);

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'studyflow_secret_fallback',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 }
}));
app.use(express.static('public'));

const A = express.Router();
const auth = (q, s, n) => q.session.uid ? n() : s.status(401).json({ error: 'Giriş gerekli' });
const val = (q, s, n) => {
  const e = validationResult(q);
  e.isEmpty() ? n() : s.status(400).json({ error: e.array()[0].msg });
};
const today = () => new Date().toLocaleDateString('sv');
const strong = v => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(v);

A.post('/register', [
  body('full_name').trim().notEmpty().withMessage('Ad soyad gerekli'),
  body('username').trim().isLength({ min: 3 }).withMessage('Kullanıcı adı en az 3 karakter'),
  body('email').isEmail().withMessage('Geçersiz e-posta'),
  body('password').custom(strong).withMessage('Şifre en az 8 karakter, büyük/küçük harf ve rakam içermeli'),
  body('password2').custom((v, { req }) => v === req.body.password).withMessage('Şifreler eşleşmiyor'),
  val
], async (q, s) => {
  const { full_name, username, email, password } = q.body;
  if (await getOne('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', [username]))
    return s.status(409).json({ error: 'Bu kullanıcı adı alınmış' });
  if (await getOne('SELECT 1 FROM users WHERE email=? COLLATE NOCASE', [email]))
    return s.status(409).json({ error: 'Bu e-posta kayıtlı' });
  const r = await run('INSERT INTO users(full_name,username,email,password_hash) VALUES(?,?,?,?)',
    [full_name, username, email, await bcrypt.hash(password, 10)]);
  q.session.uid = r.lastInsertRowid;
  s.json({ ok: 1 });
});

A.post('/login', async (q, s) => {
  const { login, password } = q.body;
  const u = await getOne('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE', [login || '', login || '']);
  if (!u || !await bcrypt.compare(password || '', u.password_hash))
    return s.status(401).json({ error: 'Kullanıcı adı/e-posta veya şifre hatalı' });
  q.session.regenerate(() => {
    q.session.uid = u.id;
    q.session.save(() => s.json({ ok: 1 }));
  });
});

A.post('/logout', (q, s) => q.session.destroy(() => s.json({ ok: 1 })));

A.get('/me', auth, async (q, s) => {
  const user = await getOne('SELECT id,full_name,username,email,theme,pomo_work,pomo_short,pomo_long FROM users WHERE id=?', [q.session.uid]);
  s.json(user);
});

A.put('/me', auth, async (q, s) => {
  const { full_name, email, theme, pomo_work, pomo_short, pomo_long } = q.body;
  try {
    await run('UPDATE users SET full_name=?,email=?,theme=?,pomo_work=?,pomo_short=?,pomo_long=? WHERE id=?',
      [full_name, email, theme === 'dark' ? 'dark' : 'light', +pomo_work || 25, +pomo_short || 5, +pomo_long || 15, q.session.uid]);
    s.json({ ok: 1 });
  } catch (e) {
    s.status(409).json({ error: 'E-posta kullanımda' });
  }
});

A.put('/me/password', auth, async (q, s) => {
  const u = await getOne('SELECT * FROM users WHERE id=?', [q.session.uid]);
  if (!await bcrypt.compare(q.body.old || '', u.password_hash))
    return s.status(400).json({ error: 'Mevcut şifre yanlış' });
  if (!strong(q.body.new || ''))
    return s.status(400).json({ error: 'Yeni şifre yeterince güçlü değil' });
  await run('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(q.body.new, 10), u.id]);
  s.json({ ok: 1 });
});

A.delete('/me', auth, async (q, s) => {
  const u = await getOne('SELECT * FROM users WHERE id=?', [q.session.uid]);
  if (!await bcrypt.compare(q.body.password || '', u.password_hash))
    return s.status(400).json({ error: 'Şifre yanlış' });
  await run('DELETE FROM users WHERE id=?', [u.id]);
  q.session.destroy(() => s.json({ ok: 1 }));
});

function crud(path, table, cols, extra = '') {
  A.get(path, auth, async (q, s) => s.json(await query(`SELECT * FROM ${table} WHERE user_id=? ${extra}`, [q.session.uid])));
  A.post(path, auth, async (q, s) => {
    const defaults = { archived: 0, done: 0, priority: 'orta', color: '#2f6f5e', target_minutes: 0 };
    const vals = cols.split(',').map(c => q.body[c] ?? (defaults[c] ?? null));
    const placeholders = cols.split(',').map(() => '?').join(',');
    const r = await run(`INSERT INTO ${table}(user_id,${cols}) VALUES(?,${placeholders})`, [q.session.uid, ...vals]);
    s.json({ id: r.lastInsertRowid });
  });
  A.put(path + '/:id', auth, async (q, s) => {
    const setClause = cols.split(',').map(c => c + '=?').join(',');
    const vals = cols.split(',').map(c => q.body[c] ?? null);
    const r = await run(`UPDATE ${table} SET ${setClause} WHERE id=? AND user_id=?`, [...vals, q.params.id, q.session.uid]);
    r.changes ? s.json({ ok: 1 }) : s.status(404).json({ error: 'Bulunamadı' });
  });
  if (table !== 'courses') {
    A.delete(path + '/:id', auth, async (q, s) => {
      await run(`DELETE FROM ${table} WHERE id=? AND user_id=?`, [q.params.id, q.session.uid]);
      s.json({ ok: 1 });
    });
  }
}

crud('/courses', 'courses', 'name,description,color,teacher,target_minutes,category,archived', 'ORDER BY archived,name');
A.delete('/courses/:id', auth, async (q, s) => {
  await run('UPDATE courses SET archived=1 WHERE id=? AND user_id=?', [q.params.id, q.session.uid]);
  s.json({ ok: 1, archived: 1 });
});

crud('/tasks', 'tasks', 'course_id,title,description,due_date,priority,done', 'ORDER BY done,due_date');
crud('/goals', 'goals', 'title,period,target_minutes,course_id');

A.get('/notes', auth, async (q, s) => {
  let sql = 'SELECT n.*,c.name course_name FROM notes n LEFT JOIN courses c ON c.id=n.course_id WHERE n.user_id=?';
  const p = [q.session.uid];
  if (q.query.q) { sql += ' AND (n.title LIKE ? OR n.content LIKE ?)'; p.push(`%${q.query.q}%`, `%${q.query.q}%`); }
  if (q.query.course) { sql += ' AND n.course_id=?'; p.push(q.query.course); }
  if (q.query.tag) { sql += ' AND (\',\'||n.tags||\',\') LIKE ?'; p.push(`%,${q.query.tag},%`); }
  s.json(await query(sql + ' ORDER BY n.favorite DESC,n.updated_at DESC', p));
});

A.post('/notes', auth, async (q, s) => {
  const b = q.body;
  if (!b.title) return s.status(400).json({ error: 'Başlık gerekli' });
  const r = await run('INSERT INTO notes(user_id,course_id,title,content,tags,favorite) VALUES(?,?,?,?,?,?)',
    [q.session.uid, b.course_id || null, b.title, b.content || '', b.tags || '', b.favorite ? 1 : 0]);
  s.json({ id: r.lastInsertRowid });
});

A.put('/notes/:id', auth, async (q, s) => {
  const b = q.body;
  await run('UPDATE notes SET course_id=?,title=?,content=?,tags=?,favorite=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',
    [b.course_id || null, b.title, b.content || '', b.tags || '', b.favorite ? 1 : 0, q.params.id, q.session.uid]);
  s.json({ ok: 1 });
});

A.delete('/notes/:id', auth, async (q, s) => {
  await run('DELETE FROM notes WHERE id=? AND user_id=?', [q.params.id, q.session.uid]);
  s.json({ ok: 1 });
});

async function checkSched(q, s, n) {
  const { course_id, date, start_time, end_time } = q.body;
  if (!course_id || !date || !start_time || !end_time) return s.status(400).json({ error: 'Ders, tarih ve saatler gerekli' });
  const course = await getOne('SELECT 1 FROM courses WHERE id=? AND user_id=?', [course_id, q.session.uid]);
  if (!course) return s.status(400).json({ error: 'Geçersiz ders' });
  if (start_time >= end_time) return s.status(400).json({ error: 'Başlangıç saati bitişten önce olmalı' });
  const c = await getOne('SELECT * FROM schedules WHERE user_id=? AND date=? AND start_time<? AND end_time>? AND id!=?',
    [q.session.uid, date, end_time, start_time, q.params.id || 0]);
  if (c) return s.status(409).json({ error: `Çakışma: ${c.start_time}–${c.end_time} arasında başka bir çalışma var` });
  n();
}

A.get('/schedules', auth, async (q, s) => {
  const { from, to } = q.query;
  s.json(await query('SELECT s.*,c.name course_name,c.color FROM schedules s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.date BETWEEN ? AND ? ORDER BY date,start_time',
    [q.session.uid, from || '0000', to || '9999']));
});

A.post('/schedules', auth, checkSched, async (q, s) => {
  const b = q.body;
  const r = await run('INSERT INTO schedules(user_id,course_id,date,start_time,end_time,topic,description,priority,reminder) VALUES(?,?,?,?,?,?,?,?,?)',
    [q.session.uid, b.course_id, b.date, b.start_time, b.end_time, b.topic, b.description, b.priority || 'orta', b.reminder ?? 10]);
  s.json({ id: r.lastInsertRowid });
});

A.put('/schedules/:id', auth, async (q, s, n) => {
  if (q.body.toggle !== undefined) {
    await run('UPDATE schedules SET done=? WHERE id=? AND user_id=?', [q.body.toggle ? 1 : 0, q.params.id, q.session.uid]);
    return s.json({ ok: 1 });
  }
  n();
}, checkSched, async (q, s) => {
  const b = q.body;
  await run('UPDATE schedules SET course_id=?,date=?,start_time=?,end_time=?,topic=?,description=?,priority=?,reminder=? WHERE id=? AND user_id=?',
    [b.course_id, b.date, b.start_time, b.end_time, b.topic, b.description, b.priority, b.reminder, q.params.id, q.session.uid]);
  s.json({ ok: 1 });
});

A.delete('/schedules/:id', auth, async (q, s) => {
  await run('DELETE FROM schedules WHERE id=? AND user_id=?', [q.params.id, q.session.uid]);
  s.json({ ok: 1 });
});

const elapsed = t => t ? t.accumulated + Math.floor(((t.paused_at || Date.now()) - t.started_at) / 1000) : 0;

A.get('/timer', auth, async (q, s) => {
  const t = await getOne('SELECT * FROM active_timer WHERE user_id=?', [q.session.uid]);
  s.json(t ? { ...t, elapsed: elapsed(t), running: !t.paused_at } : null);
});

A.post('/timer/start', auth, async (q, s) => {
  await run('INSERT OR REPLACE INTO active_timer VALUES(?,?,?,?,NULL,0,?)',
    [q.session.uid, q.body.course_id || null, q.body.topic || '', Date.now(), q.body.mode || 'serbest']);
  s.json({ ok: 1 });
});

A.post('/timer/pause', auth, async (q, s) => {
  await run('UPDATE active_timer SET paused_at=? WHERE user_id=? AND paused_at IS NULL', [Date.now(), q.session.uid]);
  s.json({ ok: 1 });
});

A.post('/timer/resume', auth, async (q, s) => {
  const t = await getOne('SELECT * FROM active_timer WHERE user_id=?', [q.session.uid]);
  if (t && t.paused_at) {
    await run('UPDATE active_timer SET accumulated=?,started_at=?,paused_at=NULL WHERE user_id=?', [t.accumulated, Date.now(), q.session.uid]);
  }
  s.json({ ok: 1 });
});

A.post('/timer/stop', auth, async (q, s) => {
  const t = await getOne('SELECT * FROM active_timer WHERE user_id=?', [q.session.uid]);
  if (!t) return s.json({ ok: 1 });
  const sec = elapsed(t);
  if (sec >= 5) {
    await run('INSERT INTO study_logs(user_id,course_id,topic,started_at,seconds,mode) VALUES(?,?,?,?,?,?)',
      [q.session.uid, t.course_id, t.topic, new Date().toISOString(), sec, t.mode]);
  }
  await run('DELETE FROM active_timer WHERE user_id=?', [q.session.uid]);
  s.json({ ok: 1, seconds: sec });
});

A.get('/stats', auth, async (q, s) => {
  const u = q.session.uid, d = today();
  const now = new Date().toTimeString().slice(0, 5);
  const L = "date(started_at,'localtime')";
  // Tüm sorgular TEK ağ turunda (batch) çalışır
  const [daily, byCourseRaw, monthlyRaw, per, goalRows, upcoming, lateR, tasksR, coursesR] = (await db.batch([
    { sql: `SELECT ${L} d,SUM(seconds) s FROM study_logs WHERE user_id=? AND ${L}>=date('now','-6 days','localtime') GROUP BY d`, args: [u] },
    { sql: 'SELECT c.name,c.color,SUM(l.seconds) seconds FROM study_logs l JOIN courses c ON c.id=l.course_id WHERE l.user_id=? GROUP BY c.id ORDER BY seconds DESC', args: [u] },
    { sql: "SELECT strftime('%Y-%m',started_at,'localtime') m,SUM(seconds) s FROM study_logs WHERE user_id=? GROUP BY m ORDER BY m DESC LIMIT 6", args: [u] },
    { sql: `SELECT course_id,
      COALESCE(SUM(CASE WHEN ${L}=date('now','localtime') THEN seconds END),0) daily,
      COALESCE(SUM(CASE WHEN ${L}>=date('now','-6 days','localtime') THEN seconds END),0) weekly,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m',started_at,'localtime')=strftime('%Y-%m','now','localtime') THEN seconds END),0) monthly
      FROM study_logs WHERE user_id=? GROUP BY course_id`, args: [u] },
    { sql: 'SELECT * FROM goals WHERE user_id=?', args: [u] },
    { sql: 'SELECT s.*,c.name course_name FROM schedules s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.date=? AND s.done=0 AND s.start_time>=? ORDER BY start_time LIMIT 5', args: [u, d, now] },
    { sql: 'SELECT COUNT(*) n FROM schedules WHERE user_id=? AND date=? AND done=0 AND end_time<?', args: [u, d, now] },
    { sql: 'SELECT COUNT(*) n FROM tasks WHERE user_id=? AND done=1', args: [u] },
    { sql: 'SELECT COUNT(*) n FROM courses WHERE user_id=? AND archived=0', args: [u] }
  ], 'read')).map(r => r.rows);

  const days = [...Array(7)].map((_, i) => {
    const x = new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('sv');
    return { date: x, seconds: Number(daily.find(r => r.d === x)?.s || 0) };
  });
  const byCourse = byCourseRaw.map(c => ({ ...c, seconds: Number(c.seconds) }));
  const monthly = monthlyRaw.map(m => ({ ...m, s: Number(m.s) })).reverse();
  const total = k => per.reduce((a, r) => a + Number(r[k]), 0);

  const goals = goalRows.map(g => {
    const secs = g.course_id ? Number(per.find(r => r.course_id == g.course_id)?.[g.period] || 0) : total(g.period);
    const done = secs / 60;
    return { ...g, done_minutes: Math.round(done), pct: Math.min(100, Math.round(done / g.target_minutes * 100)) };
  });

  const notifs = [];
  upcoming.forEach(x => {
    const m = (new Date(`${d}T${x.start_time}`) - Date.now()) / 6e4;
    if (m <= 60) notifs.push(`${x.course_name} çalışmanız ${Math.max(0, Math.round(m))} dk sonra başlıyor`);
  });
  const late = Number(lateR[0]?.n || 0);
  if (late) notifs.push(`Bugün tamamlanmamış ${late} çalışma var`);
  goals.filter(g => g.pct >= 100).forEach(g => notifs.push(`"${g.title}" hedefini tamamladınız`));

  s.json({
    today: total('daily'),
    week: total('weekly'),
    tasksDone: Number(tasksR[0]?.n || 0),
    activeCourses: Number(coursesR[0]?.n || 0),
    days, byCourse, monthly, goals, upcoming, notifs
  });
});


app.use('/api', A);

if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log('StudyFlow: http://localhost:' + (process.env.PORT || 3000)));
}
module.exports = app;
