const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const LEGACY = path.join(ROOT, 'legacy_data', 'dados');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

function readLegacy(name) {
  const file = path.join(LEGACY, name);
  if (!fs.existsSync(file)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function write(name, data) {
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(data, null, 2), 'utf8');
}
function mapExercises(rows) {
  return rows.map(x => ({
    id: Number(x.id),
    nome: x.nome || '',
    musculo: x.musculo || '',
    descricao: x.descricao || '',
    instrucoes: x.instrucoes || ''
  }));
}
function mapLinks(rows) {
  return rows.map(x => ({
    id: Number(x.id),
    aluno_id: Number(x.aluno_id),
    profissional_id: Number(x.profissional_id),
    codigo_profissional: x.codigo_profissional || '',
    ativo: x.ativo !== false,
    criado_em: x.criado_em || new Date().toISOString()
  }));
}
function mapWorkouts(rows) {
  const exerciseRows = readLegacy('treino_exercicios.json');
  return rows.map(w => ({
    id: Number(w.id),
    aluno_id: Number(w.aluno_id),
    profissional_id: Number(w.profissional_id || 0),
    titulo: w.titulo || 'Treino',
    dia_semana: String(w.dia_semana || '').toUpperCase(),
    observacoes: w.observacoes || '',
    exercicios: exerciseRows.filter(e => Number(e.treino_id) === Number(w.id)).map(e => ({
      exercicio_id: Number(e.exercicio_id),
      series: String(e.series || ''),
      repeticoes: String(e.repeticoes || ''),
      carga: String(e.carga || ''),
      descanso: String(e.descanso || '')
    })),
    criado_em: w.criado_em || new Date().toISOString(),
    atualizado_em: w.atualizado_em || w.criado_em || new Date().toISOString()
  }));
}
function mapCompletions(rows) {
  return rows.map(x => ({
    id: Number(x.id),
    treino_id: Number(x.treino_id),
    aluno_id: Number(x.aluno_id),
    concluido_em: x.concluido_em || new Date().toISOString()
  }));
}
function mapProofs(rows) {
  return rows.map(x => ({
    id: Number(x.id),
    treino_id: Number(x.treino_id),
    aluno_id: Number(x.aluno_id),
    arquivo: x.foto || x.arquivo || '',
    enviado_em: x.enviado_em || new Date().toISOString()
  }));
}
function mapRequirements(rows) {
  return rows.map(x => ({
    id: Number(x.id),
    aluno_id: Number(x.aluno_id),
    profissional_id: x.profissional_id ? Number(x.profissional_id) : null,
    tipo: x.tipo || 'REQUISITO_ALUNO',
    requisito: x.requisito || '',
    exercicios_evitar: x.exercicios_evitar || '',
    instrucao: x.instrucao || '',
    observacoes: x.observacoes || '',
    criado_por_id: Number(x.criado_por_id || x.aluno_id),
    criado_em: x.criado_em || new Date().toISOString(),
    ativo: x.ativo !== false
  }));
}
function mapSubstitutions(rows) {
  return rows.map(x => ({
    id: Number(x.id),
    treino_id: Number(x.treino_id),
    aluno_id: Number(x.aluno_id),
    profissional_id: x.profissional_id ? Number(x.profissional_id) : null,
    antigo_exercicio_id: Number(x.antigo_exercicio_id || x.exercicio_antigo_id || 0),
    novo_exercicio_id: Number(x.novo_exercicio_id || x.exercicio_novo_id || 0),
    motivo: x.motivo || x.motivo_substituicao || '',
    criado_por_id: Number(x.criado_por_id || x.aluno_id),
    criado_em: x.criado_em || new Date().toISOString()
  }));
}

if (!fs.existsSync(LEGACY)) {
  console.error('Pasta não encontrada:', LEGACY);
  console.error('Crie legacy_data/dados e copie para lá a pasta dados do PontoFit Python.');
  process.exit(1);
}

const users = readLegacy('usuarios.json');
const mappedUsers = users.map(x => ({
  id: Number(x.id),
  nome: x.nome || '',
  email: String(x.email || '').toLowerCase(),
  senha_legacy_bcrypt: x.senha || '',
  tipo: x.tipo || 'ALUNO',
  objetivo: x.objetivo || '',
  codigo_profissional: x.codigo_profissional || '',
  criado_em: x.criado_em || new Date().toISOString(),
  precisa_redefinir_senha: true
}));

write('users_legacy_import.json', mappedUsers);
write('exercises.json', mapExercises(readLegacy('exercicios.json')));
write('links.json', mapLinks(readLegacy('aluno_profissional.json')));
write('workouts.json', mapWorkouts(readLegacy('treinos.json')));
write('completions.json', mapCompletions(readLegacy('treinos_realizados.json')));
write('proofs.json', mapProofs(readLegacy('comprovacoes.json')));
write('requirements.json', mapRequirements(readLegacy('requisitos_treino.json')));
write('substitutions.json', mapSubstitutions(readLegacy('substituicoes.json')));

console.log('Migração concluída para os dados não sensíveis.');
console.log('IMPORTANTE: os usuários foram salvos em users_legacy_import.json com seus hashes bcrypt antigos.');
console.log('Por segurança, a versão JavaScript usa scrypt nativo e não reaproveita diretamente esses hashes.');
console.log('Depois da migração, crie novas senhas pelo cadastro/edição de perfil ou faça um fluxo de redefinição.');
