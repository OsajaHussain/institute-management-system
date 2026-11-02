// Institute Management System (Node.js + MySQL) - Made by Osaja Hussain
// 1) Run institute_db.sql in MySQL Workbench   2) npm install   3) put your MySQL password below   4) node server.js
'use strict';
const http = require('http'), crypto = require('crypto');
let mysql;
try { mysql = require('mysql2/promise'); } catch (e) { console.error('mysql2 is missing. Run:  npm install'); process.exit(1); }

// ===================== SETTINGS: change the password =====================
const CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Institute123',
  database: process.env.DB_NAME || 'institute_db',
};
const PORT = process.env.PORT || 8000;
// ==========================================================================

const pool = mysql.createPool({ ...CONFIG, waitForConnections: true, connectionLimit: 8, decimalNumbers: true, dateStrings: true });
const run = async (sql, p = []) => { const [rows, fields] = await pool.query({ sql, rowsAsArray: true }, p); return { rows, cols: (fields || []).map(f => f.name) }; };
const exec = (sql, p = []) => pool.query(sql, p);
const one = async (sql, p = []) => (await run(sql, p)).rows[0] || null;
const num = async sql => Number((await one(sql))[0]) || 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const mk = p => { const s = crypto.randomBytes(8).toString('hex'); return s + '$' + crypto.pbkdf2Sync(p, Buffer.from(s, 'hex'), 100000, 32, 'sha256').toString('hex'); };
const chk = (p, st) => { const [s, h] = st.split('$'); return crypto.timingSafeEqual(crypto.pbkdf2Sync(p, Buffer.from(s, 'hex'), 100000, 32, 'sha256'), Buffer.from(h, 'hex')); };
const sqlv = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const JOIN = 'JOIN students s USING(student_id) JOIN batches b USING(batch_id) JOIN courses c USING(course_id)';
const REF = {
  student_id: 'SELECT student_id, name FROM students',
  teacher_id: 'SELECT teacher_id, name FROM teachers',
  course_id: 'SELECT course_id, course_name FROM courses',
  batch_id: "SELECT b.batch_id, CONCAT(c.course_name,' (',b.timing,')') FROM batches b JOIN courses c USING(course_id)",
  enroll_id: "SELECT e.enroll_id, CONCAT(s.name,' - ',c.course_name) FROM enrollments e " + JOIN,
};
// r: a=admin r=receptionist t=teacher
const T = {
  students: { pk: 'student_id', r: 'ar', f: [['name', 'Name', 't'], ['guardian_phone', 'Guardian phone', 't']],
    q: 'SELECT student_id id,name,guardian_phone phone,admission_date admitted FROM students ORDER BY id DESC' },
  teachers: { pk: 'teacher_id', r: 'a', f: [['name', 'Name', 't'], ['subject', 'Subject', 't'], ['salary', 'Salary', 'n']],
    q: 'SELECT teacher_id id,name,subject,salary FROM teachers' },
  courses: { pk: 'course_id', r: 'ar', f: [['course_name', 'Course name', 't'], ['fee', 'Fee', 'n']],
    q: 'SELECT course_id id,course_name,fee FROM courses' },
  batches: { pk: 'batch_id', r: 'ar', f: [['course_id', 'Course', 't'], ['teacher_id', 'Teacher', 't'], ['timing', 'Timing', 't']],
    q: 'SELECT b.batch_id id,c.course_name course,t.name teacher,b.timing FROM batches b JOIN courses c USING(course_id) JOIN teachers t USING(teacher_id)' },
  enrollments: { pk: 'enroll_id', r: 'ar', noedit: 1, f: [['student_id', 'Student', 't'], ['batch_id', 'Batch', 't']],
    q: 'SELECT e.enroll_id id,s.name student,c.course_name course,e.total_fee total,e.paid_amount paid FROM enrollments e ' + JOIN },
  fee_payments: { pk: 'pay_id', r: 'ar', noedit: 1, receipt: 1, f: [['enroll_id', 'Enrollment', 't'], ['amount', 'Amount', 'n'], ['pay_date', 'Date', 'd']],
    q: 'SELECT p.pay_id id,s.name student,c.course_name course,p.amount,p.pay_date FROM fee_payments p JOIN enrollments e USING(enroll_id) ' + JOIN + ' ORDER BY p.pay_id DESC' },
  attendance: { pk: 'att_id', r: 'art', f: [['student_id', 'Student', 't'], ['batch_id', 'Batch', 't'], ['att_date', 'Date', 'd'], ['status', 'Status', 's:P,A,L']],
    q: 'SELECT a.att_id id,s.name student,c.course_name course,a.att_date,a.status FROM attendance a ' + JOIN + ' ORDER BY a.att_date DESC' },
  results: { pk: 'result_id', r: 'art', f: [['student_id', 'Student', 't'], ['batch_id', 'Batch', 't'], ['exam_name', 'Exam', 't'], ['marks', 'Marks', 'n'], ['total', 'Total', 'n']],
    q: 'SELECT r.result_id id,s.name student,c.course_name course,r.exam_name exam,r.marks,r.total,r.grade FROM results r ' + JOIN },
};
const REPORTS = {
  fee_status: 'SELECT student,course_name,total_fee,paid_amount,pending FROM v_fee_status',
  defaulters: 'SELECT student,course_name,total_fee,paid_amount,pending FROM v_fee_status WHERE pending>0 ORDER BY pending DESC',
  attendance_report: 'SELECT * FROM v_attendance_summary',
};
const ROLE = { a: 'admin', r: 'receptionist', t: 'teacher' };
const allowed = (role, tab) => tab in T ? T[tab].r.includes(role)
  : (tab in REPORTS || tab === 'dashboard') ? 'ar'.includes(role)
  : (tab === 'sql' || tab === 'users') && role === 'a';

const CSS = `*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#f4f6fb;color:#1a2238}
header{background:#1a2238;color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
header h1{margin:0;font-size:19px}header a{color:#9db4ff;margin-left:12px}
nav{display:flex;flex-wrap:wrap;gap:6px;padding:12px 24px;background:#fff;border-bottom:1px solid #dde}
nav a{padding:6px 12px;border-radius:6px;text-decoration:none;color:#1a2238;background:#eef1f8;font-size:14px}nav a.on{background:#3b5bdb;color:#fff}
main{padding:24px}table{border-collapse:collapse;background:#fff;width:100%}th,td{padding:8px 12px;border:1px solid #e1e5f0;text-align:left;font-size:14px}
th{background:#eef1f8}form{margin:12px 0;display:flex;flex-wrap:wrap;gap:8px}input,select,textarea{padding:8px;border:1px solid #bcc;border-radius:6px;font-size:14px}
textarea{width:100%;font-family:monospace}button,.b{padding:8px 16px;background:#3b5bdb;color:#fff;border:0;border-radius:6px;cursor:pointer;text-decoration:none;font-size:14px}
.d{background:#c92a2a}.s{padding:3px 9px;font-size:12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px}
.card{background:#fff;border:1px solid #e1e5f0;border-radius:10px;padding:14px}.card b{display:block;font-size:24px}.bad{color:#c92a2a}.ok{color:#2b8a3e}
.wrap{overflow-x:auto}footer{text-align:center;padding:20px;color:#667;font-size:13px}.err{background:#ffe3e3;padding:10px;border-radius:6px}`;

function shell(role, user, tab, body) {
  const names = ['dashboard', ...Object.keys(T), ...Object.keys(REPORTS), 'sql', 'users'];
  let nav = names.filter(t => allowed(role, t)).map(t => `<a class="${t === tab ? 'on' : ''}" href="/?t=${t}">${t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</a>`).join('');
  if (role === 'a') nav += '<a href="/backup">⬇ Backup</a>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Institute Management System</title><style>${CSS}</style></head><body>
<header><h1>🎓 Institute Management System</h1><div>${esc(user)} (${ROLE[role]})<a href="/logout">Logout</a></div></header>
<nav>${nav}</nav><main>${body}</main><footer>Made by Osaja Hussain</footer></body></html>`;
}
const table = (cols, rows, extra) => `<div class="wrap"><table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}${extra ? '<th></th>' : ''}</tr>` +
  (rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}${extra ? `<td>${extra(r)}</td>` : ''}</tr>`).join('') || '<tr><td>No records</td></tr>') + '</table></div>';
async function field([col, label, ty], val = '') {
  if (col in REF) {
    const opts = (await run(REF[col])).rows.map(([k, v]) => `<option value="${k}" ${String(k) === String(val) ? 'selected' : ''}>${esc(v)}</option>`).join('');
    return `<select name="${col}" required><option value="">${label}</option>${opts}</select>`;
  }
  if (ty.startsWith('s:')) return `<select name="${col}">` + ty.slice(2).split(',').map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('') + '</select>';
  const t = ty === 'n' ? 'type="number" step="any" min="0"' : ty === 'd' ? 'type="date"' : 'type="text"';
  return `<input name="${col}" placeholder="${label}" ${t} value="${esc(ty === 'd' && !val ? today() : val)}" required>`;
}
async function dashboard() {
  const pend = await num('SELECT IFNULL(SUM(total_fee-paid_amount),0) FROM enrollments');
  const att = await num("SELECT IFNULL(ROUND(100*SUM(status='P')/COUNT(*)),0) FROM attendance");
  const month = await num("SELECT IFNULL(SUM(amount),0) FROM fee_payments WHERE DATE_FORMAT(pay_date,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')");
  const card = (t, v, k = '') => `<div class="card">${t}<b class="${k}">${v}</b></div>`;
  const d = await run(REPORTS.defaulters + ' LIMIT 5');
  return '<h2>Dashboard</h2><div class="cards">' + card('Students', await num('SELECT COUNT(*) FROM students')) + card('Courses', await num('SELECT COUNT(*) FROM courses')) +
    card('Collected this month', 'Rs ' + month.toLocaleString(), 'ok') + card('Total pending', 'Rs ' + pend.toLocaleString(), 'bad') + card('Attendance', att + '%') +
    '</div><h3>Top defaulters</h3>' + table(d.cols, d.rows);
}
async function listPage(role, tab, q, edit) {
  const m = T[tab]; let { cols, rows } = await run(m.q);
  if (q) rows = rows.filter(r => r.join(' ').toLowerCase().includes(q.toLowerCase()));
  let vals = [];
  if (edit) vals = await one(`SELECT ${m.f.map(f => f[0]).join(',')} FROM ${tab} WHERE ${m.pk}=?`, [edit]) || [];
  const inputs = (await Promise.all(m.f.map((f, i) => field(f, vals[i] ?? '')))).join('');
  const act = edit ? `/edit?t=${tab}&id=${encodeURIComponent(edit)}` : `/add?t=${tab}`;
  const form = `<form method="post" action="${act}">${inputs}<button>${edit ? 'Save changes' : 'Add'}</button></form>`;
  const srch = `<form><input type="hidden" name="t" value="${tab}"><input name="q" placeholder="Search..." value="${esc(q)}"><button>Search</button></form>`;
  const extra = r => (m.receipt ? `<a class="b s" href="/receipt?id=${r[0]}" target="_blank">Receipt</a> ` : '') +
    (!m.noedit ? `<a class="b s" href="/?t=${tab}&e=${r[0]}">Edit</a> ` : '') +
    (role === 'a' ? `<form style="display:inline;margin:0" method="post" action="/del?t=${tab}&id=${r[0]}" onsubmit="return confirm('Delete?')"><button class="s d">Delete</button></form>` : '');
  return `<h2>${tab.replace(/_/g, ' ')}</h2>${form}${srch}` + table(cols, rows, extra);
}
const sqlPage = (res = '') => '<h2>SQL Console</h2><p>Run SELECT queries (read-only). Example: <code>SELECT * FROM v_fee_status</code></p>' +
  '<form method="post" action="/sql"><textarea name="sql" rows="5" placeholder="SELECT ..."></textarea><button>Run</button></form>' + res;
async function usersPage() {
  const r = await run('SELECT user_id,username,role FROM users');
  return '<h2>Users</h2><form method="post" action="/user"><input name="username" placeholder="username" required><input name="password" type="password" placeholder="password" required>' +
    '<select name="role"><option>receptionist</option><option>teacher</option><option>admin</option></select><button>Add user</button></form><p>Tip: create your own admin, then delete the default admin.</p>' +
    table(r.cols, r.rows, x => `<form style="display:inline;margin:0" method="post" action="/deluser?id=${x[0]}"><button class="s d">Delete</button></form>`);
}
const loginPage = (msg = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}
form{flex-direction:column;max-width:320px;margin:60px auto}</style></head><body><header><h1>🎓 Institute Management System</h1></header>
<form method="post" action="/login"><h2>Login</h2>${msg ? `<div class="err">${msg}</div>` : ''}<input name="u" placeholder="Username" required>
<input name="p" type="password" placeholder="Password" required><button>Login</button></form><footer>Made by Osaja Hussain</footer></body></html>`;

async function backupSql() {
  const tabs = ['users', 'students', 'teachers', 'courses', 'batches', 'enrollments', 'fee_payments', 'attendance', 'results'];
  let s = `-- Institute backup ${new Date().toISOString()}\n-- Restore: run institute_db.sql (structure) first, DELETE its sample rows, then run this file.\nUSE ${CONFIG.database};\nSET FOREIGN_KEY_CHECKS=0;\n`;
  for (const t of tabs) {
    const [rows] = await exec(`SELECT * FROM ${t}`);
    for (const r of rows) { const c = Object.keys(r); s += `INSERT INTO ${t}(${c.join(',')}) VALUES(${c.map(k => sqlv(r[k])).join(',')});\n`; }
  }
  const [en] = await exec('SELECT enroll_id,total_fee,paid_amount FROM enrollments'); // triggers add fees again on restore, so fix them
  for (const e of en) s += `UPDATE enrollments SET total_fee=${e.total_fee}, paid_amount=${e.paid_amount} WHERE enroll_id=${e.enroll_id};\n`;
  return s + 'SET FOREIGN_KEY_CHECKS=1;\n';
}
const friendly = e => e.code === 'ER_DUP_ENTRY' ? 'This record already exists (duplicate).'
  : e.code === 'ER_ROW_IS_REFERENCED_2' ? 'Cannot delete: other records depend on this one.'
  : e.code === 'ER_NO_REFERENCED_ROW_2' ? 'Please choose a valid related record.' : e.message;

const SESS = new Map();
const getSess = req => { const m = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || ''); return m ? SESS.get(m[1]) : null; };

const server = http.createServer((req, res) => {
  const out = (body, code = 200, type = 'text/html; charset=utf-8', hdr = {}) => { res.writeHead(code, { 'Content-Type': type, ...hdr }); res.end(body); };
  const go = (loc, hdr = {}) => { res.writeHead(303, { Location: loc, ...hdr }); res.end(); };
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    const u = new URL(req.url, 'http://x'), q = Object.fromEntries(u.searchParams), f = Object.fromEntries(new URLSearchParams(raw)), p = u.pathname;
    let tab = 'dashboard', s = null;
    try {
      if (req.method === 'POST' && p === '/login') {
        const r = await one('SELECT password_hash,role FROM users WHERE username=?', [f.u || '']);
        if (r && chk(f.p || '', r[0])) { const t = crypto.randomBytes(16).toString('hex'); SESS.set(t, [f.u, r[1][0]]); return go('/', { 'Set-Cookie': `sid=${t}; HttpOnly; SameSite=Strict; Path=/` }); }
        return out(loginPage('Wrong username or password'), 401);
      }
      if (p === '/login') return out(loginPage());
      if (p === '/logout') { const m = /sid=([a-f0-9]+)/.exec(req.headers.cookie || ''); if (m) SESS.delete(m[1]); return go('/login'); }
      s = getSess(req); if (!s) return go('/login');
      const [user, role] = s; tab = q.t || (role === 't' ? 'attendance' : 'dashboard');
      if (req.method === 'GET') {
        if (p === '/backup' && role === 'a')
          return out(await backupSql(), 200, 'application/octet-stream', { 'Content-Disposition': `attachment; filename="institute_backup_${today().replace(/-/g, '')}.sql"` });
        if (p === '/receipt') {
          const v = await one('SELECT p.pay_id,s.name,c.course_name,p.amount,p.pay_date,e.total_fee,e.paid_amount FROM fee_payments p JOIN enrollments e USING(enroll_id) ' + JOIN + ' WHERE p.pay_id=?', [q.id]);
          if (!v) return out('Not found', 404);
          return out(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>body{font-family:sans-serif;max-width:420px;margin:30px auto;border:2px solid #1a2238;padding:20px}td{padding:6px 0}h2,p{text-align:center}</style></head><body onload="print()"><h2>Institute Fee Receipt</h2><table width="100%">
<tr><td>Receipt #</td><td>${v[0]}</td></tr><tr><td>Student</td><td>${esc(v[1])}</td></tr><tr><td>Course</td><td>${esc(v[2])}</td></tr>
<tr><td>Amount paid</td><td><b>Rs ${v[3].toLocaleString()}</b></td></tr><tr><td>Date</td><td>${esc(v[4])}</td></tr><tr><td>Total fee</td><td>Rs ${v[5].toLocaleString()}</td></tr>
<tr><td>Remaining</td><td>Rs ${(v[5] - v[6]).toLocaleString()}</td></tr></table><p>Made by Osaja Hussain</p></body></html>`);
        }
        if (!allowed(role, tab)) return out(shell(role, user, 'x', '<h2>Not allowed for your role</h2>'), 403);
        let body;
        if (tab === 'dashboard') body = await dashboard();
        else if (tab in T) body = await listPage(role, tab, q.q || '', q.e);
        else if (tab in REPORTS) { const r = await run(REPORTS[tab]); body = `<h2>${tab.replace(/_/g, ' ')}</h2>` + table(r.cols, r.rows); }
        else if (tab === 'sql') body = sqlPage();
        else body = await usersPage();
        return out(shell(role, user, tab, body));
      }
      // ---- POST ----
      if ((p === '/add' || p === '/edit') && tab in T && T[tab].r.includes(role)) {
        const cols = T[tab].f.map(x => x[0]), vals = cols.map(k => f[k] ?? '');
        if (p === '/add') await exec(`INSERT INTO ${tab}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, vals);
        else if (!T[tab].noedit) await exec(`UPDATE ${tab} SET ${cols.map(k => k + '=?').join(',')} WHERE ${T[tab].pk}=?`, [...vals, q.id]);
        return go('/?t=' + tab);
      }
      if (p === '/del' && role === 'a' && tab in T) { await exec(`DELETE FROM ${tab} WHERE ${T[tab].pk}=?`, [q.id]); return go('/?t=' + tab); }
      if (p === '/user' && role === 'a') { tab = 'users'; await exec('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [f.username, mk(f.password), f.role]); return go('/?t=users'); }
      if (p === '/deluser' && role === 'a') {
        tab = 'users';
        const admins = await num("SELECT COUNT(*) FROM users WHERE role='admin'"), tr = await one('SELECT role FROM users WHERE user_id=?', [q.id]);
        if (tr && (admins > 1 || tr[0] !== 'admin')) await exec('DELETE FROM users WHERE user_id=?', [q.id]);
        return go('/?t=users');
      }
      if (p === '/sql' && role === 'a') {
        const sq = (f.sql || '').trim().replace(/;+$/, ''); let r;
        if (!/^(select|with)\b/i.test(sq) || sq.includes(';') || /\binto\s+(outfile|dumpfile|@)/i.test(sq)) r = '<div class="err">Only a single SELECT query is allowed.</div>';
        else {
          const conn = await pool.getConnection();
          try {
            await conn.query('SET SESSION MAX_EXECUTION_TIME=5000');
            await conn.query('START TRANSACTION READ ONLY');
            const [rows, fields] = await conn.query({ sql: sq, rowsAsArray: true });
            r = `<p>${esc(sq)}</p>` + table(fields.map(x => x.name), rows.slice(0, 500));
          } catch (e) { r = `<div class="err">${esc(e.message)}</div>`; }
          finally { await conn.query('ROLLBACK').catch(() => {}); conn.release(); }
        }
        return out(shell(role, user, 'sql', sqlPage(r)));
      }
      out('Not allowed', 403);
    } catch (e) {
      out(s ? shell(s[1], s[0], tab, `<div class="err">Error: ${esc(friendly(e))}</div><p><a href="javascript:history.back()">Back</a></p>`) : 'Error: ' + esc(friendly(e)), 400);
    }
  });
});

(async () => {
  try {
    const n = await num('SELECT COUNT(*) FROM users');
    if (n === 0) for (const [u, p, r] of [['admin', 'admin123', 'admin'], ['reception', 'reception123', 'receptionist'], ['teacher', 'teacher123', 'teacher']])
      await exec('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [u, mk(p), r]);
  } catch (e) {
    console.error('\nCould not connect to MySQL database "' + CONFIG.database + '":', e.code || '', e.message);
    console.error('Check: 1) MySQL is running  2) password in CONFIG at top of server.js  3) you ran institute_db.sql in Workbench\n');
    process.exit(1);
  }
  server.listen(PORT, () => console.log(`Institute Management System: http://localhost:${PORT}   Login: admin / admin123   (Made by Osaja Hussain)`));
})();
