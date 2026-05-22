# Sistema de inscrições - Etapa Creche 2026

Aplicação local para registrar crianças de 0 a 3 anos, calcular pontuação conforme o Edital nº 384/2025 e exibir a classificação geral.

## Como usar

Abra `index.html` no navegador.

Os dados ficam salvos no `localStorage` do navegador usado na inscrição. O botão `CSV` exporta a classificação completa.

Use o menu `Administração` para acessar dados sensíveis, dashboard, relatórios e atualização da situação dos inscritos. Senha local inicial: `creche2026`.

## Regras implementadas

- Validação de CPF da criança e do responsável.
- Apenas uma inscrição por CPF de criança.
- Página pública para novas inscrições e área administrativa separada.
- Situação inicial automática: `Aguardando chamamento`.
- Atualização manual da situação para `Convocado para matrícula` na área administrativa.
- Dashboard administrativo com total de inscrições, aguardando chamamento, convocados, média e maior pontuação.
- Relatórios gerais por série e quadrante.
- Consulta automática de endereço pelo CEP, com rua, bairro e cidade bloqueados para edição, além de número e complemento em campos separados.
- Cadastro da composição familiar, com campos para mãe e pai, duas mães, dois pais ou responsável único, e indicação de quem está preenchendo a inscrição.
- Tela de conferência antes da confirmação, declaração obrigatória de veracidade e geração de comprovante com protocolo em destaque.
- Série calculada automaticamente pela data de nascimento, usando a data de corte de 31/03/2026: Berçário I, Berçário II, Maternal I ou Maternal II.
- Quadrante calculado automaticamente pelo bairro informado: Nordeste, Noroeste, Sudeste ou Sudoeste.
- Bloqueio para crianças nascidas antes de 01/04/2022 ou após 12/11/2025, conforme público-alvo e regra de nascimento do edital.
- Pontuação conforme os critérios do item 5.1.
- Desempate por maior idade da criança.
- Filtro da classificação por busca, quadrante e série.
