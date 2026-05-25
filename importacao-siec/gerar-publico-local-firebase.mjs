import fs from "node:fs/promises";

const firebaseConfig = {
  apiKey: "AIzaSyAFzYjDtueM552XU18LbZWzYGpEQNIoxWA",
  projectId: "inscricaocreche-e4fbb",
};

const STATUS_WAITING = "Aguardando chamamento";
const STATUS_CALLED = "Convocado para matrícula";
const STATUS_REWRITTEN = "Aguardando chamamento (reescrito)";
const WAITING_STATUSES = [STATUS_WAITING, STATUS_REWRITTEN];
const importPath = new URL("./importavel_siec_2026.json", import.meta.url);
const calledProtocolsPath = new URL("./protocolos_alunos_chamados.json", import.meta.url);
const shouldWrite = process.argv.includes("--write");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const publicDashboardUrl = `${firestoreBase}/publicDashboard/summary`;
const publicProtocolUrl = `${firestoreBase}/publicProtocolLookup`;

function asString(value) {
  return { stringValue: String(value ?? "") };
}

function asInteger(value) {
  return { integerValue: String(Number(value) || 0) };
}

function asTimestamp(value) {
  return { timestampValue: new Date(value).toISOString() };
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? asInteger(value) : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])),
      },
    };
  }
  return asString(value);
}

function getStatus(item) {
  return item.status || STATUS_WAITING;
}

function getQueueGroup(item) {
  return getStatus(item) === STATUS_REWRITTEN ? 1 : 0;
}

function sortRegistrations(list) {
  return [...list].sort((a, b) => {
    const queueA = getQueueGroup(a);
    const queueB = getQueueGroup(b);
    if (queueA !== queueB) return queueA - queueB;
    if (queueA === 1) {
      const requeueA = Number(a.requeueOrder) || Number.MAX_SAFE_INTEGER;
      const requeueB = Number(b.requeueOrder) || Number.MAX_SAFE_INTEGER;
      if (requeueA !== requeueB) return requeueA - requeueB;
    }
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((a.birthDate || "") !== (b.birthDate || "")) return String(a.birthDate || "").localeCompare(String(b.birthDate || ""));
    return String(a.createdAtIso || a.createdAt || "").localeCompare(String(b.createdAtIso || b.createdAt || ""));
  });
}

function groupKey(item) {
  return `${item.region || ""}::${item.ageGroup || ""}`;
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toLocaleUpperCase("pt-BR")}.`)
    .join(" ");
}

function addSummary(summary, label, item) {
  if (!summary[label]) summary[label] = { total: 0, called: 0, waiting: 0 };
  summary[label].total += 1;
  if (getStatus(item) === STATUS_CALLED) summary[label].called += 1;
  if (WAITING_STATUSES.includes(getStatus(item))) summary[label].waiting += 1;
}

async function signInAdmin() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      [
        "Informe o login administrativo no PowerShell:",
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
  if (!response.ok) throw new Error(`Falha no login administrativo: ${await response.text()}`);
  return (await response.json()).idToken;
}

async function patchDocument(url, data, idToken) {
  const response = await fetch(`${url}?key=${apiKey}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])),
    }),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
}

async function main() {
  console.log(`Modo: ${shouldWrite ? "GRAVAR PUBLICAÇÃO NO FIREBASE" : "SIMULAÇÃO"}`);
  const calledProtocols = new Set(JSON.parse(await fs.readFile(calledProtocolsPath, "utf8")));
  const imported = JSON.parse(await fs.readFile(importPath, "utf8"));
  const registrations = imported.map((item) => ({
    ...item,
    status: calledProtocols.has(item.protocol) ? STATUS_CALLED : STATUS_WAITING,
    requeueOrder: 0,
  }));
  const selected = limit > 0 ? registrations.slice(0, limit) : registrations;
  const series = {};
  const regions = {};
  const calledByGroup = {};
  const positionByProtocol = {};

  registrations.forEach((item) => {
    const key = groupKey(item);
    if (!calledByGroup[key]) calledByGroup[key] = 0;
    if (getStatus(item) === STATUS_CALLED) calledByGroup[key] += 1;
    addSummary(series, item.ageGroup || "Não informado", item);
    addSummary(regions, item.region || "Não informado", item);
  });

  const grouped = registrations.reduce((groups, item) => {
    const key = groupKey(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  Object.values(grouped).forEach((items) => {
    sortRegistrations(items).forEach((item, index) => {
      positionByProtocol[item.protocol] = index + 1;
    });
  });

  const calledImported = registrations.filter((item) => getStatus(item) === STATUS_CALLED).length;
  console.log(`Inscrições locais: ${registrations.length}`);
  console.log(`Protocolos chamados na planilha: ${calledProtocols.size}`);
  console.log(`Chamados encontrados na base importada: ${calledImported}`);
  console.log(`Protocolos públicos a gerar: ${selected.length}`);

  if (!shouldWrite) {
    console.log("Nenhum dado foi gravado. Rode com --write para publicar.");
    return;
  }

  const idToken = await signInAdmin();
  const updatedAtIso = new Date().toISOString();
  await patchDocument(
    publicDashboardUrl,
    {
      updatedAt: updatedAtIso,
      updatedAtIso,
      series,
      regions,
    },
    idToken
  );

  let written = 0;
  for (const item of selected) {
    const key = groupKey(item);
    await patchDocument(
      `${publicProtocolUrl}/${encodeURIComponent(item.protocol)}`,
      {
        protocol: item.protocol,
        childInitials: getInitials(item.childName),
        birthDate: item.birthDate || "",
        region: item.region || "",
        ageGroup: item.ageGroup || "",
        status: getStatus(item),
        classificationPosition: positionByProtocol[item.protocol] || 0,
        calledInGroup: calledByGroup[key] || 0,
        updatedAt: updatedAtIso,
        updatedAtIso,
      },
      idToken
    );
    written += 1;
    if (written % 250 === 0) console.log(`Protocolos publicados: ${written}/${selected.length}`);
  }

  console.log(`Publicação concluída. Protocolos publicados: ${written}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
