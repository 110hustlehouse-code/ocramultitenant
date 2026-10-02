import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanupTenant, createCeo, createLoginUser, createProjectWithMember, createTestTenant, expireLock, getUserLockState } from "./helpers/db";

const SUFFIX = Date.now().toString(36);

let tenantId: string;
let companyId: string;
let ceoEmail: string;

test.beforeAll(() => {
  const { tenantId: t, companyId: c } = createTestTenant(SUFFIX);
  tenantId = t;
  companyId = c;
  ceoEmail = createCeo(tenantId, companyId, SUFFIX).email;
});

test.afterAll(() => {
  cleanupTenant(tenantId);
});

/** Login "sviluppo" (AUTH_DEV_LOGIN=true in locale): usato solo per le azioni del CEO, mai per gli scenari sotto test. */
async function loginAsDev(context: BrowserContext, email: string) {
  const page = await context.newPage();
  await page.request.post("/api/dev-login", { form: { email, callbackUrl: "/" } });
  await page.goto("/");
  return page;
}

async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  const before = page.url();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Accedi con email e password")');
  // Il submit passa da una Server Action: il redirect che segue (successo o errore) è
  // gestito dal router client-side di Next, non da una navigazione piena — aspetta che
  // l'URL cambi rispetto a quella di partenza, qualunque sia l'esito. La Server Action
  // (src/server/auth/actions.ts) rilegge l'utente dal DB e decide essa stessa la
  // destinazione finale (/password/nuova se mustChangePassword, altrimenti il target),
  // quindi qui si atterra già sulla destinazione corretta.
  await page.waitForURL((url) => url.toString() !== before, { timeout: 10_000 });
}

function requestReset(email: string): { to: string; subject: string; text: string } | null {
  const out = execFileSync(
    path.resolve("node_modules/.bin/tsx"),
    ["--conditions=react-server", "e2e/helpers/request-reset.mts", email],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return JSON.parse(out.trim().split("\n").pop()!);
}

// ─── 1. Creazione collaboratore: password mostrata una volta sola ─────────────

test("1. CEO crea un esterno: la password iniziale si vede una volta sola", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await loginAsDev(context, ceoEmail);

  const email = `esterno1-${SUFFIX}@e2e.local`;
  const password = "password-iniziale-1";
  const in2days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await page.goto("/collaboratori/nuovo?tipo=esterni");
  await page.fill("#name", "Esterno Uno");
  await page.fill("#accessEmail", email);
  await page.fill("#accessPassword", password);
  await page.selectOption("#accessRole", "EXTERNAL");
  await page.fill("#accessExpiresAt", in2days);
  const companyCheckbox = page.locator('input[name="accessCompanyIds"]');
  if (!(await companyCheckbox.isChecked())) await companyCheckbox.check();
  await page.getByRole("button", { name: "Salva" }).click();
  await page.waitForLoadState("networkidle");

  // I campi della conferma sono readonly senza id/name (vedi PartyForm.tsx): si individuano
  // per valore, l'unico aggancio affidabile indipendente dal calcolo del nome accessibile.
  const passwordField = page.locator(`input[value="${password}"]`);
  await expect(passwordField).toHaveCount(1);
  await expect(page.locator(`input[value="${email}"]`)).toHaveCount(1);

  await page.reload();
  await expect(passwordField).toHaveCount(0);

  await context.close();
});

// ─── 2 & 3. Primo login: cambio password forzato, poi visibilità limitata ─────

test.describe("2-3. primo login forzato e visibilità dopo il cambio", () => {
  const email = `esterno23-${SUFFIX}@e2e.local`;
  const tempPassword = "password-temporanea-1";
  const newPassword = "password-nuova-scelta-1";

  test.beforeAll(() => {
    const user = createLoginUser(tenantId, companyId, {
      email,
      password: tempPassword,
      role: "EXTERNAL",
      accessExpiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      mustChangePassword: true,
    });
    createProjectWithMember(tenantId, companyId, `Progetto di ${SUFFIX}`, user.userId);
  });

  test("2. login forza il cambio password, nessun'altra pagina è raggiungibile", async ({ page }) => {
    await loginWithPassword(page, email, tempPassword);
    // Il redirect è immediato e diretto a /password/nuova: nessuna pagina protetta
    // viene mai renderizzata con dati reali nel frattempo (fix su src/server/auth/actions.ts).
    await expect(page).toHaveURL(/\/password\/nuova/);
    await expect(page.getByText("Imposta una nuova password")).toBeVisible();
    await expect(page.getByText("Ciao")).toHaveCount(0);

    // Prova diretta a un'altra pagina (richiesta piena, es. URL scritto a mano): il proxy
    // intercetta correttamente e forza il cambio password; il backstop in getContext()
    // copre anche qualunque pagina che per qualche motivo sfuggisse al proxy.
    await page.goto("/progetti");
    await expect(page).toHaveURL(/\/password\/nuova/);
    await page.goto("/impostazioni/utenti");
    await expect(page).toHaveURL(/\/password\/nuova/);

    await page.fill('input[name="password"]', newPassword);
    await page.fill('input[name="confirm"]', newPassword);
    await page.click('button:has-text("Imposta e accedi di nuovo")');
    await expect(page).toHaveURL(/\/login\?cambiata=1/);
  });

  test("3. dopo il cambio: vede solo il suo progetto, nessun dato economico", async ({ page }) => {
    await loginWithPassword(page, email, newPassword);
    // Richiesta piena (non il redirect interno della Server Action): qui il login va
    // verificato per davvero, non solo "non siamo su /password/nuova".
    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);

    // TROVATO (vedi report): notFound() annidato sotto il layout qui restituisce sempre
    // status 200 — in dev E in build di produzione (next start), confermato separatamente —
    // perché lo status della risposta in streaming è già stato inviato prima che il segmento
    // interno lanci notFound(). Nessun dato trapela (il contenuto mostrato è sempre quello
    // della pagina "non trovata"), ma lo status HTTP non riflette il blocco: controlliamo
    // quindi il contenuto reale, che è la garanzia che conta per la sicurezza.
    await page.goto("/margine");
    await expect(page.getByText("Pagina non disponibile")).toBeVisible();
    await expect(page.getByText("solo CEO")).toHaveCount(0);

    await page.goto("/collaboratori");
    await expect(page.getByText("Pagina non disponibile")).toBeVisible();

    await page.goto("/impostazioni/utenti");
    await expect(page.getByText("Pagina non disponibile")).toBeVisible();

    const progetti = await page.goto("/progetti");
    expect(progetti?.status()).toBe(200);
    await expect(page.getByText(`Progetto di ${SUFFIX}`)).toBeVisible();
    await expect(page.getByText("€")).toHaveCount(0);
  });
});

// ─── 4. Blocco dopo 5+ tentativi falliti, sblocco allo scadere ────────────────

test("4. 5+ password sbagliate bloccano l'account, lo sblocco regge solo a termine scaduto", async ({ page }) => {
  const email = `lockout-${SUFFIX}@e2e.local`;
  const password = "password-corretta-1";
  const user = createLoginUser(tenantId, companyId, { email, password, role: "CREATIVE" });

  for (let i = 0; i < 5; i++) {
    await loginWithPassword(page, email, "password-sbagliata");
    await expect(page).toHaveURL(/error=CredentialsSignin/);
  }

  // Bloccato: anche la password corretta non entra.
  await loginWithPassword(page, email, password);
  await expect(page).toHaveURL(/error=CredentialsSignin/);

  const locked = getUserLockState(user.userId);
  expect(locked.lockedUntil).not.toBeNull();

  // Simula lo scadere del blocco (15 minuti reali, non attesi nel test).
  expireLock(user.userId);

  await loginWithPassword(page, email, password);
  await expect(page).not.toHaveURL(/error=/);
});

// ─── 5. Reset password: link monouso e a scadenza ─────────────────────────────

test("5. il link di reset funziona una volta sola", async ({ page }) => {
  const email = `reset-${SUFFIX}@e2e.local`;
  const oldPassword = "password-vecchia-1";
  const newPassword = "password-dopo-reset-1";
  createLoginUser(tenantId, companyId, { email, password: oldPassword, role: "CREATIVE" });

  // Passo UI reale (black-box, senza leggere il token): conferma che la Server Action risponde
  // sempre con lo stesso messaggio generico, qualunque sia l'email.
  await page.goto("/password/dimenticata");
  await page.fill('input[name="email"]', email);
  await page.click('button:has-text("Invia il link")');
  await expect(page).toHaveURL(/inviata=1/);
  await expect(page.getByText(/hai ricevuto un'email/)).toBeVisible();

  // Il token vero non è recuperabile dal DB (solo l'hash SHA-256 è salvato): per verificare
  // il link reale si intercetta l'invio richiamando la funzione di produzione con un sender
  // fittizio (vedi e2e/helpers/request-reset.mts).
  const email2 = requestReset(email);
  expect(email2).not.toBeNull();
  const match = email2!.text.match(/\/password\/reimposta\/(\S+)/);
  expect(match).not.toBeNull();
  const token = match![1];

  await page.goto(`/password/reimposta/${token}`);
  await page.fill('input[name="password"]', newPassword);
  await page.fill('input[name="confirm"]', newPassword);
  await page.click('button:has-text("Reimposta")');
  await expect(page).toHaveURL(/\/login\?cambiata=1/);

  // Riuso dello stesso token: deve fallire.
  await page.goto(`/password/reimposta/${token}`);
  await page.fill('input[name="password"]', "altra-password-1");
  await page.fill('input[name="confirm"]', "altra-password-1");
  await page.click('button:has-text("Reimposta")');
  await expect(page).toHaveURL(/errore=/);

  // La nuova password funziona, la vecchia no.
  await loginWithPassword(page, email, newPassword);
  await expect(page).not.toHaveURL(/error=|password\/nuova/);
});

// ─── 6. Disattivazione mentre l'utente è loggato ──────────────────────────────

test("6. disattivare il collaboratore lo butta fuori alla richiesta successiva", async ({ browser }) => {
  const email = `disattiva-${SUFFIX}@e2e.local`;
  const password = "password-attiva-1";
  createLoginUser(tenantId, companyId, { email, password, role: "CREATIVE" });

  const collabContext = await browser.newContext();
  const collabPage = await collabContext.newPage();
  await loginWithPassword(collabPage, email, password);
  await expect(collabPage).not.toHaveURL(/error=|password\/nuova/);
  const home = await collabPage.goto("/");
  expect(home?.status()).toBe(200);

  const ceoContext = await browser.newContext();
  const ceoPage = await loginAsDev(ceoContext, ceoEmail);
  await ceoPage.goto("/impostazioni/utenti");
  const row = ceoPage.locator("li", { hasText: email });
  await row.getByRole("button", { name: "Disattiva accesso" }).click();
  await expect(row.getByText("disattivato")).toBeVisible();

  await collabPage.goto("/progetti");
  await expect(collabPage).toHaveURL(/error=AccessDenied/);

  await collabContext.close();
  await ceoContext.close();
});

// ─── 7. Accesso scaduto: login negato anche a password corretta ──────────────

test("7. accessExpiresAt nel passato nega il login anche con password corretta", async ({ page }) => {
  const email = `scaduto-${SUFFIX}@e2e.local`;
  const password = "password-corretta-2";
  createLoginUser(tenantId, companyId, {
    email,
    password,
    role: "EXTERNAL",
    accessExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });

  await loginWithPassword(page, email, password);
  await expect(page).toHaveURL(/error=CredentialsSignin/);
  await expect(page.getByText(/accesso non più valido/)).toBeVisible();
});

// ─── 8. Login Google: solo verifica che il provider sia configurato ──────────

test("8. il provider Google: la pagina di login riflette la configurazione corrente (verifica manuale per l'OAuth reale)", async ({ page }) => {
  await page.goto("/login");
  // In questo ambiente AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET sono vuoti (placeholder, non credenziali
  // reali): Google risulta quindi non configurato, e la pagina deve dirlo chiaramente invece di
  // mostrare un bottone che poi fallirebbe. Con credenziali reali comparirebbe "Accedi con Google".
  const googleButton = page.getByRole("button", { name: "Accedi con Google" });
  const notConfigured = page.getByText("Accesso con Google non configurato");
  await expect(googleButton.or(notConfigured)).toBeVisible();
});
