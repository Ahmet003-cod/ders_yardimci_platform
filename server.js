require('dotenv').config();
const path=require('path');
const express=require('express'),session=require('express-session'),bcrypt=require('bcrypt'),Database=require('better-sqlite3');
const {body,validationResult}=require('express-validator');
const dbPath=process.env.NETLIFY?path.join('/tmp','studyflow.db'):'studyflow.db';
const db=new Database(dbPath);db.pragma('foreign_keys=ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,full_name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,theme TEXT DEFAULT 'light',pomo_work INT DEFAULT 25,pomo_short INT DEFAULT 5,pomo_long INT DEFAULT 15,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,description TEXT,color TEXT DEFAULT '#2f6f5e',teacher TEXT,target_minutes INT DEFAULT 0,category TEXT,archived INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS schedules(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT NOT NULL REFERENCES courses(id),date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,topic TEXT,description TEXT,priority TEXT DEFAULT 'orta',reminder INT DEFAULT 10,done INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT REFERENCES courses(id),title TEXT NOT NULL,content TEXT,tags TEXT DEFAULT '',favorite INT DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS study_logs(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT REFERENCES courses(id),topic TEXT,started_at TEXT NOT NULL,seconds INT NOT NULL,mode TEXT DEFAULT 'serbest');
CREATE TABLE IF NOT EXISTS active_timer(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,course_id INT,topic TEXT,started_at INT NOT NULL,paused_at INT,accumulated INT DEFAULT 0,mode TEXT DEFAULT 'serbest');
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,course_id INT REFERENCES courses(id),title TEXT NOT NULL,description TEXT,due_date TEXT,priority TEXT DEFAULT 'orta',done INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,period TEXT NOT NULL,target_minutes INT NOT NULL,course_id INT REFERENCES courses(id));
`);
const app=express();app.use(express.json());
app.use(session({secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',maxAge:7*864e5}}));
app.use(express.static('public'));
const A=express.Router();
const auth=(q,s,n)=>q.session.uid?n():s.status(401).json({error:'Giriş gerekli'});
const val=(q,s,n)=>{const e=validationResult(q);e.isEmpty()?n():s.status(400).json({error:e.array()[0].msg})};
const today=()=>new Date().toLocaleDateString('sv');
const strong=v=>/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(v);
A.post('/register',[body('full_name').trim().notEmpty().withMessage('Ad soyad gerekli'),body('username').trim().isLength({min:3}).withMessage('Kullanıcı adı en az 3 karakter'),body('email').isEmail().withMessage('Geçersiz e-posta'),body('password').custom(strong).withMessage('Şifre en az 8 karakter, büyük/küçük harf ve rakam içermeli'),body('password2').custom((v,{req})=>v===req.body.password).withMessage('Şifreler eşleşmiyor'),val],async(q,s)=>{
 const{full_name,username,email,password}=q.body;
 if(db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(username))return s.status(409).json({error:'Bu kullanıcı adı alınmış'});
 if(db.prepare('SELECT 1 FROM users WHERE email=? COLLATE NOCASE').get(email))return s.status(409).json({error:'Bu e-posta kayıtlı'});
 const r=db.prepare('INSERT INTO users(full_name,username,email,password_hash) VALUES(?,?,?,?)').run(full_name,username,email,await bcrypt.hash(password,12));
 q.session.uid=r.lastInsertRowid;s.json({ok:1});});
A.post('/login',async(q,s)=>{const{login,password}=q.body;
 const u=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').get(login||'',login||'');
 if(!u||!await bcrypt.compare(password||'',u.password_hash))return s.status(401).json({error:'Kullanıcı adı/e-posta veya şifre hatalı'});
 q.session.regenerate(()=>{q.session.uid=u.id;q.session.save(()=>s.json({ok:1}))});});
A.post('/logout',(q,s)=>q.session.destroy(()=>s.json({ok:1})));
A.get('/me',auth,(q,s)=>s.json(db.prepare('SELECT id,full_name,username,email,theme,pomo_work,pomo_short,pomo_long FROM users WHERE id=?').get(q.session.uid)));
A.put('/me',auth,(q,s)=>{const{full_name,email,theme,pomo_work,pomo_short,pomo_long}=q.body;
 try{db.prepare('UPDATE users SET full_name=?,email=?,theme=?,pomo_work=?,pomo_short=?,pomo_long=? WHERE id=?').run(full_name,email,theme==='dark'?'dark':'light',+pomo_work||25,+pomo_short||5,+pomo_long||15,q.session.uid);s.json({ok:1})}catch(e){s.status(409).json({error:'E-posta kullanımda'})}});
A.put('/me/password',auth,async(q,s)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(q.session.uid);
 if(!await bcrypt.compare(q.body.old||'',u.password_hash))return s.status(400).json({error:'Mevcut şifre yanlış'});
 if(!strong(q.body.new||''))return s.status(400).json({error:'Yeni şifre yeterince güçlü değil'});
 db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(q.body.new,12),u.id);s.json({ok:1})});
A.delete('/me',auth,async(q,s)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(q.session.uid);
 if(!await bcrypt.compare(q.body.password||'',u.password_hash))return s.status(400).json({error:'Şifre yanlış'});
 db.prepare('DELETE FROM users WHERE id=?').run(u.id);q.session.destroy(()=>s.json({ok:1}))});
// generic CRUD, her sorgu user_id ile sınırlı
function crud(path,table,cols,extra=''){
 A.get(path,auth,(q,s)=>s.json(db.prepare(`SELECT * FROM ${table} WHERE user_id=? ${extra}`).all(q.session.uid)));
 A.post(path,auth,(q,s)=>{const r=db.prepare(`INSERT INTO ${table}(user_id,${cols}) VALUES(?,${cols.split(',').map(()=>'?').join(',')})`).run(q.session.uid,...cols.split(',').map(c=>q.body[c]??({archived:0,done:0,priority:'orta',color:'#2f6f5e',target_minutes:0}[c]??null)));s.json({id:r.lastInsertRowid})});
 A.put(path+'/:id',auth,(q,s)=>{const r=db.prepare(`UPDATE ${table} SET ${cols.split(',').map(c=>c+'=?').join(',')} WHERE id=? AND user_id=?`).run(...cols.split(',').map(c=>q.body[c]??null),q.params.id,q.session.uid);r.changes?s.json({ok:1}):s.status(404).json({error:'Bulunamadı'})});
 if(table!=='courses')A.delete(path+'/:id',auth,(q,s)=>{db.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(q.params.id,q.session.uid);s.json({ok:1})});}
crud('/courses','courses','name,description,color,teacher,target_minutes,category,archived','ORDER BY archived,name');
// Ders silme = arşivleme (not ve geçmiş korunur)
A.delete('/courses/:id',auth,(q,s)=>{db.prepare('UPDATE courses SET archived=1 WHERE id=? AND user_id=?').run(q.params.id,q.session.uid);s.json({ok:1,archived:1})});
crud('/tasks','tasks','course_id,title,description,due_date,priority,done','ORDER BY done,due_date');
crud('/goals','goals','title,period,target_minutes,course_id');
// Notlar
A.get('/notes',auth,(q,s)=>{let sql='SELECT n.*,c.name course_name FROM notes n LEFT JOIN courses c ON c.id=n.course_id WHERE n.user_id=?';const p=[q.session.uid];
 if(q.query.q){sql+=' AND (n.title LIKE ? OR n.content LIKE ?)';p.push(`%${q.query.q}%`,`%${q.query.q}%`)}
 if(q.query.course){sql+=' AND n.course_id=?';p.push(q.query.course)}
 if(q.query.tag){sql+=' AND (\',\'||n.tags||\',\') LIKE ?';p.push(`%,${q.query.tag},%`)}
 s.json(db.prepare(sql+' ORDER BY n.favorite DESC,n.updated_at DESC').all(...p))});
A.post('/notes',auth,(q,s)=>{const b=q.body;if(!b.title)return s.status(400).json({error:'Başlık gerekli'});
 s.json({id:db.prepare('INSERT INTO notes(user_id,course_id,title,content,tags,favorite) VALUES(?,?,?,?,?,?)').run(q.session.uid,b.course_id||null,b.title,b.content||'',b.tags||'',b.favorite?1:0).lastInsertRowid})});
A.put('/notes/:id',auth,(q,s)=>{const b=q.body;db.prepare("UPDATE notes SET course_id=?,title=?,content=?,tags=?,favorite=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(b.course_id||null,b.title,b.content||'',b.tags||'',b.favorite?1:0,q.params.id,q.session.uid);s.json({ok:1})});
A.delete('/notes/:id',auth,(q,s)=>{db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(q.params.id,q.session.uid);s.json({ok:1})});
// Program (çakışma ve saat kontrolü)
function checkSched(q,s,n){const{course_id,date,start_time,end_time}=q.body;
 if(!course_id||!date||!start_time||!end_time)return s.status(400).json({error:'Ders, tarih ve saatler gerekli'});
 if(!db.prepare('SELECT 1 FROM courses WHERE id=? AND user_id=?').get(course_id,q.session.uid))return s.status(400).json({error:'Geçersiz ders'});
 if(start_time>=end_time)return s.status(400).json({error:'Başlangıç saati bitişten önce olmalı'});
 const c=db.prepare('SELECT * FROM schedules WHERE user_id=? AND date=? AND start_time<? AND end_time>? AND id!=?').get(q.session.uid,date,end_time,start_time,q.params.id||0);
 if(c)return s.status(409).json({error:`Çakışma: ${c.start_time}–${c.end_time} arasında başka bir çalışma var`});n()}
A.get('/schedules',auth,(q,s)=>{const{from,to}=q.query;s.json(db.prepare('SELECT s.*,c.name course_name,c.color FROM schedules s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.date BETWEEN ? AND ? ORDER BY date,start_time').all(q.session.uid,from||'0000',to||'9999'))});
A.post('/schedules',auth,checkSched,(q,s)=>{const b=q.body;s.json({id:db.prepare('INSERT INTO schedules(user_id,course_id,date,start_time,end_time,topic,description,priority,reminder) VALUES(?,?,?,?,?,?,?,?,?)').run(q.session.uid,b.course_id,b.date,b.start_time,b.end_time,b.topic,b.description,b.priority||'orta',b.reminder??10).lastInsertRowid})});
A.put('/schedules/:id',auth,(q,s,n)=>{if(q.body.toggle!==undefined){db.prepare('UPDATE schedules SET done=? WHERE id=? AND user_id=?').run(q.body.toggle?1:0,q.params.id,q.session.uid);return s.json({ok:1})}n()},checkSched,(q,s)=>{const b=q.body;db.prepare('UPDATE schedules SET course_id=?,date=?,start_time=?,end_time=?,topic=?,description=?,priority=?,reminder=? WHERE id=? AND user_id=?').run(b.course_id,b.date,b.start_time,b.end_time,b.topic,b.description,b.priority,b.reminder,q.params.id,q.session.uid);s.json({ok:1})});
A.delete('/schedules/:id',auth,(q,s)=>{db.prepare('DELETE FROM schedules WHERE id=? AND user_id=?').run(q.params.id,q.session.uid);s.json({ok:1})});
// Zamanlayıcı: başlangıç zamanı DB'de, süre yeniden hesaplanır
const elapsed=t=>t?t.accumulated+Math.floor(((t.paused_at||Date.now())-t.started_at)/1000):0;
A.get('/timer',auth,(q,s)=>{const t=db.prepare('SELECT * FROM active_timer WHERE user_id=?').get(q.session.uid);s.json(t?{...t,elapsed:elapsed(t),running:!t.paused_at}:null)});
A.post('/timer/start',auth,(q,s)=>{db.prepare('INSERT OR REPLACE INTO active_timer VALUES(?,?,?,?,NULL,0,?)').run(q.session.uid,q.body.course_id||null,q.body.topic||'',Date.now(),q.body.mode||'serbest');s.json({ok:1})});
A.post('/timer/pause',auth,(q,s)=>{db.prepare('UPDATE active_timer SET paused_at=? WHERE user_id=? AND paused_at IS NULL').run(Date.now(),q.session.uid);s.json({ok:1})});
A.post('/timer/resume',auth,(q,s)=>{const t=db.prepare('SELECT * FROM active_timer WHERE user_id=?').get(q.session.uid);if(t&&t.paused_at)db.prepare('UPDATE active_timer SET accumulated=?,started_at=?,paused_at=NULL WHERE user_id=?').run(t.accumulated,Date.now(),q.session.uid);s.json({ok:1})});
A.post('/timer/stop',auth,(q,s)=>{const t=db.prepare('SELECT * FROM active_timer WHERE user_id=?').get(q.session.uid);if(!t)return s.json({ok:1});
 const sec=elapsed(t);if(sec>=5)db.prepare('INSERT INTO study_logs(user_id,course_id,topic,started_at,seconds,mode) VALUES(?,?,?,?,?,?)').run(q.session.uid,t.course_id,t.topic,new Date().toISOString(),sec,t.mode);
 db.prepare('DELETE FROM active_timer WHERE user_id=?').run(q.session.uid);s.json({ok:1,seconds:sec})});
// Özet / istatistik (gerçek kayıtlardan)
A.get('/stats',auth,(q,s)=>{const u=q.session.uid,d=today();
 const sum=(f,...p)=>db.prepare(`SELECT COALESCE(SUM(seconds),0) v FROM study_logs WHERE user_id=? AND ${f}`).get(u,...p).v;
 const daily=db.prepare("SELECT date(started_at,'localtime') d,SUM(seconds) s FROM study_logs WHERE user_id=? AND date(started_at,'localtime')>=date('now','-6 days','localtime') GROUP BY d").all(u);
 const days=[...Array(7)].map((_,i)=>{const x=new Date(Date.now()-(6-i)*864e5).toLocaleDateString('sv');return{date:x,seconds:daily.find(r=>r.d===x)?.s||0}});
 const byCourse=db.prepare('SELECT c.name,c.color,SUM(l.seconds) seconds FROM study_logs l JOIN courses c ON c.id=l.course_id WHERE l.user_id=? GROUP BY c.id ORDER BY seconds DESC').all(u);
 const monthly=db.prepare("SELECT strftime('%Y-%m',started_at,'localtime') m,SUM(seconds) s FROM study_logs WHERE user_id=? GROUP BY m ORDER BY m DESC LIMIT 6").all(u).reverse();
 const week=sum("date(started_at,'localtime')>=date('now','-6 days','localtime')");
 const goals=db.prepare('SELECT * FROM goals WHERE user_id=?').all(u).map(g=>{const f={daily:"date(started_at,'localtime')=date('now','localtime')",weekly:"date(started_at,'localtime')>=date('now','-6 days','localtime')",monthly:"strftime('%Y-%m',started_at,'localtime')=strftime('%Y-%m','now','localtime')"}[g.period];
  const done=db.prepare(`SELECT COALESCE(SUM(seconds),0) v FROM study_logs WHERE user_id=? AND ${f}${g.course_id?' AND course_id='+(+g.course_id):''}`).get(u).v/60;return{...g,done_minutes:Math.round(done),pct:Math.min(100,Math.round(done/g.target_minutes*100))}});
 const now=new Date().toTimeString().slice(0,5);
 const upcoming=db.prepare('SELECT s.*,c.name course_name FROM schedules s JOIN courses c ON c.id=s.course_id WHERE s.user_id=? AND s.date=? AND s.done=0 AND s.start_time>=? ORDER BY start_time LIMIT 5').all(u,d,now);
 const notifs=[];upcoming.forEach(x=>{const m=(new Date(`${d}T${x.start_time}`)-Date.now())/6e4;if(m<=60)notifs.push(`${x.course_name} çalışmanız ${Math.max(0,Math.round(m))} dk sonra başlıyor`)});
 const late=db.prepare('SELECT COUNT(*) n FROM schedules WHERE user_id=? AND date=? AND done=0 AND end_time<?').get(u,d,now).n;if(late)notifs.push(`Bugün tamamlanmamış ${late} çalışma var`);
 goals.filter(g=>g.pct>=100).forEach(g=>notifs.push(`"${g.title}" hedefini tamamladınız`));
 s.json({today:sum("date(started_at,'localtime')=date('now','localtime')"),week,tasksDone:db.prepare('SELECT COUNT(*) n FROM tasks WHERE user_id=? AND done=1').get(u).n,activeCourses:db.prepare('SELECT COUNT(*) n FROM courses WHERE user_id=? AND archived=0').get(u).n,days,byCourse,monthly,goals,upcoming,notifs})});
app.use('/api',A);
// Lokal geliştirme: doğrudan çalıştırınca dinlemeye başla
if(require.main===module){app.listen(process.env.PORT||3000,()=>console.log('StudyFlow: http://localhost:'+(process.env.PORT||3000)));}
module.exports=app;
