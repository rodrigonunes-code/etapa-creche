# Importacao SIEC 2026

Esta pasta contem dados pessoais e esta ignorada pelo Git.
Nao envie estes arquivos para GitHub ou Vercel.

Arquivos:

- `importavel_siec_2026.json`: 3.755 registros tratados e prontos para importacao.
- `resumo_importacao_siec_2026.json`: resumo tecnico da preparacao.
- `importar-siec-firebase.mjs`: script local de importacao para Firestore.
- `resultado_importacao_siec_2026.json`: gerado apos importar.

## O que foi tratado

- CPFs com zeros faltando foram normalizados quando a correcao resultou em CPF valido.
- Registros duplicados foram reduzidos para uma unica inscricao, mantendo a maior pontuacao.
- Criancas fora da faixa de nascimento do edital foram removidas.
- Bairros divergentes foram conferidos pelo CEP; quando o CEP apontou bairro valido, o bairro foi corrigido.
- Bairros fora do edital apos consulta ao CEP foram removidos.

## Antes de importar

Use uma conta que ja consiga entrar na area administrativa do sistema.
O script faz login nessa conta e grava como administrador, respeitando as regras do Firebase.

As regras do Firestore precisam permitir escrita administrativa em:

- `registrations`
- `registrationCpfIndex`

## Simular sem gravar

```powershell
cd "C:\Users\RODRIGO\Desktop\Etapa creche\importacao-siec"
node importar-siec-firebase.mjs
```

## Informar o login administrativo

```powershell
$env:FIREBASE_ADMIN_EMAIL="seu-email-admin"
$env:FIREBASE_ADMIN_PASSWORD="sua-senha-admin"
```

## Testar gravando poucos registros

```powershell
cd "C:\Users\RODRIGO\Desktop\Etapa creche\importacao-siec"
node importar-siec-firebase.mjs --limit=5 --write
```

Confira no Firebase se os documentos apareceram em:

- `registrations`
- `registrationCpfIndex`

## Importar todos

```powershell
cd "C:\Users\RODRIGO\Desktop\Etapa creche\importacao-siec"
node importar-siec-firebase.mjs --write
```

Depois abra o sistema publicado e verifique a area de Administracao.
