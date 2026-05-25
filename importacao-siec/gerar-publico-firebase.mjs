const firebaseConfig = {
  apiKey: "AIzaSyAFzYjDtueM552XU18LbZWzYGpEQNIoxWA",
  projectId: "inscricaocreche-e4fbb",
};

const STATUS_CALLED = "Convocado para matrícula";
const STATUS_REWRITTEN = "Aguardando chamamento (reescrito)";
const WAITING_STATUSES = ["Aguardando chamamento", STATUS_REWRITTEN];
const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;
const shouldWrite = process.argv.includes("--write");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const registrationsUrl = `${firestoreBase}/registrations`;
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

function fromFirestoreValue(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue) || 0;
  if ("doubleValue" in value) return Number(value.doubleValue) || 0;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fromFirestoreValue(item)])
    );
  }
  return undefined;
}

function getStatus(item) {
  return item.status || item.data?.status || "Aguardando chamamento";
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

function normalizeDocument(document) {
  const item = Object.fromEntries(
    Object.entries(document.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])
  );
  const data = item.data && typeof item.data === "object" ? item.data : {};
  return {
    ...data,
    ...item,
    documentName: document.name,
    firebaseId: document.name.split("/").pop(),
    childName: item.childName || data.childName || "",
    birthDate: item.birthDate || data.birthDate || "",
    ageGroup: item.ageGroup || data.ageGroup || "",
    region: item.region || data.region || "",
    score: Number(item.score ?? data.score) || 0,
    status: item.status || data.status || "Aguardando chamamento",
    protocol: item.protocol || data.protocol || "",
    requeueOrder: Number(item.requeueOrder ?? data.requeueOrder) || 0,
  };
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

async function fetchAllRegistrations(idToken) {
  const documents = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ key: apiKey, pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${registrationsUrl}?${params.toString()}`, {
      headers: { authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) throw new Error(`Falha ao ler inscrições: ${await response.text()}`);
    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return documents.map(normalizeDocument).filter((item) => item.protocol);
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
  const idToken = await signInAdmin();
  const registrations = await fetchAllRegistrations(idToken);
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

  console.log(`Inscrições lidas: ${registrations.length}`);
  console.log(`Protocolos públicos a gerar: ${selected.length}`);
  console.log(`Séries: ${Object.keys(series).length}`);
  console.log(`Quadrantes: ${Object.keys(regions).length}`);

  if (!shouldWrite) {
    console.log("Nenhum dado foi gravado. Rode com --write para publicar.");
    return;
  }

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
