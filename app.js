import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

(function () {
  const REGISTRATIONS_COLLECTION = "registrations";
  const CPF_INDEX_COLLECTION = "registrationCpfIndex";
  const REFERENCE_DATE = "2026-03-31";
  const PUBLICATION_DATE = "2025-11-12";
  const MIN_BIRTH_DATE = "2022-04-01";
  const STATUS_WAITING = "Aguardando chamamento";
  const STATUS_CALLED = "Convocado para matrícula";
  const STATUS_NO_SHOW = "Convocado/Não compareceu no prazo";
  const STATUS_REWRITTEN = "Aguardando chamamento (reescrito)";
  const STATUS_OPTIONS = [STATUS_WAITING, STATUS_CALLED, STATUS_NO_SHOW, STATUS_REWRITTEN];
  const WAITING_STATUSES = [STATUS_WAITING, STATUS_REWRITTEN];
  const firebaseConfig = {
    apiKey: "AIzaSyAFzYjDtueM552XU18LbZWzYGpEQNIoxWA",
    authDomain: "inscricaocreche-e4fbb.firebaseapp.com",
    projectId: "inscricaocreche-e4fbb",
    storageBucket: "inscricaocreche-e4fbb.firebasestorage.app",
    messagingSenderId: "183672646035",
    appId: "1:183672646035:web:db0d8ef0e114888724a066",
    measurementId: "G-X8R5Z873EL",
  };

  const firebaseApp = initializeApp(firebaseConfig);
  const db = getFirestore(firebaseApp);
  const auth = getAuth(firebaseApp);

  const scoreRules = {
    incomeHalf: { label: "Renda até meio salário mínimo", points: 100 },
    incomeOne: { label: "Renda entre meio e um salário mínimo", points: 75 },
    incomeTwo: { label: "Renda entre um e dois salários mínimos", points: 60 },
    incomeThree: { label: "Renda entre dois e três salários mínimos", points: 50 },
    incomeAbove: { label: "Renda acima de três salários mínimos", points: 30 },
    cadBolsa: { label: "CadÚnico com Bolsa Família", points: 50 },
    cadNoBolsa: { label: "CadÚnico sem Bolsa Família", points: 10 },
    cras: { label: "Acompanhamento pelo CRAS", points: 50 },
    creas: { label: "Acompanhamento pelo CREAS", points: 60 },
    shelter: { label: "Unidade de acolhimento institucional", points: 80 },
  };

  const booleanRules = [
    ["twin", "Irmão gêmeo", 10],
    ["disability", "Criança com deficiência", 100],
    ["domesticViolence", "Violência doméstica com medida protetiva", 100],
    ["recyclingWorker", "Responsáveis catadores/reciclagem", 50],
    ["siblingSchool", "Irmão em idade escolar matriculado", 100],
    ["singleParent", "Mãe/pai solo", 50],
  ];

  const neighborhoodQuadrants = {
    Guajuviras: "Nordeste",
    "São José": "Nordeste",
    Olaria: "Nordeste",
    "Estância Velha": "Nordeste",
    "Marechal Rondon": "Nordeste",
    Igara: "Nordeste",
    "Mathias Velho": "Noroeste",
    "São Luis": "Noroeste",
    Harmonia: "Noroeste",
    Centro: "Noroeste",
    Niterói: "Sudeste",
    "Nossa Senhora das Graças": "Sudeste",
    "Rio Branco": "Sudoeste",
    Fátima: "Sudoeste",
    "Mato Grande": "Sudoeste",
  };

  const neighborhoodAliases = {
    guajuviras: "Guajuviras",
    "sao jose": "São José",
    olaria: "Olaria",
    "estancia velha": "Estância Velha",
    "marechal rondon": "Marechal Rondon",
    igara: "Igara",
    "mathias velho": "Mathias Velho",
    "sao luis": "São Luis",
    harmonia: "Harmonia",
    centro: "Centro",
    niteroi: "Niterói",
    "nossa senhora das gracas": "Nossa Senhora das Graças",
    "nossa sra das gracas": "Nossa Senhora das Graças",
    "nossa sra. das gracas": "Nossa Senhora das Graças",
    "rio branco": "Rio Branco",
    fatima: "Fátima",
    "mato grande": "Mato Grande",
  };

  const familyConfigs = {
    mae_pai: {
      parent1Label: "Nome da mãe",
      parent2Label: "Nome do pai",
      parent2Visible: true,
      guardianOptions: [
        ["mae", "Mãe"],
        ["pai", "Pai"],
        ["outro", "Outra pessoa"],
      ],
    },
    duas_maes: {
      parent1Label: "Nome da mãe 1",
      parent2Label: "Nome da mãe 2",
      parent2Visible: true,
      guardianOptions: [
        ["mae_1", "Mãe 1"],
        ["mae_2", "Mãe 2"],
        ["outro", "Outra pessoa"],
      ],
    },
    dois_pais: {
      parent1Label: "Nome do pai 1",
      parent2Label: "Nome do pai 2",
      parent2Visible: true,
      guardianOptions: [
        ["pai_1", "Pai 1"],
        ["pai_2", "Pai 2"],
        ["outro", "Outra pessoa"],
      ],
    },
    mae_solo: {
      parent1Label: "Nome da mãe",
      parent2Label: "",
      parent2Visible: false,
      guardianOptions: [
        ["mae", "Mãe"],
        ["outro", "Outra pessoa"],
      ],
    },
    pai_solo: {
      parent1Label: "Nome do pai",
      parent2Label: "",
      parent2Visible: false,
      guardianOptions: [
        ["pai", "Pai"],
        ["outro", "Outra pessoa"],
      ],
    },
    outra: {
      parent1Label: "Nome da filiação 1",
      parent2Label: "Nome da filiação 2",
      parent2Visible: true,
      guardianOptions: [
        ["filiacao_1", "Filiação 1"],
        ["filiacao_2", "Filiação 2"],
        ["outro", "Outra pessoa"],
      ],
    },
  };

  const form = document.querySelector("#registrationForm");
  const fields = {
    childName: document.querySelector("#childName"),
    childCpf: document.querySelector("#childCpf"),
    birthDate: document.querySelector("#birthDate"),
    cep: document.querySelector("#cep"),
    neighborhood: document.querySelector("#neighborhood"),
    region: document.querySelector("#region"),
    address: document.querySelector("#address"),
    addressNumber: document.querySelector("#addressNumber"),
    addressComplement: document.querySelector("#addressComplement"),
    city: document.querySelector("#city"),
    ageGroup: document.querySelector("#ageGroup"),
    familyComposition: document.querySelector("#familyComposition"),
    guardianRelation: document.querySelector("#guardianRelation"),
    parent1Name: document.querySelector("#parent1Name"),
    parent2Name: document.querySelector("#parent2Name"),
    guardianName: document.querySelector("#guardianName"),
    guardianCpf: document.querySelector("#guardianCpf"),
    guardianAge: document.querySelector("#guardianAge"),
    phone: document.querySelector("#phone"),
    email: document.querySelector("#email"),
    income: document.querySelector("#income"),
    cadunico: document.querySelector("#cadunico"),
    protection: document.querySelector("#protection"),
  };

  const checkboxes = Object.fromEntries(
    booleanRules.map(([key]) => [key, document.querySelector(`#${key}`)])
  );

  const homeView = document.querySelector("#homeView");
  const publicView = document.querySelector("#publicView");
  const adminView = document.querySelector("#adminView");
  const appShell = document.querySelector(".app-shell");
  const publicNavButton = document.querySelector("#publicNavButton");
  const adminNavButton = document.querySelector("#adminNavButton");
  const startRegistrationButton = document.querySelector("#startRegistrationButton");
  const backHomeButton = document.querySelector("#backHomeButton");
  const adminLoginPanel = document.querySelector("#adminLoginPanel");
  const adminContent = document.querySelector("#adminContent");
  const adminEmail = document.querySelector("#adminEmail");
  const adminPassword = document.querySelector("#adminPassword");
  const adminLoginButton = document.querySelector("#adminLoginButton");
  const adminLoginMessage = document.querySelector("#adminLoginMessage");
  const adminLogoutButton = document.querySelector("#adminLogoutButton");
  const previewScore = document.querySelector("#previewScore");
  const scoreBreakdown = document.querySelector("#scoreBreakdown");
  const formMessage = document.querySelector("#formMessage");
  const childCpfMessage = document.querySelector("#childCpfMessage");
  const birthDateMessage = document.querySelector("#birthDateMessage");
  const cepMessage = document.querySelector("#cepMessage");
  const rankingBody = document.querySelector("#rankingBody");
  const emptyState = document.querySelector("#emptyState");
  const searchInput = document.querySelector("#searchInput");
  const regionFilter = document.querySelector("#regionFilter");
  const ageGroupFilter = document.querySelector("#ageGroupFilter");
  const statusFilter = document.querySelector("#statusFilter");
  const viewRegistrationsButton = document.querySelector("#viewRegistrationsButton");
  const dashboardRegionFilter = document.querySelector("#dashboardRegionFilter");
  const dashboardAgeGroupFilter = document.querySelector("#dashboardAgeGroupFilter");
  const totalRegistrations = document.querySelector("#totalRegistrations");
  const waitingCount = document.querySelector("#waitingCount");
  const calledCount = document.querySelector("#calledCount");
  const averageScore = document.querySelector("#averageScore");
  const highestScore = document.querySelector("#highestScore");
  const seriesReport = document.querySelector("#seriesReport");
  const quadrantReport = document.querySelector("#quadrantReport");
  const parent1Label = document.querySelector("#parent1Label");
  const parent2Label = document.querySelector("#parent2Label");
  const parent2Field = document.querySelector("#parent2Field");
  const reviewModal = document.querySelector("#reviewModal");
  const reviewSummary = document.querySelector("#reviewSummary");
  const truthDeclaration = document.querySelector("#truthDeclaration");
  const reviewMessage = document.querySelector("#reviewMessage");
  const cancelReviewButton = document.querySelector("#cancelReviewButton");
  const editReviewButton = document.querySelector("#editReviewButton");
  const confirmRegistrationButton = document.querySelector("#confirmRegistrationButton");
  const receiptModal = document.querySelector("#receiptModal");
  const receiptContent = document.querySelector("#receiptContent");
  const newRegistrationButton = document.querySelector("#newRegistrationButton");
  const printReceiptButton = document.querySelector("#printReceiptButton");

  let registrations = [];
  let lastCepLookup = "";
  let childCpfCheck = { cpf: "", exists: false };
  let pendingRegistrationData = null;
  let rankingLoaded = false;

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function formatCep(value) {
    const digits = onlyDigits(value).slice(0, 8);
    return digits.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
  }

  function isValidCpf(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
      return false;
    }

    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += Number(cpf[i]) * (10 - i);
    }
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i += 1) {
      sum += Number(cpf[i]) * (11 - i);
    }
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === Number(cpf[10]);
  }

  function parseDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function calculateAgeOn(dateValue, referenceValue) {
    const birth = parseDate(dateValue);
    const reference = parseDate(referenceValue);
    if (!birth || !reference) return null;

    let years = reference.getFullYear() - birth.getFullYear();
    let months = reference.getMonth() - birth.getMonth();
    if (reference.getDate() < birth.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years, months, totalMonths: years * 12 + months };
  }

  function getAgeGroup(dateValue) {
    if (!dateValue) return "";
    if (dateValue < MIN_BIRTH_DATE || dateValue > PUBLICATION_DATE) {
      return "Fora da faixa do edital";
    }
    const age = calculateAgeOn(dateValue, REFERENCE_DATE);
    if (!age || age.totalMonths < 0 || age.totalMonths > 47) {
      return "Fora da faixa do edital";
    }
    if (age.totalMonths <= 11) return "Berçário I";
    if (age.totalMonths <= 23) return "Berçário II";
    if (age.totalMonths <= 35) return "Maternal I";
    return "Maternal II";
  }

  function calculateScore(data) {
    const items = [];
    addRule(items, scoreRules[data.income]);
    if (data.cadunico !== "none") addRule(items, scoreRules[data.cadunico]);
    if (data.protection !== "none") addRule(items, scoreRules[data.protection]);

    booleanRules.forEach(([key, label, points]) => {
      if (data[key]) items.push({ label, points });
    });

    const guardianAge = Number(data.guardianAge);
    if (guardianAge < 18) {
      items.push({ label: "Responsável menor de 18 anos", points: 50 });
    } else if (guardianAge > 65) {
      items.push({ label: "Responsável acima de 65 anos", points: 30 });
    }

    return {
      total: items.reduce((sum, item) => sum + item.points, 0),
      items,
    };
  }

  function addRule(items, rule) {
    if (rule) items.push({ label: rule.label, points: rule.points });
  }

  function collectFormData() {
    updateQuadrant();
    const data = {
      childName: fields.childName.value.trim(),
      childCpf: onlyDigits(fields.childCpf.value),
      birthDate: fields.birthDate.value,
      cep: onlyDigits(fields.cep.value),
      neighborhood: fields.neighborhood.value,
      region: fields.region.value,
      address: fields.address.value.trim(),
      addressNumber: fields.addressNumber.value.trim(),
      addressComplement: fields.addressComplement.value.trim(),
      city: fields.city.value.trim(),
      ageGroup: fields.ageGroup.value,
      familyComposition: fields.familyComposition.value,
      guardianRelation: fields.guardianRelation.value,
      guardianRelationLabel: fields.guardianRelation.selectedOptions[0]?.textContent || "",
      parent1Label: parent1Label.textContent,
      parent1Name: fields.parent1Name.value.trim(),
      parent2Label: parent2Label.textContent,
      parent2Name: parent2Field.classList.contains("hidden") ? "" : fields.parent2Name.value.trim(),
      guardianName: fields.guardianName.value.trim(),
      guardianCpf: onlyDigits(fields.guardianCpf.value),
      guardianAge: fields.guardianAge.value,
      phone: fields.phone.value.trim(),
      email: fields.email.value.trim(),
      income: fields.income.value,
      cadunico: fields.cadunico.value,
      protection: fields.protection.value,
    };

    Object.entries(checkboxes).forEach(([key, input]) => {
      data[key] = input.checked;
    });

    return data;
  }

  function validateRegistration(data) {
    if (!form.checkValidity()) return "Preencha os campos obrigatórios antes de registrar.";
    if (!isValidCpf(data.childCpf)) return "CPF da criança inválido.";
    if (!isValidCpf(data.guardianCpf)) return "CPF do responsável inválido.";
    if (data.cep.length !== 8) return "Informe um CEP válido com 8 dígitos.";
    if (!data.address || !data.neighborhood || !data.city) {
      return "Informe um CEP válido para preencher rua, bairro e cidade automaticamente.";
    }
    if (!data.addressNumber) return "Informe o número do endereço.";
    if (data.ageGroup === "Fora da faixa do edital" || !data.ageGroup) {
      return "A data de nascimento não se enquadra na faixa etária do edital.";
    }
    if (!data.neighborhood || !data.region) {
      return "O bairro do CEP precisa estar previsto no edital para definir o quadrante automaticamente.";
    }
    if (registrations.some((item) => item.childCpf === data.childCpf)) {
      return "Já existe uma inscrição cadastrada para o CPF desta criança.";
    }
    if (childCpfCheck.cpf === data.childCpf && childCpfCheck.exists) {
      return "Já existe uma inscrição cadastrada para o CPF desta criança.";
    }
    return "";
  }

  function createProtocol() {
    const year = new Date().getFullYear();
    const stamp = Date.now().toString(36).toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `CRECHE-${year}-${stamp}-${suffix}`;
  }

  async function saveRegistration(data) {
    const score = calculateScore(data);
    const createdAt = new Date().toISOString();
    const registration = {
      ...data,
      score: score.total,
      scoreItems: score.items,
      status: STATUS_WAITING,
      requeueOrder: 0,
      protocol: createProtocol(),
      createdAt,
      createdAtIso: createdAt,
    };
    const payload = {
      ...registration,
      childCpf: data.childCpf,
      childName: data.childName,
      birthDate: data.birthDate,
      ageGroup: data.ageGroup,
      region: data.region,
      neighborhood: data.neighborhood,
      createdAt: serverTimestamp(),
      createdAtIso: createdAt,
      data: registration,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, REGISTRATIONS_COLLECTION, data.childCpf), payload);
    batch.set(doc(db, CPF_INDEX_COLLECTION, data.childCpf), {
      exists: true,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    registration.firebaseId = data.childCpf;
    registrations.push(registration);
    return registration;
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
      if (b.score !== a.score) return b.score - a.score;
      if (a.birthDate !== b.birthDate) return a.birthDate.localeCompare(b.birthDate);
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  function getRegistrationKey(item) {
    return item.firebaseId || item.childCpf || item.protocol;
  }

  function getClassificationPositionMap(list = registrations) {
    const positions = new Map();
    const grouped = sortRegistrations(list).reduce((groups, item) => {
      const key = `${item.region || ""}::${item.ageGroup || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
      return groups;
    }, new Map());

    grouped.forEach((items) => {
      items.forEach((item, index) => {
        positions.set(getRegistrationKey(item), index + 1);
      });
    });

    return positions;
  }

  function getClassificationList(list = registrations) {
    const positions = getClassificationPositionMap(list);
    return [...list].sort((a, b) => {
      const regionCompare = (a.region || "").localeCompare(b.region || "", "pt-BR");
      if (regionCompare) return regionCompare;
      const ageGroupCompare = (a.ageGroup || "").localeCompare(b.ageGroup || "", "pt-BR");
      if (ageGroupCompare) return ageGroupCompare;
      return (positions.get(getRegistrationKey(a)) || 0) - (positions.get(getRegistrationKey(b)) || 0);
    });
  }

  function getStatus(item) {
    return item.status || STATUS_WAITING;
  }

  function getQueueGroup(item) {
    return getStatus(item) === STATUS_REWRITTEN ? 1 : 0;
  }

  function getNextRequeueOrder() {
    return registrations.reduce(
      (highest, item) => Math.max(highest, Number(item.requeueOrder) || 0),
      0
    ) + 1;
  }

  function getStatusClass(status) {
    if (status === STATUS_CALLED) return "status-called";
    if (status === STATUS_NO_SHOW) return "status-no-show";
    return "status-waiting";
  }

  function getRegistrationDocId(item) {
    return item.firebaseId || item.childCpf;
  }

  function timestampToIso(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    return "";
  }

  function normalizeFirestoreRegistration(snapshot) {
    const item = snapshot.data();
    const data = item.data && typeof item.data === "object" ? item.data : {};
    const merged = {
      ...data,
      ...item,
      firebaseId: snapshot.id,
      childCpf: item.childCpf || data.childCpf || snapshot.id,
      childName: item.childName || data.childName || "",
      birthDate: item.birthDate || data.birthDate || "",
      ageGroup: item.ageGroup || data.ageGroup || "",
      region: item.region || data.region || "",
      neighborhood: item.neighborhood || data.neighborhood || "",
      score: Number(item.score ?? data.score) || 0,
      scoreItems: item.scoreItems || data.scoreItems || [],
      status: item.status || data.status || STATUS_WAITING,
      requeueOrder: item.status === STATUS_REWRITTEN ? Number(item.requeueOrder) || 0 : 0,
      requeuedAt: item.status === STATUS_REWRITTEN ? timestampToIso(item.requeuedAt || data.requeuedAt) : "",
      createdAt: item.createdAtIso || data.createdAtIso || timestampToIso(item.createdAt) || data.createdAt || "",
    };
    return merged;
  }

  function formatDate(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function formatAddress(data) {
    const number = data.addressNumber ? `, nº ${data.addressNumber}` : "";
    const complement = data.addressComplement ? ` - ${data.addressComplement}` : "";
    return `${data.address || ""}${number}${complement}`;
  }

  function formatFamilyComposition(value) {
    const labels = {
      mae_pai: "Mãe e pai",
      duas_maes: "Duas mães",
      dois_pais: "Dois pais",
      mae_solo: "Somente mãe",
      pai_solo: "Somente pai",
      outra: "Outra composição",
    };
    return labels[value] || "Não informado";
  }

  function valueOrFallback(value) {
    return value || "Não informado";
  }

  function updateAgeGroup() {
    fields.ageGroup.value = getAgeGroup(fields.birthDate.value);
  }

  function updateQuadrant() {
    fields.region.value = neighborhoodQuadrants[fields.neighborhood.value] || "";
  }

  function updateFamilyFields() {
    const config = familyConfigs[fields.familyComposition.value] || familyConfigs.mae_pai;
    const previousRelation = fields.guardianRelation.value;

    parent1Label.textContent = config.parent1Label;
    parent2Label.textContent = config.parent2Label;
    parent2Field.classList.toggle("hidden", !config.parent2Visible);
    fields.parent2Name.required = config.parent2Visible;
    if (!config.parent2Visible) fields.parent2Name.value = "";

    fields.guardianRelation.innerHTML = "";
    config.guardianOptions.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      fields.guardianRelation.append(option);
    });

    if (config.guardianOptions.some(([value]) => value === previousRelation)) {
      fields.guardianRelation.value = previousRelation;
    }
  }

  function renderPreview() {
    updateAgeGroup();
    updateQuadrant();
    const data = collectFormData();
    const score = calculateScore(data);
    previewScore.textContent = score.total;
    scoreBreakdown.innerHTML = "";

    if (!score.items.length) {
      const item = document.createElement("li");
      item.textContent = "Nenhum critério pontuado";
      scoreBreakdown.append(item);
      return;
    }

    score.items.forEach((scoreItem) => {
      const item = document.createElement("li");
      item.textContent = `${scoreItem.label}: ${scoreItem.points}`;
      scoreBreakdown.append(item);
    });
  }

  function renderDataBlock(title, rows, wide = false) {
    const items = rows
      .map(
        ([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(valueOrFallback(value))}</dd>
          </div>
        `
      )
      .join("");

    return `
      <section class="${wide ? "review-block wide" : "review-block"}">
        <h3>${escapeHtml(title)}</h3>
        <dl>${items}</dl>
      </section>
    `;
  }

  function getRegistrationBlocks(data, score) {
    const scoreItems = score.items.length
      ? score.items.map((item) => `${item.label} (${item.points})`).join("; ")
      : "Nenhum critério pontuado";
    const familyRows = [
      ["Composição familiar", formatFamilyComposition(data.familyComposition)],
      [data.parent1Label || "Filiação 1", data.parent1Name],
    ];

    if (data.parent2Name) {
      familyRows.push([data.parent2Label || "Filiação 2", data.parent2Name]);
    }

    familyRows.push(
      ["Responsável pelo preenchimento", data.guardianRelationLabel],
      ["Nome do responsável", data.guardianName],
      ["CPF do responsável", formatCpf(data.guardianCpf)],
      ["Idade do responsável", data.guardianAge],
      ["Telefone/WhatsApp", data.phone],
      ["E-mail", data.email]
    );

    return [
      renderDataBlock("Criança", [
        ["Nome completo", data.childName],
        ["CPF", formatCpf(data.childCpf)],
        ["Data de nascimento", formatDate(data.birthDate)],
        ["Série", data.ageGroup],
      ]),
      renderDataBlock("Endereço", [
        ["CEP", formatCep(data.cep)],
        ["Rua", formatAddress(data)],
        ["Bairro", data.neighborhood],
        ["Cidade", data.city],
        ["Quadrante", data.region],
      ]),
      renderDataBlock("Filiação e responsável", familyRows),
      renderDataBlock("Pontuação", [
        ["Total de pontos", String(score.total)],
        ["Critérios pontuados", scoreItems],
      ], true),
    ];
  }

  function showReview(data) {
    const score = calculateScore(data);
    pendingRegistrationData = data;
    reviewSummary.innerHTML = getRegistrationBlocks(data, score).join("");
    truthDeclaration.checked = false;
    confirmRegistrationButton.disabled = true;
    reviewMessage.textContent = "";
    reviewModal.classList.remove("hidden");
    truthDeclaration.focus();
  }

  function closeReview() {
    reviewModal.classList.add("hidden");
    pendingRegistrationData = null;
    reviewMessage.textContent = "";
  }

  function renderReceipt(registration) {
    const score = {
      total: registration.score,
      items: registration.scoreItems || [],
    };
    const blocks = getRegistrationBlocks(registration, score)
      .join("")
      .replaceAll("review-block", "receipt-block");

    receiptContent.innerHTML = `
      <div class="receipt-head">
        <p class="section-kicker">Comprovante de inscrição</p>
        <h2 id="receiptTitle">Inscrições Etapa Creche 2026</h2>
        <div class="protocol-box">
          <span>Protocolo</span>
          <strong>${escapeHtml(registration.protocol)}</strong>
        </div>
        <p>Situação inicial: <strong>${escapeHtml(getStatus(registration))}</strong></p>
        <p>Data da inscrição: ${escapeHtml(formatDateTime(registration.createdAt))}</p>
      </div>
      <div class="receipt-grid">${blocks}</div>
      <p class="receipt-note">O responsável declarou a veracidade dos dados informados, ciente de que a comprovação de inconsistência no ato da convocação para matrícula poderá ocasionar a desclassificação da inscrição.</p>
    `;
  }

  function showReceipt(registration) {
    renderReceipt(registration);
    receiptModal.classList.remove("hidden");
  }

  function closeReceipt() {
    receiptModal.classList.add("hidden");
    receiptContent.innerHTML = "";
    fields.childName.focus();
  }

  async function confirmPendingRegistration() {
    if (!truthDeclaration.checked) {
      reviewMessage.textContent = "Marque a declaração de veracidade para confirmar a inscrição.";
      return;
    }
    if (!pendingRegistrationData) return;

    const validationMessage = validateRegistration(pendingRegistrationData);
    if (validationMessage) {
      reviewMessage.textContent = validationMessage;
      return;
    }

    confirmRegistrationButton.disabled = true;
    reviewMessage.textContent = "Salvando inscrição...";
    try {
      const registration = await saveRegistration(pendingRegistrationData);
      closeReview();
      renderRanking();
      resetForm();
      showReceipt(registration);
    } catch (error) {
      confirmRegistrationButton.disabled = false;
      reviewMessage.textContent = getFirebaseErrorMessage(
        error,
        "Não foi possível salvar a inscrição. Confira se o CPF da criança já possui cadastro."
      );
    }
  }

  function renderRanking() {
    if (!rankingLoaded) {
      rankingBody.innerHTML = "";
      emptyState.hidden = false;
      emptyState.textContent = "Selecione ao menos um filtro e clique em Ver inscrições para carregar a tabela.";
      renderDashboard();
      return;
    }

    const searchTerm = normalize(searchInput.value);
    const region = regionFilter.value;
    const ageGroup = ageGroupFilter.value;
    const status = statusFilter.value;
    const positionMap = getClassificationPositionMap();
    const sorted = getClassificationList();
    const filtered = sorted.filter((item) => {
      const searchable = normalize(
        `${item.childName} ${item.childCpf} ${item.protocol} ${item.address || ""} ${item.addressNumber || ""} ${item.addressComplement || ""} ${item.neighborhood || ""} ${item.city || ""} ${item.cep || ""} ${item.parent1Name || ""} ${item.parent2Name || ""} ${item.guardianName || ""} ${item.guardianCpf || ""}`
      );
      return (
        (!region || item.region === region) &&
        (!ageGroup || item.ageGroup === ageGroup) &&
        (!status || getStatus(item) === status) &&
        searchable.includes(searchTerm)
      );
    });

    rankingBody.innerHTML = "";
    filtered.forEach((item) => {
      const row = document.createElement("tr");
      const position = positionMap.get(getRegistrationKey(item)) || 0;
      const addressNumber = item.addressNumber ? `, nº ${item.addressNumber}` : "";
      const addressComplement = item.addressComplement ? ` - ${item.addressComplement}` : "";
      const city = item.city ? ` - ${item.city}` : "";
      row.innerHTML = `
        <td><span class="rank">${position}</span></td>
        <td>
          <span class="name-cell">${escapeHtml(item.childName)}</span>
          <span class="meta-cell">Nascimento: ${formatDate(item.birthDate)}</span>
        </td>
        <td>${formatCpf(item.childCpf)}</td>
        <td>${escapeHtml(item.ageGroup)}</td>
        <td>
          ${escapeHtml(`${item.address || ""}${addressNumber}${addressComplement}`)}
          <span class="meta-cell">${formatCep(item.cep || "")} - ${escapeHtml(item.neighborhood || "Bairro não informado")}${escapeHtml(city)} - ${escapeHtml(item.region)}</span>
        </td>
        <td>
          ${escapeHtml(item.guardianName)}
          <span class="meta-cell">Preenchimento: ${escapeHtml(item.guardianRelationLabel || "Não informado")}</span>
          <span class="meta-cell">${escapeHtml(item.parent1Label || "Filiação 1")}: ${escapeHtml(item.parent1Name || "Não informado")}</span>
          ${item.parent2Name ? `<span class="meta-cell">${escapeHtml(item.parent2Label || "Filiação 2")}: ${escapeHtml(item.parent2Name)}</span>` : ""}
          <span class="meta-cell">CPF: ${formatCpf(item.guardianCpf)} - ${escapeHtml(item.phone || "")}</span>
          <span class="meta-cell">${escapeHtml(item.email || "E-mail não informado")}</span>
        </td>
        <td class="points">${item.score}</td>
        <td class="status-cell ${getStatusClass(getStatus(item))}">
          <select class="status-select" data-protocol="${escapeHtml(item.protocol)}">
            ${STATUS_OPTIONS.map((option) => `
              <option value="${escapeHtml(option)}" ${getStatus(item) === option ? "selected" : ""}>${escapeHtml(option)}</option>
            `).join("")}
          </select>
          ${getStatus(item) === STATUS_REWRITTEN ? '<span class="meta-cell">Retornou ao final da lista de espera.</span>' : ""}
        </td>
        <td>${escapeHtml(item.protocol)}</td>
        <td>
          <button class="ghost-button compact-action requeue-button" data-protocol="${escapeHtml(item.protocol)}" type="button">
            Reinscrever no fim da fila
          </button>
        </td>
      `;
      rankingBody.append(row);
    });

    emptyState.hidden = filtered.length > 0;
    emptyState.textContent = "Nenhuma inscrição encontrada para os filtros selecionados.";
    renderDashboard();
  }

  function renderDashboard() {
    const dashboardItems = getDashboardItems();
    totalRegistrations.textContent = dashboardItems.length;
    waitingCount.textContent = dashboardItems.filter((item) => WAITING_STATUSES.includes(getStatus(item))).length;
    calledCount.textContent = dashboardItems.filter((item) => getStatus(item) === STATUS_CALLED).length;
    const scoreSum = dashboardItems.reduce((sum, item) => sum + item.score, 0);
    averageScore.textContent = dashboardItems.length ? Math.round(scoreSum / dashboardItems.length) : 0;
    highestScore.textContent = dashboardItems.length ? Math.max(...dashboardItems.map((item) => item.score)) : 0;
    renderReport(seriesReport, summarizeBy(dashboardItems, "ageGroup"));
    renderReport(quadrantReport, summarizeBy(dashboardItems, "region"));
  }

  function getDashboardItems() {
    const region = dashboardRegionFilter.value;
    const ageGroup = dashboardAgeGroupFilter.value;
    return registrations.filter((item) =>
      (!region || item.region === region) &&
      (!ageGroup || item.ageGroup === ageGroup)
    );
  }

  function summarizeBy(list, key) {
    return list.reduce((counts, item) => {
      const label = item[key] || "Não informado";
      if (!counts[label]) {
        counts[label] = {
          total: 0,
          called: 0,
          waiting: 0,
        };
      }
      counts[label].total += 1;
      if (getStatus(item) === STATUS_CALLED) counts[label].called += 1;
      if (WAITING_STATUSES.includes(getStatus(item))) counts[label].waiting += 1;
      return counts;
    }, {});
  }

  function renderReport(container, summary) {
    const entries = Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    container.innerHTML = "";
    if (!entries.length) {
      container.innerHTML = '<p class="report-empty">Sem inscrições.</p>';
      return;
    }
    const table = document.createElement("div");
    table.className = "report-table";
    table.innerHTML = `
      <div class="report-row report-head">
        <span></span>
        <strong>Inscritos</strong>
        <strong>Convocados</strong>
        <strong>Aguardando</strong>
      </div>
    `;

    entries.forEach(([label, counts]) => {
      const row = document.createElement("div");
      row.className = "report-row";
      row.innerHTML = `
        <span class="report-label">${escapeHtml(label)}</span>
        <strong>${counts.total}</strong>
        <strong>${counts.called}</strong>
        <strong>${counts.waiting}</strong>
      `;
      table.append(row);
    });

    const totals = entries.reduce(
      (sum, [, counts]) => ({
        total: sum.total + counts.total,
        called: sum.called + counts.called,
        waiting: sum.waiting + counts.waiting,
      }),
      { total: 0, called: 0, waiting: 0 }
    );
    const totalRow = document.createElement("div");
    totalRow.className = "report-row report-total";
    totalRow.innerHTML = `
      <span class="report-label">Total</span>
      <strong>${totals.total}</strong>
      <strong>${totals.called}</strong>
      <strong>${totals.waiting}</strong>
    `;
    table.append(totalRow);
    container.append(table);
  }

  async function updateStatus(protocol, status) {
    const current = registrations.find((item) => item.protocol === protocol);
    if (!current) return;
    const shouldRequeue = status === STATUS_REWRITTEN;
    const nextRequeueOrder = shouldRequeue ? getNextRequeueOrder() : 0;
    const updates = {
      status,
      requeueOrder: shouldRequeue ? nextRequeueOrder : 0,
      requeuedAt: shouldRequeue ? new Date().toISOString() : "",
    };
    await updateDoc(doc(db, REGISTRATIONS_COLLECTION, getRegistrationDocId(current)), updates);
    registrations = registrations.map((item) =>
      item.protocol === protocol
        ? {
            ...item,
            ...updates,
          }
        : item
    );
    renderRanking();
  }

  async function requeueRegistration(protocol) {
    const registration = registrations.find((item) => item.protocol === protocol);
    if (!registration) return;
    const confirmed = window.confirm(
      `Reinscrever ${registration.childName} no final da lista de espera da mesma série e quadrante?`
    );
    if (!confirmed) return;
    try {
      await updateStatus(protocol, STATUS_REWRITTEN);
    } catch (error) {
      window.alert(getFirebaseErrorMessage(error, "Não foi possível reinscrever no fim da fila."));
    }
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeNeighborhood(value) {
    return neighborhoodAliases[normalize(value)] || "";
  }

  function setCepMessage(message, type) {
    cepMessage.textContent = message;
    cepMessage.classList.toggle("error", type === "error");
    cepMessage.classList.toggle("success", type === "success");
  }

  function setChildCpfMessage(message, type) {
    childCpfMessage.textContent = message;
    childCpfMessage.classList.toggle("error", type === "error");
    childCpfMessage.classList.toggle("success", type === "success");
  }

  async function checkChildCpfAvailability() {
    const cpf = onlyDigits(fields.childCpf.value);
    childCpfCheck = { cpf, exists: false };

    if (!cpf) {
      setChildCpfMessage("", "");
      return true;
    }

    if (cpf.length !== 11) {
      setChildCpfMessage("", "");
      return true;
    }

    if (!isValidCpf(cpf)) {
      setChildCpfMessage("CPF da criança inválido.", "error");
      return false;
    }

    setChildCpfMessage("Verificando se já existe inscrição para este CPF...", "");
    try {
      const snapshot = await getDoc(doc(db, CPF_INDEX_COLLECTION, cpf));
      const exists = snapshot.exists();
      childCpfCheck = { cpf, exists };
      if (exists) {
        setChildCpfMessage("Já existe uma inscrição cadastrada para o CPF desta criança.", "error");
        return false;
      }
      setChildCpfMessage("CPF disponível para nova inscrição.", "success");
      return true;
    } catch {
      setChildCpfMessage("Não foi possível verificar agora; o CPF será conferido ao confirmar.", "");
      return true;
    }
  }

  function clearAddressFields() {
    fields.address.value = "";
    fields.neighborhood.value = "";
    fields.city.value = "";
    fields.region.value = "";
  }

  async function lookupCep() {
    const cep = onlyDigits(fields.cep.value);
    if (cep.length !== 8) {
      lastCepLookup = "";
      clearAddressFields();
      setCepMessage("", "");
      return;
    }
    if (cep === lastCepLookup) return;

    lastCepLookup = cep;
    setCepMessage("Buscando endereço pelo CEP...", "");

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error("Consulta indisponível");
      const result = await response.json();
      if (onlyDigits(fields.cep.value) !== cep) return;
      if (result.erro) {
        clearAddressFields();
        setCepMessage("CEP não encontrado. Confira o número informado.", "error");
        return;
      }

      fields.address.value = result.logradouro || "";
      fields.city.value = result.localidade || "";

      const mappedNeighborhood = normalizeNeighborhood(result.bairro);
      fields.neighborhood.value = mappedNeighborhood || result.bairro || "";
      if (mappedNeighborhood) {
        updateQuadrant();
        if (fields.address.value && fields.city.value) {
          setCepMessage("Rua, bairro, cidade e quadrante preenchidos pelo CEP.", "success");
        } else {
          setCepMessage("CEP encontrado, mas ele não retornou a rua completa.", "error");
        }
      } else {
        updateQuadrant();
        setCepMessage("Bairro do CEP não está nos quadrantes do edital.", "error");
      }
      renderPreview();
    } catch {
      clearAddressFields();
      setCepMessage("Não foi possível consultar o CEP agora. Tente novamente em instantes.", "error");
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getFirebaseErrorMessage(error, fallback) {
    const code = error?.code || "";
    if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
      return "E-mail ou senha administrativa incorretos.";
    }
    if (code === "permission-denied") {
      return fallback.includes("CPF")
        ? "Já existe uma inscrição cadastrada para o CPF desta criança."
        : "Acesso negado pelo Firebase. Verifique o login administrativo e as regras do Firestore.";
    }
    if (code === "unavailable") {
      return "Firebase indisponível no momento. Tente novamente em instantes.";
    }
    return fallback;
  }

  async function loadRegistrations() {
    rankingLoaded = false;
    emptyState.textContent = "Carregando inscrições...";
    emptyState.hidden = false;
    try {
      const snapshot = await getDocs(collection(db, REGISTRATIONS_COLLECTION));
      registrations = snapshot.docs.map(normalizeFirestoreRegistration);
      emptyState.textContent = "Nenhuma inscrição cadastrada.";
      renderRanking();
    } catch (error) {
      registrations = [];
      renderRanking();
      emptyState.textContent = getFirebaseErrorMessage(
        error,
        "Não foi possível carregar as inscrições."
      );
      emptyState.hidden = false;
    }
  }

  function setMessage(message, type) {
    formMessage.textContent = message;
    formMessage.classList.toggle("success", type === "success");
  }

  function resetForm() {
    form.reset();
    updateFamilyFields();
    fields.ageGroup.value = "";
    childCpfCheck = { cpf: "", exists: false };
    setChildCpfMessage("", "");
    clearAddressFields();
    lastCepLookup = "";
    setCepMessage("", "");
    setMessage("", "");
    renderPreview();
    fields.childName.focus();
  }

  function exportCsv() {
    if (!registrations.length) {
      adminLoginMessage.textContent = "Não há inscrições para exportar.";
      return;
    }

    const headers = [
      "posicao",
      "protocolo",
      "situacao",
      "nome_crianca",
      "cpf_crianca",
      "data_nascimento",
      "cep",
      "rua",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "quadrante",
      "serie",
      "pontuacao",
      "composicao_familiar",
      "responsavel_preenchimento",
      "campo_filiacao_1",
      "nome_filiacao_1",
      "campo_filiacao_2",
      "nome_filiacao_2",
      "responsavel",
      "cpf_responsavel",
      "telefone",
      "email",
      "criterios",
    ];
    const positionMap = getClassificationPositionMap();
    const rows = getClassificationList().map((item) => [
      positionMap.get(getRegistrationKey(item)) || "",
      item.protocol,
      getStatus(item),
      item.childName,
      formatCpf(item.childCpf),
      item.birthDate,
      formatCep(item.cep || ""),
      item.address,
      item.addressNumber || "",
      item.addressComplement || "",
      item.neighborhood || "",
      item.city || "",
      item.region,
      item.ageGroup,
      item.score,
      item.familyComposition || "",
      item.guardianRelationLabel || "",
      item.parent1Label || "",
      item.parent1Name || "",
      item.parent2Label || "",
      item.parent2Name || "",
      item.guardianName,
      formatCpf(item.guardianCpf),
      item.phone,
      item.email,
      (item.scoreItems || []).map((scoreItem) => `${scoreItem.label} (${scoreItem.points})`).join("; "),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-etapa-creche-2026.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function clearData() {
    const confirmed = window.confirm("Apagar todas as inscrições cadastradas no banco de dados?");
    if (!confirmed) return;
    try {
      await Promise.all(
        registrations.map((item) =>
          deleteDoc(doc(db, REGISTRATIONS_COLLECTION, getRegistrationDocId(item)))
        )
      );
      registrations = [];
      renderRanking();
    } catch (error) {
      adminLoginMessage.textContent = getFirebaseErrorMessage(
        error,
        "Não foi possível apagar as inscrições."
      );
    }
  }

  function showHome() {
    homeView.classList.remove("hidden");
    publicView.classList.add("hidden");
    adminView.classList.add("hidden");
    publicNavButton.classList.add("active");
    adminNavButton.classList.remove("active");
    appShell.classList.add("public-shell");
    appShell.classList.remove("admin-shell");
  }

  function showRegistrationForm() {
    homeView.classList.add("hidden");
    publicView.classList.remove("hidden");
    adminView.classList.add("hidden");
    publicNavButton.classList.add("active");
    adminNavButton.classList.remove("active");
    appShell.classList.add("public-shell");
    appShell.classList.remove("admin-shell");
    fields.childName.focus();
  }

  function showAdmin() {
    homeView.classList.add("hidden");
    publicView.classList.add("hidden");
    adminView.classList.remove("hidden");
    publicNavButton.classList.remove("active");
    adminNavButton.classList.add("active");
    appShell.classList.remove("public-shell");
    appShell.classList.add("admin-shell");
    renderAdminAccess();
  }

  function renderAdminAccess() {
    const isLogged = !!auth.currentUser;
    adminLoginPanel.classList.toggle("hidden", isLogged);
    adminContent.classList.toggle("hidden", !isLogged);
    adminLogoutButton.classList.toggle("hidden", !isLogged);
    if (isLogged) {
      loadRegistrations();
    } else {
      registrations = [];
      renderDashboard();
    }
  }

  async function loginAdmin() {
    const email = adminEmail.value.trim();
    const password = adminPassword.value;
    if (!email || !password) {
      adminLoginMessage.textContent = "Informe e-mail e senha administrativa.";
      return;
    }
    adminLoginButton.disabled = true;
    adminLoginMessage.textContent = "Entrando...";
    try {
      await signInWithEmailAndPassword(auth, email, password);
      adminPassword.value = "";
      adminLoginMessage.textContent = "";
    } catch (error) {
      adminLoginMessage.textContent = getFirebaseErrorMessage(
        error,
        "Não foi possível acessar a administração."
      );
    } finally {
      adminLoginButton.disabled = false;
    }
  }

  async function logoutAdmin() {
    await signOut(auth);
  }

  form.addEventListener("input", renderPreview);
  fields.childCpf.addEventListener("input", () => {
    fields.childCpf.value = formatCpf(fields.childCpf.value);
    const cpf = onlyDigits(fields.childCpf.value);
    if (childCpfCheck.cpf && childCpfCheck.cpf !== cpf) {
      childCpfCheck = { cpf: "", exists: false };
      setChildCpfMessage("", "");
    }
  });
  fields.childCpf.addEventListener("blur", checkChildCpfAvailability);
  fields.guardianCpf.addEventListener("input", () => {
    fields.guardianCpf.value = formatCpf(fields.guardianCpf.value);
  });
  fields.cep.addEventListener("input", () => {
    fields.cep.value = formatCep(fields.cep.value);
    if (onlyDigits(fields.cep.value).length === 8) {
      lookupCep();
    } else {
      lastCepLookup = "";
      clearAddressFields();
      setCepMessage("", "");
    }
  });
  fields.cep.addEventListener("blur", lookupCep);
  fields.familyComposition.addEventListener("change", () => {
    updateFamilyFields();
    renderPreview();
  });
  fields.neighborhood.addEventListener("change", () => {
    updateQuadrant();
    renderPreview();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await lookupCep();
    renderPreview();
    const data = collectFormData();
    const validationMessage = validateRegistration(data);
    if (validationMessage) {
      setMessage(validationMessage, "");
      return;
    }

    const childCpfAvailable = await checkChildCpfAvailability();
    if (!childCpfAvailable) {
      setMessage("Já existe uma inscrição cadastrada para o CPF desta criança.", "");
      fields.childCpf.focus();
      return;
    }

    setMessage("", "");
    showReview(data);
  });

  rankingBody.addEventListener("change", async (event) => {
    if (!event.target.matches(".status-select")) return;
    event.target.disabled = true;
    try {
      await updateStatus(event.target.dataset.protocol, event.target.value);
    } catch (error) {
      window.alert(getFirebaseErrorMessage(error, "Não foi possível atualizar a situação."));
      renderRanking();
    }
  });
  rankingBody.addEventListener("click", async (event) => {
    if (!event.target.matches(".requeue-button")) return;
    const button = event.target;
    button.disabled = true;
    try {
      await requeueRegistration(button.dataset.protocol);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });

  document.querySelector("#resetFormButton").addEventListener("click", resetForm);
  document.querySelector("#exportCsvButton").addEventListener("click", exportCsv);
  document.querySelector("#clearDataButton").addEventListener("click", () => {
    clearData();
  });
  cancelReviewButton.addEventListener("click", closeReview);
  editReviewButton.addEventListener("click", closeReview);
  truthDeclaration.addEventListener("change", () => {
    confirmRegistrationButton.disabled = !truthDeclaration.checked;
    if (truthDeclaration.checked) reviewMessage.textContent = "";
  });
  confirmRegistrationButton.addEventListener("click", confirmPendingRegistration);
  newRegistrationButton.addEventListener("click", closeReceipt);
  printReceiptButton.addEventListener("click", () => window.print());
  startRegistrationButton.addEventListener("click", showRegistrationForm);
  backHomeButton.addEventListener("click", showHome);
  publicNavButton.addEventListener("click", showHome);
  adminNavButton.addEventListener("click", showAdmin);
  adminLoginButton.addEventListener("click", loginAdmin);
  adminLogoutButton.addEventListener("click", logoutAdmin);
  adminEmail.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginAdmin();
  });
  adminPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginAdmin();
  });
  searchInput.addEventListener("input", renderRanking);
  regionFilter.addEventListener("change", renderRanking);
  ageGroupFilter.addEventListener("change", renderRanking);
  statusFilter.addEventListener("change", renderRanking);
  dashboardRegionFilter.addEventListener("change", renderDashboard);
  dashboardAgeGroupFilter.addEventListener("change", renderDashboard);

  updateFamilyFields();
  renderPreview();
  renderDashboard();
  onAuthStateChanged(auth, () => {
    if (!adminView.classList.contains("hidden")) {
      renderAdminAccess();
    }
  });
})();
