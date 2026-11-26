const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const FILES = {
  users: 'users.json',
  links: 'links.json',
  exercises: 'exercises.json',
  workouts: 'workouts.json',
  completions: 'completions.json',
  proofs: 'proofs.json',
  requirements: 'requirements.json',
  substitutions: 'substitutions.json'
};

const DEFAULT_EXERCISES = [
  { id: 1, nome: 'Supino reto', musculo: 'Peito', descricao: 'Empurrar a barra mantendo controle e estabilidade.', instrucoes: 'Mantenha escápulas estáveis, pés apoiados e desça a barra de forma controlada.' },
  { id: 2, nome: 'Remada baixa', musculo: 'Costas', descricao: 'Movimento de puxada horizontal para costas.', instrucoes: 'Mantenha a coluna neutra e puxe em direção ao abdômen sem impulsionar o tronco.' },
  { id: 3, nome: 'Desenvolvimento com halteres', musculo: 'Ombros', descricao: 'Exercício de empurrar acima da cabeça.', instrucoes: 'Controle a descida e mantenha o tronco estável.' },
  { id: 4, nome: 'Rosca direta', musculo: 'Bíceps', descricao: 'Flexão de cotovelo com barra ou equipamento.', instrucoes: 'Evite balanço do tronco e controle todo o movimento.' },
  { id: 5, nome: 'Tríceps na polia', musculo: 'Tríceps', descricao: 'Extensão de cotovelo na polia.', instrucoes: 'Mantenha os cotovelos próximos ao corpo e controle o retorno.' },
  { id: 6, nome: 'Agachamento livre', musculo: 'Pernas', descricao: 'Movimento de agachamento com carga.', instrucoes: 'Mantenha alinhamento confortável e controle a amplitude.' },
  { id: 7, nome: 'Elevação pélvica', musculo: 'Glúteos', descricao: 'Extensão de quadril com foco em glúteos.', instrucoes: 'Faça a extensão de quadril sem hiperestender a lombar.' },
  { id: 8, nome: 'Prancha', musculo: 'Abdômen', descricao: 'Exercício isométrico para o tronco.', instrucoes: 'Mantenha o corpo alinhado e respire normalmente.' }
];

const DEFAULTS = {
  users: [],
  links: [],
  exercises: DEFAULT_EXERCISES,
  workouts: [],
  completions: [],
  proofs: [],
  requirements: [],
  substitutions: []
};

function filePath(key) {
  return path.join(DATA_DIR, FILES[key]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function read(key) {
  const p = filePath(key);
  if (!fs.existsSync(p)) {
    const defaults = DEFAULTS[key] || [];
    write(key, defaults);
    return clone(defaults);
  }
  try {
    const text = fs.readFileSync(p, 'utf8');
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key, data) {
  fs.writeFileSync(filePath(key), JSON.stringify(data, null, 2), 'utf8');
}

function nextId(key) {
  const values = read(key);
  if (!values.length) return 1;
  return Math.max(...values.map(v => Number(v.id) || 0)) + 1;
}

for (const key of Object.keys(FILES)) {
  if (!fs.existsSync(filePath(key))) write(key, DEFAULTS[key] || []);
}

function cleanText(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  return cleanText(value, 160).toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split(':');
    if (parts.length !== 2) return false;
    const [salt, expectedHex] = parts;
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function safeUser(user) {
  if (!user) return null;
  const { senha, ...safe } = user;
  return safe;
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, file, contentType, extraHeaders = {}) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      ...extraHeaders
    });
    res.end(data);
  });
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}

const SESSION_SECRET = process.env.PONTOFIT_SESSION_SECRET || 'pontofit-dev-secret-troque-em-producao';

function signSession(userId) {
  const payload = String(userId);
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifySession(value) {
  try {
    const [payload, signature] = String(value || '').split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return Number(payload);
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) result[key] = decodeURIComponent(rest.join('='));
  }
  return result;
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  const userId = verifySession(sid);
  if (!userId) return null;
  const user = read('users').find(x => Number(x.id) === userId);
  return safeUser(user);
}

function requireAuth(req, res, roles = []) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { erro: 'Você precisa estar autenticado.' });
    return null;
  }
  if (roles.length && !roles.includes(user.tipo)) {
    json(res, 403, { erro: 'Acesso negado.' });
    return null;
  }
  return user;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Requisição muito grande.'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function linkedProfessional(alunoId) {
  const links = read('links');
  const users = read('users');
  const active = links.find(x => Number(x.aluno_id) === Number(alunoId) && x.ativo !== false);
  if (!active) return null;
  return users.find(x => Number(x.id) === Number(active.profissional_id) && x.tipo === 'PROFISSIONAL') || null;
}

function linkedStudents(professionalId) {
  const links = read('links');
  const users = read('users');
  const ids = new Set(
    links
      .filter(x => Number(x.profissional_id) === Number(professionalId) && x.ativo !== false)
      .map(x => Number(x.aluno_id))
  );
  return users.filter(x => x.tipo === 'ALUNO' && ids.has(Number(x.id)));
}

function ownsWorkout(user, workoutId) {
  const workouts = read('workouts');
  const workout = workouts.find(x => Number(x.id) === Number(workoutId));
  if (!workout) return null;
  if (user.tipo === 'ALUNO' && Number(workout.aluno_id) !== Number(user.id)) return null;
  if (user.tipo === 'PROFISSIONAL' && Number(workout.profissional_id) !== Number(user.id)) return null;
  return workout;
}

function canProfessionalAccessStudent(user, alunoId) {
  return linkedStudents(user.id).some(a => Number(a.id) === Number(alunoId));
}

function validDays() {
  return ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'];
}

function sanitizeExercises(rows) {
  const exerciseList = read('exercises');
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    const id = Number(row.exercicio_id);
    const ex = exerciseList.find(x => Number(x.id) === id);
    if (!ex) return null;
    return {
      exercicio_id: id,
      series: cleanText(row.series, 80),
      repeticoes: cleanText(row.repeticoes, 80),
      carga: cleanText(row.carga, 80),
      descanso: cleanText(row.descanso, 80)
    };
  }).filter(Boolean);
}

async function api(req, res, url) {
  const method = req.method;
  try {
    // Sessão
    if (url === '/api/session' && method === 'GET') {
      return json(res, 200, { usuario: safeUser(currentUser(req)) });
    }

    if (url === '/api/register' && method === 'POST') {
      const b = await parseBody(req);
      const nome = cleanText(b.nome, 120);
      const email = normalizeEmail(b.email);
      const senha = String(b.senha || '');
      const tipo = cleanText(b.tipo, 30).toUpperCase();
      const objetivo = cleanText(b.objetivo, 500);

      if (!nome || !email || !senha || !['ALUNO', 'PROFISSIONAL'].includes(tipo)) {
        return json(res, 400, { erro: 'Preencha nome, e-mail, senha e tipo corretamente.' });
      }
      if (senha.length < 6) {
        return json(res, 400, { erro: 'A senha precisa ter pelo menos 6 caracteres.' });
      }

      const users = read('users');
      if (users.some(x => x.email === email)) {
        return json(res, 409, { erro: 'Este e-mail já está cadastrado.' });
      }

      const id = nextId('users');
      const user = {
        id,
        nome,
        email,
        senha: hashPassword(senha),
        tipo,
        objetivo,
        codigo_profissional: tipo === 'PROFISSIONAL' ? `PF${String(id).padStart(5, '0')}` : '',
        criado_em: new Date().toISOString()
      };

      users.push(user);
      write('users', users);
      return json(res, 201, { usuario: safeUser(user) });
    }

    if (url === '/api/login' && method === 'POST') {
      const b = await parseBody(req);
      const email = normalizeEmail(b.email);
      const senha = String(b.senha || '');
      const user = read('users').find(x => x.email === email);

      if (!user || !verifyPassword(senha, user.senha)) {
        return json(res, 401, { erro: 'E-mail ou senha incorretos.' });
      }

      const sid = signSession(user.id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Lax`
      });
      return res.end(JSON.stringify({ usuario: safeUser(user) }));
    }

    if (url === '/api/logout' && method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': 'sid=; Max-Age=0; HttpOnly; Path=/; SameSite=Lax'
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Perfil
    if (url === '/api/profile' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      return json(res, 200, {
        usuario: safeUser(read('users').find(x => x.id === user.id)),
        profissional: user.tipo === 'ALUNO' ? safeUser(linkedProfessional(user.id)) : null
      });
    }

    if (url === '/api/profile' && method === 'PUT') {
      const user = requireAuth(req, res);
      if (!user) return;
      const b = await parseBody(req);
      const users = read('users');
      const idx = users.findIndex(x => Number(x.id) === Number(user.id));
      if (idx < 0) return json(res, 404, { erro: 'Usuário não encontrado.' });

      const nome = cleanText(b.nome ?? users[idx].nome, 120);
      const email = normalizeEmail(b.email ?? users[idx].email);
      if (!nome || !email) return json(res, 400, { erro: 'Nome e e-mail são obrigatórios.' });
      if (users.some(x => x.email === email && x.id !== user.id)) {
        return json(res, 409, { erro: 'Este e-mail já está em uso.' });
      }

      users[idx].nome = nome;
      users[idx].email = email;
      if (user.tipo === 'ALUNO') users[idx].objetivo = cleanText(b.objetivo ?? users[idx].objetivo, 500);
      if (b.senha) {
        const senha = String(b.senha);
        if (senha.length < 6) return json(res, 400, { erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
        users[idx].senha = hashPassword(senha);
      }
      write('users', users);

      return json(res, 200, { usuario: safeUser(users[idx]) });
    }

    // Profissional / vínculo
    if (url === '/api/professional' && method === 'GET') {
      const user = requireAuth(req, res, ['ALUNO']);
      if (!user) return;
      return json(res, 200, { profissional: safeUser(linkedProfessional(user.id)) });
    }

    if (url === '/api/link' && method === 'POST') {
      const user = requireAuth(req, res, ['ALUNO']);
      if (!user) return;
      const b = await parseBody(req);
      const codigo = cleanText(b.codigo_profissional, 50).toUpperCase();
      const professionals = read('users').filter(x => x.tipo === 'PROFISSIONAL');
      const professional = professionals.find(x => x.codigo_profissional.toUpperCase() === codigo);
      if (!professional) return json(res, 404, { erro: 'Código profissional não encontrado.' });

      const links = read('links');
      links.forEach(x => {
        if (Number(x.aluno_id) === Number(user.id)) x.ativo = false;
      });
      links.push({
        id: nextId('links'),
        aluno_id: user.id,
        profissional_id: professional.id,
        codigo_profissional: professional.codigo_profissional,
        ativo: true,
        criado_em: new Date().toISOString()
      });
      write('links', links);
      return json(res, 200, { profissional: safeUser(professional) });
    }

    if (url === '/api/unlink' && method === 'POST') {
      const user = requireAuth(req, res, ['ALUNO']);
      if (!user) return;
      const links = read('links');
      links.forEach(x => {
        if (Number(x.aluno_id) === Number(user.id)) x.ativo = false;
      });
      write('links', links);
      return json(res, 200, { ok: true });
    }

    // Exercícios
    if (url === '/api/exercises' && method === 'GET') {
      return json(res, 200, { exercicios: read('exercises') });
    }

    if (url === '/api/exercises' && method === 'POST') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const b = await parseBody(req);
      const nome = cleanText(b.nome, 120);
      const musculo = cleanText(b.musculo, 60);
      const descricao = cleanText(b.descricao, 1200);
      const instrucoes = cleanText(b.instrucoes, 1200);
      if (!nome || !musculo) return json(res, 400, { erro: 'Nome e músculo são obrigatórios.' });
      const exercises = read('exercises');
      if (exercises.some(x => x.nome.toLowerCase() === nome.toLowerCase())) {
        return json(res, 409, { erro: 'Já existe um exercício com esse nome.' });
      }
      const exercise = { id: nextId('exercises'), nome, musculo, descricao, instrucoes, criado_em: new Date().toISOString() };
      exercises.push(exercise);
      write('exercises', exercises);
      return json(res, 201, { exercicio: exercise });
    }

    if (url.startsWith('/api/exercises/') && method === 'PUT') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const id = Number(url.split('/').pop());
      const b = await parseBody(req);
      const exercises = read('exercises');
      const idx = exercises.findIndex(x => Number(x.id) === id);
      if (idx < 0) return json(res, 404, { erro: 'Exercício não encontrado.' });
      const nome = cleanText(b.nome ?? exercises[idx].nome, 120);
      const musculo = cleanText(b.musculo ?? exercises[idx].musculo, 60);
      if (!nome || !musculo) return json(res, 400, { erro: 'Nome e músculo são obrigatórios.' });
      if (exercises.some(x => x.id !== id && x.nome.toLowerCase() === nome.toLowerCase())) {
        return json(res, 409, { erro: 'Já existe um exercício com esse nome.' });
      }
      exercises[idx] = {
        ...exercises[idx],
        nome,
        musculo,
        descricao: cleanText(b.descricao ?? exercises[idx].descricao, 1200),
        instrucoes: cleanText(b.instrucoes ?? exercises[idx].instrucoes, 1200),
        atualizado_em: new Date().toISOString()
      };
      write('exercises', exercises);
      return json(res, 200, { exercicio: exercises[idx] });
    }

    if (url.startsWith('/api/exercises/') && method === 'DELETE') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const id = Number(url.split('/').pop());
      const workouts = read('workouts');
      if (workouts.some(w => Array.isArray(w.exercicios) && w.exercicios.some(e => Number(e.exercicio_id) === id))) {
        return json(res, 409, { erro: 'Este exercício está sendo usado em um treino e não pode ser excluído.' });
      }
      const exercises = read('exercises');
      const exists = exercises.some(x => Number(x.id) === id);
      if (!exists) return json(res, 404, { erro: 'Exercício não encontrado.' });
      write('exercises', exercises.filter(x => Number(x.id) !== id));
      return json(res, 200, { ok: true });
    }

    // Treinos
    if (url === '/api/workouts' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const query = new URL(url, 'http://localhost').searchParams;
      const alunoId = query.get('aluno_id');
      const workouts = read('workouts');

      if (user.tipo === 'ALUNO') {
        const list = workouts.filter(w => Number(w.aluno_id) === Number(user.id));
        return json(res, 200, { treinos: list });
      }

      if (alunoId !== null) {
        const id = Number(alunoId);
        if (!canProfessionalAccessStudent(user, id)) return json(res, 403, { erro: 'Aluno não vinculado a você.' });
        return json(res, 200, { treinos: workouts.filter(w => Number(w.profissional_id) === Number(user.id) && Number(w.aluno_id) === id) });
      }

      return json(res, 200, { treinos: workouts.filter(w => Number(w.profissional_id) === Number(user.id)) });
    }

    if (url === '/api/workouts' && method === 'POST') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const b = await parseBody(req);
      const alunoId = Number(b.aluno_id);
      if (!canProfessionalAccessStudent(user, alunoId)) return json(res, 403, { erro: 'Aluno não está vinculado a você.' });
      const titulo = cleanText(b.titulo, 160);
      const dia = cleanText(b.dia_semana, 30).toUpperCase();
      const observacoes = cleanText(b.observacoes, 1500);
      if (!titulo || !validDays().includes(dia)) return json(res, 400, { erro: 'Título e dia válido são obrigatórios.' });
      const exercicios = sanitizeExercises(b.exercicios);
      if (!exercicios.length) return json(res, 400, { erro: 'Adicione pelo menos um exercício.' });

      const workout = {
        id: nextId('workouts'),
        aluno_id: alunoId,
        profissional_id: user.id,
        titulo,
        dia_semana: dia,
        observacoes,
        exercicios,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      };
      const workouts = read('workouts');
      workouts.push(workout);
      write('workouts', workouts);
      return json(res, 201, { treino: workout });
    }

    if (url.startsWith('/api/workouts/') && method === 'PUT') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const id = Number(url.split('/').pop());
      const workouts = read('workouts');
      const idx = workouts.findIndex(w => Number(w.id) === id && Number(w.profissional_id) === Number(user.id));
      if (idx < 0) return json(res, 404, { erro: 'Treino não encontrado.' });
      const b = await parseBody(req);
      const titulo = cleanText(b.titulo ?? workouts[idx].titulo, 160);
      const dia = cleanText(b.dia_semana ?? workouts[idx].dia_semana, 30).toUpperCase();
      if (!titulo || !validDays().includes(dia)) return json(res, 400, { erro: 'Título e dia válido são obrigatórios.' });
      workouts[idx].titulo = titulo;
      workouts[idx].dia_semana = dia;
      workouts[idx].observacoes = cleanText(b.observacoes ?? workouts[idx].observacoes, 1500);
      if (Array.isArray(b.exercicios)) {
        const exs = sanitizeExercises(b.exercicios);
        if (!exs.length) return json(res, 400, { erro: 'O treino precisa ter pelo menos um exercício.' });
        workouts[idx].exercicios = exs;
      }
      workouts[idx].atualizado_em = new Date().toISOString();
      write('workouts', workouts);
      return json(res, 200, { treino: workouts[idx] });
    }

    if (url.startsWith('/api/workouts/') && method === 'DELETE') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const id = Number(url.split('/').pop());
      const workouts = read('workouts');
      const exists = workouts.some(w => Number(w.id) === id && Number(w.profissional_id) === Number(user.id));
      if (!exists) return json(res, 404, { erro: 'Treino não encontrado.' });
      write('workouts', workouts.filter(w => Number(w.id) !== id));
      write('completions', read('completions').filter(x => Number(x.treino_id) !== id));
      write('proofs', read('proofs').filter(x => Number(x.treino_id) !== id));
      write('substitutions', read('substitutions').filter(x => Number(x.treino_id) !== id));
      return json(res, 200, { ok: true });
    }

    // Conclusões
    if (url === '/api/completions' && method === 'POST') {
      const user = requireAuth(req, res, ['ALUNO']);
      if (!user) return;
      const b = await parseBody(req);
      const workout = ownsWorkout(user, Number(b.treino_id));
      if (!workout) return json(res, 404, { erro: 'Treino não encontrado.' });
      const completions = read('completions');
      if (completions.some(x => Number(x.treino_id) === workout.id && Number(x.aluno_id) === user.id)) {
        return json(res, 409, { erro: 'Este treino já foi concluído.' });
      }
      const completion = { id: nextId('completions'), treino_id: workout.id, aluno_id: user.id, concluido_em: new Date().toISOString() };
      completions.push(completion);
      write('completions', completions);
      return json(res, 201, { conclusao: completion });
    }

    if (url === '/api/completions' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const completions = read('completions');
      const workouts = read('workouts');
      if (user.tipo === 'ALUNO') {
        return json(res, 200, { conclusoes: completions.filter(x => Number(x.aluno_id) === Number(user.id)) });
      }
      const allowed = new Set(workouts.filter(w => Number(w.profissional_id) === Number(user.id)).map(w => Number(w.id)));
      return json(res, 200, { conclusoes: completions.filter(x => allowed.has(Number(x.treino_id))) });
    }

    // Comprovantes
    if (url === '/api/proofs' && method === 'POST') {
      const user = requireAuth(req, res, ['ALUNO']);
      if (!user) return;
      const b = await parseBody(req);
      const workout = ownsWorkout(user, Number(b.treino_id));
      if (!workout) return json(res, 404, { erro: 'Treino não encontrado.' });
      const dataUrl = String(b.imagem || '');
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json(res, 400, { erro: 'Imagem inválida. Use PNG, JPG ou WEBP.' });
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 10 * 1024 * 1024) return json(res, 413, { erro: 'A imagem pode ter no máximo 10 MB.' });
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]];
      const filename = `comprovante_${user.id}_${workout.id}_${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
      const proof = { id: nextId('proofs'), treino_id: workout.id, aluno_id: user.id, arquivo: `/uploads/${filename}`, enviado_em: new Date().toISOString() };
      const proofs = read('proofs');
      proofs.push(proof);
      write('proofs', proofs);
      return json(res, 201, { comprovante: proof });
    }

    if (url === '/api/proofs' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const proofs = read('proofs');
      const workouts = read('workouts');
      const query = new URL(url, 'http://localhost').searchParams;
      const alunoId = query.get('aluno_id');
      if (user.tipo === 'ALUNO') {
        return json(res, 200, { comprovantes: proofs.filter(x => Number(x.aluno_id) === Number(user.id)) });
      }
      if (alunoId !== null && !canProfessionalAccessStudent(user, Number(alunoId))) return json(res, 403, { erro: 'Aluno não vinculado a você.' });
      const ownWorkoutIds = new Set(workouts.filter(w => Number(w.profissional_id) === Number(user.id) && (alunoId === null || Number(w.aluno_id) === Number(alunoId))).map(w => Number(w.id)));
      return json(res, 200, { comprovantes: proofs.filter(p => ownWorkoutIds.has(Number(p.treino_id))) });
    }

    // Requisitos/orientações
    if (url === '/api/requirements' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const requirements = read('requirements');
      const query = new URL(url, 'http://localhost').searchParams;
      const alunoId = query.get('aluno_id');
      if (user.tipo === 'ALUNO') {
        return json(res, 200, { requisitos: requirements.filter(r => Number(r.aluno_id) === Number(user.id)) });
      }
      if (alunoId !== null) {
        if (!canProfessionalAccessStudent(user, Number(alunoId))) return json(res, 403, { erro: 'Aluno não vinculado a você.' });
        return json(res, 200, { requisitos: requirements.filter(r => Number(r.aluno_id) === Number(alunoId)) });
      }
      const allowed = new Set(linkedStudents(user.id).map(a => Number(a.id)));
      return json(res, 200, { requisitos: requirements.filter(r => allowed.has(Number(r.aluno_id))) });
    }

    if (url === '/api/requirements' && method === 'POST') {
      const user = requireAuth(req, res, ['ALUNO', 'PROFISSIONAL']);
      if (!user) return;
      const b = await parseBody(req);
      const alunoId = user.tipo === 'ALUNO' ? user.id : Number(b.aluno_id);
      if (!alunoId) return json(res, 400, { erro: 'Aluno não informado.' });
      if (user.tipo === 'PROFISSIONAL' && !canProfessionalAccessStudent(user, alunoId)) {
        return json(res, 403, { erro: 'Aluno não vinculado a você.' });
      }
      const requisito = cleanText(b.requisito, 1000);
      if (!requisito) return json(res, 400, { erro: 'Preencha o requisito/necessidade.' });
      const profissional = linkedProfessional(alunoId);
      const type = user.tipo === 'ALUNO' ? 'REQUISITO_ALUNO' : 'INSTRUCAO_PROFISSIONAL';
      const requirements = read('requirements');
      if (type === 'INSTRUCAO_PROFISSIONAL') {
        for (const item of requirements) {
          if (Number(item.aluno_id) === Number(alunoId) && Number(item.profissional_id) === Number(user.id) && item.tipo === type) item.ativo = false;
        }
      }
      const record = {
        id: nextId('requirements'),
        aluno_id: alunoId,
        profissional_id: user.tipo === 'PROFISSIONAL' ? user.id : (profissional ? profissional.id : null),
        tipo: type,
        requisito,
        exercicios_evitar: cleanText(b.exercicios_evitar, 700),
        instrucao: cleanText(b.instrucao, 1500),
        observacoes: cleanText(b.observacoes, 1500),
        criado_por_id: user.id,
        criado_em: new Date().toISOString(),
        ativo: true
      };
      requirements.push(record);
      write('requirements', requirements);
      return json(res, 201, { requisito: record });
    }

    // Substituições
    if (url === '/api/substitutions' && method === 'POST') {
      const user = requireAuth(req, res, ['ALUNO', 'PROFISSIONAL']);
      if (!user) return;
      const b = await parseBody(req);
      const workout = ownsWorkout(user, Number(b.treino_id));
      if (!workout) return json(res, 404, { erro: 'Treino não encontrado ou sem permissão.' });
      const antigo = Number(b.antigo_exercicio_id);
      const novo = Number(b.novo_exercicio_id);
      if (!antigo || !novo || antigo === novo) return json(res, 400, { erro: 'Selecione exercícios diferentes.' });
      if (!Array.isArray(workout.exercicios) || !workout.exercicios.some(e => Number(e.exercicio_id) === antigo)) return json(res, 400, { erro: 'O exercício atual não está no treino.' });
      if (!read('exercises').some(e => Number(e.id) === novo)) return json(res, 404, { erro: 'Novo exercício não encontrado.' });
      const workouts = read('workouts');
      const idx = workouts.findIndex(w => Number(w.id) === Number(workout.id));
      workouts[idx].exercicios = workouts[idx].exercicios.map(e => Number(e.exercicio_id) === antigo ? { ...e, exercicio_id: novo } : e);
      workouts[idx].atualizado_em = new Date().toISOString();
      write('workouts', workouts);
      const substitutions = read('substitutions');
      const item = {
        id: nextId('substitutions'),
        treino_id: workout.id,
        aluno_id: workout.aluno_id,
        profissional_id: workout.profissional_id,
        antigo_exercicio_id: antigo,
        novo_exercicio_id: novo,
        motivo: cleanText(b.motivo, 800),
        criado_por_id: user.id,
        criado_em: new Date().toISOString()
      };
      substitutions.push(item);
      write('substitutions', substitutions);
      return json(res, 200, { substituicao: item });
    }

    if (url === '/api/substitutions' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const substitutions = read('substitutions');
      if (user.tipo === 'ALUNO') return json(res, 200, { substituicoes: substitutions.filter(x => Number(x.aluno_id) === Number(user.id)) });
      return json(res, 200, { substituicoes: substitutions.filter(x => Number(x.profissional_id) === Number(user.id)) });
    }

    // Dashboard
    if (url === '/api/dashboard' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const workouts = read('workouts');
      const completions = read('completions');
      const proofs = read('proofs');
      const substitutions = read('substitutions');

      if (user.tipo === 'ALUNO') {
        const ws = workouts.filter(w => Number(w.aluno_id) === Number(user.id));
        const cs = completions.filter(c => Number(c.aluno_id) === Number(user.id));
        const ps = proofs.filter(p => Number(p.aluno_id) === Number(user.id));
        const now = new Date();
        const startWeek = new Date(now);
        startWeek.setHours(0, 0, 0, 0);
        startWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const weekCount = cs.filter(c => new Date(c.concluido_em) >= startWeek).length;
        const monthCount = cs.filter(c => new Date(c.concluido_em) >= startMonth).length;
        return json(res, 200, {
          tipo: 'ALUNO',
          resumo: { treinos: ws.length, concluidos: cs.length, comprovantes: ps.length, semana: weekCount, mes: monthCount, substituicoes: substitutions.filter(s => Number(s.aluno_id) === Number(user.id)).length },
          profissional: safeUser(linkedProfessional(user.id))
        });
      }

      const students = linkedStudents(user.id);
      const ws = workouts.filter(w => Number(w.profissional_id) === Number(user.id));
      const ownWorkoutIds = new Set(ws.map(w => Number(w.id)));
      const ps = proofs.filter(p => ownWorkoutIds.has(Number(p.treino_id)));
      return json(res, 200, {
        tipo: 'PROFISSIONAL',
        resumo: { alunos: students.length, treinos: ws.length, comprovantes: ps.length, substituicoes: substitutions.filter(s => Number(s.profissional_id) === Number(user.id)).length },
        alunos: students.map(safeUser)
      });
    }

    // Resumo individual do aluno para o profissional
    if (url.startsWith('/api/students/') && url.endsWith('/summary') && method === 'GET') {
      const user = requireAuth(req, res, ['PROFISSIONAL']);
      if (!user) return;
      const parts = url.split('/');
      const alunoId = Number(parts[3]);
      if (!canProfessionalAccessStudent(user, alunoId)) return json(res, 403, { erro: 'Aluno não vinculado a você.' });
      const student = read('users').find(x => Number(x.id) === alunoId && x.tipo === 'ALUNO');
      if (!student) return json(res, 404, { erro: 'Aluno não encontrado.' });
      const workouts = read('workouts').filter(w => Number(w.aluno_id) === alunoId && Number(w.profissional_id) === Number(user.id));
      const completions = read('completions').filter(c => Number(c.aluno_id) === alunoId && workouts.some(w => Number(w.id) === Number(c.treino_id)));
      const proofs = read('proofs').filter(p => Number(p.aluno_id) === alunoId && workouts.some(w => Number(w.id) === Number(p.treino_id)));
      const requirements = read('requirements').filter(r => Number(r.aluno_id) === alunoId);
      return json(res, 200, { aluno: safeUser(student), resumo: { treinos: workouts.length, concluidos: completions.length, comprovantes: proofs.length, requisitos: requirements.length } });
    }

    return json(res, 404, { erro: 'Rota não encontrada.' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { erro: error.message || 'Erro interno.' });
  }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith('/api/')) {
    return api(req, res, pathname + requestUrl.search);
  }

  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const full = path.join(UPLOAD_DIR, filename);
    return sendFile(res, full, mime(full), { 'Cache-Control': 'public, max-age=3600' });
  }

  let requested = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const full = path.resolve(PUBLIC_DIR, requested);
  const publicRoot = path.resolve(PUBLIC_DIR);
  if (!full.startsWith(publicRoot)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), mime('index.html'));
  }
  return sendFile(res, full, mime(full));
});

server.listen(PORT, HOST, () => {
  console.log(`PontoFit rodando em http://127.0.0.1:${PORT}`);
  console.log(`Rede local: http://localhost:${PORT}`);
});
