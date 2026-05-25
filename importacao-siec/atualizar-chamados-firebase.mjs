import fs from "node:fs/promises";

const firebaseConfig = {
  apiKey: "AIzaSyAFzYjDtueM552XU18LbZWzYGpEQNIoxWA",
  projectId: "inscricaocreche-e4fbb",
};

const STATUS_CALLED = "Convocado para matrícula";
const inputPath = new URL("./protocolos_alunos_chamados.json", import.meta.url);
const outputPath = new URL("./resultado_atualizacao_chamados_2026.json", import.meta.url);
const shouldWrite = process.argv.includes("--write");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const registrationsUrl = `${firestoreBase}/registrations`;

function asString(value) {
  return { stringValue: String(value ?? "") };
}

function asInteger(value) {
  return { integerValue: String(Number(value) || 0) };
}

function asTimestamp(value) {
  return { timestampValue: new Date(value).toISOString() };
}

function getStringField(fields, key) {
  return fields?.[key]?.stringValue || "";
}

function getMapStringField(fields, mapKey, key) {
  return fields?.[mapKey]?.mapValue?.fields?.[key]?.stringValue || "";
}

function getDocumentId(documentName) {
  return documentName.split("/").pop();
}

function getProtocol(document) {
  return (
    getStringField(document.fields, "protocol") ||
    getMapStringField(document.fields, "data", "protocol")
  );
}

function getStatus(document) {
  return (
    getStringField(document.fields, "status") ||
    getMapStringField(document.fields, "data", "status")
  );
}

async function signInAdmin() {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      [
        "Informe o login administrativo no PowerShell antes de rodar:",
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

async function fetchAllRegistrations(idToken) {
  const documents = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ key: apiKey, pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${registrationsUrl}?${params.toString()}`, {
      headers: { authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Falha ao ler inscrições: ${response.status} ${response.statusText}: ${details}`);
    }

    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return documents;
}

async function updateCalledStatus(document, idToken, calledAt) {
  const query = new URLSearchParams({
    key: apiKey,
    "updateMask.fieldPaths": "status",
  });
  query.append("updateMask.fieldPaths", "requeueOrder");
  query.append("updateMask.fieldPaths", "requeuedAt");
  query.append("updateMask.fieldPaths", "calledAt");
  query.append("updateMask.fieldPaths", "data.status");
  query.append("updateMask.fieldPaths", "data.requeueOrder");
  query.append("updateMask.fieldPaths", "data.requeuedAt");
  query.append("updateMask.fieldPaths", "data.calledAt");

  const fields = {
    status: asString(STATUS_CALLED),
    requeueOrder: asInteger(0),
    requeuedAt: asString(""),
    calledAt: asTimestamp(calledAt),
    data: {
      mapValue: {
        fields: {
          status: asString(STATUS_CALLED),
          requeueOrder: asInteger(0),
          requeuedAt: asString(""),
          calledAt: asString(calledAt),
        },
      },
    },
  };

  const documentUrl = document.name.startsWith("http")
    ? document.name
    : `https://firestore.googleapis.com/v1/${document.name}`;

  const response = await fetch(`${documentUrl}?${query.toString()}`, {
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
}

async function main() {
  const protocolInput = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const protocols = [...new Set(protocolInput.map((item) => String(item).trim()).filter(Boolean))];
  const selectedProtocols = limit > 0 ? protocols.slice(0, limit) : protocols;
  const protocolSet = new Set(selectedProtocols);

  console.log(`Protocolos na planilha: ${protocolInput.length}`);
  console.log(`Protocolos unicos: ${protocols.length}`);
  console.log(`Protocolos selecionados: ${selectedProtocols.length}`);
  console.log(`Status destino: ${STATUS_CALLED}`);
  console.log(`Modo: ${shouldWrite ? "GRAVAR NO FIREBASE" : "SIMULACAO"}`);

  const idToken = await signInAdmin();
  const documents = await fetchAllRegistrations(idToken);
  const matched = documents.filter((document) => protocolSet.has(getProtocol(document)));
  const matchedProtocols = new Set(matched.map(getProtocol));
  const missing = selectedProtocols.filter((protocol) => !matchedProtocols.has(protocol));
  const alreadyCalled = matched.filter((document) => getStatus(document) === STATUS_CALLED);
  const toUpdate = matched.filter((document) => getStatus(document) !== STATUS_CALLED);

  console.log(`Inscricoes no Firebase: ${documents.length}`);
  console.log(`Protocolos encontrados: ${matchedProtocols.size}`);
  console.log(`Documentos encontrados: ${matched.length}`);
  console.log(`Ja estavam convocados: ${alreadyCalled.length}`);
  console.log(`Documentos para atualizar: ${toUpdate.length}`);
  console.log(`Protocolos nao encontrados: ${missing.length}`);

  const result = {
    generatedAt: new Date().toISOString(),
    status: STATUS_CALLED,
    inputProtocols: protocolInput.length,
    uniqueProtocols: protocols.length,
    selectedProtocols: selectedProtocols.length,
    firebaseRegistrations: documents.length,
    matchedProtocols: matchedProtocols.size,
    matchedDocuments: matched.length,
    alreadyCalled: alreadyCalled.length,
    toUpdate: toUpdate.length,
    updated: 0,
    missing,
    errors: [],
  };

  if (!shouldWrite) {
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
    console.log("Nenhum dado foi gravado. Rode com --write para atualizar.");
    return;
  }

  const calledAt = new Date().toISOString();
  for (const document of toUpdate) {
    try {
      await updateCalledStatus(document, idToken, calledAt);
      result.updated += 1;
      if (result.updated % 100 === 0) {
        console.log(`Atualizados: ${result.updated}/${toUpdate.length}`);
      }
    } catch (error) {
      result.errors.push({
        documentId: getDocumentId(document.name),
        protocol: getProtocol(document),
        error: error.message,
      });
      console.error(`Erro em ${getProtocol(document)}: ${error.message}`);
    }
  }

  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(`Atualizacao concluida. Atualizados: ${result.updated}. Erros: ${result.errors.length}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
