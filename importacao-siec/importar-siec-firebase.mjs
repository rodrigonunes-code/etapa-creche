import fs from "node:fs/promises";

const firebaseConfig = {
  apiKey: "AIzaSyAFzYjDtueM552XU18LbZWzYGpEQNIoxWA",
  authDomain: "inscricaocreche-e4fbb.firebaseapp.com",
  projectId: "inscricaocreche-e4fbb",
  storageBucket: "inscricaocreche-e4fbb.firebasestorage.app",
  messagingSenderId: "183672646035",
  appId: "1:183672646035:web:db0d8ef0e114888724a066",
  measurementId: "G-X8R5Z873EL",
};

const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;
const inputPath = new URL("./importavel_siec_2026.json", import.meta.url);
const outputPath = new URL("./resultado_importacao_siec_2026.json", import.meta.url);
const shouldWrite = process.argv.includes("--write");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const registrationsUrl = `${firestoreBase}/registrations`;
const cpfIndexUrl = `${firestoreBase}/registrationCpfIndex`;

function asString(value) {
  return { stringValue: String(value ?? "") };
}

function asInteger(value) {
  return { integerValue: String(Number(value) || 0) };
}

function asBoolean(value) {
  return { booleanValue: Boolean(value) };
}

function asTimestamp(value) {
  const iso = value ? new Date(value).toISOString() : new Date().toISOString();
  return { timestampValue: iso };
}

function normalizeAgeGroup(value) {
  return String(value ?? "")
    .replaceAll("Ber??rio I", "Berçário I")
    .replaceAll("Ber??rio II", "Berçário II")
    .replaceAll("Berçario I", "Berçário I")
    .replaceAll("Berçario II", "Berçário II");
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return asBoolean(value);
  if (typeof value === "number") {
    return Number.isInteger(value) ? asInteger(value) : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return value.length
      ? { arrayValue: { values: value.map(toFirestoreValue) } }
      : { arrayValue: {} };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])
        ),
      },
    };
  }
  return asString(value);
}

function registrationFields(item) {
  const normalizedItem = {
    ...item,
    ageGroup: normalizeAgeGroup(item.ageGroup),
    data: item.data
      ? {
          ...item.data,
          ageGroup: normalizeAgeGroup(item.data.ageGroup),
        }
      : item.data,
  };

  return {
    ...Object.fromEntries(Object.entries(normalizedItem).map(([key, value]) => [key, toFirestoreValue(value)])),
    childCpf: asString(normalizedItem.childCpf),
    childName: asString(normalizedItem.childName),
    birthDate: asString(normalizedItem.birthDate),
    ageGroup: asString(normalizedItem.ageGroup),
    region: asString(normalizedItem.region),
    neighborhood: asString(normalizedItem.neighborhood),
    score: asInteger(normalizedItem.score),
    status: asString(normalizedItem.status),
    requeueOrder: asInteger(normalizedItem.requeueOrder),
    createdAt: asTimestamp(normalizedItem.createdAtIso),
    createdAtIso: asString(normalizedItem.createdAtIso),
    importedFromLegacy: asBoolean(true),
  };
}

async function signInAdmin() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      [
        "Para gravar, informe o login administrativo nestas variaveis de ambiente:",
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

async function firestorePatch(url, fields, idToken) {
  const response = await fetch(`${url}?key=${apiKey}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${details}`);
  }

  return response.json();
}

async function main() {
  const records = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const selected = limit > 0 ? records.slice(0, limit) : records;

  console.log(`Registros carregados: ${records.length}`);
  console.log(`Registros selecionados: ${selected.length}`);
  console.log(`Modo: ${shouldWrite ? "GRAVAR NO FIREBASE" : "SIMULACAO"}`);

  if (!shouldWrite) {
    console.log("Nenhum dado foi gravado. Rode com --write para importar.");
    console.log("Exemplo de teste: node importar-siec-firebase.mjs --limit=5 --write");
    return;
  }

  const idToken = await signInAdmin();
  let imported = 0;
  const errors = [];

  for (const item of selected) {
    try {
      await firestorePatch(`${registrationsUrl}/${item.childCpf}`, registrationFields(item), idToken);
      await firestorePatch(
        `${cpfIndexUrl}/${item.childCpf}`,
        {
          exists: asBoolean(true),
          importedFromLegacy: asBoolean(true),
          protocol: asString(item.protocol),
          createdAt: asTimestamp(new Date().toISOString()),
        },
        idToken
      );
      imported += 1;
      if (imported % 100 === 0) console.log(`Importados: ${imported}/${selected.length}`);
    } catch (error) {
      errors.push({ protocol: item.protocol, childCpf: item.childCpf, error: error.message });
      console.error(`Erro em ${item.protocol} (${item.childCpf}): ${error.message}`);
    }
  }

  await fs.writeFile(outputPath, JSON.stringify({ imported, errors }, null, 2), "utf8");
  console.log(`Importacao concluida. Importados: ${imported}. Erros: ${errors.length}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
