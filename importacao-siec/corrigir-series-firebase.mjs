import fs from "node:fs/promises";

const firebaseConfig = {
  apiKey: "AIzaSyAFzYjDtueM552XU18LbZWzYGpEQNIoxWA",
  projectId: "inscricaocreche-e4fbb",
};

const inputPath = new URL("./importavel_siec_2026.json", import.meta.url);
const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;
const shouldWrite = process.argv.includes("--write");
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const registrationsUrl = `${firestoreBase}/registrations`;

function asString(value) {
  return { stringValue: String(value ?? "") };
}

function normalizeAgeGroup(value) {
  return String(value ?? "")
    .replaceAll("Ber??rio I", "Berçário I")
    .replaceAll("Ber??rio II", "Berçário II")
    .replaceAll("Berçario I", "Berçário I")
    .replaceAll("Berçario II", "Berçário II");
}

async function signInAdmin() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      [
        "Informe novamente o login administrativo no PowerShell:",
        '$env:FIREBASE_ADMIN_EMAIL="seu-email-admin"',
        '$env:FIREBASE_ADMIN_PASSWORD="sua-senha-admin"',
      ].join("\n")
    );
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha no login administrativo: ${response.status} ${response.statusText}: ${details}`);
  }

  const auth = await response.json();
  return auth.idToken;
}

async function patchAgeGroup(childCpf, ageGroup, idToken) {
  const query = new URLSearchParams({
    key: apiKey,
    "updateMask.fieldPaths": "ageGroup",
  });
  query.append("updateMask.fieldPaths", "data.ageGroup");

  const response = await fetch(`${registrationsUrl}/${childCpf}?${query.toString()}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: {
        ageGroup: asString(ageGroup),
        data: {
          mapValue: {
            fields: {
              ageGroup: asString(ageGroup),
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${details}`);
  }
}

async function main() {
  const records = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const corrections = records
    .map((item) => ({
      childCpf: item.childCpf,
      from: item.ageGroup,
      to: normalizeAgeGroup(item.ageGroup),
    }))
    .filter((item) => item.from !== item.to);

  const byCpf = new Map(corrections.map((item) => [item.childCpf, item]));
  const selected = [...byCpf.values()];

  console.log(`Registros com serie para corrigir: ${selected.length}`);
  console.log(`Modo: ${shouldWrite ? "GRAVAR NO FIREBASE" : "SIMULACAO"}`);

  if (!shouldWrite) {
    console.log("Nenhum dado foi gravado. Rode com --write para corrigir no Firebase.");
    console.log("Exemplo: node corrigir-series-firebase.mjs --write");
    return;
  }

  const idToken = await signInAdmin();
  let updated = 0;
  const errors = [];

  for (const item of selected) {
    try {
      await patchAgeGroup(item.childCpf, item.to, idToken);
      updated += 1;
      if (updated % 100 === 0) console.log(`Corrigidos: ${updated}/${selected.length}`);
    } catch (error) {
      errors.push({ childCpf: item.childCpf, from: item.from, to: item.to, error: error.message });
      console.error(`Erro ao corrigir ${item.childCpf}: ${error.message}`);
    }
  }

  await fs.writeFile(
    new URL("./resultado_correcao_series_2026.json", import.meta.url),
    JSON.stringify({ updated, errors }, null, 2),
    "utf8"
  );

  console.log(`Correcao concluida. Corrigidos: ${updated}. Erros: ${errors.length}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
