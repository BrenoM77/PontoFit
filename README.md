# PontoFit — JavaScript (site + app/PWA)

Versão refeita do zero para reproduzir as funcionalidades do projeto Python em uma aplicação web responsiva.

## Tecnologias

- Node.js 18+
- JavaScript no servidor
- JavaScript no navegador
- HTML5
- CSS3 responsivo
- JSON para armazenamento local
- `crypto.scryptSync` do próprio Node para hash de senha
- PWA para instalar como aplicativo

Não usa Java, Maven, Tomcat, Flask ou frameworks obrigatórios.

## Funcionalidades

### Aluno
- Cadastro e login
- Início com treino do dia
- Frequência da semana e do mês
- Meus treinos
- Dias planejados
- Status pendente/concluído
- Detalhes do treino
- Marcar treino como concluído
- Enviar comprovante por foto
- Treinos realizados
- Histórico
- Retrospectiva anual
- Pesquisa de exercícios
- Filtro por músculo
- Perfil
- Editar perfil
- Vincular, trocar e desvincular profissional
- Requisitos/orientações de treino
- Substituir exercício

### Profissional
- Cadastro com código profissional automático
- Painel com indicadores
- Meus alunos
- Resumo individual do aluno
- Criar treino para aluno selecionado
- Editar treino
- Excluir treino
- Ver detalhes do treino
- Histórico do aluno
- Comprovantes do aluno
- Requisitos e orientações
- Criar, editar, visualizar e excluir exercícios
- Perfil profissional
- Editar perfil

### PWA
A aplicação possui `manifest.webmanifest` e `service-worker.js`. Em um navegador compatível, ela pode ser instalada como aplicativo.

## Rodar no Windows

Na pasta do projeto:

```powershell
node server.js
```

Abra:

```text
http://127.0.0.1:3000
```

Ou execute `iniciar.bat`.

## GitHub

O projeto pode ser colocado no GitHub como código-fonte. Para ficar acessível publicamente, o servidor Node deve ser hospedado em um serviço que execute Node.js; GitHub Pages sozinho não executa `server.js`.

## Migração do projeto Python

Copie a pasta `dados` antiga para:

```text
legacy_data/dados
```

Depois execute:

```powershell
node migrar_dados.js
```

Os dados de treinos, exercícios, vínculos, conclusões, comprovantes, requisitos e substituições são convertidos. Os hashes de senha antigos são preservados separadamente por segurança, mas a autenticação desta versão usa `scrypt` nativo do Node. Portanto, as senhas antigas precisam ser redefinidas/cadastradas novamente.

## Observação sobre requisitos de treino

A tela foi desenhada para registrar apenas informações necessárias à adaptação do treinamento. Evite inserir diagnóstico, CID ou informações médicas que não sejam necessárias para o planejamento.
