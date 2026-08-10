// Autenticação dos jogadores: identidade = perfil da Steam, senha = guardada
// com segurança pelo Firebase Authentication (Email/Senha), FORA do banco
// público. O "email" é sintético, derivado do SteamID — nenhum email é enviado.
//
// Pré-requisito no console do Firebase: Authentication → Sign-in method →
// ativar o provedor "Email/Senha".
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { app } from "./firebase.js";
import { buscarPerfilSteam } from "./steam.js";

const auth = app ? getAuth(app) : null;
const env = import.meta.env || {};

// SteamID <-> email sintético (domínio fake, sem verificação/envio).
const emailDe = (steamId) => `${steamId}@mamometro.gg`;
export const steamIdDoUser = (user) =>
  user && user.email ? user.email.split("@")[0] : null;

export const SENHA_MIN = 6;

// Admins: SteamIDs que podem abrir o painel do organizador (Vini e Iago).
// Papéis: `papeis/<steamid>` = "master" | "organizador".
//   comum       -> não aparece no nó
//   organizador -> aprova partidas e VOTA na assembleia
//   master      -> faz tudo direto (promove, seasons), mas NÃO vota
// Quem decide de verdade são as regras do banco; isto aqui liga/desliga botões.
let PAPEIS = {};

// Semente do build: os SteamIDs do .env entram como master até o banco falar.
(env.VITE_ADMIN_STEAMIDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .forEach((sid) => (PAPEIS[sid] = "master"));

export function definirPapeis(obj) {
  if (obj && Object.keys(obj).length) PAPEIS = { ...obj };
}

export const papelDe = (sid) => (sid ? PAPEIS[sid] || null : null);
export const meuPapel = () => papelDe(steamIdDoUser(currentUser));
export const ehMaster = () => meuPapel() === "master";
export const ehOrganizador = () => meuPapel() === "organizador";

// Lista de quem vota: só organizadores (master é excluído de propósito).
export const listaVotantes = () =>
  Object.keys(PAPEIS).filter((sid) => PAPEIS[sid] === "organizador");
export const listaPapeis = () => ({ ...PAPEIS });

// Rastreia o usuário logado de forma central e avisa quem se inscrever.
let currentUser = null;
let authReady = false; // vira true quando o Firebase resolve a sessão (evita flash)
const listeners = new Set();
if (auth)
  onAuthStateChanged(auth, (u) => {
    currentUser = u;
    authReady = true;
    listeners.forEach((fn) => fn(u));
  });

export function usuarioAtual() {
  return currentUser;
}
export function authPronto() {
  return authReady;
}
// "Admin" = tem algum papel (organizador ou master): abre o painel.
export function ehAdmin() {
  return !!meuPapel();
}

// Cadastro: resolve o perfil da Steam (valida + pega avatar) e cria a conta.
export async function cadastrar(steamInput, senha) {
  if (!auth) throw new Error("Firebase não configurado.");
  const perfil = await buscarPerfilSteam(steamInput); // { steamId, name, avatar, profileUrl }
  await createUserWithEmailAndPassword(auth, emailDe(perfil.steamId), senha);
  return perfil;
}

// Login: resolve o perfil pra obter o SteamID e entra com a senha.
export async function entrar(steamInput, senha) {
  if (!auth) throw new Error("Firebase não configurado.");
  const perfil = await buscarPerfilSteam(steamInput);
  await signInWithEmailAndPassword(auth, emailDe(perfil.steamId), senha);
  return perfil;
}

export function sair() {
  return auth ? signOut(auth) : Promise.resolve();
}

export function aoMudarAuth(cb) {
  listeners.add(cb);
  if (authReady) cb(currentUser); // só dispara já se a sessão já resolveu
  return () => listeners.delete(cb);
}

// Traduz códigos de erro do Firebase Auth pra mensagens amigáveis.
export function msgErroAuth(e) {
  const c = (e && e.code) || "";
  if (c === "auth/email-already-in-use")
    return "Esse perfil já tem conta. Use a aba Entrar.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password")
    return "Senha incorreta.";
  if (c === "auth/user-not-found")
    return "Esse perfil ainda não tem conta. Cadastre-se primeiro.";
  if (c === "auth/weak-password")
    return `Senha muito curta (mínimo ${SENHA_MIN} caracteres).`;
  if (c === "auth/operation-not-allowed")
    return "Ative o provedor Email/Senha no console do Firebase (Authentication → Sign-in method).";
  // O Authentication nem foi inicializado no projeto (falta clicar em "Começar").
  if (c === "auth/configuration-not-found")
    return "O Authentication ainda não foi ativado neste projeto do Firebase. No console: Authentication → Começar → Sign-in method → ative Email/Senha.";
  if (c === "auth/network-request-failed") return "Falha de rede. Tente de novo.";
  return (e && e.message) || "Não deu pra completar. Tente de novo.";
}
