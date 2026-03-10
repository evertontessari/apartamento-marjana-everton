const STORAGE_KEY = "monitor-precos-v1";
const CLOUD_PULL_INTERVAL_MS = 20000;

const state = {
  products: [],
  selectedProductId: null,
  search: "",
  activeTab: "products",
};

const els = {
  productForm: document.getElementById("productForm"),
  productName: document.getElementById("productName"),
  productCategory: document.getElementById("productCategory"),
  productNote: document.getElementById("productNote"),
  productPhoto: document.getElementById("productPhoto"),

  priceForm: document.getElementById("priceForm"),
  priceProduct: document.getElementById("priceProduct"),
  priceStore: document.getElementById("priceStore"),
  priceValue: document.getElementById("priceValue"),
  priceDate: document.getElementById("priceDate"),
  priceNote: document.getElementById("priceNote"),

  totalProducts: document.getElementById("totalProducts"),
  withPrices: document.getElementById("withPrices"),
  bestOpportunity: document.getElementById("bestOpportunity"),

  productsTableBody: document.getElementById("productsTableBody"),
  productsMobileList: document.getElementById("productsMobileList"),
  historyTitle: document.getElementById("historyTitle"),
  historyList: document.getElementById("historyList"),
  searchInput: document.getElementById("searchInput"),
  syncStatus: document.getElementById("syncStatus"),
  tabBtnProducts: document.getElementById("tabBtnProducts"),
  tabBtnPrices: document.getElementById("tabBtnPrices"),
  tabProductsPanel: document.getElementById("tabProductsPanel"),
  tabPricesPanel: document.getElementById("tabPricesPanel"),
};

const cloudConfig = window.CLOUD_CONFIG || { enabled: false };
let cloudSyncBusy = false;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatMoney(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));
}

function setSyncStatus(message, tone = "") {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
  els.syncStatus.className = `sync-status ${tone}`.trim();
}

function cloudEnabled() {
  return (
    !!cloudConfig.enabled &&
    !!cloudConfig.supabaseUrl &&
    !!cloudConfig.supabaseAnonKey &&
    !!cloudConfig.listId
  );
}

function cloudBaseUrl() {
  return `${cloudConfig.supabaseUrl.replace(/\/$/, "")}/rest/v1/shopping_lists`;
}

async function pullFromCloud() {
  if (!cloudEnabled() || cloudSyncBusy) return false;
  cloudSyncBusy = true;
  try {
    const url = `${cloudBaseUrl()}?list_id=eq.${encodeURIComponent(cloudConfig.listId)}&select=payload,updated_at`;
    const response = await fetch(url, {
      headers: {
        apikey: cloudConfig.supabaseAnonKey,
        Authorization: `Bearer ${cloudConfig.supabaseAnonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ao carregar nuvem (${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || !data.length || !data[0].payload) {
      setSyncStatus("Sincronização ativa: nuvem conectada");
      return false;
    }

    if (Array.isArray(data[0].payload)) {
      state.products = data[0].payload;
      saveState();
      refreshUI();
      setSyncStatus("Sincronização ativa: dados atualizados da nuvem", "ok");
      return true;
    }

    return false;
  } catch {
    setSyncStatus("Sincronização com erro: usando dados locais", "warn");
    return false;
  } finally {
    cloudSyncBusy = false;
  }
}

async function pushToCloud() {
  if (!cloudEnabled() || cloudSyncBusy) return;
  cloudSyncBusy = true;
  try {
    const response = await fetch(cloudBaseUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cloudConfig.supabaseAnonKey,
        Authorization: `Bearer ${cloudConfig.supabaseAnonKey}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([
        {
          list_id: cloudConfig.listId,
          payload: state.products,
          updated_at: new Date().toISOString(),
        },
      ]),
    });

    if (!response.ok) {
      throw new Error(`Erro ao salvar nuvem (${response.status})`);
    }

    setSyncStatus("Sincronização ativa: salvo na nuvem", "ok");
  } catch {
    setSyncStatus("Sincronização com erro: salvo apenas localmente", "warn");
  } finally {
    cloudSyncBusy = false;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.products = parsed.map((product) => ({
        ...product,
        category: product.category || "Outros",
        photoDataUrl: product.photoDataUrl || "",
        entries: Array.isArray(product.entries) ? product.entries : [],
      }));
    }
  } catch {
    state.products = [];
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function productStats(product) {
  if (!product.entries.length) {
    return {
      latestEntry: null,
      minEntry: null,
      variationPct: null,
    };
  }

  const sorted = [...product.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latestEntry = sorted[0];
  const minEntry = product.entries.reduce((lowest, current) =>
    current.price < lowest.price ? current : lowest
  );

  let variationPct = null;
  if (product.entries.length > 1) {
    const previous = sorted[1];
    if (previous.price > 0) {
      variationPct = ((latestEntry.price - previous.price) / previous.price) * 100;
    }
  }

  return { latestEntry, minEntry, variationPct };
}

function getFilteredProducts() {
  const term = state.search.trim().toLowerCase();
  if (!term) return state.products;

  return state.products.filter(
    (product) =>
      product.name.toLowerCase().includes(term) ||
      (product.category || "").toLowerCase().includes(term) ||
      (product.note || "").toLowerCase().includes(term)
  );
}

function renderSummary() {
  const total = state.products.length;
  const withPrices = state.products.filter((p) => p.entries.length > 0).length;

  let bestLabel = "—";
  let bestDelta = 0;

  for (const product of state.products) {
    const sorted = [...product.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (sorted.length < 2) continue;

    const latest = sorted[0];
    const previous = sorted[1];
    const delta = previous.price - latest.price;

    if (delta > bestDelta) {
      bestDelta = delta;
      bestLabel = `${product.name}: ${formatMoney(latest.price)} (${formatMoney(delta)} mais barato)`;
    }
  }

  els.totalProducts.textContent = String(total);
  els.withPrices.textContent = String(withPrices);
  els.bestOpportunity.textContent = bestLabel;
}

function renderProductOptions() {
  const current = els.priceProduct.value;
  els.priceProduct.innerHTML = `<option value="">Selecione</option>`;

  state.products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .forEach((product) => {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = product.name;
      els.priceProduct.appendChild(option);
    });

  if (state.products.some((p) => p.id === current)) {
    els.priceProduct.value = current;
  }
}

function renderTable() {
  const products = getFilteredProducts();
  els.productsTableBody.innerHTML = "";

  if (!products.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="empty" colspan="7">Nenhum produto encontrado.</td>`;
    els.productsTableBody.appendChild(row);
    return;
  }

  products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .forEach((product) => {
      const { latestEntry, minEntry, variationPct } = productStats(product);

      const row = document.createElement("tr");

      const variationBadge = () => {
        if (variationPct === null || Number.isNaN(variationPct)) return `<span class="badge same">—</span>`;
        if (variationPct > 0) return `<span class="badge up">+${variationPct.toFixed(1)}%</span>`;
        if (variationPct < 0) return `<span class="badge down">${variationPct.toFixed(1)}%</span>`;
        return `<span class="badge same">0,0%</span>`;
      };

      row.innerHTML = `
        <td>
          <div class="product-cell">
            ${product.photoDataUrl ? `<img src="${product.photoDataUrl}" alt="${product.name}" class="product-thumb" />` : `<div class="product-thumb placeholder">Sem foto</div>`}
            <div>
              <strong>${product.name}</strong>
              <div class="empty">${product.category || "Outros"}</div>
              <div class="empty">${product.note || "Sem observação"}</div>
            </div>
          </div>
        </td>
        <td>${latestEntry ? formatMoney(latestEntry.price) : "—"}</td>
        <td>${minEntry ? `${formatMoney(minEntry.price)} (${minEntry.store})` : "—"}</td>
        <td>${variationBadge()}</td>
        <td>${latestEntry ? latestEntry.store : "—"}</td>
        <td>${latestEntry ? formatDate(latestEntry.date) : "—"}</td>
        <td>
          <div class="actions">
            <button data-action="history" data-id="${product.id}" class="secondary">Histórico</button>
            <button data-action="delete" data-id="${product.id}" class="danger">Excluir</button>
          </div>
        </td>
      `;

      els.productsTableBody.appendChild(row);
    });
}

function renderMobileList() {
  const products = getFilteredProducts();
  els.productsMobileList.innerHTML = "";

  if (!products.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nenhum produto encontrado.";
    els.productsMobileList.appendChild(empty);
    return;
  }

  products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .forEach((product) => {
      const { latestEntry, minEntry, variationPct } = productStats(product);

      const card = document.createElement("article");
      card.className = "mobile-item";

      const variationLabel = () => {
        if (variationPct === null || Number.isNaN(variationPct)) return `<span class="badge same">—</span>`;
        if (variationPct > 0) return `<span class="badge up">+${variationPct.toFixed(1)}%</span>`;
        if (variationPct < 0) return `<span class="badge down">${variationPct.toFixed(1)}%</span>`;
        return `<span class="badge same">0,0%</span>`;
      };

      card.innerHTML = `
        <div class="mobile-product-head">
          ${product.photoDataUrl ? `<img src="${product.photoDataUrl}" alt="${product.name}" class="product-thumb" />` : `<div class="product-thumb placeholder">Sem foto</div>`}
          <div>
            <div class="mobile-item-top">
              <strong>${product.name}</strong>
              ${variationLabel()}
            </div>
            <div class="empty">${product.category || "Outros"}</div>
            <div class="empty">${product.note || "Sem observação"}</div>
          </div>
        </div>
        <div class="mobile-info-grid">
          <div><span>Último preço</span><strong>${latestEntry ? formatMoney(latestEntry.price) : "—"}</strong></div>
          <div><span>Menor preço</span><strong>${minEntry ? formatMoney(minEntry.price) : "—"}</strong></div>
          <div><span>Loja</span><strong>${latestEntry ? latestEntry.store : "—"}</strong></div>
          <div><span>Atualizado</span><strong>${latestEntry ? formatDate(latestEntry.date) : "—"}</strong></div>
        </div>
        <div class="actions mobile-actions">
          <button data-action="history" data-id="${product.id}" class="secondary">Histórico</button>
          <button data-action="delete" data-id="${product.id}" class="danger">Excluir</button>
        </div>
      `;

      els.productsMobileList.appendChild(card);
    });
}

function renderHistory() {
  const product = state.products.find((p) => p.id === state.selectedProductId);
  els.historyList.innerHTML = "";

  if (!product) {
    els.historyTitle.textContent = "Selecione um produto para ver o histórico.";
    return;
  }

  els.historyTitle.textContent = `Histórico: ${product.name}`;

  if (!product.entries.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Este produto ainda não tem preços registrados.";
    els.historyList.appendChild(li);
    return;
  }

  product.entries
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .forEach((entry) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `
        <strong>${formatMoney(entry.price)} — ${entry.store}</strong>
        <div>Data: ${formatDate(entry.date)}</div>
        <div class="empty">${entry.note || "Sem anotação"}</div>
      `;
      els.historyList.appendChild(li);
    });
}

function switchTab(tab) {
  state.activeTab = tab;
  const productsActive = tab === "products";

  els.tabBtnProducts.classList.toggle("active", productsActive);
  els.tabBtnPrices.classList.toggle("active", !productsActive);
  els.tabBtnProducts.setAttribute("aria-selected", productsActive ? "true" : "false");
  els.tabBtnPrices.setAttribute("aria-selected", productsActive ? "false" : "true");

  els.tabProductsPanel.classList.toggle("active", productsActive);
  els.tabPricesPanel.classList.toggle("active", !productsActive);
}

function refreshUI() {
  renderSummary();
  renderProductOptions();
  renderTable();
  renderMobileList();
  renderHistory();
}

async function addProduct(event) {
  event.preventDefault();

  const name = els.productName.value.trim();
  const category = els.productCategory.value;
  const note = els.productNote.value.trim();
  const photoFile = els.productPhoto.files && els.productPhoto.files[0] ? els.productPhoto.files[0] : null;

  if (!name) return;

  let photoDataUrl = "";
  if (photoFile) {
    photoDataUrl = await readFileAsDataURL(photoFile);
  }

  state.products.push({
    id: uid(),
    name,
    category,
    note,
    photoDataUrl,
    entries: [],
  });

  els.productForm.reset();
  saveState();
  void pushToCloud();
  refreshUI();
}

function addPrice(event) {
  event.preventDefault();

  const productId = els.priceProduct.value;
  const store = els.priceStore.value.trim();
  const price = Number(els.priceValue.value);
  const date = els.priceDate.value;
  const note = els.priceNote.value.trim();

  if (!productId || !store || !date || Number.isNaN(price) || price < 0) return;

  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  product.entries.push({
    id: uid(),
    store,
    price,
    date,
    note,
  });

  state.selectedProductId = product.id;
  els.priceForm.reset();
  els.priceDate.value = todayISO();

  saveState();
  void pushToCloud();
  refreshUI();
  switchTab("products");
}

function onTableClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;

  if (action === "history") {
    state.selectedProductId = id;
    renderHistory();
    return;
  }

  if (action === "delete") {
    const product = state.products.find((p) => p.id === id);
    if (!product) return;

    const confirmed = window.confirm(`Excluir o produto \"${product.name}\" e todo o histórico?`);
    if (!confirmed) return;

    state.products = state.products.filter((p) => p.id !== id);
    if (state.selectedProductId === id) {
      state.selectedProductId = null;
    }

    saveState();
    void pushToCloud();
    refreshUI();
  }
}

function onSearch(event) {
  state.search = event.target.value;
  renderTable();
  renderMobileList();
}

function onTabClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const tab = target.dataset.tab;
  if (tab !== "products" && tab !== "prices") return;
  switchTab(tab);
}

function setupEvents() {
  els.productForm.addEventListener("submit", addProduct);
  els.priceForm.addEventListener("submit", addPrice);
  els.productsTableBody.addEventListener("click", onTableClick);
  els.productsMobileList.addEventListener("click", onTableClick);
  els.searchInput.addEventListener("input", onSearch);
  els.tabBtnProducts.addEventListener("click", onTabClick);
  els.tabBtnPrices.addEventListener("click", onTabClick);
}

async function init() {
  loadState();
  els.priceDate.value = todayISO();
  setupEvents();
  switchTab("products");
  refreshUI();

  if (cloudEnabled()) {
    setSyncStatus("Sincronização: conectando nuvem...");
    await pullFromCloud();
    window.setInterval(() => {
      void pullFromCloud();
    }, CLOUD_PULL_INTERVAL_MS);
  } else {
    setSyncStatus("Sincronização: local (somente neste aparelho)");
  }
}

void init();
